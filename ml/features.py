#!/usr/bin/env python3
"""
ml/features.py — membangun matriks fitur dari OHLCV mentah.

Fitur sengaja dibatasi pada yang SUDAH dipakai aplikasi (RSI, MACD, Bollinger,
EMA, ATR, volume). Alasannya bukan malas: kalau model memakai fitur yang tidak
bisa ditampilkan di UI, user tidak punya cara memahami kenapa modelnya bilang
begitu, dan kita tidak punya cara mendeteksi kalau fiturnya rusak.

Semua fitur dihitung dari data SAMPAI bar ke-i saja. Tidak ada satu pun yang
menyentuh bar setelahnya. Ini titik paling gampang bocor di proyek time-series.
"""
import numpy as np
import pandas as pd


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    gain = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100)


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    tr = pd.concat([
        df["High"] - df["Low"],
        (df["High"] - df["Close"].shift()).abs(),
        (df["Low"] - df["Close"].shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def build(df: pd.DataFrame) -> pd.DataFrame:
    """df butuh kolom Open/High/Low/Close/Volume, index tanggal urut naik."""
    c, v = df["Close"], df["Volume"]
    out = pd.DataFrame(index=df.index)

    out["rsi14"] = rsi(c, 14)
    out["rsi9"] = rsi(c, 9)
    out["rsi14_chg3"] = out["rsi14"].diff(3)

    macd = ema(c, 12) - ema(c, 26)
    sig = ema(macd, 9)
    out["macd_hist"] = macd - sig
    out["macd_hist_chg"] = out["macd_hist"].diff()

    ma20 = c.rolling(20).mean()
    sd20 = c.rolling(20).std()
    # Posisi harga di dalam pita Bollinger: 0 = lower, 1 = upper.
    out["bb_pos"] = (c - (ma20 - 2 * sd20)) / (4 * sd20).replace(0, np.nan)
    out["bb_width"] = (4 * sd20) / ma20

    for n in (5, 20, 50):
        out[f"dist_ema{n}"] = c / ema(c, n) - 1

    a = atr(df, 14)
    out["atr_ratio"] = a / c
    out["ret_1"] = c.pct_change(1)
    out["ret_3"] = c.pct_change(3)
    out["ret_5"] = c.pct_change(5)

    vol20 = v.rolling(20).mean()
    out["vol_ratio"] = v / vol20.replace(0, np.nan)
    out["vol_trend"] = vol20 / vol20.shift(10) - 1

    out["dd_from_high"] = c / c.rolling(252, min_periods=20).max() - 1
    out["dow"] = pd.to_datetime(df.index).dayofweek

    return out


FEATURE_COLS = [
    "rsi14", "rsi9", "rsi14_chg3", "macd_hist", "macd_hist_chg",
    "bb_pos", "bb_width", "dist_ema5", "dist_ema20", "dist_ema50",
    "atr_ratio", "ret_1", "ret_3", "ret_5", "vol_ratio", "vol_trend",
    "dd_from_high", "dow",
]


def label(df: pd.DataFrame, horizon: int) -> pd.Series:
    """Target: apakah close N hari ke depan lebih tinggi dari hari ini.

    Klasifikasi biner, bukan regresi. Return saham 1-2 hari didominasi noise;
    memprediksi arah jauh lebih realistis daripada memprediksi besarannya.
    """
    return (df["Close"].shift(-horizon) > df["Close"]).astype(int)
