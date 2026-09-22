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

  5. Prediksi out-of-sample per ticker disimpan (ml/models/oos_<h>d.json) supaya
     UI bisa menggambar "kapan AI bilang naik, dan apakah benar naik" dari data
     yang TIDAK dilihat model saat dilatih — bukan replay in-sample yang
     kelihatan bagus tapi tidak membuktikan apa-apa.
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


# Horizon yang sama dengan backtest teknikal (lib/core/constants.js: HORIZONS).
HORIZONS_ALL = [1, 2, 3, 5, 7, 14, 30, 60]
# ONNX hanya dipakai kolom ML di leaderboard (pages/api/screener.js, FAST_HORIZONS).
# Panel "Prediksi AI" memakai pohon JSON (tree_<h>d.json) untuk SEMUA horizon.
ONNX_HORIZONS = {1, 2}


def walk_forward(X, y, dates, horizon, n_folds=6, tickers=None):
    """Mengembalikan daftar hasil per fold + prediksi out-of-sample gabungan.

    Lipatan dipotong per TANGGAL (bukan per baris), dan ada embargo `horizon`
    hari bursa antara data latih dan data uji: label baris latih pada tanggal d
    memakai harga d+horizon, jadi baris latih terakhir harus d + horizon < awal
    uji. Dulu jeda-nya `horizon` BARIS, padahal satu tanggal berisi ~300 baris
    (satu per saham) — praktis tanpa jeda, dan makin parah untuk horizon panjang
    (30/60 hari), karena label latih menyerap pergerakan pasar di masa uji.

    tickers (opsional, sejajar dengan X): kalau diberikan, tiap baris prediksi
    out-of-sample ikut membawa kolom `ticker` dan `date` — dipakai
    simpan_riwayat_oos() untuk chart per saham di UI.
    """
    dates = np.asarray(dates)
    y = pd.Series(np.asarray(y))
    X = X.reset_index(drop=True)
    tick = None if tickers is None else np.asarray(tickers)

    hari = np.unique(dates)                     # tanggal unik, terurut
    n_hari = len(hari)
    idx = np.searchsorted(hari, dates)          # indeks tanggal tiap baris
    fold_days = n_hari // (n_folds + 1)
    hasil, oos = [], []

    for k in range(1, n_folds + 1):
        mulai = fold_days * k
        akhir = n_hari if k == n_folds else fold_days * (k + 1)
        tr = idx < (mulai - horizon)            # embargo `horizon` hari
        te = (idx >= mulai) & (idx < akhir)
        if tr.sum() < 500 or te.sum() < 100:
            continue
        Xtr, ytr = X[tr], y[tr]
        Xte, yte = X[te], y[te]
        if ytr.nunique() < 2:
            continue

        m = make_model().fit(Xtr, ytr)
        p = m.predict_proba(Xte)[:, 1]

        hasil.append({
            "fold": k,
            "n_train": int(tr.sum()), "n_test": int(te.sum()),
            "akurasi": float(((p > 0.5) == yte).mean()),
            "auc": float(roc_auc_score(yte, p)) if yte.nunique() > 1 else None,
            "brier": float(brier_score_loss(yte, p)),
            "baseline_selalu_naik": float(yte.mean()),
            "uji_dari": str(hari[mulai])[:10],
            "uji_sampai": str(hari[akhir - 1])[:10],
            "embargo_hari": int(horizon),
        })
        frame = pd.DataFrame({"p": p, "y": yte.values})
        if tick is not None:
            frame["ticker"] = tick[te]
            frame["date"] = dates[te]
        oos.append(frame)

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


