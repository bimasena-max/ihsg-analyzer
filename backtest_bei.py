#!/usr/bin/env python3
"""
IHSG Signal Backtest v2 — FIXED
================================
Perbaikan dari versi sebelumnya:

  BUG 1 FIXED — Early exit contamination:
    Sebelumnya: exit_idx = min(entry_idx + hold, len(closes) - 1)
    → Trade recent dihitung pakai exit lebih awal, return kelihatan valid tapi salah
    Sesudahnya: kalau data tidak cukup, return None (NaN) — trade ini di-exclude
    dari perhitungan WR/avg/distribusi

  BUG 2 FIXED — BPJS/BSJP semua horizon identik:
    Sebelumnya: ret_3d = ret_5d = ... = ret_60d = overnight return
    → Di modal distribusi semua tab tampilkan angka sama (misleading)
    Sesudahnya: Intraday tetap punya ret overnight sebagai "native",
    tapi horizon 3d, 5d, dst dihitung sebagai holding period yang sebenarnya
    (beli same entry point, jual di hari ke-N)

  BUG 3 NOTED — TICKER_SIGNAL_STATS di index.js stale:
    Setelah script ini selesai, jalankan generate_index_stats.py
    untuk rebuild BACKTEST_STATS dan TICKER_SIGNAL_STATS dari CSV baru

Cara pakai:
  pip install yfinance pandas numpy tqdm
  python backtest_bei_v2_fixed.py
  python backtest_bei_v2_fixed.py --tickers BBCA BBRI BMRI
  python backtest_bei_v2_fixed.py --workers 2 --years 3
"""

import argparse
import os
import random
import sys
import time
import warnings
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional

import numpy as np
import pandas as pd
import yfinance as yf
from tqdm import tqdm

warnings.filterwarnings("ignore")

# ══════════════════════════════════════════════════════════════════════════════
# SIGNAL NAME CONSTANTS
# ══════════════════════════════════════════════════════════════════════════════

SIG_RSI_BB          = "RSI+BB Lower Bounce"
SIG_MACD_CROSS      = "MACD Crossover Bullish"
SIG_GOLDEN_CROSS    = "Golden Cross EMA20/50"
SIG_RSI_RECOVERY    = "RSI Recovery + 2 Candle Hijau"
SIG_STOCH_OB        = "Stochastic Oversold + Naik"
SIG_RSI9_EMA5       = "RSI-9 Pullback ke EMA5"
SIG_STOCH_DEEP      = "Stochastic Deeply Oversold"
SIG_VOL_SPIKE       = "Volume Spike Sideways"
SIG_VOL_AVG_UP      = "Volume Avg Naik Terkontrol"
SIG_VOL_DRY         = "Volume Exhaustion Bottom"
SIG_ACCUM_HIDDEN    = "Akumulasi Tersembunyi"
SIG_CANDLE_COMPRESS = "Candle Compression"
SIG_VOL_EXPLODE     = "Volume Meledak"
SIG_RSI_QUIET       = "RSI Recovery Diam-diam"
SIG_BREAKOUT        = "Breakout Konsolidasi"
SIG_BPJS            = "BPJS Beli Pagi Jual Sore"
SIG_BSJP            = "BSJP Beli Sore Jual Pagi"

SIGNAL_CATEGORY = {
    SIG_RSI_BB:          "Swing",
    SIG_MACD_CROSS:      "Swing",
    SIG_GOLDEN_CROSS:    "Swing",
    SIG_RSI_RECOVERY:    "Swing",
    SIG_STOCH_OB:        "Scalp",
    SIG_RSI9_EMA5:       "Scalp",
    SIG_STOCH_DEEP:      "Scalp",
    SIG_VOL_SPIKE:       "Akumulasi",
    SIG_VOL_AVG_UP:      "Akumulasi",
    SIG_VOL_DRY:         "Akumulasi",
    SIG_ACCUM_HIDDEN:    "Pre-ARA",
    SIG_CANDLE_COMPRESS: "Pre-ARA",
    SIG_VOL_EXPLODE:     "Pre-ARA",
    SIG_RSI_QUIET:       "Pre-ARA",
    SIG_BREAKOUT:        "Pre-ARA",
    SIG_BPJS:            "Intraday",
    SIG_BSJP:            "Intraday",
}

INTRADAY_SIGNALS = {SIG_BPJS, SIG_BSJP}

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════════════

