#!/usr/bin/env python3
"""
ml/predict.py — batch job harian. Bukan inference realtime.

Alasan batch: Vercel serverless tidak cocok memuat model tiap request (cold
start, tanpa state), dan prediksi harian toh tidak berubah dalam hitungan detik.

  python ml/predict.py --horizon 1

Output: data/predictions/YYYY-MM-DD.json, dibaca frontend lewat /api/predictions.
Kalau model tidak lolos baseline, prediksinya TIDAK ditulis — lebih baik UI
tidak menampilkan apa-apa daripada menampilkan angka yang belum layak.
"""
import argparse
import json
import os
import pickle
from datetime import date

import pandas as pd
import features as F
from _diag import classify, print_summary
from collections import Counter


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=1)
    ap.add_argument("--models", default="ml/models")
    ap.add_argument("--out", default="data/predictions")
    args = ap.parse_args()

    kartu_path = f"{args.models}/model_{args.horizon}d.json"
    if not os.path.exists(kartu_path):
        raise SystemExit(f"Model {args.horizon}d belum dilatih.")

    kartu = json.load(open(kartu_path))
    if not kartu.get("lolos_baseline"):
        raise SystemExit(
            f"Model {args.horizon}d tidak mengalahkan baseline "
            f"({kartu['akurasi_walk_forward']} vs {kartu['baseline_selalu_naik']}). "
            "Prediksi tidak ditulis.")

    with open(f"{args.models}/model_{args.horizon}d.pkl", "rb") as fh:
        bundle = pickle.load(fh)

    import yfinance as yf
    from watchlist import TICKERS

    hasil = {}
    gagal = Counter()
    for t in TICKERS:
        try:
            df = yf.download(f"{t}.JK", period="1y", interval="1d",
                             progress=False, auto_adjust=False)
            if df is None or len(df) < 260:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            f = F.build(df)[bundle["features"]].dropna()
            if f.empty:
                continue
            p = float(bundle["model"].predict_proba(f.iloc[[-1]])[0, 1])
            hasil[t] = {
                "prob_naik": round(p, 4),
                "tanggal_data": str(f.index[-1])[:10],
            }
        except Exception as e:
            print(f"  lewati {t}: {e}")
            gagal[classify(e)] += 1

    print_summary(gagal)
    os.makedirs(args.out, exist_ok=True)
    payload = {
        "tanggal": str(date.today()),
        "horizon": f"{args.horizon}d",
        "model": {k: kartu[k] for k in
                  ("algoritma", "dilatih", "akurasi_walk_forward",
                   "baseline_selalu_naik", "auc")},
        "disclaimer": "Probabilitas statistik dari data historis. Bukan ramalan, bukan saran finansial.",
        "prediksi": hasil,
    }
    with open(f"{args.out}/{date.today()}-{args.horizon}d.json", "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print(f"{len(hasil)} prediksi ditulis untuk horizon {args.horizon}d.")


if __name__ == "__main__":
    main()