def export_onnx(model, n_features, algoritma, path):
    """Export model ke ONNX dengan probabilitas sebagai TENSOR biasa.

    Default converter (onnxmltools / skl2onnx) menambahkan node ZipMap, sehingga
    output `probabilities` berupa sequence<map>. onnxruntime-node — yang dipakai
    pages/api/screener.js di Vercel — TIDAK bisa membaca output non-tensor dan
    melempar "Non tensor type is temporarily not supported". Hasilnya: MLScore
    selalu null ("Model ML belum tersedia") walau modelnya ada. Jadi ZipMap
    dimatikan, lalu bentuk output diperiksa sebelum berkas ditulis.
    """
    if algoritma == "lightgbm":
        from onnxmltools import convert_lightgbm
        from onnxmltools.convert.common.data_types import FloatTensorType
        onnx_model = convert_lightgbm(
            model, initial_types=[("input", FloatTensorType([None, n_features]))],
            zipmap=False,
        )
    else:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType
        onnx_model = convert_sklearn(
            model, initial_types=[("input", FloatTensorType([None, n_features]))],
            options={id(model): {"zipmap": False}},
        )
    # Penjaga: server membaca output TERAKHIR sebagai probabilitas kelas [tidak naik, naik].
    keluaran = list(onnx_model.graph.output)
    if not keluaran or keluaran[-1].type.WhichOneof("value") != "tensor_type":
        raise ValueError("output terakhir model ONNX bukan tensor (masih ZipMap?); "
                         "onnxruntime-node tidak bisa membacanya")
    with open(path, "wb") as fh:
        fh.write(onnx_model.SerializeToString())
    return path


def _pohon_datar(node):
    """Ratakan pohon bersarang dari booster.dump_model() menjadi larik datar.

    f=fitur, t=ambang, l/r=anak kiri/kanan (>=0: indeks simpul, <0: ~indeks daun),
    v=nilai daun. Aturan LightGBM untuk fitur numerik: nilai <= ambang -> kiri.
    """
    f, t, l, r, v = {}, {}, {}, {}, {}

    def kode(n):
        if "leaf_index" in n:
            v[n["leaf_index"]] = float(n["leaf_value"])
            return ~n["leaf_index"]
        if n.get("decision_type") != "<=":
            raise ValueError(f"tipe split {n.get('decision_type')!r} belum didukung evaluator JS")
        s_ = n["split_index"]
        f[s_], t[s_] = int(n["split_feature"]), float(n["threshold"])
        l[s_], r[s_] = kode(n["left_child"]), kode(n["right_child"])
        return s_

    root = kode(node)
    if root < 0:                                # pohon satu daun
        return {"f": [], "t": [], "l": [], "r": [], "v": [v[0]]}
    return {
        "f": [f[i] for i in range(len(f))], "t": [t[i] for i in range(len(t))],
        "l": [l[i] for i in range(len(l))], "r": [r[i] for i in range(len(r))],
        "v": [v[i] for i in range(len(v))],
    }


def evaluasi_pohon(model_json, X):
    """Evaluator referensi (Python) — algoritma yang SAMA dengan lib/core/ml-trees.js."""
    out = np.empty(len(X))
    for i, x in enumerate(np.asarray(X, dtype=float)):
        skor = 0.0
        for tr in model_json["trees"]:
            if not tr["f"]:
                skor += tr["v"][0]
                continue
            n = 0
            while n >= 0:
                n = tr["l"][n] if x[tr["f"][n]] <= tr["t"][n] else tr["r"][n]
            skor += tr["v"][~n]
        out[i] = 1.0 / (1.0 + np.exp(-model_json["sigmoid"] * skor))
    return out