IHSG_WATCHLIST = [
    "BBCA","BBRI","BMRI","TLKM","ASII","GOTO","BREN","TPIA","AMMN","ADRO",
    "UNVR","ICBP","KLBF","SIDO","MYOR","INDF","HMSP","GGRM","BUKA","ACES",
    "EMTK","MIKA","HEAL","SILO","CPIN","JPFA","MAIN","BISI","LSIP",
    "ANTM","MDKA","INCO","ITMG","PTBA","BYAN","HRUM","ELSA","MEDC","AKRA",
    "SMGR","INTP","BRPT","TKIM","INKP","PWON","BSDE","SMRA","CTRA","DMAS",
    "JSMR","TOWR","MTEL","TBIG","ISAT","EXCL","BBNI","BBTN","MEGA","PGAS",
    "AALI","ADHI","AGRO","ALTO","AMFG","AMRT","ARNA","AUTO","BABP","BALI",
    "BANK","BDMN","BFIN","BGTG","BKSL","BMTR","BNII","BNLI","BOSS","BPFI",
    "BRAM","BRNA","BTEK","BTPN","BULL","BUMI","BVIC","CARS","CASA","CEKA",
    "CENT","CFIN","CITA","CLPI","CMNP","CMRY","CSAP","CTBN","CTTH","DART",
    "DEWA","DGIK","DILD","DLTA","DNET","DSSA","DVLA","EKAD","ELTY","EMDE",
    "EPMT","ERAA","ESSA","FAST","FASW","FILM","FISH","FMII","FOOD","GAMA",
    "GDST","GEMA","GJTL","GLOB","GLVA","GMFI","GPRA","GZCO","HERO","HITS",
    "HOME","HOTL","IBST","ICON","IGAR","IKAI","IMAS","IMJS","IMPC","INAF",
    "INAI","INCI","INDS","INPC","INRU","INTD","IPCC","IPOL","ISSP","ITIC",
    "JKON","JRPT","JSPT","JTPE","KBLI","KBLM","KDSI","KEEN","KIJA","KINO",
    "KIOS","KOIN","KPIG","KRAS","LCKM","LEAD","LINK","LION","LMAS","LPCK",
    "LPGI","LPIN","LPKR","LRNA","LTLS","MAMI","MAPI","MBSS","MDLN","META",
    "MIDI","MKPI","MLBI","MLPL","MMLP","MNCN","MOLI","MPPA","MRAT","MSKY",
    "MTDL","MTLA","MYOH","NELY","NISP","NRCA","NUSA","OMRE","PADI","PANR",
    "PCAR","PDES","PEGE","PICO","PJAA","PKPK","PLAN","PNBN","PNLF","POOL",
    "PPRE","PRDA","PSAB","PTPP","PTRO","PUDP","RAJA","RANC","RELI","RICY",
    "RIGS","RODA","ROTI","SAME","SCCO","SCMA","SDRA","SGRO","SKBM","SKLT",
    "SMBR","SMCB","SMDR","SMSM","SOCI","SOFA","SONA","SQMI","SRTG","SSIA",
    "SSMS","STAR","STTP","SULI","TALF","TARA","TBLA","TCID","TELE","TFCO",
    "TGKA","TINS","TMAS","TOBA","TOPS","TOTL","TOTO","TRIM","TRIS","TRST",
    "TSPC","ULTJ","UNIC","UNIT","UNTR","VICO","VINS","VIVA","VOKS","VRNA",
    "WAPO","WEHA","WICO","WINS","WSBP","WSKT","WTON","ZINC",
]

LOOKBACK_YEARS  = 3
MAX_WORKERS     = 2
MIN_DATA_BARS   = 60
HOLD_DAYS       = [3, 5, 7, 14, 30, 60]
COMMISSION_PCT  = 0.15   # beli+jual total

# ══════════════════════════════════════════════════════════════════════════════
# INDICATORS (tidak berubah dari versi sebelumnya)
# ══════════════════════════════════════════════════════════════════════════════

def calc_ema(arr: np.ndarray, period: int) -> np.ndarray:
    k   = 2 / (period + 1)
    out = np.empty(len(arr))
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = arr[i] * k + out[i-1] * (1 - k)
    return out


def calc_rsi(closes: np.ndarray, period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    avg_g = avg_l = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i-1]
        avg_g += max(d, 0)
        avg_l += max(-d, 0)
    avg_g /= period
    avg_l /= period
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i-1]
        avg_g = (avg_g * (period - 1) + max(d, 0)) / period
        avg_l = (avg_l * (period - 1) + max(-d, 0)) / period
    return 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)


def calc_macd(closes: np.ndarray):
    ema12  = calc_ema(closes, 12)
    ema26  = calc_ema(closes, 26)
    macd   = ema12 - ema26
    signal = calc_ema(macd, 9)
    hist   = macd - signal
    return hist


def calc_bollinger(closes: np.ndarray, period: int = 20):
    upper = np.full(len(closes), np.nan)
    lower = np.full(len(closes), np.nan)
    for i in range(period - 1, len(closes)):
        sl = closes[i-period+1:i+1]
        m, s = sl.mean(), sl.std()
        upper[i] = m + 2 * s
        lower[i] = m - 2 * s
    return upper, lower


def calc_atr(highs, lows, closes, period: int = 14) -> np.ndarray:
    n   = len(closes)
    atr = np.full(n, np.nan)
    trs = []
    for i in range(1, n):
        tr = max(highs[i]-lows[i], abs(highs[i]-closes[i-1]), abs(lows[i]-closes[i-1]))
        trs.append(tr)
    trs = np.array(trs)
    val = trs[:period].mean()
    atr[period] = val
    for i in range(period, len(trs)):
        val = (val * (period - 1) + trs[i]) / period
        atr[i+1] = val
    return atr


