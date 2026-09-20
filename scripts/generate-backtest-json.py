#!/usr/bin/env python3
"""
scripts/generate-backtest-json.py

Mengubah backtest_trades_v2.csv -> data/backtest/*.json yang dibaca aplikasi.
Menggantikan build_index_js_stats() yang dulu mencetak literal JavaScript untuk
ditempel manual ke pages/index.js.

  python scripts/generate-backtest-json.py backtest_trades_v2.csv

Output:
  data/backtest/global.json          statistik per nama sinyal
  data/backtest/index.json           peta ticker -> daftar sinyal
  data/backtest/tickers/<TICKER>.json
"""
import json
import os
import sys

import numpy as np
import pandas as pd

CSV = sys.argv[1] if len(sys.argv) > 1 else "backtest_trades_v2.csv"
OUT = os.path.join("data", "backtest")
MIN_TRADES_PER_TICKER = 5

# Urutan ini menentukan urutan tab horizon di UI.
HORIZONS = [("ret_1d", "1d"), ("ret_2d", "2d"), ("ret_3d", "3d"), ("ret_5d", "5d"),
            ("ret_7d", "7d"), ("ret_14d", "14d"), ("ret_30d", "30d"), ("ret_60d", "60d")]


def stats_block(series: pd.Series) -> dict | None:
    s = series.dropna()
    if len(s) == 0:
        return None
    return {
        "wr":  round(float((s > 0).mean() * 100), 1),
        "avg": round(float(s.mean()), 2),
        "n":   int(len(s)),
        "p10": round(float(np.percentile(s, 10)), 2),
        "p25": round(float(np.percentile(s, 25)), 2),
        "p50": round(float(np.percentile(s, 50)), 2),
        "p75": round(float(np.percentile(s, 75)), 2),
        "p90": round(float(np.percentile(s, 90)), 2),
    }


def by_horizon(df: pd.DataFrame) -> dict:
    out = {}
    for col, key in HORIZONS:
        if col not in df.columns:
            continue          # horizon belum di-backtest — dilewati, bukan diisi nol
        blk = stats_block(df[col])
        if blk:
            out[key] = blk
    return out


def best_horizon(bh: dict) -> str | None:
    # "Terbaik" = win rate tertinggi dengan sampel minimal layak.
    layak = {k: v for k, v in bh.items() if v["n"] >= 10} or bh
    return max(layak, key=lambda k: layak[k]["wr"]) if layak else None


def main():
    df = pd.read_csv(CSV)
    print(f"{len(df):,} baris dibaca dari {CSV}")

    ada = [k for c, k in HORIZONS if c in df.columns]
    hilang = [k for c, k in HORIZONS if c not in df.columns]
    print(f"Horizon tersedia: {', '.join(ada)}")
    if hilang:
        print(f"Horizon BELUM ada: {', '.join(hilang)} "
              f"-> jalankan ulang backtest_bei.py versi baru dulu.")

    os.makedirs(os.path.join(OUT, "tickers"), exist_ok=True)

    # ── global per sinyal ──
    global_stats = {}
    for signal, g in df.groupby("signal"):
        bh = by_horizon(g)
        if not bh:
            continue
        bestk = best_horizon(bh)
        global_stats[signal] = {
            "winRate": bh[bestk]["wr"],
            "avgRet": bh[bestk]["avg"],
            "bestHorizon": bestk,
            "count": int(len(g)),
            "category": str(g["category"].iloc[0]) if "category" in g else None,
            "byHorizon": bh,
        }
    with open(os.path.join(OUT, "global.json"), "w") as f:
        json.dump(global_stats, f, separators=(",", ":"))
    print(f"global.json: {len(global_stats)} sinyal")

    # ── per ticker x sinyal ──
    index = {}
    pairs = 0
    for ticker, gt in df.groupby("ticker"):
        per_signal = {}
        for signal, g in gt.groupby("signal"):
            if len(g) < MIN_TRADES_PER_TICKER:
                continue      # sampel terlalu kecil untuk dipercaya
            bh = by_horizon(g)
            if not bh:
                continue
            bestk = best_horizon(bh)
            per_signal[signal] = {
                "wr": bh[bestk]["wr"], "avg": bh[bestk]["avg"],
                "best": bestk, "n": int(len(g)), "bh": bh,
            }
        if not per_signal:
            continue
        with open(os.path.join(OUT, "tickers", f"{ticker}.json"), "w") as f:
            json.dump(per_signal, f, separators=(",", ":"))
        index[ticker] = list(per_signal.keys())
        pairs += len(per_signal)

    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))
    print(f"{len(index)} ticker, {pairs} pasangan ticker x sinyal")
    print("Selesai. Aplikasi membacanya lewat /api/backtest-stats.")


if __name__ == "__main__":
    main()