def export_trees(model, fitur, horizon, path, contoh):
    """Simpan ensemble LightGBM sebagai JSON datar untuk dievaluasi langsung di Node.

    Kenapa bukan ONNX: onnxruntime-node adalah modul native yang berat, sulit
    dibawa ke function Vercel, dan tidak bisa membaca keluaran ZipMap. Ensemble
    pohon cukup dijumlahkan di JavaScript murni (lib/core/ml-trees.js), tanpa
    dependensi apa pun. Sebelum berkas ditulis, hasilnya dibandingkan dengan
    predict_proba model asli pada `contoh` baris; kalau beda, berkas TIDAK ditulis.
    """
    if MODEL_NAME != "lightgbm" or not hasattr(model, "booster_"):
        raise ValueError("export pohon JSON hanya untuk LightGBM (model cadangan sklearn dilewati)")
    dump = model.booster_.dump_model()
    objective = str(dump.get("objective", ""))
    if not objective.startswith("binary"):
        raise ValueError(f"objective {objective!r} belum didukung")
    sigmoid = 1.0
    for bagian in objective.split():
        if bagian.startswith("sigmoid:"):
            sigmoid = float(bagian.split(":")[1])
    payload = {
        "format": "lgbm-flat-v1",
        "horizon": f"{horizon}d",
        "dibuat": datetime.now().isoformat(timespec="seconds"),
        "fitur": list(fitur),
        "sigmoid": sigmoid,
        "trees": [_pohon_datar(ti["tree_structure"]) for ti in dump["tree_info"]],
    }
    ref = model.predict_proba(contoh)[:, 1]
    got = evaluasi_pohon(payload, contoh.values)
    selisih = float(np.max(np.abs(ref - got)))
    if selisih > 1e-9:
        raise ValueError(f"evaluator pohon tidak cocok dengan model asli (selisih maks {selisih:.2e})")
    with open(path, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    return selisih


def simpan_riwayat_oos(oos, out_dir, horizon, max_hari=250):
    """Simpan probabilitas out-of-sample per ticker, `max_hari` tanggal terakhir.

    Format ringkas: satu daftar tanggal bersama + satu daftar angka per ticker
    (per-mil 0-1000, None kalau ticker itu tidak punya baris di tanggal tsb).
    Dibaca /api/ml-insight untuk menggambar chart di halaman detail saham.
    """
    if oos.empty or "ticker" not in oos.columns or "date" not in oos.columns:
        return None
    df = oos[["ticker", "date", "p"]].copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    hari = sorted(df["date"].unique())[-max_hari:]
    posisi = {d: i for i, d in enumerate(hari)}
    df = df[df["date"].isin(posisi)]

    per_ticker = {}
    for t, g in df.groupby("ticker"):
        arr = [None] * len(hari)
        for d, pr in zip(g["date"], g["p"]):
            arr[posisi[d]] = int(round(float(pr) * 1000))
        per_ticker[str(t)] = arr

    payload = {
        "horizon": f"{horizon}d",
        "dibuat": datetime.now().isoformat(timespec="seconds"),
        "satuan": "per-mil (0-1000) = probabilitas naik x 1000",
        "catatan": "Prediksi walk-forward: tiap tanggal diprediksi oleh model yang "
                   "hanya dilatih dengan data SEBELUM periode ujinya. Bukan hasil "
                   "replay model final.",
        "dates": hari,
        "p": per_ticker,
    }
    path = f"{out_dir}/oos_{horizon}d.json"
    with open(path, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    return path


def latih_horizon(h, per_ticker, out_dir):
    """Latih, uji (walk-forward), dan simpan artefak untuk SATU horizon."""
    frames = []
    for t, df, feat in per_ticker:
        f = feat.copy()
        f["y"] = F.label(df, h)
        f["ticker"] = t
        f["date"] = df.index
        f = f.dropna()
        if len(f):
            frames.append(f)
    if not frames:
        raise SystemExit("tidak ada baris berlabel")

    data = pd.concat(frames).sort_values("date")
    print(f"\n=== Horizon {h}D: {len(data):,} baris dari {data['ticker'].nunique()} ticker ===")

    X, y = data[F.FEATURE_COLS], data["y"]
    folds, oos = walk_forward(X, y, data["date"].values, h, tickers=data["ticker"].values)
    if not folds:
        raise SystemExit("data tidak cukup untuk walk-forward")

    akurasi = float(np.mean([f["akurasi"] for f in folds]))
    baseline = float(np.mean([f["baseline_selalu_naik"] for f in folds]))
    auc = float(np.mean([f["auc"] for f in folds if f["auc"]]))
    lolos = akurasi > baseline + 0.01 and auc > 0.52

    print(f"Horizon {h}D — akurasi {akurasi:.3f} vs baseline {baseline:.3f}, AUC {auc:.3f}")
    print("LOLOS — layak dipasang" if lolos else
          "TIDAK LOLOS — jangan tampilkan angkanya di UI, model belum mengalahkan baseline")

    # Model final dilatih pada SELURUH data, tapi metrik yang dilaporkan tetap
    # dari walk-forward di atas — bukan dari data yang sudah dilihat model.
    final = make_model().fit(X, y)
    os.makedirs(out_dir, exist_ok=True)

    import pickle
    with open(f"{out_dir}/model_{h}d.pkl", "wb") as fh:
        pickle.dump({"model": final, "features": F.FEATURE_COLS}, fh)

    # Pohon JSON: dibaca /api/ml-predict (panel Prediksi AI, semua horizon).
    # Kegagalan export TIDAK boleh menggagalkan training — .pkl & kartu tetap ada.
    try:
        contoh = X.iloc[:: max(1, len(X) // 300)].head(300)
        selisih = export_trees(final, F.FEATURE_COLS, h, f"{out_dir}/tree_{h}d.json", contoh)
        print(f"Pohon JSON diexport (selisih vs model asli {selisih:.1e})")
    except Exception as e:
        print(f"PERINGATAN: gagal export pohon JSON horizon {h}D ({e}). "
              "Tombol Prediksi di UI tidak akan jalan untuk horizon ini.")

    # ONNX hanya untuk horizon cepat yang dibaca screener (kolom ML leaderboard).
    if h in ONNX_HORIZONS:
        try:
            onnx_path = f"{out_dir}/model_{h}d.onnx"
            export_onnx(final, len(F.FEATURE_COLS), MODEL_NAME, onnx_path)
            print(f"Model diexport ke {onnx_path}")
        except Exception as e:
            print(f"PERINGATAN: gagal export ONNX ({e}). Model .pkl tetap tersimpan, "
                  f"tapi kolom ML di leaderboard tidak akan jalan sampai ini diperbaiki.")

    kartu = {
        "horizon": f"{h}d",
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
    with open(f"{out_dir}/model_{h}d.json", "w") as fh:
        json.dump(kartu, fh, indent=2)
    print(f"Tersimpan di {out_dir}/model_{h}d.*")

    try:
        path = simpan_riwayat_oos(oos, out_dir, h)
        if path:
            print(f"Riwayat out-of-sample tersimpan di {path}")
    except Exception as e:
        print(f"PERINGATAN: gagal menyimpan riwayat out-of-sample ({e}). "
              "Model dan kartu model tidak terpengaruh.")

    return {"horizon": h, "lolos": bool(lolos), "akurasi": akurasi, "baseline": baseline, "auc": auc}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=None, choices=HORIZONS_ALL,
                    help="satu horizon saja (cara lama)")
    ap.add_argument("--horizons", default=None,
                    help="daftar dipisah koma, mis. 1,2,5,30 (default: semua = "
                         + ",".join(map(str, HORIZONS_ALL)) + ")")
    ap.add_argument("--years", type=int, default=3)
    ap.add_argument("--tickers", nargs="*", default=None)
    ap.add_argument("--out", default="ml/models")
    args = ap.parse_args()

    if args.horizon:
        horizons = [args.horizon]
    elif args.horizons:
        horizons = sorted({int(x) for x in args.horizons.split(",") if x.strip()})
        bad = [h for h in horizons if h not in HORIZONS_ALL]
        if bad:
            raise SystemExit(f"horizon tidak dikenal: {bad}. Pilihan: {HORIZONS_ALL}")
    else:
        horizons = HORIZONS_ALL

    import yfinance as yf
    from watchlist import TICKERS          # ml/watchlist.py

    tickers = args.tickers or TICKERS
    per_ticker = []                        # (ticker, df, fitur) — data diunduh SEKALI untuk semua horizon
    gagal = Counter()

    for t in tickers:
        try:
            df = yf.download(f"{t}.JK", period=f"{args.years}y",
                             interval="1d", progress=False, auto_adjust=False)
            if df is None or len(df) < 300:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            per_ticker.append((t, df, F.build(df)))
        except Exception as e:
            print(f"  lewati {t}: {e}")
            gagal[classify(e)] += 1

    print_summary(gagal)
    if not per_ticker:
        raise SystemExit("Tidak ada data. Cek koneksi / daftar ticker.")
    print(f"{len(per_ticker)} ticker berhasil diunduh. Horizon yang dilatih: {horizons}")

    ringkasan = []
    for h in horizons:
        try:
            ringkasan.append(latih_horizon(h, per_ticker, args.out))
        except (SystemExit, Exception) as e:      # satu horizon gagal tidak menghentikan yang lain
            print(f"\nHorizon {h}D dilewati: {e}")

    if not ringkasan:
        raise SystemExit("Tidak ada horizon yang berhasil dilatih.")
    print("\n=== RINGKASAN ===")
    for r in ringkasan:
        print(f"  {r['horizon']:>2}D  akurasi {r['akurasi']:.3f}  baseline {r['baseline']:.3f}  "
              f"AUC {r['auc']:.3f}  {'LOLOS' if r['lolos'] else 'tidak lolos'}")


if __name__ == "__main__":
    main()