def calc_stochastic(highs, lows, closes, period: int = 14):
    k = np.full(len(closes), np.nan)
    for i in range(period - 1, len(closes)):
        h   = highs[i-period+1:i+1].max()
        l   = lows[i-period+1:i+1].min()
        rng = h - l
        k[i] = 50.0 if rng == 0 else (closes[i] - l) / rng * 100
    d = np.full(len(closes), np.nan)
    for i in range(2, len(closes)):
        if not (np.isnan(k[i]) or np.isnan(k[i-1]) or np.isnan(k[i-2])):
            d[i] = (k[i] + k[i-1] + k[i-2]) / 3
    return k, d


# ══════════════════════════════════════════════════════════════════════════════
# RETURN CALCULATION — FIXED
# ══════════════════════════════════════════════════════════════════════════════

def calc_return(closes: np.ndarray, entry_idx: int, hold: int) -> Optional[float]:
    """
    Return % setelah hold hari dari entry_idx, sudah dikurangi komisi.

    FIX BUG 1: Kalau data tidak cukup (exit_idx >= len(closes)),
    return None — jangan pakai early exit yang menghasilkan angka salah.
    Trade ini akan muncul sebagai NaN di CSV dan di-exclude dari stats.
    """
    exit_idx = entry_idx + hold
    if exit_idx >= len(closes):
        # Data tidak cukup — jangan gunakan early exit
        return None
    ret = (closes[exit_idx] / closes[entry_idx] - 1) * 100 - COMMISSION_PCT
    return round(ret, 4)


# ══════════════════════════════════════════════════════════════════════════════
# SIGNAL DETECTOR (tidak berubah dari versi sebelumnya)
# ══════════════════════════════════════════════════════════════════════════════

