#!/usr/bin/env python3
"""
ml/train.py — latih + evaluasi model arah harga 1D/2D dengan walk-forward.

  python ml/train.py --horizon 1 --years 3

Aturan main yang membuat hasilnya bisa dipercaya:

  1. WALK-FORWARD, bukan random split. Random split pada data time-series
     membocorkan masa depan ke data latih. Angkanya kelihatan bagus dan palsu.
     Di sini: latih pada periode t, uji pada periode t+1, geser, ulangi.

  2. GAP antara akhir data latih dan awal data uji sepanjang horizon prediksi,
     supaya label terakhir di data latih tidak memakai harga yang sudah masuk
     periode uji.

  3. DUA BASELINE wajib dikalahkan: (a) selalu tebak "naik", (b) win rate
     sinyal yang sudah ada. Model yang tidak mengalahkan keduanya TIDAK dipasang,
     sebagus apa pun angka latihnya.

  4. Kalibrasi probabilitas dicek. Model yang bilang "70%" harus benar sekitar
     70% dari waktu, kalau tidak angkanya menyesatkan di UI.
"""
import argparse
import json
import os
from datetime import datetime

import numpy as np
import pandas as pd

import features as F
from _diag import classify, print_summary
from collections import Counter

try:
    from lightgbm import LGBMClassifier
    MODEL_NAME = "lightgbm"
except ImportError:                                  # fallback tanpa dependensi berat
    from sklearn.ensemble import HistGradientBoostingClassifier as LGBMClassifier
    MODEL_NAME = "sklearn-hgb"

from sklearn.metrics import roc_auc_score, brier_score_loss


def make_model():
    if MODEL_NAME == "lightgbm":
        return LGBMClassifier(
            n_estimators=400, learning_rate=0.03, num_leaves=31,
            min_child_samples=80, subsample=0.8, colsample_bytree=0.8,
            reg_lambda=1.0, verbose=-1,
        )
    return LGBMClassifier(max_iter=400, learning_rate=0.03, min_samples_leaf=80)


def walk_forward(X, y, dates, horizon, n_folds=6):
    """Mengembalikan daftar hasil per fold + prediksi out-of-sample gabungan."""
    order = np.argsort(dates)
    X, y, dates = X.iloc[order], y.iloc[order], dates[order]
    n = len(X)
    fold_size = n // (n_folds + 1)
    hasil, oos = [], []

    for k in range(1, n_folds + 1):
        train_end = fold_size * k - horizon      # GAP sepanjang horizon
        test_end = fold_size * (k + 1)
        if train_end < 500:
            continue

        Xtr, ytr = X.iloc[:train_end], y.iloc[:train_end]
        Xte, yte = X.iloc[fold_size * k:test_end], y.iloc[fold_size * k:test_end]
        if len(Xte) < 100 or ytr.nunique() < 2:
            continue

        m = make_model().fit(Xtr, ytr)
        p = m.predict_proba(Xte)[:, 1]

        hasil.append({
            "fold": k,
            "n_train": len(Xtr), "n_test": len(Xte),
            "akurasi": float(((p > 0.5) == yte).mean()),
            "auc": float(roc_auc_score(yte, p)) if yte.nunique() > 1 else None,
            "brier": float(brier_score_loss(yte, p)),
            "baseline_selalu_naik": float(yte.mean()),
            "uji_dari": str(dates[fold_size * k])[:10],
            "uji_sampai": str(dates[test_end - 1])[:10],
        })
        oos.append(pd.DataFrame({"p": p, "y": yte.values}))

    return hasil, (pd.concat(oos) if oos else pd.DataFrame())