def detect_signals(closes, opens, highs, lows, volumes, i: int):
    c  = closes[:i+1]
    o  = opens[:i+1]
    h  = highs[:i+1]
    l  = lows[:i+1]
    v  = volumes[:i+1]
    n  = len(c)

    if n < MIN_DATA_BARS:
        return []

    price   = c[-1]
    signals = []

    rsi14          = calc_rsi(c, 14)
    rsi9           = calc_rsi(c, 9)
    ema20          = calc_ema(c, 20)
    ema50          = calc_ema(c, 50)
    ema5           = calc_ema(c, 5)
    ema13          = calc_ema(c, 13)
    bb_u, bb_l     = calc_bollinger(c, 20)
    atr_arr        = calc_atr(h, l, c, 14)
    atr            = atr_arr[-1] if not np.isnan(atr_arr[-1]) else price * 0.02
    macd_hist      = calc_macd(c)
    stoch_k, stoch_d = calc_stochastic(h, l, c, 9)

    if atr <= 0 or price <= 0:
        return []

    atr_r = atr / price

    # Swing
    if rsi14 < 40 and not np.isnan(bb_l[-1]) and price < bb_l[-1] * 1.05:
        signals.append((SIG_RSI_BB, 80))
    if n >= 2 and macd_hist[-1] > 0 and macd_hist[-2] <= 0 and price > ema20[-1] * 0.97:
        signals.append((SIG_MACD_CROSS, 75))
    if n >= 2 and ema20[-1] > ema50[-1] and ema20[-2] <= ema50[-2]:
        signals.append((SIG_GOLDEN_CROSS, 85))
    if 30 < rsi14 < 45 and n >= 3 and c[-1] > c[-2] > c[-3]:
        signals.append((SIG_RSI_RECOVERY, 70))

    # Scalp
    if atr_r > 0.012:
        if (not np.isnan(stoch_k[-1]) and stoch_k[-1] < 25 and
                n >= 2 and not np.isnan(stoch_k[-2]) and
                stoch_k[-1] > stoch_k[-2] and ema5[-1] > ema13[-1] * 0.98):
            signals.append((SIG_STOCH_OB, 85))
        if rsi9 < 35 and price < ema5[-1] and ema5[-1] > ema13[-1] * 0.98:
            signals.append((SIG_RSI9_EMA5, 78))
        if (not np.isnan(stoch_k[-1]) and stoch_k[-1] < 15 and
                not np.isnan(stoch_d[-1]) and stoch_d[-1] < 20):
            signals.append((SIG_STOCH_DEEP, 88))

    # Accumulation
    if n >= 50 and len(v) >= 50:
        avg_vol20   = v[-20:].mean()
        avg_vol50   = v[-50:].mean()
        recent_vol5 = v[-5:].mean()
        price_chg20 = (c[-1] - c[-20]) / c[-20] * 100 if c[-20] > 0 else 0

        if avg_vol20 > 0:
            if recent_vol5 > avg_vol20 * 1.3 and abs(price_chg20) < 8:
                strength = min(90, int(recent_vol5 / avg_vol20 * 35))
                signals.append((SIG_VOL_SPIKE, strength))
            if avg_vol20 > avg_vol50 * 1.2 and 0 < price_chg20 < 15:
                signals.append((SIG_VOL_AVG_UP, 75))
            if recent_vol5 < avg_vol20 * 0.7 and price_chg20 < -8:
                signals.append((SIG_VOL_DRY, 70))

    # Pre-ARA
    if n >= 30 and len(v) >= 20:
        avg_vol20 = v[-20:].mean()
        avg_vol5  = v[-5:].mean()
        avg_vol3  = v[-3:].mean()

        if avg_vol20 > 0:
            pc5 = (c[-1] - c[-6]) / c[-6] * 100 if n >= 6 and c[-6] > 0 else 0
            high20 = h[-20:].max()
            low20  = l[-20:].min()
            range20_pct = (high20 - low20) / low20 * 100 if low20 > 0 else 0
            avg_range5  = (h[-5:] - l[-5:]).mean() if n >= 5 else 0
            avg_range20 = (h[-20:] - l[-20:]).mean() if n >= 20 else 1
            compression = avg_range5 / avg_range20 if avg_range20 > 0 else 1
            rsi_arr   = [calc_rsi(c[:j+1]) for j in range(max(0, n-10), n)]
            rsi_slope = rsi_arr[-1] - rsi_arr[0] if len(rsi_arr) >= 2 else 0
            consolidation_h = h[-10:-1].max() if n >= 10 else h[-1]
            last_vol = v[-1]

            if avg_vol5 > avg_vol20 * 1.8 and abs(pc5) < 5:
                score = min(30, int((avg_vol5 / avg_vol20) * 12))
                signals.append((SIG_ACCUM_HIDDEN, score))
            if compression < 0.55:
                score = int((1 - compression) * 25)
                signals.append((SIG_CANDLE_COMPRESS, score))
            if last_vol > avg_vol20 * 3 and c[-1] >= c[-2] * 0.99:
                score = min(25, int((last_vol / avg_vol20) * 6))
                signals.append((SIG_VOL_EXPLODE, score))
            if rsi14 > 30 and rsi14 < 55 and rsi_slope > 8:
                score = min(20, int(rsi_slope * 1.2))
                signals.append((SIG_RSI_QUIET, score))
            if c[-1] > consolidation_h * 1.01 and last_vol > avg_vol20 * 1.5 and range20_pct < 15:
                signals.append((SIG_BREAKOUT, 25))

    # Intraday
    sample = min(60, n)
    if n >= 20 and len(o) >= 20:
        valid = [(o[j], c[j]) for j in range(n-sample, n) if o[j] and o[j] > 0]
        if len(valid) >= 15:
            bull    = [(oc, cc) for oc, cc in valid if cc > oc]
            bear    = [(oc, cc) for oc, cc in valid if cc <= oc]
            wr      = len(bull) / len(valid)
            avg_g   = np.mean([(cc-oc)/oc*100 for oc, cc in bull]) if bull else 0
            avg_l   = np.mean([(oc-cc)/oc*100 for oc, cc in bear]) if bear else 0
            exp     = wr * avg_g - (1 - wr) * avg_l
            if wr >= 0.60 and exp >= 0.25:
                signals.append((SIG_BPJS, min(95, int(wr * 70 + exp * 10))))

    if n >= 20 and len(o) >= 21:
        gaps = []
        for j in range(n-sample+1, n):
            if c[j-1] > 0:
                gap = (o[j] - c[j-1]) / c[j-1] * 100
                if abs(gap) > 0.2:
                    gaps.append(gap)
        if gaps:
            gap_ups   = [g for g in gaps if g > 0]
            gap_downs = [g for g in gaps if g < 0]
            total     = len(gap_ups) + len(gap_downs)
            if total >= 10:
                wr    = len(gap_ups) / total
                avg_g = np.mean(gap_ups) if gap_ups else 0
                avg_l = abs(np.mean(gap_downs)) if gap_downs else 0
                exp   = wr * avg_g - (1 - wr) * avg_l
                if wr >= 0.60 and exp >= 0.25:
                    signals.append((SIG_BSJP, min(95, int(wr * 70 + exp * 10))))

    return signals


# ══════════════════════════════════════════════════════════════════════════════
# PER-TICKER BACKTEST — FIXED
# ══════════════════════════════════════════════════════════════════════════════

# FIX — sebelumnya semua exception ditelan (`except Exception: pass`), jadi
# kalau Yahoo memblokir IP (429/999) atau jaringan tidak bisa connect sama
# sekali, script ini gagal total untuk SEMUA ticker dan cuma mencetak
# "Tidak ada trade" tanpa alasan. Sekarang alasan kegagalan dikategorikan dan
# dihitung, supaya jelas apakah ini masalah rate-limit, auth, atau jaringan.
FAILURE_REASONS = Counter()
_reason_lock = threading.Lock()


def _classify_failure(exc: Exception) -> str:
    msg = str(exc).lower()
    if "429" in msg or "too many requests" in msg or "rate limit" in msg:
        return "RATE_LIMIT (429) — Yahoo membatasi IP ini, bukan koneksi mati"
    if "999" in msg:
        return "BLOCKED (999) — Yahoo menolak IP/fingerprint permintaan ini"
    if "401" in msg or "403" in msg or "crumb" in msg or "cookie" in msg:
        return "AUTH — sesi/crumb Yahoo ditolak"
    if any(k in msg for k in ("timed out", "timeout")):
        return "TIMEOUT — server tidak membalas dalam waktu wajar"
    if any(k in msg for k in ("connection", "resolve", "dns", "refused", "unreachable")):
        return "NETWORK — tidak bisa terhubung sama sekali (kemungkinan diblokir jaringan/ISP)"
    return f"LAIN — {type(exc).__name__}: {str(exc)[:120]}"