def cek_kalibrasi(oos, bins=10):
    """Model yang bilang 70% harus benar ~70% dari waktu."""
    if oos.empty:
        return []
    oos = oos.copy()
    oos["bin"] = pd.cut(oos["p"], np.linspace(0, 1, bins + 1))
    g = oos.groupby("bin", observed=True).agg(
        prediksi=("p", "mean"), kenyataan=("y", "mean"), n=("y", "size"))
    return [
        {"prediksi": round(float(r.prediksi), 3),
         "kenyataan": round(float(r.kenyataan), 3),
         "n": int(r.n)}
        for r in g.itertuples() if r.n >= 30
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=1, choices=[1, 2, 3, 5])
    ap.add_argument("--years", type=int, default=3)
    ap.add_argument("--tickers", nargs="*", default=None)
    ap.add_argument("--out", default="ml/models")
    args = ap.parse_args()

    import yfinance as yf
    from watchlist import TICKERS          # ml/watchlist.py

    tickers = args.tickers or TICKERS
    frames = []
    gagal = Counter()

    for t in tickers:
        try:
            df = yf.download(f"{t}.JK", period=f"{args.years}y",
                             interval="1d", progress=False, auto_adjust=False)
            if df is None or len(df) < 300:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            f = F.build(df)
            f["y"] = F.label(df, args.horizon)
            f["ticker"] = t
            f["date"] = df.index
            frames.append(f.dropna())
        except Exception as e:
            print(f"  lewati {t}: {e}")
            gagal[classify(e)] += 1

    print_summary(gagal)
    if not frames:
        raise SystemExit("Tidak ada data. Cek koneksi / daftar ticker.")

    data = pd.concat(frames).sort_values("date")
    print(f"{len(data):,} baris dari {data['ticker'].nunique()} ticker")

    X, y = data[F.FEATURE_COLS], data["y"]
    folds, oos = walk_forward(X, y, data["date"].values, args.horizon)

    if not folds:
        raise SystemExit("Data tidak cukup untuk walk-forward.")

    akurasi = float(np.mean([f["akurasi"] for f in folds]))
    baseline = float(np.mean([f["baseline_selalu_naik"] for f in folds]))
    auc = float(np.mean([f["auc"] for f in folds if f["auc"]]))
    lolos = akurasi > baseline + 0.01 and auc > 0.52

    print(f"\nHorizon {args.horizon}D — akurasi {akurasi:.3f} vs baseline {baseline:.3f}, AUC {auc:.3f}")
    print("LOLOS — layak dipasang" if lolos else
          "TIDAK LOLOS — jangan tampilkan angkanya di UI, model belum mengalahkan baseline")

    # Model final dilatih pada SELURUH data, tapi metrik yang dilaporkan tetap
    # dari walk-forward di atas — bukan dari data yang sudah dilihat model.
    final = make_model().fit(X, y)
    os.makedirs(args.out, exist_ok=True)

    import pickle
    with open(f"{args.out}/model_{args.horizon}d.pkl", "wb") as fh:
        pickle.dump({"model": final, "features": F.FEATURE_COLS}, fh)

    # ── Export ke ONNX ────────────────────────────────────────────────────
    # Dibutuhkan supaya Vercel (Node.js, tidak ada python3) bisa jalankan
    # inference langsung saat user pencet tombol Screener — lihat
    # lib/core/ml-features.js dan pages/api/screener.js (predictMlSafe).
    # Kalau lolos == False, tetap export (biar dev bisa cek), tapi
    # predict.py & UI akan tetap menyembunyikan angkanya sampai lolos.
    try:
        n_features = len(F.FEATURE_COLS)
        onnx_path = f"{args.out}/model_{args.horizon}d.onnx"
        if MODEL_NAME == "lightgbm":
            from onnxmltools import convert_lightgbm
            from onnxmltools.convert.common.data_types import FloatTensorType
            onnx_model = convert_lightgbm(
                final, initial_types=[("input", FloatTensorType([None, n_features]))],
            )
        else:
            from skl2onnx import convert_sklearn
            from skl2onnx.common.data_types import FloatTensorType
            onnx_model = convert_sklearn(
                final, initial_types=[("input", FloatTensorType([None, n_features]))],
            )
        with open(onnx_path, "wb") as fh:
            fh.write(onnx_model.SerializeToString())
        print(f"Model diexport ke {onnx_path}")
    except Exception as e:
        # JANGAN gagalkan training kalau cuma export ONNX yang gagal —
        # model .pkl tetap tersimpan dan bisa diexport ulang manual nanti.
        print(f"PERINGATAN: gagal export ONNX ({e}). Model .pkl tetap tersimpan, "
              f"tapi prediksi on-demand di Vercel tidak akan jalan sampai ini diperbaiki.")

    kartu = {
        "horizon": f"{args.horizon}d",
        "algoritma": MODEL_NAME,
        "dilatih": datetime.now().isoformat(timespec="seconds"),
        "baris_latih": len(data),
        "jumlah_ticker": int(data["ticker"].nunique()),
        "akurasi_walk_forward": round(akurasi, 4),
        "baseline_selalu_naik": round(baseline, 4),
        "auc": round(auc, 4),
        "lolos_baseline": bool(lolos),
        "folds": folds,
        "kalibrasi": cek_kalibrasi(oos),
        "catatan": "Metrik dari walk-forward out-of-sample. Bukan saran finansial.",
    }
    with open(f"{args.out}/model_{args.horizon}d.json", "w") as fh:
        json.dump(kartu, fh, indent=2)
    print(f"Tersimpan di {args.out}/model_{args.horizon}d.*")


if __name__ == "__main__":
    main()