def download_with_retry(sym, start_str, end_str, retries=3):
    last_exc = None
    for attempt in range(retries):
        try:
            df = yf.download(sym, start=start_str, end=end_str,
                             interval="1d", auto_adjust=True,
                             progress=False, timeout=15)
            if df is not None and len(df) >= MIN_DATA_BARS:
                return df
            if df is not None and len(df) == 0:
                last_exc = RuntimeError("respons kosong (0 baris) — bukan error, tapi juga bukan data")
        except Exception as e:
            last_exc = e
        time.sleep(random.uniform(1.5, 4.0) * (attempt + 1))

    if last_exc is not None:
        with _reason_lock:
            FAILURE_REASONS[_classify_failure(last_exc)] += 1
    return None


def flatten_columns(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def get_sector(ticker: str) -> str:
    try:
        info = yf.Ticker(f"{ticker}.JK").info
        return info.get("sector", "—") or "—"
    except Exception:
        return "—"


@dataclass
class TradeRow:
    ticker:   str
    date:     str
    signal:   str
    category: str
    price:    float
    sector:   str
    ret_1d:   Optional[float]
    ret_2d:   Optional[float]
    ret_3d:   Optional[float]
    ret_5d:   Optional[float]
    ret_7d:   Optional[float]
    ret_14d:  Optional[float]
    ret_30d:  Optional[float]
    ret_60d:  Optional[float]
    # FIX BUG 4 — kolom sendiri untuk return native intraday/overnight.
    # Sebelumnya nilai ini dijejalkan ke ret_3d untuk BPJS/BSJP, jadi kolom
    # "3 hari" di UI sebenarnya angka 1 hari untuk dua sinyal itu.
    ret_intraday: Optional[float] = None


def backtest_ticker(ticker: str) -> List[TradeRow]:
    sym        = f"{ticker}.JK"
    end_date   = datetime.today()
    start_date = end_date - timedelta(days=LOOKBACK_YEARS * 365 + 60)

    df = download_with_retry(sym,
                             start_date.strftime("%Y-%m-%d"),
                             end_date.strftime("%Y-%m-%d"))
    if df is None or len(df) == 0:
        return []

    df = flatten_columns(df)

    required = ["Close", "Open", "High", "Low", "Volume"]
    if not all(c in df.columns for c in required):
        return []

    df.dropna(subset=required, inplace=True)
    if len(df) < MIN_DATA_BARS + max(HOLD_DAYS) + 5:
        return []

    closes  = df["Close"].values.astype(float)
    opens   = df["Open"].values.astype(float)
    highs   = df["High"].values.astype(float)
    lows    = df["Low"].values.astype(float)
    volumes = df["Volume"].values.astype(float)
    dates   = df.index.tolist()

    sector = get_sector(ticker)

    rows: List[TradeRow] = []
    last_sig_bar = {}

    # FIX BUG 1: Hapus limit = len(closes) - max_hold - 2
    # Sekarang kita scan SEMUA bar, dan calc_return akan return None
    # kalau data tidak cukup. Trade dengan NaN di-include di CSV
    # tapi di-exclude saat hitung stats.
    # Loop sampai bar terakhir yang ada sinyal (tidak perlu buffer 60 hari)
    for i in range(MIN_DATA_BARS, len(closes) - 1):
        sigs = detect_signals(closes, opens, highs, lows, volumes, i)

        for sig_name, _ in sigs:
            if i - last_sig_bar.get(sig_name, -999) < 5:
                continue
            last_sig_bar[sig_name] = i

            entry_idx = i + 1
            ep        = opens[entry_idx]
            if ep <= 0:
                continue

            entry_date = str(dates[entry_idx])[:10]
            category   = SIGNAL_CATEGORY.get(sig_name, "—")

            # FIX BUG 2: BPJS — hitung return native (open→close same day)
            # DAN juga hitung holding period 3d/5d/7d dst dari entry point
            if sig_name == SIG_BPJS:
                # Native return: beli open, jual close hari yang sama
                intraday_ret = round(
                    (closes[entry_idx] / ep - 1) * 100 - COMMISSION_PCT, 4
                )
                # Multi-horizon: dari entry point yang sama, hold N hari
                # Ini berguna untuk distribusi per horizon yang bermakna
                r1  = calc_return(closes, entry_idx, 1)
                r2  = calc_return(closes, entry_idx, 2)
                r3  = calc_return(closes, entry_idx, 3)
                r5  = calc_return(closes, entry_idx, 5)
                r7  = calc_return(closes, entry_idx, 7)
                r14 = calc_return(closes, entry_idx, 14)
                r30 = calc_return(closes, entry_idx, 30)
                r60 = calc_return(closes, entry_idx, 60)
                rows.append(TradeRow(
                    ticker=ticker, date=entry_date, signal=sig_name,
                    category=category, price=round(ep, 2), sector=sector,
                    # ret_3d sekarang BENAR-BENAR 3 hari. Return native BPJS
                    # pindah ke kolomnya sendiri.
                    ret_1d=r1, ret_2d=r2, ret_3d=r3,
                    ret_5d=r5, ret_7d=r7, ret_14d=r14, ret_30d=r30, ret_60d=r60,
                    ret_intraday=intraday_ret,
                ))
                continue

            # FIX BUG 2: BSJP — hitung return native (close→open next day)
            # DAN juga hitung holding period dari close entry
            if sig_name == SIG_BSJP:
                if entry_idx + 1 >= len(closes):
                    continue
                buy_price = closes[i]   # entry: close bar i
                sel_price = opens[entry_idx + 1]  # exit: open bar i+1
                if buy_price <= 0 or sel_price <= 0:
                    continue
                overnight_ret = round(
                    (sel_price / buy_price - 1) * 100 - COMMISSION_PCT, 4
                )
                # Multi-horizon dari entry point (close bar i)
                r1  = calc_return(closes, i, 1)
                r2  = calc_return(closes, i, 2)
                r3  = calc_return(closes, i, 3)
                r5  = calc_return(closes, i, 5)
                r7  = calc_return(closes, i, 7)
                r14 = calc_return(closes, i, 14)
                r30 = calc_return(closes, i, 30)
                r60 = calc_return(closes, i, 60)
                rows.append(TradeRow(
                    ticker=ticker, date=str(dates[i])[:10], signal=sig_name,
                    category=category, price=round(float(buy_price), 2),
                    sector=sector,
                    ret_1d=r1, ret_2d=r2, ret_3d=r3,
                    ret_5d=r5, ret_7d=r7, ret_14d=r14, ret_30d=r30, ret_60d=r60,
                    ret_intraday=overnight_ret,
                ))
                continue

            # Sinyal biasa: hitung semua horizon
            # calc_return akan return None kalau data tidak cukup (BUG 1 FIX)
            r1  = calc_return(closes, entry_idx, 1)
            r2  = calc_return(closes, entry_idx, 2)
            r3  = calc_return(closes, entry_idx, 3)
            r5  = calc_return(closes, entry_idx, 5)
            r7  = calc_return(closes, entry_idx, 7)
            r14 = calc_return(closes, entry_idx, 14)
            r30 = calc_return(closes, entry_idx, 30)
            r60 = calc_return(closes, entry_idx, 60)

            rows.append(TradeRow(
                ticker=ticker, date=entry_date, signal=sig_name,
                category=category, price=round(ep, 2), sector=sector,
                ret_1d=r1, ret_2d=r2, ret_3d=r3, ret_5d=r5, ret_7d=r7,
                ret_14d=r14, ret_30d=r30, ret_60d=r60,
            ))

    return rows


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY BUILDER + INDEX.JS STATS GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

def build_summary(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (sig, cat), grp in df.groupby(["signal", "category"]):
        for col, horizon in [("ret_1d","1d"),("ret_2d","2d"),
                              ("ret_3d","3d"),("ret_5d","5d"),("ret_7d","7d"),
                              ("ret_14d","14d"),("ret_30d","30d"),("ret_60d","60d")]:
            rets = grp[col].dropna()  # NaN di-exclude otomatis
            n    = len(rets)
            if n == 0:
                continue
            wins = rets[rets > 0]
            loss = rets[rets <= 0]
            wr   = len(wins) / n * 100
            avg_g = wins.mean() if len(wins) > 0 else 0
            avg_l = loss.mean() if len(loss) > 0 else 0
            pf    = abs(wins.sum() / loss.sum()) if loss.sum() != 0 else 999.0
            exp   = wr / 100 * avg_g + (1 - wr / 100) * avg_l
            rows.append({
                "Signal":       sig,
                "Category":     cat,
                "Horizon":      horizon,
                "Trades":       n,
                "WinRate%":     round(wr, 1),
                "AvgReturn%":   round(rets.mean(), 3),
                "AvgWin%":      round(avg_g, 3),
                "AvgLoss%":     round(avg_l, 3),
                "ProfitFactor": round(min(pf, 999), 2),
                "Expectancy%":  round(exp, 3),
                "MaxLoss%":     round(rets.min(), 3),
                "TotalReturn%": round(rets.sum(), 2),
            })
    return pd.DataFrame(rows).sort_values(["Category", "Signal", "Horizon"])


def build_index_js_stats(df: pd.DataFrame) -> str:
    """
    Generate BACKTEST_STATS dan TICKER_SIGNAL_STATS untuk di-paste ke index.js.
    WR dihitung dari ret > 0, konsisten dengan distribusi di modal.
    """
    lines = []
    lines.append("// ── BACKTEST STATS (auto-generated dari backtest_bei_v2_fixed.py) ─────────")
    lines.append(f"// Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"// Total trades: {len(df):,}")
    lines.append("// WR = % trade dengan return > 0 (fixed-horizon exit, NaN di-exclude)")
    lines.append("const BACKTEST_STATS = {")

    horizon_cols = [("ret_1d","1d"),("ret_2d","2d"),
                    ("ret_3d","3d"),("ret_5d","5d"),("ret_7d","7d"),
                    ("ret_14d","14d"),("ret_30d","30d"),("ret_60d","60d")]

    for sig, grp in df.groupby("signal"):
        bh_parts = []
        best_wr, best_h = 0, "7d"

        for col, h in horizon_cols:
            rets = grp[col].dropna()
            n = len(rets)
            if n == 0:
                continue
            wr  = round((rets > 0).mean() * 100, 1)
            avg = round(rets.mean(), 2)
            bh_parts.append(f"'{h}':{{wr:{wr},avg:{avg}}}")
            if wr > best_wr:
                best_wr, best_h = wr, h

        # Gunakan best horizon untuk top-level stats
        best_col = f"ret_{best_h}"
        best_rets = grp[best_col].dropna()
        n_total = len(best_rets)
        avg_best = round(best_rets.mean(), 2)

        bh_str = ", ".join(bh_parts)
        lines.append(f"  '{sig}': {{")
        lines.append(f"    winRate: {best_wr}, avgRet: {avg_best}, bestHorizon: '{best_h} hari',")
        lines.append(f"    holdDays: '—', count: {n_total},")
        lines.append(f"    byHorizon: {{ {bh_str} }},")
        lines.append(f"  }},")

    lines.append("};")
    lines.append("")

    # Per-ticker stats
    lines.append("// ── Per-ticker backtest stats ──")
    lines.append("const TICKER_SIGNAL_STATS = {")

    for ticker, tgrp in df.groupby("ticker"):
        sig_parts = []
        for sig, sgrp in tgrp.groupby("signal"):
            bh_parts = []
            best_wr, best_h = 0, "7d"

            for col, h in horizon_cols:
                rets = sgrp[col].dropna()
                n = len(rets)
                if n < 3:  # skip kalau sampel terlalu kecil
                    continue
                wr  = round((rets > 0).mean() * 100, 1)
                avg = round(rets.mean(), 2)
                p10 = round(rets.quantile(0.10), 2)
                p25 = round(rets.quantile(0.25), 2)
                p50 = round(rets.quantile(0.50), 2)
                p75 = round(rets.quantile(0.75), 2)
                p90 = round(rets.quantile(0.90), 2)
                bh_parts.append(
                    f"'{h}':{{wr:{wr},avg:{avg},n:{n},"
                    f"p10:{p10},p25:{p25},p50:{p50},p75:{p75},p90:{p90}}}"
                )
                if wr > best_wr:
                    best_wr, best_h = wr, h

            if not bh_parts:
                continue

            best_col = f"ret_{best_h}"
            best_rets = sgrp[best_col].dropna()
            n_total = len(best_rets)
            if n_total < 3:
                continue
            avg_best = round(best_rets.mean(), 2)
            bh_str = ", ".join(bh_parts)
            sig_parts.append(
                f"    '{sig}': {{wr:{best_wr},avg:{avg_best},best:'{best_h}',n:{n_total},bh:{{{bh_str}}}}}"
            )

        if sig_parts:
            lines.append(f"  '{ticker}': {{")
            lines.append(",\n".join(sig_parts))
            lines.append("  },")

    lines.append("};")
    return "\n".join(lines)


def print_report(df: pd.DataFrame, summary: pd.DataFrame, tickers_done: int):
    print("\n" + "="*70)
    print("  IHSG SIGNAL BACKTEST v2 FIXED — REPORT")
    print(f"  Generated : {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("="*70)
    print(f"\n  Total Trades (incl. NaN) : {len(df):,}")

    # Show NaN stats
    for col in ['ret_1d','ret_2d','ret_3d','ret_5d','ret_7d','ret_14d','ret_30d','ret_60d']:
        n_nan = df[col].isna().sum()
        pct   = n_nan / len(df) * 100
        print(f"  NaN {col:>8}: {n_nan:,} ({pct:.1f}%) — excluded dari WR/avg")

    print(f"\n  Tickers: {tickers_done} | Periode: {LOOKBACK_YEARS} tahun")
    print(f"  Commission: {COMMISSION_PCT}%")

    print("\n" + "-"*70)
    print("  TOP 15 SINYAL (WinRate, min 20 trades, horizon 7d)")
    print("-"*70)
    top = summary[(summary["Horizon"] == "7d") & (summary["Trades"] >= 20)]
    top = top.sort_values("WinRate%", ascending=False).head(15)
    for _, r in top.iterrows():
        print(f"  {r['Signal']:<35} WR={r['WinRate%']:>5.1f}% "
              f"Avg={r['AvgReturn%']:>+6.2f}% N={r['Trades']}")

    print("\n" + "-"*70)
    print("  INTRADAY — ret_intraday = native return (overnight/intraday)")
    print("           — ret_1d/2d/3d/dst = holding period sebenarnya, semua sinyal")
    print("-"*70)
    for sig in [SIG_BPJS, SIG_BSJP]:
        sub = summary[(summary["Signal"] == sig) & (summary["Horizon"] == "3d")]
        if len(sub):
            r = sub.iloc[0]
            print(f"  {sig:<35} WR={r['WinRate%']:>5.1f}% "
                  f"Avg={r['AvgReturn%']:>+6.3f}% N={r['Trades']}")

    print("="*70 + "\n")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    global LOOKBACK_YEARS, MAX_WORKERS, COMMISSION_PCT

    parser = argparse.ArgumentParser(description="IHSG Backtest v2 Fixed")
    parser.add_argument("--tickers",    nargs="*", default=None)
    parser.add_argument("--workers",    type=int,   default=MAX_WORKERS)
    parser.add_argument("--years",      type=int,   default=LOOKBACK_YEARS)
    parser.add_argument("--commission", type=float, default=COMMISSION_PCT)
    args = parser.parse_args()

    LOOKBACK_YEARS  = args.years
    MAX_WORKERS     = args.workers
    COMMISSION_PCT  = args.commission

    tickers = args.tickers if args.tickers else IHSG_WATCHLIST
    tickers = [t.upper().replace(".JK", "") for t in tickers]

    print(f"\n🚀 IHSG Backtest v2 FIXED — {len(tickers)} tickers × {LOOKBACK_YEARS} tahun")
    print(f"   Workers: {MAX_WORKERS} | Commission: {COMMISSION_PCT}%")
    print(f"   BUG FIXES: early exit NaN + intraday multi-horizon\n")

    all_rows: List[TradeRow] = []
    failed = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(backtest_ticker, t): t for t in tickers}
        with tqdm(total=len(tickers), unit="ticker", ncols=72) as pbar:
            for fut in as_completed(futures):
                t = futures[fut]
                try:
                    result = fut.result()
                    all_rows.extend(result)
                    pbar.set_postfix({"trades": len(all_rows), "last": t})
                except Exception as e:
                    failed.append(t)
                pbar.update(1)

    def _print_failure_reasons():
        if not FAILURE_REASONS:
            return
        print("\n" + "-"*70)
        print("  KENAPA GAGAL (dihitung dari exception yang tertangkap)")
        print("-"*70)
        for reason, n in FAILURE_REASONS.most_common():
            print(f"  {n:>4}x  {reason}")
        top = FAILURE_REASONS.most_common(1)[0][0]
        if "RATE_LIMIT" in top or "BLOCKED" in top:
            print("\n  -> Ini blokir dari Yahoo, bukan yfinance yang rusak. Coba:")
            print("     - kurangi --workers (mis. --workers 1) dan jalankan lagi")
            print("     - jalankan dari IP lain (GitHub Actions / VPS / VPN)")
            print("     - upgrade yfinance: pip install --upgrade yfinance")
        elif "NETWORK" in top:
            print("\n  -> Ini jaringan lu yang tidak bisa mencapai Yahoo sama sekali")
            print("     (bukan rate-limit). VPN tidak selalu cukup kalau ini blokir ISP/ ")
            print("     ISP-level DNS. Paling pasti: jalankan dari mesin lain sepenuhnya")
            print("     (GitHub Actions, VPS, Colab).")
        print("-"*70)

    if not all_rows:
        print("\n❌ Tidak ada trade sama sekali.")
        _print_failure_reasons()
        return

    print(f"\n✅ Total trades: {len(all_rows):,} | Gagal: {len(failed)} ticker")
    _print_failure_reasons()

    df = pd.DataFrame([{
        "ticker":  r.ticker,
        "date":    r.date,
        "signal":  r.signal,
        "category":r.category,
        "price":   r.price,
        "sector":  r.sector,
        "ret_1d":  r.ret_1d,
        "ret_2d":  r.ret_2d,
        "ret_3d":  r.ret_3d,
        "ret_5d":  r.ret_5d,
        "ret_7d":  r.ret_7d,
        "ret_14d": r.ret_14d,
        "ret_30d": r.ret_30d,
        "ret_60d": r.ret_60d,
        "ret_intraday": r.ret_intraday,
    } for r in all_rows])

    summary = build_summary(df)
    print_report(df, summary, len(tickers) - len(failed))

    out_dir = os.path.dirname(os.path.abspath(__file__))
    trades_path  = os.path.join(out_dir, "backtest_trades_v2.csv")
    summary_path = os.path.join(out_dir, "backtest_summary_v2.csv")
    df.to_csv(trades_path, index=False)
    summary.to_csv(summary_path, index=False)

    # CATATAN: build_index_js_stats() (mencetak literal JS untuk ditempel ke
    # index.js) TIDAK dipanggil lagi. Sumber statistik sekarang adalah CSV di
    # atas, dibaca oleh scripts/generate-backtest-json.py -> data/backtest/*.json.
    # Fungsinya masih ada di file ini kalau suatu saat dibutuhkan lagi, tapi
    # jalur produksi tidak lewat situ.

    print(f"📁 Output:")
    print(f"   {trades_path}")
    print(f"   {summary_path}")
    print()
    print("➡️  Langkah berikutnya:")
    print(f"   python scripts/generate-backtest-json.py {os.path.basename(trades_path)}")


if __name__ == "__main__":
    main()