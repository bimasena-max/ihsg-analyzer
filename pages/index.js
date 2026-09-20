// pages/index.js  —  IHSG Stock Analyzer v3.1 (Fixed)
import { useState, useRef, useEffect, useCallback } from 'react';
import { ReturnDistributionModal, DistributionTriggerBtn } from '../components/ReturnDistributionModal';
import Head from 'next/head';
import BACKTEST_STATS from '../data/backtest/global.json';
import { TICKER_SIGNAL_STATS, ensureStats, useStatsVersion } from '../lib/client/stats-store';
import { SECTOR_BENCH, benchFor, HORIZONS, HORIZON_LABEL } from '../lib/core/constants';
import { invScore } from '../lib/core/scoring';
import {
  calcRSI, calcBollinger, calcMA, calcMACD, calcEMA, calcStochastic, calcATR,
  findNearestResistance, calcFibTargets, calcATRStopLoss, snapshot,
} from '../lib/core/indicators';
import { buildVerdict } from '../lib/core/verdict';
import {
  estimateHoldingDays, generateSwingSignals, generateScalpingSignals, calcSignals,
  detectAccumulation, calculateLiquidityScore, calcSMC,
} from '../lib/core/signals';

const IHSG_WATCHLIST = [
  "BBCA","BBRI","BMRI","TLKM","ASII","GOTO","BREN","TPIA","AMMN","ADRO",
  "UNVR","ICBP","KLBF","SIDO","MYOR","INDF","HMSP","GGRM","BUKA","ACES",
  "EMTK","MIKA","HEAL","SILO","CPIN","JPFA","MAIN","BISI","LSIP",
  "ANTM","MDKA","INCO","ITMG","PTBA","BYAN","HRUM","ELSA","MEDC","AKRA",
  "SMGR","INTP","BRPT","TKIM","INKP","PWON","BSDE","SMRA","CTRA","DMAS",
  "JSMR","TOWR","MTEL","TBIG","ISAT","EXCL","BBNI","BBTN","MEGA","PGAS",
  "AALI","ADHI","AGRO","ALTO","AMFG","AMRT","ARNA","ASBI","ASDM","ASRM",
  "AUTO","BABP","BALI","BANK","BAPA","BATA","BAYU","BBMD","BCAP","BCIC",
  "BDMN","BFIN","BGTG","BIMA","BKSL","BLTA","BMTR","BNBA","BNBR","BNII",
  "BNLI","BOSS","BPFI","BRAM","BRNA","BSML","BTEK","BTPN","BUCK","BULL",
  "BUMI","BVIC","CARS","CASA","CBMF","CEKA","CENT","CFIN","CITA","CKRA",
  "CLPI","CMNP","CMRY","CSAP","CTBN","CTTH","DAJK","DART","DEWA","DGIK",
  "DILD","DLTA","DNET","DPUM","DSSA","DVLA","EKAD","ELTY","EMDE","EPMT",
  "ERAA","ERTX","ESSA","FAST","FASW","FILM","FISH","FMII","FOOD","FREN",
  "GAMA","GDST","GEMA","GJTL","GLOB","GLVA","GMFI","GPRA","GZCO","HERO",
  "HITS","HOME","HOTL","IATA","IBST","ICON","IGAR","IIKP","IKAI","IMAS",
  "IMJS","IMPC","INAF","INAI","INCI","INDS","INDX","INPC","INRU","INTD",
  "IPCC","IPOL","ISSP","ITIC","JKON","JPRS","JRPT","JSPT","JTPE","KBLI",
  "KBLM","KDSI","KEEN","KIJA","KINO","KIOS","KOBX","KOIN","KPIG","KRAS",
  "LANC","LCKM","LEAD","LINK","LION","LMAS","LPCK","LPGI","LPIN","LPKR",
  "LRNA","LTLS","MABA","MAMI","MAPI","MASA","MBSS","MDRN","MDLN","META",
  "MFIN","MGLV","MIDI","MKPI","MLBI","MLPL","MMLP","MNCN","MOLI","MORO",
  "MPPA","MRAT","MSKY","MTDL","MTLA","MTSM","MYOH","NASI","NELY","NISP",
  "NRCA","NUSA","OKAS","OMRE","PADI","PANR","PCAR","PDES","PEGE","PICO",
  "PJAA","PKPK","PLAN","PNBN","PNLF","POLA","POOL","POSA","PPRE","PRAS",
  "PRDA","PSAB","PSKT","PTPP","PTRO","PUDP","RAJA","RANC","RBMS","RELI",
  "RICY","RIGS","RMBA","RODA","ROTI","SAME","SCCO","SCMA","SDRA","SGRO",
  "SKBM","SKLT","SMBR","SMCB","SMDR","SMSM","SOCI","SOFA","SONA","SQMI",
  "SRTG","SSIA","SSMS","STAR","STTP","SUGI","SULI","TALF","TARA","TAXI",
  "TBLA","TCID","TELE","TFCO","TGKA","TINS","TMAS","TNCA","TOBA","TOPS",
  "TOTL","TOTO","TRIM","TRIS","TRST","TSPC","ULTJ","UNIC","UNIT","UNTR",
  "VICO","VINS","VIVA","VOKS","VRNA","WAPO","WEHA","WICO","WINS","WSBP",
  "WSKT","WTON","ZINC",
];
const ALL_TICKERS = [...new Set(IHSG_WATCHLIST)];

// PENTING: Harus sama dengan screener.js di backend (pages/api/screener.js)
// SECTOR_BENCH pindah ke lib/core/constants.js (dulu 3 salinan).

// ── BACKTEST STATS (dari CSV 2 tahun, 214.926 trades) ─────────
// Diperbarui otomatis dari backtest_trades.csv
// winRate = % trade positif di horizon terbaik
// avgRet  = rata-rata return (%) di horizon terbaik
// holdDays = label holding period yang direkomendasikan
// BACKTEST_STATS sekarang di data/backtest/global.json (12 KB, di-import di atas).

// ── Per-ticker backtest stats (min 5 trades, dari CSV 2 tahun, incl. byHorizon) ──
// TICKER_SIGNAL_STATS (dulu 4.553 baris / 2,5 MB literal) sekarang dimuat
// per ticker dari /api/backtest-stats. Lihat lib/client/stats-store.js.

// TP/SL dari distribusi historis per ticker per sinyal
function getHistoricalTPSL(ticker, signalName, price, horizonOverride) {
  const s = (TICKER_SIGNAL_STATS[ticker] || {})[signalName];
  if (!s) return null;
  const h = horizonOverride || s.best;
  const d = s.bh[h];
  if (!d) return null;
  const rawSLpct = d.p25 < 0 ? d.p25 : (d.p10 != null && d.p10 < 0 ? d.p10 : -5);
  const pctSL    = rawSLpct;
  const sl       = Math.round(price * (1 + pctSL / 100));
  const tp1 = Math.round(price * (1 + d.p75 / 100));
  const tp2 = Math.round(price * (1 + d.p90 / 100));
  const rr  = tp1 > price && price > sl ? ((tp1-price)/(price-sl)).toFixed(1) : '?';
  return { sl, tp1, tp2, pctSL: d.p25, pctTP1: d.p75, pctTP2: d.p90,
           rr, horizon: h, winRate: d.wr, median: d.p50, n: d.n };
}

const DD_SIGNAL_STATS = {"Volume Avg Naik Terkontrol|0-10%": {"n": 4479, "wr": 50.8, "avg": 4.71, "p25": -4.62, "p50": 0.4, "p75": 8.21, "p90": 23.48}, "Volume Avg Naik Terkontrol|10-20%": {"n": 2648, "wr": 46.6, "avg": 4.52, "p25": -6.19, "p50": -0.47, "p75": 8.24, "p90": 21.28}, "Volume Avg Naik Terkontrol|20-30%": {"n": 1854, "wr": 42.6, "avg": 5.42, "p25": -7.41, "p50": -0.88, "p75": 8.22, "p90": 25.25}, "Volume Avg Naik Terkontrol|30-40%": {"n": 1171, "wr": 46.0, "avg": 8.89, "p25": -7.25, "p50": -0.71, "p75": 12.34, "p90": 34.13}, "Volume Avg Naik Terkontrol|40-50%": {"n": 525, "wr": 44.2, "avg": 4.88, "p25": -8.51, "p50": -0.91, "p75": 10.13, "p90": 35.7}, "Volume Avg Naik Terkontrol|>50%": {"n": 370, "wr": 44.9, "avg": 7.33, "p25": -7.61, "p50": -1.5, "p75": 10.05, "p90": 47.21}, "Volume Exhaustion Bottom|0-10%": {"n": 251, "wr": 58.2, "avg": 7.44, "p25": -3.66, "p50": 2.33, "p75": 9.03, "p90": 36.92}, "Volume Exhaustion Bottom|10-20%": {"n": 1477, "wr": 40.2, "avg": 1.67, "p25": -8.7, "p50": -1.88, "p75": 6.0, "p90": 21.15}, "Volume Exhaustion Bottom|20-30%": {"n": 2074, "wr": 41.1, "avg": 2.69, "p25": -10.42, "p50": -2.44, "p75": 7.69, "p90": 23.44}, "Volume Exhaustion Bottom|30-40%": {"n": 1836, "wr": 41.6, "avg": 6.75, "p25": -10.0, "p50": -1.91, "p75": 8.89, "p90": 31.95}, "Volume Exhaustion Bottom|40-50%": {"n": 1284, "wr": 51.2, "avg": 5.8, "p25": -9.14, "p50": 0.82, "p75": 13.44, "p90": 30.56}, "Volume Exhaustion Bottom|>50%": {"n": 1332, "wr": 50.8, "avg": 7.03, "p25": -8.83, "p50": 0.81, "p75": 13.72, "p90": 32.51}, "Volume Spike Sideways|0-10%": {"n": 4493, "wr": 45.8, "avg": 3.63, "p25": -5.13, "p50": -0.3, "p75": 5.64, "p90": 17.35}, "Volume Spike Sideways|10-20%": {"n": 3700, "wr": 44.2, "avg": 3.4, "p25": -5.91, "p50": -0.62, "p75": 6.85, "p90": 18.75}, "Volume Spike Sideways|20-30%": {"n": 2796, "wr": 44.4, "avg": 6.81, "p25": -6.2, "p50": 0.0, "p75": 7.22, "p90": 24.69}, "Volume Spike Sideways|30-40%": {"n": 1484, "wr": 50.3, "avg": 5.21, "p25": -6.04, "p50": 0.3, "p75": 11.76, "p90": 27.9}, "Volume Spike Sideways|40-50%": {"n": 676, "wr": 51.9, "avg": 19.06, "p25": -7.14, "p50": 1.21, "p75": 20.0, "p90": 63.96}, "Volume Spike Sideways|>50%": {"n": 445, "wr": 58.9, "avg": 17.64, "p25": -5.26, "p50": 4.24, "p75": 28.73, "p90": 60.67}, "BPJS Beli Pagi Jual Sore|0-10%": {"n": 243, "wr": 28.8, "avg": -3.34, "p25": -9.54, "p50": -4.52, "p75": 1.63, "p90": 9.99}, "BPJS Beli Pagi Jual Sore|10-20%": {"n": 214, "wr": 34.1, "avg": -3.85, "p25": -12.77, "p50": -6.98, "p75": 3.37, "p90": 9.95}, "BPJS Beli Pagi Jual Sore|20-30%": {"n": 190, "wr": 22.6, "avg": -0.04, "p25": -6.51, "p50": -4.14, "p75": 0.0, "p90": 19.85}, "BPJS Beli Pagi Jual Sore|30-40%": {"n": 85, "wr": 10.6, "avg": -3.66, "p25": -5.5, "p50": -3.7, "p75": -1.83, "p90": 0.52}, "BPJS Beli Pagi Jual Sore|40-50%": {"n": 64, "wr": 21.9, "avg": -2.95, "p25": -5.83, "p50": -2.92, "p75": 0.0, "p90": 1.99}, "BSJP Beli Sore Jual Pagi|0-10%": {"n": 17555, "wr": 47.1, "avg": 3.1, "p25": -6.29, "p50": -0.2, "p75": 6.8, "p90": 19.36}, "BSJP Beli Sore Jual Pagi|10-20%": {"n": 15198, "wr": 40.8, "avg": 1.86, "p25": -8.16, "p50": -1.89, "p75": 5.85, "p90": 19.93}, "BSJP Beli Sore Jual Pagi|20-30%": {"n": 13197, "wr": 42.7, "avg": 3.72, "p25": -8.7, "p50": -1.54, "p75": 7.02, "p90": 21.88}, "BSJP Beli Sore Jual Pagi|30-40%": {"n": 8936, "wr": 46.1, "avg": 4.38, "p25": -8.02, "p50": -0.25, "p75": 9.65, "p90": 25.88}, "BSJP Beli Sore Jual Pagi|40-50%": {"n": 4553, "wr": 51.7, "avg": 7.42, "p25": -8.2, "p50": 0.86, "p75": 13.54, "p90": 32.0}, "BSJP Beli Sore Jual Pagi|>50%": {"n": 3301, "wr": 52.6, "avg": 8.24, "p25": -6.83, "p50": 1.15, "p75": 15.56, "p90": 42.05}, "Akumulasi Tersembunyi|0-10%": {"n": 1605, "wr": 45.5, "avg": 4.0, "p25": -5.22, "p50": -0.42, "p75": 5.71, "p90": 18.99}, "Akumulasi Tersembunyi|10-20%": {"n": 1274, "wr": 45.8, "avg": 4.13, "p25": -5.33, "p50": 0.0, "p75": 7.32, "p90": 19.28}, "Akumulasi Tersembunyi|20-30%": {"n": 933, "wr": 46.1, "avg": 8.11, "p25": -5.85, "p50": 0.0, "p75": 8.45, "p90": 30.11}, "Akumulasi Tersembunyi|30-40%": {"n": 474, "wr": 45.8, "avg": 4.43, "p25": -7.4, "p50": -0.12, "p75": 9.85, "p90": 27.26}, "Akumulasi Tersembunyi|40-50%": {"n": 227, "wr": 48.9, "avg": 18.58, "p25": -10.04, "p50": 0.0, "p75": 19.0, "p90": 68.43}, "Akumulasi Tersembunyi|>50%": {"n": 193, "wr": 57.0, "avg": 9.98, "p25": -8.89, "p50": 2.92, "p75": 17.32, "p90": 48.71}, "Breakout Konsolidasi|0-10%": {"n": 172, "wr": 41.3, "avg": 0.32, "p25": -7.66, "p50": -1.69, "p75": 5.55, "p90": 16.37}, "Breakout Konsolidasi|10-20%": {"n": 104, "wr": 39.4, "avg": 1.54, "p25": -9.52, "p50": -3.6, "p75": 7.13, "p90": 25.0}, "Breakout Konsolidasi|20-30%": {"n": 64, "wr": 43.8, "avg": 7.49, "p25": -8.47, "p50": -1.12, "p75": 8.75, "p90": 37.9}, "Breakout Konsolidasi|30-40%": {"n": 52, "wr": 51.9, "avg": 8.03, "p25": -6.66, "p50": 2.13, "p75": 14.86, "p90": 25.13}, "Candle Compression|0-10%": {"n": 1787, "wr": 42.5, "avg": 5.18, "p25": -4.76, "p50": -0.55, "p75": 4.36, "p90": 18.76}, "Candle Compression|10-20%": {"n": 2014, "wr": 43.4, "avg": 3.4, "p25": -6.79, "p50": -0.27, "p75": 5.91, "p90": 22.14}, "Candle Compression|20-30%": {"n": 1750, "wr": 38.6, "avg": 4.63, "p25": -7.49, "p50": 0.0, "p75": 4.39, "p90": 21.73}, "Candle Compression|30-40%": {"n": 1085, "wr": 46.2, "avg": 8.77, "p25": -5.67, "p50": 0.0, "p75": 11.72, "p90": 32.89}, "Candle Compression|40-50%": {"n": 534, "wr": 41.8, "avg": 17.42, "p25": -10.56, "p50": 0.0, "p75": 11.58, "p90": 56.0}, "Candle Compression|>50%": {"n": 674, "wr": 40.5, "avg": 8.83, "p25": -10.19, "p50": -0.85, "p75": 8.33, "p90": 49.95}, "RSI Recovery Diam-diam|0-10%": {"n": 1283, "wr": 41.0, "avg": 3.28, "p25": -5.46, "p50": -1.2, "p75": 3.7, "p90": 15.33}, "RSI Recovery Diam-diam|10-20%": {"n": 1874, "wr": 37.2, "avg": 0.21, "p25": -8.12, "p50": -2.13, "p75": 4.28, "p90": 15.31}, "RSI Recovery Diam-diam|20-30%": {"n": 1725, "wr": 39.1, "avg": 2.19, "p25": -9.09, "p50": -1.95, "p75": 6.04, "p90": 17.54}, "RSI Recovery Diam-diam|30-40%": {"n": 1260, "wr": 44.4, "avg": 2.44, "p25": -9.92, "p50": -1.5, "p75": 9.67, "p90": 24.68}, "RSI Recovery Diam-diam|40-50%": {"n": 760, "wr": 53.2, "avg": 7.27, "p25": -8.95, "p50": 1.67, "p75": 15.51, "p90": 42.94}, "RSI Recovery Diam-diam|>50%": {"n": 503, "wr": 54.9, "avg": 10.22, "p25": -5.12, "p50": 2.04, "p75": 16.56, "p90": 44.32}, "Volume Meledak|0-10%": {"n": 1065, "wr": 43.1, "avg": 5.84, "p25": -7.38, "p50": -0.97, "p75": 6.34, "p90": 28.85}, "Volume Meledak|10-20%": {"n": 889, "wr": 44.0, "avg": 7.05, "p25": -8.11, "p50": -0.93, "p75": 9.58, "p90": 37.61}, "Volume Meledak|20-30%": {"n": 694, "wr": 45.4, "avg": 12.88, "p25": -8.77, "p50": 0.0, "p75": 10.56, "p90": 42.39}, "Volume Meledak|30-40%": {"n": 401, "wr": 47.6, "avg": 9.64, "p25": -10.42, "p50": -0.36, "p75": 15.05, "p90": 38.2}, "Volume Meledak|40-50%": {"n": 223, "wr": 47.1, "avg": 12.73, "p25": -13.4, "p50": -0.61, "p75": 15.09, "p90": 50.98}, "Volume Meledak|>50%": {"n": 177, "wr": 48.0, "avg": 10.39, "p25": -13.33, "p50": -0.36, "p75": 22.05, "p90": 72.29}, "RSI-9 Pullback ke EMA5|0-10%": {"n": 1231, "wr": 42.0, "avg": 0.4, "p25": -4.83, "p50": -1.06, "p75": 3.75, "p90": 9.44}, "RSI-9 Pullback ke EMA5|10-20%": {"n": 1965, "wr": 39.3, "avg": 0.9, "p25": -6.06, "p50": -1.27, "p75": 3.11, "p90": 11.44}, "RSI-9 Pullback ke EMA5|20-30%": {"n": 1442, "wr": 41.1, "avg": 0.81, "p25": -6.11, "p50": -1.25, "p75": 3.97, "p90": 12.64}, "RSI-9 Pullback ke EMA5|30-40%": {"n": 768, "wr": 54.2, "avg": 2.24, "p25": -4.58, "p50": 0.73, "p75": 6.87, "p90": 16.23}, "RSI-9 Pullback ke EMA5|40-50%": {"n": 281, "wr": 52.3, "avg": 5.79, "p25": -6.13, "p50": 1.14, "p75": 8.84, "p90": 22.87}, "RSI-9 Pullback ke EMA5|>50%": {"n": 205, "wr": 43.9, "avg": 5.62, "p25": -4.83, "p50": 0.0, "p75": 6.9, "p90": 34.26}, "Stochastic Deeply Oversold|0-10%": {"n": 1397, "wr": 48.7, "avg": 3.86, "p25": -4.42, "p50": 0.0, "p75": 6.16, "p90": 17.41}, "Stochastic Deeply Oversold|10-20%": {"n": 3036, "wr": 42.9, "avg": 1.36, "p25": -7.09, "p50": -1.26, "p75": 5.47, "p90": 18.24}, "Stochastic Deeply Oversold|20-30%": {"n": 3354, "wr": 42.3, "avg": 1.62, "p25": -7.88, "p50": -0.78, "p75": 6.03, "p90": 17.94}, "Stochastic Deeply Oversold|30-40%": {"n": 2687, "wr": 45.8, "avg": 6.02, "p25": -7.84, "p50": 0.0, "p75": 9.57, "p90": 27.81}, "Stochastic Deeply Oversold|40-50%": {"n": 1599, "wr": 52.9, "avg": 9.68, "p25": -8.6, "p50": 1.52, "p75": 14.69, "p90": 33.33}, "Stochastic Deeply Oversold|>50%": {"n": 1470, "wr": 53.1, "avg": 9.47, "p25": -8.21, "p50": 1.98, "p75": 15.61, "p90": 47.07}, "Stochastic Oversold + Naik|0-10%": {"n": 1009, "wr": 46.6, "avg": 1.9, "p25": -5.6, "p50": -0.21, "p75": 5.7, "p90": 14.96}, "Stochastic Oversold + Naik|10-20%": {"n": 1294, "wr": 43.0, "avg": 1.78, "p25": -6.89, "p50": -1.24, "p75": 5.25, "p90": 17.44}, "Stochastic Oversold + Naik|20-30%": {"n": 958, "wr": 42.8, "avg": 2.86, "p25": -6.94, "p50": -1.2, "p75": 5.74, "p90": 19.27}, "Stochastic Oversold + Naik|30-40%": {"n": 523, "wr": 44.6, "avg": 3.6, "p25": -5.59, "p50": -0.65, "p75": 6.2, "p90": 20.17}, "Stochastic Oversold + Naik|40-50%": {"n": 245, "wr": 50.2, "avg": 5.05, "p25": -7.17, "p50": 0.46, "p75": 12.2, "p90": 26.51}, "Stochastic Oversold + Naik|>50%": {"n": 151, "wr": 39.1, "avg": 2.02, "p25": -9.21, "p50": -3.28, "p75": 5.93, "p90": 22.18}, "Golden Cross EMA20/50|0-10%": {"n": 282, "wr": 45.4, "avg": 5.13, "p25": -5.74, "p50": -0.41, "p75": 8.56, "p90": 23.12}, "Golden Cross EMA20/50|10-20%": {"n": 231, "wr": 43.7, "avg": 8.67, "p25": -5.62, "p50": 0.0, "p75": 10.5, "p90": 37.5}, "Golden Cross EMA20/50|20-30%": {"n": 184, "wr": 51.1, "avg": 21.91, "p25": -7.15, "p50": 0.92, "p75": 14.45, "p90": 60.5}, "Golden Cross EMA20/50|30-40%": {"n": 104, "wr": 50.0, "avg": 9.91, "p25": -9.55, "p50": 0.23, "p75": 15.33, "p90": 46.25}, "Golden Cross EMA20/50|40-50%": {"n": 49, "wr": 49.0, "avg": 20.53, "p25": -11.29, "p50": 0.0, "p75": 37.1, "p90": 102.67}, "Golden Cross EMA20/50|>50%": {"n": 20, "wr": 40.0, "avg": 14.12, "p25": -9.7, "p50": -4.5, "p75": 17.42, "p90": 57.99}, "MACD Crossover Bullish|0-10%": {"n": 1162, "wr": 41.9, "avg": 2.56, "p25": -6.46, "p50": -1.02, "p75": 4.41, "p90": 16.94}, "MACD Crossover Bullish|10-20%": {"n": 1066, "wr": 39.8, "avg": 2.13, "p25": -8.0, "p50": -1.92, "p75": 5.15, "p90": 20.3}, "MACD Crossover Bullish|20-30%": {"n": 821, "wr": 43.7, "avg": 7.21, "p25": -8.37, "p50": -0.75, "p75": 7.44, "p90": 25.0}, "MACD Crossover Bullish|30-40%": {"n": 451, "wr": 45.5, "avg": 5.74, "p25": -7.52, "p50": -1.41, "p75": 9.47, "p90": 25.76}, "MACD Crossover Bullish|40-50%": {"n": 225, "wr": 52.4, "avg": 15.78, "p25": -6.46, "p50": 0.84, "p75": 18.18, "p90": 57.74}, "MACD Crossover Bullish|>50%": {"n": 119, "wr": 52.9, "avg": 13.55, "p25": -6.92, "p50": 1.09, "p75": 16.45, "p90": 69.57}, "RSI Recovery + 2 Candle Hijau|0-10%": {"n": 125, "wr": 60.0, "avg": 7.48, "p25": -4.74, "p50": 2.29, "p75": 6.12, "p90": 19.27}, "RSI Recovery + 2 Candle Hijau|10-20%": {"n": 347, "wr": 34.0, "avg": -1.24, "p25": -8.54, "p50": -3.28, "p75": 2.98, "p90": 9.81}, "RSI Recovery + 2 Candle Hijau|20-30%": {"n": 395, "wr": 34.7, "avg": -0.74, "p25": -10.49, "p50": -3.42, "p75": 3.29, "p90": 14.39}, "RSI Recovery + 2 Candle Hijau|30-40%": {"n": 317, "wr": 40.4, "avg": 1.44, "p25": -8.12, "p50": -2.46, "p75": 7.58, "p90": 21.21}, "RSI Recovery + 2 Candle Hijau|40-50%": {"n": 282, "wr": 57.1, "avg": 5.9, "p25": -5.55, "p50": 2.56, "p75": 14.99, "p90": 33.25}, "RSI Recovery + 2 Candle Hijau|>50%": {"n": 224, "wr": 60.3, "avg": 12.47, "p25": -7.79, "p50": 4.42, "p75": 21.34, "p90": 46.21}, "RSI+BB Lower Bounce|0-10%": {"n": 1736, "wr": 42.6, "avg": 1.93, "p25": -4.97, "p50": -0.94, "p75": 4.13, "p90": 12.37}, "RSI+BB Lower Bounce|10-20%": {"n": 4420, "wr": 39.5, "avg": 0.45, "p25": -6.53, "p50": -1.22, "p75": 3.42, "p90": 11.66}, "RSI+BB Lower Bounce|20-30%": {"n": 4311, "wr": 42.2, "avg": 0.45, "p25": -7.52, "p50": -1.45, "p75": 5.25, "p90": 14.8}, "RSI+BB Lower Bounce|30-40%": {"n": 3186, "wr": 48.8, "avg": 1.56, "p25": -8.18, "p50": 0.0, "p75": 8.68, "p90": 20.27}, "RSI+BB Lower Bounce|40-50%": {"n": 1831, "wr": 57.8, "avg": 7.63, "p25": -6.55, "p50": 3.1, "p75": 15.7, "p90": 33.33}, "RSI+BB Lower Bounce|>50%": {"n": 1944, "wr": 43.3, "avg": 7.91, "p25": -2.15, "p50": 0.0, "p75": 11.78, "p90": 36.88}, "BELI (Grade A)|10-20%": {"n": 72, "wr": 33.3, "avg": 0.31, "p25": -4.2, "p50": -0.93, "p75": 1.35, "p90": 10.28}, "BELI (Grade A)|20-30%": {"n": 57, "wr": 45.6, "avg": -0.75, "p25": -5.14, "p50": -0.43, "p75": 2.05, "p90": 6.94}, "BELI (Grade A)|30-40%": {"n": 45, "wr": 26.7, "avg": -1.41, "p25": -9.73, "p50": -4.3, "p75": 0.56, "p90": 19.58}, "BELI (Grade A)|40-50%": {"n": 48, "wr": 83.3, "avg": 11.28, "p25": 2.19, "p50": 14.47, "p75": 18.31, "p90": 21.52}, "PERHATIKAN (Grade B)|0-10%": {"n": 8156, "wr": 45.4, "avg": 0.69, "p25": -4.68, "p50": -0.43, "p75": 4.5, "p90": 11.76}, "PERHATIKAN (Grade B)|10-20%": {"n": 5996, "wr": 41.2, "avg": 0.5, "p25": -6.35, "p50": -1.52, "p75": 4.65, "p90": 13.19}, "PERHATIKAN (Grade B)|20-30%": {"n": 3818, "wr": 42.5, "avg": 1.42, "p25": -6.13, "p50": -1.04, "p75": 5.0, "p90": 14.06}, "PERHATIKAN (Grade B)|30-40%": {"n": 1934, "wr": 46.7, "avg": 1.97, "p25": -6.26, "p50": -0.56, "p75": 7.52, "p90": 15.51}, "PERHATIKAN (Grade B)|40-50%": {"n": 859, "wr": 63.0, "avg": 6.91, "p25": -3.24, "p50": 4.3, "p75": 15.06, "p90": 27.85}, "PERHATIKAN (Grade B)|>50%": {"n": 322, "wr": 43.8, "avg": -0.19, "p25": -4.06, "p50": -0.77, "p75": 4.98, "p90": 12.91}};

// TP/SL yang sudah disesuaikan posisi DD saham
// Saham DD 40-50% punya distribusi return beda dengan yang DD 10%
function getDeepBounceTPSL(signalName, price, ddPct) {
  const bucket = ddPct >= 50 ? '>50%' : ddPct >= 40 ? '40-50%' : ddPct >= 30 ? '30-40%' : ddPct >= 20 ? '20-30%' : ddPct >= 10 ? '10-20%' : '0-10%';
  const d = DD_SIGNAL_STATS[`${signalName}|${bucket}`];
  if (!d) return null;
  const rawSLpct = d.p25 < 0 ? d.p25 : (d.p10 != null && d.p10 < 0 ? d.p10 : -5);
  const pctSL    = rawSLpct;
  const sl       = Math.round(price * (1 + pctSL / 100));
  const tp1 = Math.round(price * (1 + d.p75 / 100));
  const tp2 = Math.round(price * (1 + d.p90 / 100));
  const rr  = tp1 > price && price > sl ? ((tp1-price)/(price-sl)).toFixed(1) : '?';
  return { sl, tp1, tp2, pctSL: d.p25, pctTP1: d.p75, pctTP2: d.p90,
           rr, bucket, winRate: d.wr, avg: d.avg, median: d.p50, n: d.n,
           isDeepBounce: ddPct >= 40 };
}

// Gap-up tendency per ticker — dari backtest 214k trades
// g5 = % chance gap +5% dalam 3 hari, g10 = gap +10%
// cat: rendah/normal/sering/sangat_sering
const GAP_STATS = {"AALI":{"g5":5.2,"g10":0.0,"n":799,"cat":"rendah"},"ACES":{"g5":7.3,"g10":1.4,"n":1134,"cat":"rendah"},"ADHI":{"g5":13.5,"g10":4.9,"n":817,"cat":"normal"},"ADRO":{"g5":10.7,"g10":3.4,"n":771,"cat":"normal"},"AGRO":{"g5":12.1,"g10":1.7,"n":862,"cat":"normal"},"AKRA":{"g5":12.3,"g10":1.6,"n":697,"cat":"normal"},"ALTO":{"g5":33.1,"g10":13.6,"n":369,"cat":"sering"},"AMFG":{"g5":2.7,"g10":0.6,"n":618,"cat":"rendah"},"AMMN":{"g5":13.8,"g10":3.5,"n":630,"cat":"normal"},"AMRT":{"g5":9.0,"g10":2.2,"n":621,"cat":"rendah"},"ANTM":{"g5":20.5,"g10":4.5,"n":626,"cat":"sering"},"ARNA":{"g5":2.1,"g10":0.4,"n":756,"cat":"rendah"},"ASBI":{"g5":8.6,"g10":4.0,"n":720,"cat":"rendah"},"ASDM":{"g5":3.0,"g10":0.8,"n":494,"cat":"rendah"},"ASII":{"g5":6.8,"g10":0.7,"n":880,"cat":"rendah"},"ASRM":{"g5":4.3,"g10":2.1,"n":667,"cat":"rendah"},"AUTO":{"g5":5.8,"g10":0.3,"n":1107,"cat":"rendah"},"BABP":{"g5":5.8,"g10":1.7,"n":768,"cat":"rendah"},"BALI":{"g5":16.3,"g10":8.0,"n":623,"cat":"normal"},"BANK":{"g5":5.7,"g10":2.2,"n":368,"cat":"rendah"},"BAPA":{"g5":13.0,"g10":6.3,"n":694,"cat":"normal"},"BATA":{"g5":7.0,"g10":3.4,"n":581,"cat":"rendah"},"BAYU":{"g5":2.3,"g10":0.0,"n":771,"cat":"rendah"},"BBCA":{"g5":6.7,"g10":0.4,"n":475,"cat":"rendah"},"BBMD":{"g5":6.8,"g10":0.0,"n":711,"cat":"rendah"},"BBNI":{"g5":10.0,"g10":2.1,"n":715,"cat":"rendah"},"BBRI":{"g5":7.3,"g10":1.5,"n":519,"cat":"rendah"},"BBTN":{"g5":10.2,"g10":2.7,"n":1155,"cat":"normal"},"BCAP":{"g5":12.9,"g10":5.5,"n":850,"cat":"normal"},"BCIC":{"g5":15.4,"g10":7.5,"n":429,"cat":"normal"},"BDMN":{"g5":2.3,"g10":0.7,"n":603,"cat":"rendah"},"BFIN":{"g5":10.5,"g10":2.2,"n":809,"cat":"normal"},"BGTG":{"g5":15.5,"g10":5.5,"n":760,"cat":"normal"},"BIMA":{"g5":17.5,"g10":7.9,"n":530,"cat":"normal"},"BISI":{"g5":3.4,"g10":0.8,"n":844,"cat":"rendah"},"BKSL":{"g5":29.3,"g10":14.5,"n":620,"cat":"sering"},"BLTA":{"g5":27.5,"g10":13.4,"n":578,"cat":"sering"},"BMRI":{"g5":9.1,"g10":1.1,"n":556,"cat":"rendah"},"BMTR":{"g5":8.9,"g10":2.7,"n":938,"cat":"rendah"},"BNBA":{"g5":11.4,"g10":5.2,"n":762,"cat":"normal"},"BNBR":{"g5":36.0,"g10":22.7,"n":637,"cat":"sangat_sering"},"BNII":{"g5":3.1,"g10":0.5,"n":803,"cat":"rendah"},"BNLI":{"g5":20.2,"g10":11.9,"n":625,"cat":"sering"},"BPFI":{"g5":3.8,"g10":1.4,"n":635,"cat":"rendah"},"BRAM":{"g5":1.8,"g10":0.4,"n":501,"cat":"rendah"},"BREN":{"g5":19.0,"g10":7.6,"n":522,"cat":"normal"},"BRNA":{"g5":10.0,"g10":5.9,"n":559,"cat":"rendah"},"BRPT":{"g5":19.8,"g10":8.3,"n":668,"cat":"normal"},"BSDE":{"g5":9.2,"g10":1.0,"n":1113,"cat":"rendah"},"BSML":{"g5":19.2,"g10":5.4,"n":585,"cat":"normal"},"BTEK":{"g5":31.9,"g10":23.4,"n":543,"cat":"sering"},"BTPN":{"g5":3.3,"g10":1.4,"n":575,"cat":"rendah"},"BUKA":{"g5":11.8,"g10":2.4,"n":1098,"cat":"normal"},"BULL":{"g5":19.7,"g10":8.5,"n":526,"cat":"normal"},"BUMI":{"g5":24.6,"g10":11.3,"n":640,"cat":"sering"},"BVIC":{"g5":14.1,"g10":5.8,"n":791,"cat":"normal"},"BYAN":{"g5":2.8,"g10":1.2,"n":498,"cat":"rendah"},"CARS":{"g5":9.6,"g10":3.3,"n":701,"cat":"rendah"},"CASA":{"g5":9.8,"g10":3.0,"n":363,"cat":"rendah"},"CEKA":{"g5":3.2,"g10":0.6,"n":897,"cat":"rendah"},"CENT":{"g5":23.6,"g10":11.0,"n":733,"cat":"sering"},"CFIN":{"g5":4.6,"g10":1.3,"n":869,"cat":"rendah"},"CITA":{"g5":10.5,"g10":6.3,"n":747,"cat":"normal"},"CLPI":{"g5":2.7,"g10":0.8,"n":1030,"cat":"rendah"},"CMNP":{"g5":6.9,"g10":3.6,"n":842,"cat":"rendah"},"CMRY":{"g5":10.9,"g10":1.3,"n":530,"cat":"normal"},"CPIN":{"g5":4.9,"g10":0.5,"n":1082,"cat":"rendah"},"CSAP":{"g5":5.6,"g10":0.9,"n":774,"cat":"rendah"},"CTBN":{"g5":22.1,"g10":13.1,"n":662,"cat":"sering"},"CTRA":{"g5":7.1,"g10":0.6,"n":1124,"cat":"rendah"},"CTTH":{"g5":19.6,"g10":12.1,"n":715,"cat":"normal"},"DART":{"g5":10.0,"g10":2.4,"n":815,"cat":"rendah"},"DEWA":{"g5":28.4,"g10":15.5,"n":577,"cat":"sering"},"DGIK":{"g5":8.1,"g10":2.3,"n":660,"cat":"rendah"},"DILD":{"g5":6.7,"g10":2.0,"n":855,"cat":"rendah"},"DLTA":{"g5":1.0,"g10":0.0,"n":1010,"cat":"rendah"},"DMAS":{"g5":3.1,"g10":0.6,"n":844,"cat":"rendah"},"DNET":{"g5":1.6,"g10":0.2,"n":502,"cat":"rendah"},"DPUM":{"g5":11.5,"g10":9.1,"n":621,"cat":"normal"},"DSSA":{"g5":20.3,"g10":7.8,"n":493,"cat":"sering"},"DVLA":{"g5":3.3,"g10":0.0,"n":1238,"cat":"rendah"},"EKAD":{"g5":0.7,"g10":0.0,"n":1024,"cat":"rendah"},"ELSA":{"g5":8.1,"g10":1.2,"n":771,"cat":"rendah"},"ELTY":{"g5":37.9,"g10":26.2,"n":551,"cat":"sangat_sering"},"EMDE":{"g5":10.1,"g10":4.0,"n":739,"cat":"normal"},"EMTK":{"g5":19.9,"g10":6.9,"n":663,"cat":"normal"},"EPMT":{"g5":0.0,"g10":0.0,"n":1160,"cat":"nan"},"ERAA":{"g5":10.1,"g10":2.2,"n":1117,"cat":"normal"},"ERTX":{"g5":16.3,"g10":7.8,"n":728,"cat":"normal"},"ESSA":{"g5":16.0,"g10":4.0,"n":720,"cat":"normal"},"EXCL":{"g5":7.9,"g10":2.5,"n":483,"cat":"rendah"},"FAST":{"g5":17.1,"g10":11.4,"n":796,"cat":"normal"},"FASW":{"g5":9.1,"g10":4.7,"n":253,"cat":"rendah"},"FILM":{"g5":27.0,"g10":14.8,"n":458,"cat":"sering"},"FISH":{"g5":12.1,"g10":7.1,"n":627,"cat":"normal"},"FMII":{"g5":16.8,"g10":12.0,"n":662,"cat":"normal"},"FOOD":{"g5":13.1,"g10":6.1,"n":682,"cat":"normal"},"GDST":{"g5":8.9,"g10":2.4,"n":852,"cat":"rendah"},"GEMA":{"g5":11.4,"g10":3.0,"n":825,"cat":"normal"},"GGRM":{"g5":12.6,"g10":5.2,"n":852,"cat":"normal"},"GJTL":{"g5":5.2,"g10":0.3,"n":1176,"cat":"rendah"},"GLOB":{"g5":19.5,"g10":12.3,"n":527,"cat":"normal"},"GLVA":{"g5":5.7,"g10":1.4,"n":695,"cat":"rendah"},"GMFI":{"g5":19.2,"g10":11.7,"n":558,"cat":"normal"},"GOTO":{"g5":15.4,"g10":3.4,"n":523,"cat":"normal"},"GPRA":{"g5":10.5,"g10":3.2,"n":1031,"cat":"normal"},"GZCO":{"g5":19.7,"g10":6.2,"n":859,"cat":"normal"},"HEAL":{"g5":7.4,"g10":0.9,"n":791,"cat":"rendah"},"HERO":{"g5":10.1,"g10":4.4,"n":649,"cat":"normal"},"HITS":{"g5":2.3,"g10":0.5,"n":661,"cat":"rendah"},"HMSP":{"g5":8.6,"g10":3.8,"n":895,"cat":"rendah"},"HRUM":{"g5":14.2,"g10":3.5,"n":825,"cat":"normal"},"IATA":{"g5":17.7,"g10":9.8,"n":666,"cat":"normal"},"IBST":{"g5":16.6,"g10":3.9,"n":759,"cat":"normal"},"ICBP":{"g5":4.9,"g10":1.0,"n":868,"cat":"rendah"},"ICON":{"g5":36.7,"g10":15.5,"n":403,"cat":"sangat_sering"},"IGAR":{"g5":5.9,"g10":2.0,"n":1069,"cat":"rendah"},"IKAI":{"g5":36.4,"g10":26.7,"n":480,"cat":"sangat_sering"},"IMAS":{"g5":8.4,"g10":3.3,"n":836,"cat":"rendah"},"IMJS":{"g5":16.4,"g10":8.1,"n":727,"cat":"normal"},"IMPC":{"g5":19.5,"g10":11.9,"n":481,"cat":"normal"},"INAF":{"g5":0.0,"g10":0.0,"n":427,"cat":"nan"},"INAI":{"g5":13.5,"g10":7.6,"n":608,"cat":"normal"},"INCI":{"g5":3.0,"g10":1.6,"n":576,"cat":"rendah"},"INCO":{"g5":16.0,"g10":5.0,"n":722,"cat":"normal"},"INDF":{"g5":3.8,"g10":0.9,"n":760,"cat":"rendah"},"INDS":{"g5":12.8,"g10":7.9,"n":818,"cat":"normal"},"INDX":{"g5":15.9,"g10":9.0,"n":735,"cat":"normal"},"INKP":{"g5":8.0,"g10":2.5,"n":605,"cat":"rendah"},"INPC":{"g5":18.2,"g10":9.2,"n":738,"cat":"normal"},"INTD":{"g5":13.8,"g10":8.1,"n":629,"cat":"normal"},"INTP":{"g5":7.3,"g10":1.2,"n":878,"cat":"rendah"},"IPCC":{"g5":7.7,"g10":1.9,"n":782,"cat":"rendah"},"IPOL":{"g5":5.5,"g10":3.3,"n":708,"cat":"rendah"},"ISAT":{"g5":13.7,"g10":4.9,"n":696,"cat":"normal"},"ISSP":{"g5":9.1,"g10":0.9,"n":1127,"cat":"rendah"},"ITIC":{"g5":8.3,"g10":2.7,"n":740,"cat":"rendah"},"ITMG":{"g5":4.5,"g10":1.3,"n":616,"cat":"rendah"},"JKON":{"g5":8.0,"g10":1.7,"n":930,"cat":"rendah"},"JPFA":{"g5":16.5,"g10":3.1,"n":1057,"cat":"normal"},"JRPT":{"g5":2.3,"g10":0.0,"n":257,"cat":"rendah"},"JSMR":{"g5":3.5,"g10":0.5,"n":946,"cat":"rendah"},"JSPT":{"g5":14.4,"g10":10.7,"n":908,"cat":"normal"},"JTPE":{"g5":10.5,"g10":2.6,"n":305,"cat":"normal"},"KBLI":{"g5":2.2,"g10":0.0,"n":971,"cat":"rendah"},"KBLM":{"g5":6.9,"g10":2.6,"n":598,"cat":"rendah"},"KDSI":{"g5":8.5,"g10":2.0,"n":779,"cat":"rendah"},"KEEN":{"g5":7.5,"g10":2.9,"n":733,"cat":"rendah"},"KIJA":{"g5":7.7,"g10":2.8,"n":602,"cat":"rendah"},"KINO":{"g5":6.3,"g10":0.9,"n":744,"cat":"rendah"},"KIOS":{"g5":16.1,"g10":4.6,"n":551,"cat":"normal"},"KLBF":{"g5":6.3,"g10":1.2,"n":1014,"cat":"rendah"},"KOBX":{"g5":12.3,"g10":6.4,"n":761,"cat":"normal"},"KOIN":{"g5":8.9,"g10":2.5,"n":597,"cat":"rendah"},"KPIG":{"g5":15.6,"g10":6.8,"n":669,"cat":"normal"},"KRAS":{"g5":19.9,"g10":8.2,"n":1058,"cat":"normal"},"LCKM":{"g5":14.4,"g10":7.1,"n":620,"cat":"normal"},"LEAD":{"g5":21.9,"g10":8.6,"n":643,"cat":"sering"},"LINK":{"g5":18.4,"g10":11.3,"n":527,"cat":"normal"},"LION":{"g5":18.3,"g10":10.1,"n":694,"cat":"normal"},"LPCK":{"g5":9.8,"g10":4.4,"n":738,"cat":"rendah"},"LPGI":{"g5":15.1,"g10":5.2,"n":744,"cat":"normal"},"LPIN":{"g5":4.8,"g10":2.4,"n":1070,"cat":"rendah"},"LPKR":{"g5":15.5,"g10":4.8,"n":739,"cat":"normal"},"LRNA":{"g5":14.2,"g10":6.8,"n":740,"cat":"normal"},"LSIP":{"g5":13.6,"g10":1.5,"n":1112,"cat":"normal"},"LTLS":{"g5":1.6,"g10":0.0,"n":806,"cat":"rendah"},"MAIN":{"g5":12.3,"g10":2.5,"n":1143,"cat":"normal"},"MAPI":{"g5":12.8,"g10":4.4,"n":730,"cat":"normal"},"MBSS":{"g5":18.3,"g10":11.0,"n":632,"cat":"normal"},"MDKA":{"g5":19.9,"g10":8.1,"n":709,"cat":"normal"},"MDLN":{"g5":10.1,"g10":2.6,"n":1109,"cat":"normal"},"MDRN":{"g5":36.9,"g10":29.2,"n":409,"cat":"sangat_sering"},"MEDC":{"g5":12.9,"g10":2.7,"n":706,"cat":"normal"},"MEGA":{"g5":4.3,"g10":2.1,"n":800,"cat":"rendah"},"MGLV":{"g5":30.3,"g10":22.4,"n":564,"cat":"sering"},"MIDI":{"g5":6.5,"g10":1.2,"n":926,"cat":"rendah"},"MIKA":{"g5":4.7,"g10":0.6,"n":708,"cat":"rendah"},"MKPI":{"g5":1.9,"g10":0.6,"n":515,"cat":"rendah"},"MLBI":{"g5":1.4,"g10":0.4,"n":767,"cat":"rendah"},"MLPL":{"g5":25.7,"g10":12.4,"n":727,"cat":"sering"},"MMLP":{"g5":12.1,"g10":3.6,"n":527,"cat":"normal"},"MNCN":{"g5":4.8,"g10":1.0,"n":982,"cat":"rendah"},"MOLI":{"g5":12.2,"g10":5.1,"n":919,"cat":"normal"},"MPPA":{"g5":16.2,"g10":8.1,"n":726,"cat":"normal"},"MRAT":{"g5":14.8,"g10":6.7,"n":848,"cat":"normal"},"MSKY":{"g5":18.9,"g10":8.2,"n":601,"cat":"normal"},"MTDL":{"g5":4.5,"g10":0.3,"n":1110,"cat":"rendah"},"MTEL":{"g5":9.1,"g10":0.4,"n":680,"cat":"rendah"},"MTLA":{"g5":11.8,"g10":5.3,"n":563,"cat":"normal"},"MTSM":{"g5":38.3,"g10":21.3,"n":188,"cat":"sangat_sering"},"MYOH":{"g5":4.7,"g10":0.5,"n":715,"cat":"rendah"},"MYOR":{"g5":8.5,"g10":0.6,"n":704,"cat":"rendah"},"NASI":{"g5":17.8,"g10":7.2,"n":741,"cat":"normal"},"NELY":{"g5":6.0,"g10":1.2,"n":764,"cat":"rendah"},"NISP":{"g5":1.3,"g10":0.0,"n":1085,"cat":"rendah"},"NRCA":{"g5":15.0,"g10":9.4,"n":1085,"cat":"normal"},"OKAS":{"g5":15.3,"g10":8.5,"n":682,"cat":"normal"},"OMRE":{"g5":14.0,"g10":6.4,"n":638,"cat":"normal"},"PADI":{"g5":41.8,"g10":29.6,"n":414,"cat":"sangat_sering"},"PANR":{"g5":12.4,"g10":1.5,"n":465,"cat":"normal"},"PCAR":{"g5":15.6,"g10":7.3,"n":356,"cat":"normal"},"PDES":{"g5":8.3,"g10":5.9,"n":560,"cat":"rendah"},"PEGE":{"g5":16.4,"g10":7.7,"n":666,"cat":"normal"},"PGAS":{"g5":4.7,"g10":0.2,"n":819,"cat":"rendah"},"PICO":{"g5":20.0,"g10":10.2,"n":467,"cat":"normal"},"PJAA":{"g5":5.8,"g10":2.6,"n":1238,"cat":"rendah"},"PKPK":{"g5":16.9,"g10":11.2,"n":681,"cat":"normal"},"PLAN":{"g5":28.5,"g10":16.7,"n":420,"cat":"sering"},"PNBN":{"g5":10.8,"g10":3.2,"n":790,"cat":"normal"},"PNLF":{"g5":11.8,"g10":2.4,"n":1032,"cat":"normal"},"POLA":{"g5":36.7,"g10":20.6,"n":599,"cat":"sangat_sering"},"PPRE":{"g5":15.2,"g10":9.0,"n":758,"cat":"normal"},"PRDA":{"g5":3.0,"g10":0.9,"n":1286,"cat":"rendah"},"PSAB":{"g5":22.8,"g10":9.0,"n":665,"cat":"sering"},"PSKT":{"g5":37.0,"g10":22.2,"n":486,"cat":"sangat_sering"},"PTBA":{"g5":4.9,"g10":1.1,"n":716,"cat":"rendah"},"PTPP":{"g5":14.3,"g10":4.4,"n":815,"cat":"normal"},"PTRO":{"g5":34.1,"g10":17.1,"n":546,"cat":"sering"},"PUDP":{"g5":11.1,"g10":4.5,"n":551,"cat":"normal"},"PWON":{"g5":8.0,"g10":0.5,"n":1093,"cat":"rendah"},"RAJA":{"g5":31.6,"g10":15.7,"n":653,"cat":"sering"},"RANC":{"g5":10.9,"g10":5.5,"n":593,"cat":"normal"},"RBMS":{"g5":17.8,"g10":6.7,"n":433,"cat":"normal"},"RELI":{"g5":13.5,"g10":6.4,"n":519,"cat":"normal"},"RICY":{"g5":20.2,"g10":10.7,"n":668,"cat":"sering"},"RIGS":{"g5":11.6,"g10":4.9,"n":844,"cat":"normal"},"RODA":{"g5":29.2,"g10":14.3,"n":567,"cat":"sering"},"ROTI":{"g5":1.6,"g10":0.5,"n":1086,"cat":"rendah"},"SAME":{"g5":13.7,"g10":6.2,"n":828,"cat":"normal"},"SCCO":{"g5":4.4,"g10":0.0,"n":752,"cat":"rendah"},"SCMA":{"g5":19.3,"g10":6.5,"n":704,"cat":"normal"},"SDRA":{"g5":2.1,"g10":0.2,"n":823,"cat":"rendah"},"SGRO":{"g5":10.7,"g10":5.2,"n":513,"cat":"normal"},"SIDO":{"g5":3.2,"g10":0.9,"n":837,"cat":"rendah"},"SILO":{"g5":7.4,"g10":3.5,"n":647,"cat":"rendah"},"SKBM":{"g5":19.8,"g10":9.9,"n":633,"cat":"normal"},"SKLT":{"g5":10.0,"g10":3.4,"n":888,"cat":"rendah"},"SMBR":{"g5":12.9,"g10":5.6,"n":828,"cat":"normal"},"SMCB":{"g5":10.4,"g10":5.0,"n":222,"cat":"normal"},"SMDR":{"g5":11.6,"g10":2.3,"n":1203,"cat":"normal"},"SMGR":{"g5":11.9,"g10":1.5,"n":779,"cat":"normal"},"SMRA":{"g5":3.7,"g10":0.3,"n":1066,"cat":"rendah"},"SMSM":{"g5":2.6,"g10":0.1,"n":767,"cat":"rendah"},"SOCI":{"g5":11.9,"g10":5.3,"n":835,"cat":"normal"},"SOFA":{"g5":33.2,"g10":19.9,"n":560,"cat":"sering"},"SONA":{"g5":22.4,"g10":15.2,"n":664,"cat":"sering"},"SQMI":{"g5":19.5,"g10":7.5,"n":409,"cat":"normal"},"SRTG":{"g5":17.6,"g10":5.6,"n":1239,"cat":"normal"},"SSIA":{"g5":15.6,"g10":6.3,"n":753,"cat":"normal"},"SSMS":{"g5":10.1,"g10":2.6,"n":571,"cat":"normal"},"STAR":{"g5":26.4,"g10":19.9,"n":486,"cat":"sering"},"STTP":{"g5":5.0,"g10":2.3,"n":634,"cat":"rendah"},"SULI":{"g5":14.3,"g10":4.7,"n":636,"cat":"normal"},"TALF":{"g5":17.3,"g10":10.4,"n":730,"cat":"normal"},"TARA":{"g5":37.7,"g10":30.1,"n":408,"cat":"sangat_sering"},"TAXI":{"g5":38.0,"g10":31.0,"n":413,"cat":"sangat_sering"},"TBIG":{"g5":8.2,"g10":2.0,"n":639,"cat":"rendah"},"TBLA":{"g5":4.7,"g10":1.3,"n":1101,"cat":"rendah"},"TCID":{"g5":8.4,"g10":2.8,"n":627,"cat":"rendah"},"TELE":{"g5":9.3,"g10":8.0,"n":458,"cat":"rendah"},"TFCO":{"g5":3.8,"g10":3.7,"n":621,"cat":"rendah"},"TGKA":{"g5":2.3,"g10":0.4,"n":1111,"cat":"rendah"},"TINS":{"g5":24.4,"g10":8.8,"n":696,"cat":"sering"},"TKIM":{"g5":7.8,"g10":3.1,"n":1127,"cat":"rendah"},"TLKM":{"g5":10.3,"g10":1.5,"n":611,"cat":"normal"},"TMAS":{"g5":4.5,"g10":1.5,"n":781,"cat":"rendah"},"TNCA":{"g5":18.1,"g10":8.2,"n":732,"cat":"normal"},"TOBA":{"g5":23.1,"g10":11.0,"n":767,"cat":"sering"},"TOTL":{"g5":9.6,"g10":2.4,"n":667,"cat":"rendah"},"TOTO":{"g5":1.4,"g10":0.0,"n":1086,"cat":"rendah"},"TOWR":{"g5":7.4,"g10":2.7,"n":699,"cat":"rendah"},"TPIA":{"g5":12.8,"g10":6.0,"n":766,"cat":"normal"},"TRIM":{"g5":15.2,"g10":3.5,"n":646,"cat":"normal"},"TRIS":{"g5":4.6,"g10":1.3,"n":854,"cat":"rendah"},"TRST":{"g5":3.9,"g10":2.3,"n":428,"cat":"rendah"},"TSPC":{"g5":4.8,"g10":1.4,"n":981,"cat":"rendah"},"ULTJ":{"g5":5.7,"g10":0.7,"n":902,"cat":"rendah"},"UNIC":{"g5":7.8,"g10":3.3,"n":695,"cat":"rendah"},"UNTR":{"g5":7.2,"g10":1.1,"n":548,"cat":"rendah"},"UNVR":{"g5":11.9,"g10":3.5,"n":642,"cat":"normal"},"VICO":{"g5":13.4,"g10":5.6,"n":817,"cat":"normal"},"VINS":{"g5":10.0,"g10":4.4,"n":797,"cat":"rendah"},"VIVA":{"g5":33.5,"g10":13.7,"n":335,"cat":"sering"},"VOKS":{"g5":9.7,"g10":6.1,"n":883,"cat":"rendah"},"VRNA":{"g5":4.9,"g10":1.2,"n":651,"cat":"rendah"},"WAPO":{"g5":17.5,"g10":10.2,"n":871,"cat":"normal"},"WEHA":{"g5":11.0,"g10":4.6,"n":1004,"cat":"normal"},"WICO":{"g5":0.0,"g10":0.0,"n":514,"cat":"nan"},"WINS":{"g5":9.6,"g10":2.0,"n":1194,"cat":"rendah"},"WSBP":{"g5":34.1,"g10":14.1,"n":472,"cat":"sering"},"WTON":{"g5":10.7,"g10":2.4,"n":788,"cat":"normal"},"ZINC":{"g5":30.7,"g10":17.3,"n":531,"cat":"sering"}};

// Deteksi apakah saham ini kandidat gap up besok pagi
// Input: ticker, price, dayOfWeek (0=Senin), currentSignals
// Output: { isGapCandidate, score, reasons, expected5pct, expected10pct }
function detectGapUpCandidate(ticker, price, dayOfWeek, signals = []) {
  const g = GAP_STATS[ticker];
  let score = 0;
  const reasons = [];

  // Factor 1: ticker historically sering gap
  if (g) {
    if (g.cat === 'sangat_sering') { score += 40; reasons.push(`${ticker} sangat sering gap (${g.g5}% dari ${g.n} trade)`); }
    else if (g.cat === 'sering')   { score += 25; reasons.push(`${ticker} sering gap (${g.g5}% historis)`); }
    else if (g.cat === 'normal')   { score += 10; }
  }

  // Factor 2: harga rendah = lebih volatile
  if (price < 100)       { score += 25; reasons.push('Harga < Rp100 (sangat volatile)'); }
  else if (price < 200)  { score += 15; reasons.push('Harga < Rp200 (volatile)'); }
  else if (price < 500)  { score += 5; }

  // Factor 3: Senin atau Jumat = lebih sering gap
  if (dayOfWeek === 0)   { score += 10; reasons.push('Senin = sering gap up dari weekend catalyst'); }
  else if (dayOfWeek === 4) { score += 10; reasons.push('Jumat = short squeeze menjelang weekend'); }

  // Factor 4: ada sinyal BSJP aktif = momentum sudah ada
  const hasBSJP = signals.some(s => s.reason?.includes('BSJP') || s.type?.includes('BSJP'));
  if (hasBSJP) { score += 15; reasons.push('Sinyal BSJP aktif'); }

  // Factor 5: ada Pre-ARA signal = kandidat ARA
  const hasPreARA = signals.some(s => s.reason?.includes('ARA') || s.type?.includes('ARA'));
  if (hasPreARA) { score += 20; reasons.push('Sinyal Pre-ARA aktif → potensi ARA besok'); }

  const isGapCandidate = score >= 40;
  const level = score >= 70 ? 'TINGGI' : score >= 50 ? 'SEDANG' : score >= 40 ? 'RENDAH' : null;

  return {
    isGapCandidate,
    score,
    level,
    reasons,
    expected5pct:  g?.g5  ?? null,
    expected10pct: g?.g10 ?? null,
  };
}


// Helper: ambil backtest stats berdasarkan keyword di label sinyal
// Jika ticker diberikan, merge dengan stats per-ticker (lebih akurat)
function getBacktestStats(labelOrReason, ticker, signalNameExact) {
  const s = labelOrReason || '';
  let globalStat = null;
  // 1. Exact signalName lookup (paling akurat, dari field signalName di screener)
  if (signalNameExact && BACKTEST_STATS[signalNameExact]) {
    globalStat = BACKTEST_STATS[signalNameExact];
  }
  // 2. Exact key inclusion dalam string
  if (!globalStat) {
    for (const [key, val] of Object.entries(BACKTEST_STATS)) {
      if (s.includes(key)) { globalStat = val; break; }
    }
  }
  // 3. Fuzzy fallback
  if (!globalStat) {
    if (s.includes('RSI') && s.includes('BB')) globalStat = BACKTEST_STATS['RSI+BB Lower Bounce'];
    else if (s.includes('MACD') || s.includes('macd')) globalStat = BACKTEST_STATS['MACD Crossover Bullish'];
    else if (s.includes('Golden Cross') || s.includes('golden cross')) globalStat = BACKTEST_STATS['Golden Cross EMA20/50'];
    else if (s.includes('RSI recovery') || s.includes('RSI Recovery')) globalStat = BACKTEST_STATS['RSI Recovery + 2 Candle Hijau'];
    else if (s.includes('EMA5') || s.includes('ema5')) globalStat = BACKTEST_STATS['RSI-9 Pullback ke EMA5'];
    else if (s.includes('Deeply Oversold') || s.includes('deeply oversold')) globalStat = BACKTEST_STATS['Stochastic Deeply Oversold'];
    else if (s.includes('Oversold + Naik') || s.includes('oversold + naik')) globalStat = BACKTEST_STATS['Stochastic Oversold + Naik'];
    else if (s.includes('Volume Spike') || s.includes('volume spike')) globalStat = BACKTEST_STATS['Volume Spike Sideways'];
    else if (s.includes('Volume Avg') || s.includes('volume avg')) globalStat = BACKTEST_STATS['Volume Avg Naik Terkontrol'];
    else if (s.includes('Exhaustion') || s.includes('exhaustion')) globalStat = BACKTEST_STATS['Volume Exhaustion Bottom'];
    else if (s.includes('Tersembunyi') || s.includes('tersembunyi')) globalStat = BACKTEST_STATS['Akumulasi Tersembunyi'];
    else if (s.includes('Diam-diam') || s.includes('diam-diam')) globalStat = BACKTEST_STATS['RSI Recovery Diam-diam'];
    else if (s.includes('Compression') || s.includes('compression')) globalStat = BACKTEST_STATS['Candle Compression'];
    else if (s.includes('Volume Meledak') || s.includes('volume meledak')) globalStat = BACKTEST_STATS['Volume Meledak'];
    else if (s.includes('Breakout') || s.includes('breakout')) globalStat = BACKTEST_STATS['Breakout Konsolidasi'];
    else if (s.includes('BSJP') || s.includes('Beli Sore')) globalStat = BACKTEST_STATS['BSJP Beli Sore Jual Pagi'];
    else if (s.includes('BPJS') || s.includes('Beli Pagi')) globalStat = BACKTEST_STATS['BPJS Beli Pagi Jual Sore'];
    else if (s.includes('Grade A') || s.includes('BELI')) globalStat = BACKTEST_STATS['BELI (Grade A)'];
    else if (s.includes('Grade B') || s.includes('PERHATIKAN')) globalStat = BACKTEST_STATS['PERHATIKAN (Grade B)'];
  }
  if (!globalStat) return null;

  // If ticker provided, try to find per-ticker stats and merge
  if (ticker && TICKER_SIGNAL_STATS[ticker]) {
    const sigKey = signalNameExact ||
      Object.keys(BACKTEST_STATS).find(k => s.includes(k)) ||
      Object.keys(BACKTEST_STATS).find(k => globalStat === BACKTEST_STATS[k]);
    if (sigKey && TICKER_SIGNAL_STATS[ticker][sigKey]) {
      const tickerStat = TICKER_SIGNAL_STATS[ticker][sigKey];
      return {
        ...globalStat,
        winRate: tickerStat.wr,
        avgRet: tickerStat.avg,
        bestHorizon: tickerStat.best,
        count: tickerStat.n,
        byHorizon: tickerStat.bh || globalStat.byHorizon,
        _tickerSpecific: true,
      };
    }
  }
  return globalStat;
}

// ── Calculations ──────────────────────────────────────────────
// calcRSI() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// calcBollinger() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// calcMA() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// calcMACD() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// calcEMA() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// calcStochastic() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// calcATR() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// ── Signal Generation ──────────────────────────────────────────
// Target dihitung dari ATR + level teknikal nyata (resistance/fib/BB upper).
// Bukan hardcoded multiplier — setiap saham punya target berbeda sesuai volatilitasnya.

// Helper: cari resistance terdekat di atas harga sekarang
// findNearestResistance() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// Helper: hitung Fibonacci extension untuk target
// calcFibTargets() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// Helper: hitung stop loss berbasis ATR
// calcATRStopLoss() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

// Helper: hitung holding days dari momentum RSI & ATR ratio
// estimateHoldingDays() dipindah ke lib/core/signals.js

// generateSwingSignals() dipindah ke lib/core/signals.js

// generateScalpingSignals() dipindah ke lib/core/signals.js

// detectAccumulation() dipindah ke lib/core/signals.js

// calculateLiquidityScore() dipindah ke lib/core/signals.js

// ── Smart Money Concept ──────────────────────────────────────
// calcSMC() dipindah ke lib/core/signals.js

// ── Trading Signals ──────────────────────────────────────────
// calcSignals() dipindah ke lib/core/signals.js

// ── INVESTMENT SCORE ─────────────────────────────────────────────────────────
// PENTING: Formula & threshold HARUS sama persis dengan screener.js di backend.
// Jangan ubah salah satu tanpa mengubah yang lain.
//
// Threshold baku:
//   Score >= 75 → Grade A → BELI
//   Score 55-74 → Grade B → PERHATIKAN
//   Score 35-54 → Grade C → TAHAN
//   Score < 35  → Grade D → HINDARI
// ─────────────────────────────────────────────────────────────────────────────
// invScore() dihapus — sekarang di-import dari lib/core/ (dulu ditulis ulang di sini).

function extractInfo(q = {}) {
  const sd = q.summaryDetail || {};
  const ks = q.defaultKeyStatistics || {};
  const fd = q.financialData || {};
  const ap = q.assetProfile || {};
  const pr = q.price || {};
  const g = (...keys) => {
    for (const k of keys) {
      for (const src of [sd, ks, fd, ap, pr]) {
        const o = src[k];
        if (o == null) continue;
        const v = (typeof o === 'object' && 'raw' in o) ? o.raw : o;
        if (v != null && v !== '' && !(typeof o === 'object' && Object.keys(o).length === 0)) return v;
      }
    }
    return null;
  };

  // ── Gunakan _fundamentals yang sudah dihitung di backend (unit sudah benar) ──
  // quote.js menghitung PBV, PER, ROE (desimal), DER (ratio) dengan logika
  // IDENTIK dengan screener.js. Hasilnya dijamin konsisten.
  const f = q._fundamentals || null;

  return {
    name: pr.longName || pr.shortName || ap.longName || '',
    sector: ap.sector || '—', industry: ap.industry || '—',
    // Kalau ada _fundamentals dari backend → pakai itu. Kalau tidak → fallback Yahoo raw.
    pbv: f?.pbv ?? (() => {
      const sv = q._sectorsValuation;
      const rawPBV = g('priceToBook');
      const rawBookVal = g('bookValue');
      const rawPrice = pr.regularMarketPrice?.raw || null;
      if (sv?.pbv != null) return sv.pbv;
      if (rawBookVal != null && rawBookVal > 0 && rawBookVal < 1 && rawPrice > 100) return Math.round((rawPrice / (rawBookVal * 16300)) * 100) / 100;
      if (rawPBV != null && rawPBV > 50 && rawPrice > 0) return rawPrice / rawPBV;
      if (rawPBV != null && rawPBV >= 0.1 && rawPBV <= 50) return rawPBV;
      return null;
    })(),
    per: f?.per ?? g('trailingPE'),
    // ROE: Yahoo tidak konsisten — kadang desimal (0.18), kadang persen (14.43 dari Sectors).
    // Normalisasi: abs > 2 → dianggap persen → bagi 100. Buang jika abs > 100 (data rusak).
    roe: (() => {
      const raw = f?.roe ?? g('returnOnEquity');
      if (raw == null) return null;
      if (Math.abs(raw) > 2) return Math.abs(raw) > 100 ? null : raw / 100;
      return Math.abs(raw) > 1 ? null : raw;
    })(),
    // DER: dari _fundamentals sudah RATIO (1.5). Kalau fallback Yahoo raw perlu /100.
    der: f?.der ?? (() => { const r = g('debtToEquity'); return r != null ? r / 100 : null; })(),
    mc: pr.marketCap?.raw || g('marketCap'), prev: pr.regularMarketPreviousClose?.raw || g('previousClose'),
    w52h: g('fiftyTwoWeekHigh'), w52l: g('fiftyTwoWeekLow'),
    dyield: g('dividendYield', 'trailingAnnualDividendYield'), beta: g('beta'),
    eps: g('trailingEps'), ps: g('priceToSalesTrailing12Months'),
    evebitda: g('enterpriseToEbitda'), roa: g('returnOnAssets'),
    cr: g('currentRatio'), gm: g('grossMargins'), om: g('operatingMargins'),
    rev: g('totalRevenue'), website: ap.website || '',
    employees: ap.fullTimeEmployees || null, country: ap.country || 'Indonesia',
    biz: ap.longBusinessSummary || '',
    targetMean: g('targetMeanPrice'), targetHigh: g('targetHighPrice'), targetLow: g('targetLowPrice'),
    analystCount: g('numberOfAnalystOpinions'), recKey: fd.recommendationKey || null,
  };
}

// ── DETEKSI POLA INTRADAY: Beli Pagi/Jual Sore & Beli Sore/Jual Pagi ────────
// Formula berbasis EXPECTANCY (bukan sekadar winrate) supaya sinyal bermakna.
// ── DETEKSI GAP HARI INI ─────────────────────────────────────────────────────
// Bandingkan open[-1] vs close[-2] dari chart data.
// Real-time — bukan historis. Kalau market lagi buka, ini gap pagi ini.
function detectTodayGap(opens, closes, timestamps) {
  if (!opens?.length || !closes?.length || opens.length < 2 || closes.length < 2) return null;
  const todayOpen = opens[opens.length - 1];
  const prevClose = closes[closes.length - 2];
  if (!todayOpen || !prevClose || prevClose <= 0) return null;

  // Validasi: candle terakhir harus hari ini (bukan kemarin)
  // Yahoo timestamp dalam detik UTC. IDX buka 09:00 WIB = 02:00 UTC
  if (timestamps?.length) {
    const lastTs  = timestamps[timestamps.length - 1] * 1000; // ke ms
    const lastDate = new Date(lastTs);
    const today    = new Date();
    const isToday  = lastDate.toDateString() === today.toDateString();
    // Kalau candle terakhir bukan hari ini, open[-1] = open kemarin, bukan pagi ini
    if (!isToday) return { stale: true, reason: 'Data belum update hari ini' };
    // Kalau belum jam 09:15 WIB (02:15 UTC), open belum terbentuk
    const utcHour = today.getUTCHours();
    const utcMin  = today.getUTCMinutes();
    if (utcHour < 2 || (utcHour === 2 && utcMin < 15)) {
      return { stale: true, reason: 'Market belum buka (< 09:15 WIB)' };
    }
  }

  const pct = (todayOpen - prevClose) / prevClose * 100;
  const abs = Math.abs(pct);
  const isGapUp   = pct >  0.3;
  const isGapDown = pct < -0.3;
  const level = abs >= 5 ? 'besar' : abs >= 2 ? 'sedang' : abs >= 0.5 ? 'kecil' : null;

  if (!level) return { pct: parseFloat(pct.toFixed(2)), isFlat: true, isGapUp: false, isGapDown: false };

  const pullbackLow  = Math.round(prevClose * 1.005).toLocaleString('id');
  const pullbackHigh = Math.round(prevClose * 1.03).toLocaleString('id');
  let action = null;
  if      (isGapUp   && level === 'besar')  action = `⚠️ Jangan chase — tunggu pullback ke Rp${pullbackLow}–${pullbackHigh}`;
  else if (isGapUp   && level === 'sedang') action = `Hati-hati entry, sudah naik dari close kemarin`;
  else if (isGapUp   && level === 'kecil')  action = `Gap kecil, masih oke untuk entry normal`;
  else if (isGapDown && level === 'besar')  action = `🟢 Gap down besar = entry BSJP ideal`;
  else if (isGapDown && level === 'sedang') action = `🟢 Gap down = potensi entry BSJP, target balik Rp${Math.round(prevClose).toLocaleString('id')}`;
  else if (isGapDown && level === 'kecil')  action = `Gap down kecil, normal`;

  return {
    pct: parseFloat(pct.toFixed(2)),
    todayOpen, prevClose,
    isGapUp, isGapDown, isFlat: false, stale: false,
    level, action,
    label: isGapUp
      ? `⬆️ Gap Up +${pct.toFixed(1)}% pagi ini`
      : `⬇️ Gap Down ${pct.toFixed(1)}% pagi ini`,
  };
}

// ── BPJS/BSJP INTRADAY PATTERN ───────────────────────────────────────────────
// Expectancy = (WR × avgGain) − ((1−WR) × avgLoss)
// Threshold: WR ≥ 60% DAN expectancy ≥ 0.25% per hari
// Data Yahoo adalah daily OHLC: Open = proxy pagi, Close = proxy sore.
function detectIntradayPattern(data) {
  const { closes, opens, highs, lows, volumes } = data;
  const n = closes.length;
  if (n < 20 || !opens || opens.length < 20) return null;

  const sample = Math.min(60, n); // 60 hari agar statistik lebih robust
  let bullishCount = 0, bearishCount = 0;
  let totalBullGain = 0, totalBullLoss = 0;
  let gapUpCount = 0, gapDownCount = 0;
  let totalGapGain = 0, totalGapLoss = 0;
  let validDays = 0;

  for (let i = n - sample; i < n; i++) {
    const o = opens[i], c = closes[i];
    if (!o || !c || o <= 0) continue;
    validDays++;

    const candlePct = (c - o) / o * 100;
    if (c > o) { bullishCount++; totalBullGain += candlePct; }
    else { bearishCount++; totalBullLoss += Math.abs(candlePct); }

    if (i > 0 && opens[i] && closes[i - 1] && closes[i - 1] > 0) {
      const gapPct = (opens[i] - closes[i - 1]) / closes[i - 1] * 100;
      if (gapPct > 0.2) { gapUpCount++; totalGapGain += gapPct; }
      else if (gapPct < -0.2) { gapDownCount++; totalGapLoss += Math.abs(gapPct); }
    }
  }

  if (validDays < 15) return null;

  // BPJS: Beli Pagi Jual Sore
  const bpjsWR = validDays > 0 ? bullishCount / validDays : 0;
  const bpjsAvgGain = bullishCount > 0 ? totalBullGain / bullishCount : 0;
  const bpjsAvgLoss = bearishCount > 0 ? totalBullLoss / bearishCount : 0;
  const bpjsExpectancy = bpjsWR * bpjsAvgGain - (1 - bpjsWR) * bpjsAvgLoss;

  // BSJP: Beli Sore Jual Pagi
  const gapTotal = gapUpCount + gapDownCount;
  const bsjpWR = gapTotal > 0 ? gapUpCount / gapTotal : 0;
  const bsjpAvgGain = gapUpCount > 0 ? totalGapGain / gapUpCount : 0;
  const bsjpAvgLoss = gapDownCount > 0 ? totalGapLoss / gapDownCount : 0;
  const bsjpExpectancy = bsjpWR * bsjpAvgGain - (1 - bsjpWR) * bsjpAvgLoss;

  const patterns = [];

  // Threshold ketat: WR ≥ 60% DAN expectancy ≥ 0.25%
  if (bpjsWR >= 0.60 && bpjsExpectancy >= 0.25) {
    patterns.push({
      type: 'BELI_PAGI_JUAL_SORE',
      signalName: 'BPJS Beli Pagi Jual Sore',
      label: '☀️ Beli Pagi, Jual Sore',
      reason: `WR ${Math.round(bpjsWR * 100)}% dari ${validDays} hari — avg gain ${bpjsAvgGain.toFixed(2)}%, expectancy +${bpjsExpectancy.toFixed(2)}%/hari`,
      timing: 'Masuk di harga Open (09:00–09:30), exit di Close (15:45–16:00)',
      winRate: Math.round(bpjsWR * 100),
      avgGain: bpjsAvgGain.toFixed(2),
      avgLoss: bpjsAvgLoss.toFixed(2),
      expectancy: bpjsExpectancy.toFixed(2),
      sampleDays: validDays,
      strength: Math.min(95, Math.round(bpjsWR * 70 + bpjsExpectancy * 10)),
      color: 'var(--amber)',
    });
  }

  if (bsjpWR >= 0.60 && bsjpExpectancy >= 0.25 && gapTotal >= 10) {
    patterns.push({
      type: 'BELI_SORE_JUAL_PAGI',
      signalName: 'BSJP Beli Sore Jual Pagi',
      label: '🌙 Beli Sore, Jual Pagi',
      reason: `WR ${Math.round(bsjpWR * 100)}% dari ${gapTotal} observasi — avg gap ${bsjpAvgGain.toFixed(2)}%, expectancy +${bsjpExpectancy.toFixed(2)}%`,
      timing: 'Masuk di Close (15:45–16:00), exit di Open besok (09:00–09:30)',
      winRate: Math.round(bsjpWR * 100),
      avgGain: bsjpAvgGain.toFixed(2),
      avgLoss: bsjpAvgLoss.toFixed(2),
      expectancy: bsjpExpectancy.toFixed(2),
      sampleDays: gapTotal,
      strength: Math.min(95, Math.round(bsjpWR * 70 + bsjpExpectancy * 10)),
      color: 'var(--purple)',
    });
  }

  let dominant = null;
  if (patterns.length === 2) {
    dominant = parseFloat(patterns[0].expectancy) >= parseFloat(patterns[1].expectancy) ? patterns[0] : patterns[1];
  } else if (patterns.length === 1) {
    dominant = patterns[0];
  }

  return {
    patterns,
    dominant,
    stats: {
      sample: validDays,
      bullishCount, bearishCount,
      beliPagiWinRate: Math.round(bpjsWR * 100),
      beliSoreWinRate: Math.round(bsjpWR * 100),
      bpjsExpectancy: bpjsExpectancy.toFixed(2),
      bsjpExpectancy: bsjpExpectancy.toFixed(2),
      gapUpCount, gapDownCount,
    },
  };
}

// ── PREDIKSI PRE-ARA & LONJAKAN BESAR ───────────────────────────────────────
// Mendeteksi saham yang BERPOTENSI akan ARA atau lonjakan besar dalam waktu dekat.
// Bukan deteksi sesudah ARA terjadi — tapi sinyal SEBELUM gerakan besar.
//
// Logika: ARA / lonjakan besar biasanya didahului oleh:
//   1. Akumulasi tersembunyi: volume naik tapi harga flat (bandar mengumpulkan)
//   2. Candle compression: range high-low makin menyempit (energi terkumpul)
//   3. RSI recovery diam-diam dari oversold ke netral
//   4. Volume tiba-tiba meledak 1 hari sebelum (last accumulation)
//   5. Harga break dari konsolidasi sempit dengan volume
// ─────────────────────────────────────────────────────────────────────────────
function detectPreARA(data) {
  const { closes, opens, highs, lows, volumes } = data;
  const n = closes.length;
  if (n < 30) return null;

  const price   = closes[n - 1];
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const avgVol5  = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const avgVol3  = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
  if (avgVol20 === 0) return null;

  const rsi     = calcRSI(closes);
  const ema20   = calcEMA(closes, 20);
  const ema5    = calcEMA(closes, 5);
  const atrArr  = calcATR(highs, lows, closes, 14);
  const atr     = atrArr[atrArr.length - 1] || 0;

  // Harga & range
  const priceChange5  = (closes[n-1] - closes[n-6])  / closes[n-6]  * 100;
  const priceChange10 = (closes[n-1] - closes[n-11]) / closes[n-11] * 100;
  const high20 = Math.max(...highs.slice(-20));
  const low20  = Math.min(...lows.slice(-20));
  const range20Pct = (high20 - low20) / low20 * 100;

  // Candle compression: average range 5 hari vs 20 hari
  const avgRange5  = highs.slice(-5).map((h,i) => h - lows.slice(-5)[i]).reduce((a,b)=>a+b,0) / 5;
  const avgRange20 = highs.slice(-20).map((h,i) => h - lows.slice(-20)[i]).reduce((a,b)=>a+b,0) / 20;
  const compression = avgRange20 > 0 ? avgRange5 / avgRange20 : 1;

  // RSI slope: apakah RSI sedang naik diam-diam?
  const rsiArr = [];
  for (let i = n-10; i < n; i++) rsiArr.push(calcRSI(closes.slice(0, i+1)));
  const rsiSlope = rsiArr.length > 5 ? rsiArr[rsiArr.length-1] - rsiArr[rsiArr.length-6] : 0;

  const signals = [];
  let totalScore = 0;

  // ── SINYAL 1: Volume akumulasi tersembunyi ──────────────────────────────
  // Volume naik signifikan tapi harga masih flat → bandar mengumpulkan pelan-pelan
  if (avgVol5 > avgVol20 * 1.8 && Math.abs(priceChange5) < 5) {
    const score = Math.min(30, Math.round((avgVol5 / avgVol20) * 12));
    totalScore += score;
    signals.push({
      icon: '📦',
      label: 'Akumulasi Tersembunyi', signalName: 'Akumulasi Tersembunyi',
      detail: `Volume ${(avgVol5/avgVol20).toFixed(1)}x rata-rata, harga masih sideways ${priceChange5.toFixed(1)}%`,
      score,
    });
  }

  // ── SINYAL 2: Candle compression (spring loaded) ────────────────────────
  // Range candle makin sempit = energi terkumpul, siap meledak
  if (compression < 0.55 && avgRange20 > 0) {
    const score = Math.round((1 - compression) * 25);
    totalScore += score;
    signals.push({
      icon: '🗜️',
      label: 'Candle Compression', signalName: 'Candle Compression',
      detail: `Range 5hr = ${(compression*100).toFixed(0)}% dari normal — energi terkumpul, siap meledak`,
      score,
    });
  }

  // ── SINYAL 3: Volume spike mendadak (last accumulation) ─────────────────
  // Volume hari terakhir meledak jauh di atas rata-rata
  const lastVol = volumes[n-1];
  if (lastVol > avgVol20 * 3 && closes[n-1] >= closes[n-2] * 0.99) {
    const score = Math.min(25, Math.round((lastVol / avgVol20) * 6));
    totalScore += score;
    signals.push({
      icon: '💥',
      label: 'Volume Meledak', signalName: 'Volume Meledak',
      detail: `Volume hari ini ${(lastVol/avgVol20).toFixed(1)}x rata-rata — sinyal kuat masuk uang besar`,
      score,
    });
  }

  // ── SINYAL 4: RSI naik diam-diam dari oversold ───────────────────────────
  // RSI recovery tapi belum overbought = masih ada ruang naik
  if (rsi > 30 && rsi < 55 && rsiSlope > 8) {
    const score = Math.round(rsiSlope * 1.2);
    totalScore += Math.min(20, score);
    signals.push({
      icon: '📈',
      label: 'RSI Recovery Diam-diam', signalName: 'RSI Recovery Diam-diam',
      detail: `RSI naik ${rsiSlope.toFixed(0)} poin dalam 5 hari — momentum mulai terbentuk`,
      score: Math.min(20, score),
    });
  }

  // ── SINYAL 5: Harga breakout konsolidasi sempit ──────────────────────────
  // Harga tembus resistance konsolidasi dengan volume
  const consolidationHigh = Math.max(...highs.slice(-10, -1));
  const isBreakout = closes[n-1] > consolidationHigh * 1.01 && lastVol > avgVol20 * 1.5;
  if (isBreakout && range20Pct < 15) {
    const score = 25;
    totalScore += score;
    signals.push({
      icon: '🚀',
      label: 'Breakout Konsolidasi', signalName: 'Breakout Konsolidasi',
      detail: `Harga ${fmtRp(price)} tembus resistance ${fmtRp(Math.round(consolidationHigh))} dengan volume ${(lastVol/avgVol20).toFixed(1)}x`,
      score,
    });
  }

  // ── SINYAL 6: EMA5 cross EMA20 dengan volume ─────────────────────────────
  const prevEma5  = calcEMA(closes.slice(0,-1), 5);
  const prevEma20 = calcEMA(closes.slice(0,-1), 20);
  const emaCross  = ema5[n-1] > ema20[n-1] && prevEma5[prevEma5.length-1] <= prevEma20[prevEma20.length-1];
  if (emaCross && lastVol > avgVol20 * 1.3) {
    totalScore += 20;
    signals.push({
      icon: '⚡',
      label: 'EMA Cross + Volume',
      detail: `EMA5 baru saja cross EMA20 ke atas dengan volume ${(lastVol/avgVol20).toFixed(1)}x`,
      score: 20,
    });
  }

  // ── SINYAL 7: Harga mendekati zona support kuat lalu bounce ─────────────
  const support = Math.min(...lows.slice(-20));
  const nearSupport = (price - support) / support < 0.03;
  const bouncing = closes[n-1] > closes[n-2] && closes[n-2] > closes[n-3];
  if (nearSupport && bouncing && lastVol > avgVol20) {
    totalScore += 15;
    signals.push({
      icon: '🎯',
      label: 'Bounce dari Support',
      detail: `Harga bounce dari support ${fmtRp(Math.round(support))} dengan 3 candle hijau berturut`,
      score: 15,
    });
  }

  if (signals.length === 0) return null;

  const finalScore = Math.min(99, totalScore);

  // Klasifikasi potensi
  let potential, potentialColor, potentialDesc;
  // Threshold Pre-ARA:
  // SANGAT TINGGI (≥70, ≥3 sinyal) = kandidat ARA 1-3 hari — masuk tab Sinyal
  // TINGGI (≥50, ≥2 sinyal) = kandidat breakout 3-7 hari — masuk tab Sinyal
  // WASPADA (≥35, ≥2 sinyal) = sinyal awal — masuk tab Sinyal tapi badge abu
  // SEDANG (<35) = hanya tampil di tab Detail, TIDAK muncul di tab Sinyal
  if (finalScore >= 70 && signals.length >= 3) {
    potential = 'SANGAT TINGGI';
    potentialColor = '#ff4d6a';
    potentialDesc = 'Kombinasi sinyal kuat — potensi lonjakan besar / ARA dalam 1-3 hari';
  } else if (finalScore >= 50 && signals.length >= 2) {
    potential = 'TINGGI';
    potentialColor = '#ffb84d';
    potentialDesc = 'Sinyal akumulasi terdeteksi — pantau ketat, potensi gerak besar 3-7 hari';
  } else if (finalScore >= 35 && signals.length >= 2) {
    potential = 'WASPADA';
    potentialColor = '#a78bfa';
    potentialDesc = 'Sinyal awal terbentuk — perlu konfirmasi volume dan harga dalam 1-2 hari';
  } else {
    potential = 'SEDANG';
    potentialColor = '#6b7280';
    potentialDesc = 'Beberapa sinyal lemah — belum cukup konfirmasi untuk masuk posisi';
  }

  return { signals, finalScore, potential, potentialColor, potentialDesc };
}
function fmt(n, dec = 2) { return n != null && !isNaN(n) ? Number(n).toFixed(dec) : '—'; }
function fmtRp(n) { return n != null ? 'Rp ' + Math.round(n).toLocaleString('id') : '—'; }
function fmtPct(n) { return n != null ? (n * 100).toFixed(1) + '%' : '—'; }
function fmtMC(mc) { return mc ? (mc >= 1e12 ? `Rp ${(mc / 1e12).toFixed(2)} T` : `Rp ${(mc / 1e9).toFixed(1)} M`) : '—'; }

const verdictClass = { BELI: 'vd-a', PERHATIKAN: 'vd-b', TAHAN: 'vd-c', HINDARI: 'vd-d' };
const gradeColor = { A: '#00e5a0', B: '#ffb84d', C: '#4d9fff', D: '#ff4d6a' };


// ── SignalNote: kartu sinyal lengkap dengan TP1/TP2/SL/RR/Hold ──────────────
function SignalNote({ signals = [], type = 'swing', ticker = null, ddPct = 0, onDistSignal }) {
  if (!signals || signals.length === 0) return null;
  const active = signals.filter(s => s.strength > 0 && s.type !== 'SCALP_NEUTRAL');
  if (active.length === 0) return null;

  const typeColor = type === 'swing'
    ? { bg: 'rgba(0,229,160,.07)', border: 'rgba(0,229,160,.25)', label: '#00e5a0', tag: 'SWING' }
    : type === 'scalp'
    ? { bg: 'rgba(77,159,255,.07)', border: 'rgba(77,159,255,.25)', label: '#4d9fff', tag: 'SCALP' }
    : { bg: 'rgba(167,139,250,.07)', border: 'rgba(167,139,250,.25)', label: '#a78bfa', tag: 'AKUMULASI' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0.5rem 0' }}>
      {active.map((s, i) => {
        const bst = getBacktestStats(s.reason, ticker, s.signalName);
        const wrColor = !bst ? 'var(--muted)' : bst.winRate >= 55 ? '#00e5a0' : bst.winRate >= 45 ? '#ffb84d' : '#ff4d6a';
        const isTickerSpecific = bst?._tickerSpecific;
        return (
        <div key={i} style={{
          padding: '0.75rem 1rem',
          background: typeColor.bg,
          border: `1px solid ${typeColor.border}`,
          borderRadius: 10,
          fontSize: '.82rem',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '.65rem', fontWeight: 700, padding: '2px 7px',
              background: typeColor.border, color: typeColor.label,
              borderRadius: 20, letterSpacing: '.04em',
            }}>{typeColor.tag}</span>
            <span style={{ fontWeight: 700, color: 'var(--text)', flex: 1 }}>
              {s.type.includes('BUY') ? '▲' : '▼'} {s.reason}
            </span>
            {s.reason?.includes('BSJP') && (() => {
              const g = detectGapUpCandidate(ticker, 0, new Date().getDay(), [s]);
              return g?.isGapCandidate ? (
                <span style={{ fontSize:'.65rem', fontWeight:700, padding:'2px 8px', background:'rgba(255,184,77,.15)', color:'#ffb84d', borderRadius:20, border:'1px solid rgba(255,184,77,.3)' }}>
                  ⚡ Gap {g.level} · {g.expected5pct}% historis
                </span>
              ) : null;
            })()}
            {bst && (
              <span title={`${isTickerSpecific ? `Data spesifik ${ticker} (${bst.count} trade)` : `Data global (${bst.count} trade)`} · Best: ${bst.bestHorizon}`} style={{
                fontSize: '.68rem', fontWeight: 700, padding: '2px 8px',
                background: `${wrColor}18`, color: wrColor,
                borderRadius: 20, border: `1px solid ${wrColor}44`,
                whiteSpace: 'nowrap', cursor: 'default',
              }}>
                📊 WR {bst.winRate}%{isTickerSpecific ? ' ★' : ''} · {bst.bestHorizon}
              </span>
            )}
            {bst && (() => {
              const sigKey = s.signalName || null;
              return sigKey ? <DistributionTriggerBtn signalKey={sigKey} ticker={ticker} backtestData={ticker ? (TICKER_SIGNAL_STATS[ticker] || {})[sigKey] : null} onClick={() => onDistSignal && onDistSignal({signal: sigKey, ticker})} /> : null;
            })()}
            <span style={{
              fontSize: '.7rem', fontWeight: 700,
              color: s.strength >= 80 ? '#00e5a0' : s.strength >= 60 ? '#ffb84d' : 'var(--muted)',
            }}>{s.strength}%</span>
          </div>

          {/* TP / SL / RR grid — prioritas: DD-aware historical > per-ticker historical > ATR */}
          {(() => {
            // Resolve signal name dari reason string (sama logic getBacktestStats)
            const r = s.reason || '';
            let sigName = null;
            if (r.includes('RSI') && r.includes('BB')) sigName = 'RSI+BB Lower Bounce';
            else if (r.includes('MACD') || r.includes('macd')) sigName = 'MACD Crossover Bullish';
            else if (r.includes('Golden Cross')) sigName = 'Golden Cross EMA20/50';
            else if (r.includes('RSI recovery') || r.includes('RSI Recovery')) sigName = 'RSI Recovery + 2 Candle Hijau';
            else if (r.includes('EMA5') || r.includes('ema5')) sigName = 'RSI-9 Pullback ke EMA5';
            else if (r.includes('Deeply Oversold')) sigName = 'Stochastic Deeply Oversold';
            else if (r.includes('Oversold + Naik')) sigName = 'Stochastic Oversold + Naik';
            else if (r.includes('Volume Spike')) sigName = 'Volume Spike Sideways';
            else if (r.includes('Volume Avg')) sigName = 'Volume Avg Naik Terkontrol';
            else if (r.includes('Exhaustion')) sigName = 'Volume Exhaustion Bottom';
            else if (r.includes('Tersembunyi')) sigName = 'Akumulasi Tersembunyi';
            else if (r.includes('Diam-diam')) sigName = 'RSI Recovery Diam-diam';
            else if (r.includes('Compression')) sigName = 'Candle Compression';
            else if (r.includes('Volume Meledak')) sigName = 'Volume Meledak';
            else if (r.includes('Breakout')) sigName = 'Breakout Konsolidasi';
            // Harga entry: ambil dari sl+atr (paling akurat) atau estimasi balik dari tp1
            const price = s.sl && s.atr ? Math.round(s.sl + s.atr * 1.5)
                        : s.tp1 && s.pct1 ? Math.round(s.tp1 / (1 + parseFloat(s.pct1)/100))
                        : null;

            // Prioritas: 1) per-ticker specific (paling akurat) → 2) DD-aware global → 3) ATR
            const histTicker = (sigName && price && ticker)
              ? getHistoricalTPSL(ticker, sigName, price) : null;
            // Hanya pakai DD-aware global kalau per-ticker tidak ada atau n < 8
            const useGlobal = !histTicker || histTicker.n < 8;
            const histDD = (useGlobal && sigName && price && ddPct > 0)
              ? getDeepBounceTPSL(sigName, price, ddPct) : null;
            const best = histTicker || histDD;  // per-ticker selalu menang

            const tp1   = best?.tp1  ?? s.tp1;
            const tp2   = best?.tp2  ?? s.tp2;
            const sl    = best?.sl   ?? s.sl;
            const pct1  = best ? `+${best.pctTP1}%` : (s.pct1 ? `+${s.pct1}%` : null);
            const pct2  = best ? `+${best.pctTP2}%` : (s.pct2 ? `+${s.pct2}%` : null);
            const pctSL = best ? `${best.pctSL}%` : null;
            const rr    = best?.rr ?? s.riskReward;
            // Label sumber data
            const isTicker = !!histTicker && histTicker.n >= 8;
            const isDeep   = !isTicker && histDD?.isDeepBounce;
            const src  = isTicker ? `📊 ${ticker} spesifik`
                       : isDeep   ? '🔄 Deep Bounce (global)'
                       : best     ? '📊 Historis (global)'
                       : '📐 ATR';
            const lowN = best && best.n < 10;

            return (tp1 || tp2 || sl) ? (
              <div style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  {tp1 && <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(0,229,160,.12)', color: '#00e5a0', fontSize: '.73rem', fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>
                    TP1 {tp1.toLocaleString('id')} {pct1 ? `(${pct1})` : ''}
                  </span>}
                  {tp2 && <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(0,229,160,.07)', color: '#00e5a0', fontSize: '.73rem', fontFamily: 'DM Mono,monospace' }}>
                    TP2 {tp2.toLocaleString('id')} {pct2 ? `(${pct2})` : ''}
                  </span>}
                  {sl && <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(255,77,106,.12)', color: '#ff4d6a', fontSize: '.73rem', fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>
                    SL {sl.toLocaleString('id')} {pctSL ? `(${pctSL})` : ''}
                  </span>}
                  {rr && <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(255,255,255,.05)', color: 'var(--muted)', fontSize: '.73rem' }}>R/R 1:{rr}</span>}
                  {s.holdingDays && <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(255,255,255,.05)', color: 'var(--muted)', fontSize: '.73rem' }}>⏱ {s.holdingDays}</span>}
                </div>
                <div style={{ fontSize: '.65rem', color: isDeep ? '#ffb84d' : 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{src}{best ? ` · ${best.n} trade${lowN ? ' ⚠️ sample kecil' : ''}` : ''}</span>
                  {best && <span>WR {best.winRate}% · median {best.median > 0 ? '+' : ''}{best.median}%</span>}
                  {isDeep && ddPct > 0 && <span style={{ color: '#ffb84d', fontWeight: 700 }}>DD -{Math.round(ddPct)}% dari ATH → potensi lebih besar</span>}
                </div>
              </div>
            ) : null;
          })()}

          {/* Backtest stats — horizon breakdown selalu tampil */}
          {bst && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,.05)', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '.67rem', color: 'var(--muted)' }}>
              {!isTickerSpecific && <span>📊 Global {bst.count.toLocaleString('id')} trade</span>}
              {['1d','2d','3d','5d','7d','14d','30d','60d'].filter(h => bst.byHorizon?.[h]).map(h => {
                const v = bst.byHorizon[h];
                const c = v.wr >= 55 ? '#00e5a0' : v.wr >= 45 ? '#ffb84d' : '#ff4d6a';
                return <span key={h} style={{ color: v.wr === bst.winRate ? c : 'var(--muted)' }}>
                  {h}: <b style={{ color: c }}>{v.wr}%</b> WR
                </span>;
              })}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function Verdict({ v }) {
  return <span className={`verdict ${verdictClass[v] || ''}`}>{v}</span>;
}

function MetricCard({ label, value, delta, deltaType = 'neu' }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value ?? '—'}</div>
      {delta && <div className={`metric-delta delta-${deltaType}`}>{delta}</div>}
    </div>
  );
}

function ScoreBreakdown({ bd }) {
  // Harus sama dengan maks poin di invScore()
  const maxes = { PBV: 20, PER: 20, RSI: 20, Drawdown: 10, ROE: 20, 'D/E': 10 };
  return (
    <div className="breakdown-bars">
      {Object.entries(bd).map(([k, v]) => {
        const max = maxes[k] || 20;
        const pct = v / max * 100;
        const col = pct > 60 ? '#00e5a0' : pct > 30 ? '#ffb84d' : '#ff4d6a';
        return (
          <div key={k} className="breakdown-row">
            <div className="breakdown-label">{k}</div>
            <div className="breakdown-bar-wrap">
              <div className="breakdown-bar-fill" style={{ width: pct + '%', background: col }} />
            </div>
            <div className="breakdown-val">{v.toFixed(0)}</div>
          </div>
        );
      })}
    </div>
  );
}

function PriceChart({ closes, dates, highs, lows, vols, showBB, showMA50 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !closes?.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const PAD = { t: 20, r: 70, b: 60, l: 10 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const MAX = 250;
    const step = Math.max(1, Math.floor(closes.length / MAX));
    const sc = closes.filter((_, i) => i % step === 0);
    const sH = (highs || closes).filter((_, i) => i % step === 0);
    const sL = (lows || closes).filter((_, i) => i % step === 0);
    const sv = (vols || []).filter((_, i) => i % step === 0);
    const n = sc.length;
    if (n < 2) return;
    const minP = Math.min(...sL) * 0.995, maxP = Math.max(...sH) * 1.005;
    const x = i => PAD.l + (i / (n - 1)) * cW;
    const y = v => PAD.t + (1 - (v - minP) / (maxP - minP)) * cH;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = PAD.t + (i / 4) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.l, yy); ctx.lineTo(W - PAD.r, yy); ctx.stroke();
      const v = maxP - (i / 4) * (maxP - minP);
      ctx.fillStyle = '#5a6f8f'; ctx.font = '10px DM Mono,monospace'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(v).toLocaleString('id'), W - PAD.r + 65, yy + 4);
    }
    const maxV = Math.max(...sv.filter(Boolean)) || 1;
    sv.forEach((v, i) => {
      if (!v) return;
      const bH = (v / maxV) * 40;
      ctx.fillStyle = i > 0 && sc[i] >= sc[i - 1] ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,106,0.3)';
      const bW = Math.max(1, cW / n - 1);
      ctx.fillRect(x(i) - bW / 2, H - PAD.b - bH, bW, bH);
    });
    if (showBB) {
      const bb = calcBollinger(sc);
      ctx.strokeStyle = 'rgba(167,139,250,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ['upper', 'lower'].forEach(k => {
        ctx.beginPath();
        bb.forEach((b, i) => {
          if (b && b[k] != null) {
            if (i === 0 || !bb[i - 1] || bb[i - 1][k] == null) ctx.moveTo(x(i), y(b[k]));
            else ctx.lineTo(x(i), y(b[k]));
          }
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    if (showMA50) {
      const ma50 = calcMA(sc, Math.min(50, Math.floor(sc.length / 2)));
      ctx.strokeStyle = 'rgba(139,92,246,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ma50.forEach((v, i) => {
        if (v != null) {
          if (!ma50[i - 1]) ctx.moveTo(x(i), y(v));
          else ctx.lineTo(x(i), y(v));
        }
      });
      ctx.stroke(); ctx.setLineDash([]);
    }
    const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
    grad.addColorStop(0, 'rgba(77,159,255,0.18)'); grad.addColorStop(1, 'rgba(77,159,255,0.01)');
    ctx.beginPath();
    sc.forEach((v, i) => i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(n - 1), H - PAD.b); ctx.lineTo(x(0), H - PAD.b); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    sc.forEach((v, i) => i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)));
    ctx.strokeStyle = '#4d9fff'; ctx.lineWidth = 2; ctx.stroke();
    const labelEvery = Math.ceil(n / 6);
    ctx.fillStyle = '#5a6f8f'; ctx.font = '10px DM Mono,monospace'; ctx.textAlign = 'center';
    sc.forEach((_, i) => {
      if (i % labelEvery === 0 && dates?.[i * step]) {
        const d = new Date(dates[i * step] * 1000);
        ctx.fillText(d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), x(i), H - PAD.b + 16);
      }
    });
  }, [closes, showBB, showMA50]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: 300, display: 'block' }} />;
}

function RSIChart({ closes }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !closes?.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const rsiArr = closes.map((_, i) => i < 14 ? null : calcRSI(closes.slice(0, i + 1)));
    const valid = rsiArr.filter(v => v != null);
    const n = valid.length;
    if (n < 2) return;
    const PAD = { t: 10, r: 40, b: 20, l: 10 };
    const cW = W - PAD.l - PAD.r;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(239,68,68,.06)';
    ctx.fillRect(PAD.l, PAD.t, cW, (1 - 70 / 100) * (H - PAD.t - PAD.b));
    ctx.fillStyle = 'rgba(0,229,160,.06)';
    ctx.fillRect(PAD.l, H - PAD.b - (30 / 100) * (H - PAD.t - PAD.b), cW, (30 / 100) * (H - PAD.t - PAD.b));
    [70, 50, 30].forEach(lvl => {
      const yy = PAD.t + (1 - lvl / 100) * (H - PAD.t - PAD.b);
      ctx.strokeStyle = lvl === 70 ? 'rgba(255,77,106,.4)' : lvl === 30 ? 'rgba(0,229,160,.4)' : 'rgba(255,255,255,.1)';
      ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(PAD.l, yy); ctx.lineTo(W - PAD.r, yy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#5a6f8f'; ctx.font = '9px DM Mono,monospace'; ctx.textAlign = 'left';
      ctx.fillText(lvl, W - PAD.r + 4, yy + 3);
    });
    ctx.beginPath();
    valid.forEach((v, i) => {
      const xi = PAD.l + (i / (n - 1)) * cW, yi = PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
      i === 0 ? ctx.moveTo(xi, yi) : ctx.lineTo(xi, yi);
    });
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.8; ctx.stroke();
  }, [closes]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: 90, display: 'block' }} />;
}

// ── Relative Performance Chart ────────────────────────────────
function RelativeChart({ rows }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !rows.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const PAD = { t: 15, r: 10, b: 30, l: 50 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const COLORS = ['#4d9fff', '#00e5a0', '#ffb84d', '#a78bfa', '#ff4d6a'];
    const allNorm = rows.map(r => r.closes.map(v => v / r.closes[0] * 100));
    const allVals = allNorm.flat();
    const minV = Math.min(...allVals) * 0.998, maxV = Math.max(...allVals) * 1.002;
    const n = Math.min(...rows.map(r => r.closes.length));
    if (n < 2) return;
    const x = i => PAD.l + (i / (n - 1)) * cW;
    const y = v => PAD.t + (1 - (v - minV) / (maxV - minV)) * cH;
    ctx.clearRect(0, 0, W, H);
    [80, 90, 100, 110, 120].forEach(lvl => {
      if (lvl < minV || lvl > maxV) return;
      ctx.strokeStyle = lvl === 100 ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.04)';
      ctx.setLineDash(lvl === 100 ? [4, 4] : []); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.l, y(lvl)); ctx.lineTo(W - PAD.r, y(lvl)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#5a6f8f'; ctx.font = '10px DM Mono,monospace'; ctx.textAlign = 'right';
      ctx.fillText(lvl + '%', PAD.l - 4, y(lvl) + 4);
    });
    rows.forEach((r, ri) => {
      const norm = allNorm[ri];
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (i === 0) ctx.moveTo(x(i), y(norm[i])); else ctx.lineTo(x(i), y(norm[i]));
      }
      ctx.strokeStyle = COLORS[ri]; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = COLORS[ri]; ctx.font = '10px Syne,sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(r.sym, x(n - 1) - 30, y(norm[n - 1]) - 5);
    });
  }, [rows]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: 240, display: 'block' }} />;
}

// ── Chatbot Component ────────────────────────────────────────
function JarvisChat({ groqKey, groqModel, screenerRows, detailData, newsItems }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [jarvisReady, setJarvisReady] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function buildMarketContext() {
    if (!screenerRows || screenerRows.length === 0) return 'Data screener belum tersedia. Minta user jalankan Screener dulu.';
    const enriched = screenerRows.map(r => {
      const swing  = (r._swingSignals  || []).filter(s => s.strength > 0);
      const scalp  = (r._scalpSignals  || []).filter(s => s.type !== 'SCALP_NEUTRAL' && s.strength > 0);
      const accum  = (r._accumSignals  || []);
      const bpjs   = r._intradayPattern?.patterns?.find(p => p.type === 'BELI_PAGI_JUAL_SORE');
      const bsjp   = r._intradayPattern?.patterns?.find(p => p.type === 'BELI_SORE_JUAL_PAGI');
      const preARA = r._preARA;
      const allSig = [...swing, ...scalp, ...accum,
        ...(bpjs ? [{ type: 'BPJS', reason: bpjs.reason, strength: bpjs.strength }] : []),
        ...(bsjp ? [{ type: 'BSJP', reason: bsjp.reason, strength: bsjp.strength }] : []),
        ...((preARA?.signals || []).map(s => ({ type: 'PRE_ARA', reason: s.label, strength: s.score * 2 }))),
      ];
      return {
        ...r, _allSig: allSig, _sigCount: allSig.length,
        _hasBPJS: !!bpjs, _hasBSJP: !!bsjp,
        _hasPreARA: !!(preARA?.finalScore >= 35 && (preARA?.signals?.length || 0) >= 2),
        _preARAScore: preARA?.finalScore || 0,
        _beliPagiWR: bpjs ? r._intradayPattern?.stats?.beliPagiWinRate : null,
        _beliSoreWR: bsjp ? r._intradayPattern?.stats?.beliSoreWinRate : null,
      };
    });
    const byScore   = [...enriched].sort((a,b) => b.Score - a.Score).slice(0, 25);
    const multiSig  = [...enriched].filter(r => r._sigCount > 0).sort((a,b) => (b._sigCount*10+b.Score)-(a._sigCount*10+a.Score)).slice(0, 20);
    const preARALst = enriched.filter(r => r._hasPreARA).sort((a,b) => b._preARAScore - a._preARAScore).slice(0, 10);
    const bpjsLst   = enriched.filter(r => r._hasBPJS).sort((a,b) => (b._beliPagiWR||0) - (a._beliPagiWR||0)).slice(0, 10);
    const bsjpLst   = enriched.filter(r => r._hasBSJP).sort((a,b) => (b._beliSoreWR||0) - (a._beliSoreWR||0)).slice(0, 10);
    const gorengan  = enriched.filter(r => r._sigCount >= 2 && (r.PBV > 3 || r.Score >= 50)).sort((a,b) => b._sigCount - a._sigCount).slice(0, 10);
    const scalping  = enriched.filter(r => r._allSig.some(s => s.type?.includes('SCALP'))).sort((a,b) => b.Score - a.Score).slice(0, 10);

    const p = r => r.Price || r.Harga || 0;
    const fmt  = r => `${r.Ticker}(Score:${r.Score},RSI:${r.RSI?.toFixed(0)||'?'},Sig:${r._sigCount},PBV:${r.PBV?.toFixed(1)||'?'},PER:${r.PER?.toFixed(0)||'?'},ROE:${r['ROE%']||'?'}%,Harga:Rp${p(r).toLocaleString('id')},SL:Rp${Math.round(p(r)*0.93).toLocaleString('id')},TP1:Rp${Math.round(p(r)*1.07).toLocaleString('id')},TP2:Rp${Math.round(p(r)*1.14).toLocaleString('id')})`;
    const fmtB = r => `${r.Ticker}(Score:${r.Score},WR:${r._beliPagiWR}%,RSI:${r.RSI?.toFixed(0)||'?'},Harga:Rp${p(r).toLocaleString('id')},SL:Rp${Math.round(p(r)*0.97).toLocaleString('id')},TP:Rp${Math.round(p(r)*1.03).toLocaleString('id')})`;
    const fmtS = r => `${r.Ticker}(Score:${r.Score},WR:${r._beliSoreWR}%,RSI:${r.RSI?.toFixed(0)||'?'},Harga:Rp${p(r).toLocaleString('id')},SL:Rp${Math.round(p(r)*0.97).toLocaleString('id')},TP:Rp${Math.round(p(r)*1.03).toLocaleString('id')})`;
    const fmtP = r => `${r.Ticker}(PreARA:${r._preARAScore},Score:${r.Score},Pot:${r._preARA?.potential||'?'},Harga:Rp${p(r).toLocaleString('id')},SL:Rp${Math.round(p(r)*0.93).toLocaleString('id')},TP:Rp${Math.round(p(r)*1.24).toLocaleString('id')})`;

    return `=== DATA PASAR LIVE (${enriched.length} saham, ${new Date().toLocaleDateString('id')}) ===

TOP SCORE: ${byScore.map(fmt).join(' | ')}

MULTI-SINYAL (sinyal terbanyak): ${multiSig.map(fmt).join(' | ')}

PRE-ARA (potensi ARA): ${preARALst.length > 0 ? preARALst.map(fmtP).join(' | ') : 'tidak ada saat ini'}

BELI PAGI JUAL SORE (BPJS): ${bpjsLst.length > 0 ? bpjsLst.map(fmtB).join(' | ') : 'tidak ada'}

BELI SORE JUAL PAGI (BSJP): ${bsjpLst.length > 0 ? bsjpLst.map(fmtS).join(' | ') : 'tidak ada'}

GORENGAN MOMENTUM: ${gorengan.length > 0 ? gorengan.map(fmt).join(' | ') : 'tidak ada'}

SCALPING SETUP: ${scalping.length > 0 ? scalping.map(fmt).join(' | ') : 'tidak ada'}

${detailData && !detailData.error ? `SAHAM DI DETAIL: ${detailData.ticker} Rp${detailData.price?.toLocaleString('id')} RSI:${detailData.rsiV?.toFixed(1)} Score:${detailData.sc?.total}/100` : ''}`;
  }

  const JARVIS_SYSTEM = () => `Kamu adalah JARVIS — AI trader elite BEI/IDX. 

SPESIALISASI:
- Saham gorengan (high volatility, momentum play)
- Swing trading 5-21 hari
- Scalping intraday 1-3 hari  
- BPJS (Beli Pagi Jual Sore) & BSJP (Beli Sore Jual Pagi) — strategi intraday berdasarkan pola historis
- Pre-ARA hunting (saham yang akan Auto Rejection Atas)
- Akumulasi fundamental murah

KEPRIBADIAN:
- Tegas, singkat, to-the-point
- Tidak pernah bilang "DYOR", "konsultasikan ke ahli keuangan", atau disclaimer berlebihan
- Kalau ditanya saham apa — jawab dengan ticker spesifik, entry, TP, SL, holding
- Gunakan data screener yang sudah tersedia
- Boleh bilang "hindari" atau "jangan beli" kalau memang buruk
- Format angka Rupiah: Rp1.250 bukan Rp1250

FORMAT JAWABAN:
Untuk rekomendasi saham, gunakan format:
**[TICKER]** — [1 kalimat thesis]
• Entry: RpX | TP1: RpX | TP2: RpX | SL: RpX
• Holding: X hari | R/R: 1:X
• Alasan: [maks 2 poin singkat]

${buildMarketContext()}`;

  const QUICK_CMDS = [
    { label: '🔥 Beli hari ini?', q: 'Saham apa yang paling layak dibeli hari ini? Kasih top 3 terbaik dengan entry, TP, SL.' },
    { label: '🚀 Pre-ARA?', q: 'Saham mana yang paling berpotensi kena ARA? Kasih yang pre-ARA score tertinggi.' },
    { label: '☀️ BPJS terbaik?', q: 'Rekomendasikan saham terbaik untuk strategi Beli Pagi Jual Sore hari ini.' },
    { label: '🌙 BSJP terbaik?', q: 'Rekomendasikan saham terbaik untuk strategi Beli Sore Jual Pagi.' },
    { label: '🌶️ Gorengan hot?', q: 'Ada gorengan yang lagi momentum bagus sekarang? Kasih yang paling menarik untuk trading.' },
    { label: '⚡ Scalp sekarang?', q: 'Saham mana yang bagus buat scalping 1-2 hari ini? Entry dan target cepat.' },
    { label: '📈 Swing minggu ini?', q: 'Rekomendasikan swing trade terbaik untuk holding 1-2 minggu.' },
    { label: '🛑 Yang dihindari?', q: 'Dari data screener, saham apa yang sebaiknya dihindari atau di-cut loss sekarang?' },
  ];

  useEffect(() => {
    if (messages.length === 0) {
      if (screenerRows.length > 0) {
        const preARACount = screenerRows.filter(r => r._preARA?.finalScore >= 35 && (r._preARA?.signals?.length||0) >= 2).length;
        const topTicker = [...screenerRows].sort((a,b) => b.Score - a.Score)[0]?.Ticker || '?';
        const bpjsCount = screenerRows.filter(r => r._intradayPattern?.patterns?.some(p => p.type === 'BELI_PAGI_JUAL_SORE')).length;
        setMessages([{ role: 'assistant', content: `⚡ JARVIS online — ${screenerRows.length} saham live.

📊 Top score: **${topTicker}** | 🔮 Pre-ARA: **${preARACount}** kandidat | ☀️ BPJS: **${bpjsCount}** saham

Mau tahu saham apa yang harus dibeli hari ini? Tanya langsung.` }]);
      } else {
        setMessages([{ role: 'assistant', content: '⚡ JARVIS siap tapi data screener belum ada.\n\nJalankan **Screener** dulu (tab 📋), baru balik sini — gue bisa kasih rekomendasi spesifik berdasarkan data live.' }]);
      }
    }
  }, []);

  useEffect(() => {
    if (screenerRows.length > 0 && !jarvisReady && messages.length <= 1) {
      setJarvisReady(true);
      const preARACount = screenerRows.filter(r => r._preARA?.finalScore >= 35 && (r._preARA?.signals?.length||0) >= 2).length;
      const topTicker = [...screenerRows].sort((a,b) => b.Score - a.Score)[0]?.Ticker || '?';
      const bpjsCount = screenerRows.filter(r => r._intradayPattern?.patterns?.some(p => p.type === 'BELI_PAGI_JUAL_SORE')).length;
      setMessages([{ role: 'assistant', content: `⚡ JARVIS online — ${screenerRows.length} saham live.

📊 Top score: **${topTicker}** | 🔮 Pre-ARA: **${preARACount}** kandidat | ☀️ BPJS: **${bpjsCount}** saham

Mau tahu saham apa yang harus dibeli hari ini? Tanya langsung.` }]);
    }
  }, [screenerRows.length]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    if (!groqKey) {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Masukkan Groq API Key di panel atas dulu.' }]);
      return;
    }
    setInput('');
    const newMessages = [...messages, { role: 'user', content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            { role: 'system', content: JARVIS_SYSTEM() },
            ...newMessages.slice(-12).map(m => ({ role: m.role, content: m.content }))
          ],
          max_tokens: 700, temperature: 0.35, stream: true
        }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      let buf = '';
      setMessages(m => [...m, { role: 'assistant', content: '' }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try { full += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ''; } catch {}
        }
        setMessages(m => [...m.slice(0, -1), { role: 'assistant', content: full }]);
      }
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `❌ Error: ${e.message}` }]);
    }
    setLoading(false);
  };

  const renderMsg = (content) => {
    return content
      .replace(/\*\*(.+?)\*\*/g, '<b style="color:#e8e8e8">$1</b>')
      .replace(/\*(.+?)\*/g, '<em style="color:#aaa">$1</em>')
      .split('\n')
      .map((l, i) => `<p style="margin:2px 0">${l || '&nbsp;'}</p>`)
      .join('');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 200px)', minHeight:520 }}>
      <div style={{ background:'linear-gradient(135deg,#060608,#0d1117)', border:'1px solid #00d4ff33', borderRadius:'12px 12px 0 0', padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#00d4ff,#0055ff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', boxShadow:'0 0 15px #00d4ff44', flexShrink:0 }}>⚡</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'DM Mono,monospace', fontWeight:900, fontSize:'.92rem', color:'#00d4ff', letterSpacing:'.06em' }}>JARVIS — IHSG DESTROYER</div>
          <div style={{ fontSize:'.68rem', color:'#ffffff44', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {screenerRows.length > 0
              ? `${screenerRows.length} saham live · ${screenerRows.filter(r=>r._preARA?.finalScore>=50).length} Pre-ARA · ${screenerRows.filter(r=>r._intradayPattern?.patterns?.some(p=>p.type==='BELI_PAGI_JUAL_SORE')).length} BPJS · ${screenerRows.filter(r=>r._intradayPattern?.patterns?.some(p=>p.type==='BELI_SORE_JUAL_PAGI')).length} BSJP`
              : 'Jalankan Screener dulu untuk aktifkan data live'}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background: screenerRows.length > 0 ? '#00ff88' : '#ff4d4d', boxShadow: screenerRows.length > 0 ? '0 0 8px #00ff88' : 'none', animation: screenerRows.length > 0 ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize:'.65rem', color:'#ffffff33', fontFamily:'DM Mono,monospace' }}>{screenerRows.length > 0 ? 'LIVE' : 'OFFLINE'}</span>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', background:'#07070d', padding:'1rem', display:'flex', flexDirection:'column', gap:12, border:'1px solid #00d4ff22', borderTop:'none', borderBottom:'none' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'assistant' && (
              <div style={{ width:24, height:24, borderRadius:'50%', background:'linear-gradient(135deg,#00d4ff,#0055ff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.65rem', marginRight:8, marginTop:4, flexShrink:0, boxShadow:'0 0 8px #00d4ff33' }}>J</div>
            )}
            <div style={{
              maxWidth:'82%', padding:'.65rem .95rem',
              borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
              background: m.role === 'user' ? 'linear-gradient(135deg,#00d4ff18,#0055ff18)' : '#ffffff09',
              border: m.role === 'user' ? '1px solid #00d4ff33' : '1px solid #ffffff0f',
              color: m.role === 'user' ? '#7dd3fc' : '#d4d4d4',
              fontSize:'.82rem', lineHeight:1.7, fontFamily:'DM Sans,sans-serif',
            }}
              dangerouslySetInnerHTML={{ __html: renderMsg(m.content) }}
            />
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
            <div style={{ width:24, height:24, borderRadius:'50%', background:'linear-gradient(135deg,#00d4ff,#0055ff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.65rem', flexShrink:0 }}>J</div>
            <div style={{ padding:'.65rem .95rem', background:'#ffffff09', border:'1px solid #ffffff0f', borderRadius:'2px 12px 12px 12px', display:'flex', gap:5, alignItems:'center' }}>
              {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#00d4ff', animation:'jbounce .8s infinite', animationDelay:`${i*0.13}s` }} />)}
              <span style={{ fontSize:'.68rem', color:'#00d4ff44', marginLeft:6, fontFamily:'DM Mono,monospace' }}>thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ background:'#07070d', border:'1px solid #00d4ff22', borderTop:'1px solid #ffffff08', padding:'8px 12px', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
        {QUICK_CMDS.map((c, i) => (
          <button key={i} onClick={() => send(c.q)} disabled={loading} style={{
            background:'#ffffff07', border:'1px solid #ffffff12', color:'#ffffff55',
            borderRadius:20, padding:'4px 11px', fontSize:'.71rem', cursor:'pointer',
            fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap', transition:'.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#00d4ff66'; e.currentTarget.style.color='#00d4ff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#ffffff12'; e.currentTarget.style.color='#ffffff55'; }}
          >{c.label}</button>
        ))}
      </div>

      <div style={{ background:'#060608', border:'1px solid #00d4ff33', borderTop:'1px solid #ffffff08', borderRadius:'0 0 12px 12px', padding:'10px 12px', display:'flex', gap:8, flexShrink:0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && send()}
          placeholder={screenerRows.length > 0 ? 'Tanya Jarvis: saham apa yang harus gue beli hari ini?' : 'Jalankan Screener dulu...'}
          style={{ flex:1, background:'#ffffff0a', border:'1px solid #ffffff1a', borderRadius:8, color:'#e0e0e0', fontFamily:'DM Sans,sans-serif', fontSize:'.82rem', padding:'.5rem .9rem', outline:'none', transition:'.2s' }}
          onFocus={e => e.target.style.borderColor='#00d4ff44'}
          onBlur={e => e.target.style.borderColor='#ffffff1a'}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{
          background: !loading && input.trim() ? 'linear-gradient(135deg,#00d4ff,#0055ff)' : '#ffffff0a',
          color: !loading && input.trim() ? '#000' : '#ffffff22',
          border:'none', borderRadius:8, padding:'.5rem 1.1rem', fontSize:'.8rem',
          fontWeight:900, cursor: !loading && input.trim() ? 'pointer' : 'default',
          fontFamily:'DM Mono,monospace', letterSpacing:'.04em', transition:'.2s',
        }}>SEND</button>
      </div>
    </div>
  );
}

function Chatbot() { return null; }
// ── Screener Row with integrated signals ──────────────────────
function ScreenerRow({ r, index, onDetail }) {
  const [expanded, setExpanded] = useState(false);
  const hasSignals = (r.signals && (
    r.signals.swing?.length > 0 ||
    r.signals.scalp?.length > 0 ||
    r.signals.accumulation?.length > 0
  )) || (r._intradayPattern?.patterns?.length > 0) || (r._preARA?.signals?.length > 0);

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)} style={{ cursor: hasSignals ? 'pointer' : 'default' }}>
        <td style={{ color: 'var(--muted)' }}>{index + 1}</td>
        <td
          className="td-ticker"
          style={{ cursor: 'pointer', color: 'var(--blue)' }}
          onClick={e => { e.stopPropagation(); onDetail(r.Ticker, r); }}
        >
          {r.Ticker}
        </td>
        <td style={{ fontSize: '.77rem' }}>{r.Nama || '—'}</td>
        <td style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{(r.Sektor || '—').substring(0, 18)}</td>
        <td className="td-mono">{fmtRp(r.Harga)}</td>
        <td className={`td-mono ${r.PBV && r.PBV < 1 ? 'td-green' : ''}`}>{r.PBV ?? '—'}</td>
        <td className="td-mono">{r.PER ?? '—'}</td>
        <td className={`td-mono ${r.RSI < 30 ? 'td-green' : r.RSI > 70 ? 'td-red' : ''}`}>{r.RSI}</td>
        <td className="td-mono td-red">-{r['DD%']}%</td>
        <td className={`td-mono ${r['ROE%'] && r['ROE%'] > 15 ? 'td-green' : ''}`}>
          {r['ROE%'] != null ? r['ROE%'] + '%' : '—'}
        </td>
        <td className="td-mono" style={{ fontWeight: 700, color: gradeColor[r.Grade] }}>{r.Score}</td>
        <td><Verdict v={r.Grade} /></td>
        <td><Verdict v={r.Verdict} /></td>
        <td>
          {r.buyZone ? (
            <span style={{
              fontSize: '.7rem', padding: '2px 7px', borderRadius: 4, fontWeight: 600,
              background: r.buyZone.inZone ? 'rgba(0,229,160,.15)' : 'rgba(255,255,255,.05)',
              color: r.buyZone.inZone ? 'var(--green)' : 'var(--muted)',
              border: `1px solid ${r.buyZone.inZone ? 'rgba(0,229,160,.4)' : 'rgba(255,255,255,.1)'}`,
              whiteSpace: 'nowrap',
            }}>
              {r.buyZone.inZone ? '🟢 Di zona' : `${r.buyZone.zoneHigh.toLocaleString()}`}
            </span>
          ) : '—'}
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            {hasSignals && (
              <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}>
                {expanded ? '▲' : '▼'} Sinyal
              </button>
            )}
            <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); onDetail(r.Ticker, r); }}>Detail →</button>
          </div>
        </td>
      </tr>
      {expanded && hasSignals && (
        <tr>
          <td colSpan={15} style={{ background: 'var(--bg2)', padding: '.6rem 1rem' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.74rem' }}>
              {r.signals.swing?.map((sig, idx) => (
                <div key={'sw' + idx} style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <span className={`signal-pill ${sig.type.includes('BUY') ? 'signal-buy' : 'signal-sell'}`}>
                    {sig.type.includes('BUY') ? '▲' : '▼'} Swing: {sig.reason} ({sig.strength}%)
                    {(() => { const b = getBacktestStats(sig.reason, r.Ticker, sig.signalName);
                      const isBSJP = sig.reason?.includes('BSJP');
                      const gapInfo = isBSJP ? detectGapUpCandidate(r.Ticker, r.Price || r.price || 0, new Date().getDay(), r._swingSignals || []) : null;
                      return <>{b ? <span style={{ marginLeft:5, fontWeight:700, color: b.winRate>=55?'#00e5a0':b.winRate>=45?'#ffb84d':'#ff4d6a', fontSize:'.65rem' }}>WR {b.winRate}%{b._tickerSpecific?' ★':''}</span> : null}{gapInfo?.isGapCandidate ? <span style={{ marginLeft:4, fontSize:'.63rem', fontWeight:700, background:'rgba(255,184,77,.15)', color:'#ffb84d', padding:'1px 6px', borderRadius:10 }}>⚡ Gap {gapInfo.level} {gapInfo.expected5pct ? `${gapInfo.expected5pct}%` : ''}</span> : null}</>; })()}
                  </span>
                  {sig.tp1 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', paddingLeft:4 }}>
                      <span style={{ fontSize:'.68rem', background:'rgba(0,229,160,.1)', color:'var(--green)', padding:'1px 6px', borderRadius:3 }}>TP1 {sig.tp1.toLocaleString('id')} (+{sig.profitTarget?.split('–')[0]})</span>
                      {sig.tp2 && <span style={{ fontSize:'.68rem', background:'rgba(77,159,255,.1)', color:'var(--blue)', padding:'1px 6px', borderRadius:3 }}>TP2 {sig.tp2.toLocaleString('id')}</span>}
                      {sig.sl && <span style={{ fontSize:'.68rem', background:'rgba(255,77,106,.1)', color:'var(--red)', padding:'1px 6px', borderRadius:3 }}>SL {sig.sl.toLocaleString('id')}</span>}
                      <span style={{ fontSize:'.68rem', color:'var(--muted)', padding:'1px 4px' }}>⏱ {sig.holdingDays}</span>
                    </div>
                  )}
                </div>
              ))}
              {r.signals.scalp?.filter(s => s.type !== 'SCALP_NEUTRAL').map((sig, idx) => (
                <div key={'sc' + idx} style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <span className={`signal-pill ${sig.type.includes('BUY') ? 'signal-buy' : 'signal-sell'}`}>
                    {sig.type.includes('BUY') ? '⚡' : '▼'} Scalp: {sig.reason} ({sig.strength}%)
                    {(() => { const b = getBacktestStats(sig.reason, r.Ticker, sig.signalName);
                      const isBSJP = sig.reason?.includes('BSJP');
                      const gapInfo = isBSJP ? detectGapUpCandidate(r.Ticker, r.Price || r.price || 0, new Date().getDay(), r._swingSignals || []) : null;
                      return <>{b ? <span style={{ marginLeft:5, fontWeight:700, color: b.winRate>=55?'#00e5a0':b.winRate>=45?'#ffb84d':'#ff4d6a', fontSize:'.65rem' }}>WR {b.winRate}%{b._tickerSpecific?' ★':''}</span> : null}{gapInfo?.isGapCandidate ? <span style={{ marginLeft:4, fontSize:'.63rem', fontWeight:700, background:'rgba(255,184,77,.15)', color:'#ffb84d', padding:'1px 6px', borderRadius:10 }}>⚡ Gap {gapInfo.level} {gapInfo.expected5pct ? `${gapInfo.expected5pct}%` : ''}</span> : null}</>; })()}
                  </span>
                  {sig.tp1 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', paddingLeft:4 }}>
                      <span style={{ fontSize:'.68rem', background:'rgba(0,229,160,.1)', color:'var(--green)', padding:'1px 6px', borderRadius:3 }}>TP1 {sig.tp1.toLocaleString('id')} (+{sig.profitTarget?.split('–')[0]})</span>
                      {sig.tp2 && <span style={{ fontSize:'.68rem', background:'rgba(77,159,255,.1)', color:'var(--blue)', padding:'1px 6px', borderRadius:3 }}>TP2 {sig.tp2.toLocaleString('id')}</span>}
                      {sig.sl && <span style={{ fontSize:'.68rem', background:'rgba(255,77,106,.1)', color:'var(--red)', padding:'1px 6px', borderRadius:3 }}>SL {sig.sl.toLocaleString('id')}</span>}
                      <span style={{ fontSize:'.68rem', color:'var(--muted)', padding:'1px 4px' }}>⏱ {sig.holdingDays}</span>
                    </div>
                  )}
                </div>
              ))}
              {r.signals.scalp?.filter(s => s.type === 'SCALP_NEUTRAL').map((sig, idx) => (
                <span key={'sn' + idx} className="signal-pill" style={{ color:'var(--muted)', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)' }}>
                  ⏸ {sig.reason}
                </span>
              ))}
              {r.signals.accumulation?.map((sig, idx) => (
                <div key={'ac' + idx} style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <span className="signal-pill" style={{ background: 'rgba(167,139,250,.15)', color: 'var(--purple)', border: '1px solid rgba(167,139,250,.3)' }}>
                    📦 Akumulasi: {sig.reason} ({sig.strength.toFixed(0)}%)
                    {(() => { const b = getBacktestStats(sig.reason, r.Ticker, sig.signalName);
                      const isBSJP = sig.reason?.includes('BSJP');
                      const gapInfo = isBSJP ? detectGapUpCandidate(r.Ticker, r.Price || r.price || 0, new Date().getDay(), r._swingSignals || []) : null;
                      return <>{b ? <span style={{ marginLeft:5, fontWeight:700, color: b.winRate>=55?'#00e5a0':b.winRate>=45?'#ffb84d':'#ff4d6a', fontSize:'.65rem' }}>WR {b.winRate}%{b._tickerSpecific?' ★':''}</span> : null}{gapInfo?.isGapCandidate ? <span style={{ marginLeft:4, fontSize:'.63rem', fontWeight:700, background:'rgba(255,184,77,.15)', color:'#ffb84d', padding:'1px 6px', borderRadius:10 }}>⚡ Gap {gapInfo.level} {gapInfo.expected5pct ? `${gapInfo.expected5pct}%` : ''}</span> : null}</>; })()}
                  </span>
                  {sig.tp1 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', paddingLeft:4 }}>
                      <span style={{ fontSize:'.68rem', background:'rgba(167,139,250,.12)', color:'var(--purple)', padding:'1px 6px', borderRadius:3 }}>TP1 {sig.tp1.toLocaleString('id')} (+{sig.profitTarget?.split('–')[0]})</span>
                      {sig.tp2 && <span style={{ fontSize:'.68rem', background:'rgba(77,159,255,.1)', color:'var(--blue)', padding:'1px 6px', borderRadius:3 }}>TP2 {sig.tp2.toLocaleString('id')}</span>}
                      {sig.sl && <span style={{ fontSize:'.68rem', background:'rgba(255,77,106,.1)', color:'var(--red)', padding:'1px 6px', borderRadius:3 }}>SL {sig.sl.toLocaleString('id')}</span>}
                      <span style={{ fontSize:'.68rem', color:'var(--muted)', padding:'1px 4px' }}>⏱ {sig.holdingDays}</span>
                    </div>
                  )}
                </div>
              ))}
              {(() => {
                const bpjs = r._intradayPattern?.patterns?.find(p => p.type === 'BELI_PAGI_JUAL_SORE');
                const bsjp = r._intradayPattern?.patterns?.find(p => p.type === 'BELI_SORE_JUAL_PAGI');
                return (
                  <>
                    {bpjs && (
                      <span className="signal-pill" style={{ background:'rgba(255,184,77,.12)', color:'var(--amber)', border:'1px solid rgba(255,184,77,.3)' }}>
                        ☀️ Beli Pagi Jual Sore — WR {r._intradayPattern?.stats?.beliPagiWinRate}% (expectancy {bpjs.expectancy > 0 ? '+' : ''}{bpjs.expectancy}%)
                      </span>
                    )}
                    {bsjp && (
                      <span className="signal-pill" style={{ background:'rgba(167,139,250,.12)', color:'var(--purple)', border:'1px solid rgba(167,139,250,.3)' }}>
                        🌙 Beli Sore Jual Pagi — WR {r._intradayPattern?.stats?.beliSoreWinRate}% (expectancy {bsjp.expectancy > 0 ? '+' : ''}{bsjp.expectancy}%)
                      </span>
                    )}
                  </>
                );
              })()}
              {r._preARA?.signals?.length > 0 && (
                <span className="signal-pill" style={{ background:'rgba(255,77,106,.1)', color:'#ff4d6a', border:'1px solid rgba(255,77,106,.3)' }}>
                  🔮 Pre-ARA {r._preARA.potential} ({r._preARA.finalScore}/99) — {r._preARA.signals.slice(0,2).map(s => `${s.icon || ''} ${s.label || ''}`).join(' · ')}
                </span>
              )}
              {r.signals.liquidity && (
                <span className="signal-pill" style={{
                  background: r.signals.liquidity.tradeable ? 'rgba(0,229,160,.1)' : 'rgba(255,184,77,.1)',
                  color: r.signals.liquidity.tradeable ? 'var(--green)' : 'var(--amber)',
                  border: `1px solid ${r.signals.liquidity.tradeable ? 'rgba(0,229,160,.3)' : 'rgba(255,184,77,.3)'}`,
                }}>
                  💧 Likuiditas: {r.signals.liquidity.score}/100
                  {r.signals.liquidity.issues?.length > 0 ? ` — ⚠️ ${r.signals.liquidity.issues.join(', ')}` : ''}
                </span>
              )}
              {r.buyZone && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: r.buyZone.inZone ? 'rgba(0,229,160,.08)' : 'rgba(255,255,255,.03)', borderRadius: 8, border: `1px solid ${r.buyZone.inZone ? 'rgba(0,229,160,.35)' : 'rgba(255,255,255,.08)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: r.buyZone.inZone ? 'var(--green)' : 'var(--muted)', fontSize: '.78rem' }}>
                      {r.buyZone.inZone ? '🟢 DALAM AREA BELI' : '⬜ Area Beli (belum di zona)'}
                    </span>
                    <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>konfirmasi {r.buyZone.strength}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: '.72rem' }}>
                    <span style={{ background: 'rgba(0,229,160,.12)', color: 'var(--green)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                      Zone: {r.buyZone.zoneLow.toLocaleString('id')} – {r.buyZone.zoneHigh.toLocaleString('id')}
                    </span>
                    {r.buyZone.levels.bbLow && (
                      <span style={{ background: 'rgba(77,159,255,.1)', color: 'var(--blue)', padding: '2px 8px', borderRadius: 4 }}>
                        BB Low: {r.buyZone.levels.bbLow.toLocaleString('id')}
                      </span>
                    )}
                    <span style={{ background: 'rgba(255,184,77,.1)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 4 }}>
                      EMA20: {r.buyZone.levels.ema20.toLocaleString('id')}
                    </span>
                    <span style={{ background: 'rgba(255,184,77,.1)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 4 }}>
                      EMA50: {r.buyZone.levels.ema50.toLocaleString('id')}
                    </span>
                    <span style={{ background: 'rgba(167,139,250,.1)', color: 'var(--purple)', padding: '2px 8px', borderRadius: 4 }}>
                      Fib 61.8%: {r.buyZone.levels.fib618.toLocaleString('id')}
                    </span>
                    <span style={{ background: 'rgba(167,139,250,.1)', color: 'var(--purple)', padding: '2px 8px', borderRadius: 4 }}>
                      Fib 78.6%: {r.buyZone.levels.fib786.toLocaleString('id')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App() {
  // Ikut render ulang saat statistik backtest per-ticker selesai dimuat.
  useStatsVersion();
  const [tab, setTab] = useState('screener');
  const [groqKey, setGroqKey] = useState('');
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [distSignal, setDistSignal] = useState(null);
  const [sigFilter, setSigFilter] = useState('semua');
  const [sortMode, setSortMode] = useState('default');
  
  // Signal Dashboard — tambahan state
  const [sigViewMode, setSigViewMode] = useState('cards');    // 'cards' | 'leaderboard'
  const [sigHorizon, setSigHorizon] = useState('best');       // 'best' | '1d' | '2d' | '3d' | '5d' | '7d' | '14d' | '30d' | '60d'
  const [lbSort, setLbSort] = useState('winrate');            // 'winrate' | 'avgret' | 'score' | 'count' | 'tech' | 'ml'
  const [lbMinWR, setLbMinWR] = useState(0);                  // filter minimum winrate
  const [lbMinN, setLbMinN] = useState(5);                    // filter minimum sample size
  const [lbAlignOnly, setLbAlignOnly] = useState(false);       // filter: cuma yang teknikal selaras sama winrate historis
  const [exportingPDF, setExportingPDF] = useState(null);     // null | 'winrate' | 'avgret' — dipakai tombol export

  // JARVIS modal state
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [jarvisStock, setJarvisStock] = useState(null);
  const [jarvisText, setJarvisText] = useState('');
  const [jarvisLoading, setJarvisLoading] = useState(false);
  const [jarvisAsked, setJarvisAsked] = useState('');
  const [jarvisMode, setJarvisMode] = useState('recommend'); // 'recommend' | 'chat'
  const [jarvisChatHistory, setJarvisChatHistory] = useState([]);
  const [jarvisChatInput, setJarvisChatInput] = useState('');

  // Screener
  const [maxPBV, setMaxPBV] = useState(3.0);
  const [maxPER, setMaxPER] = useState(20);
  const [maxRSI, setMaxRSI] = useState(40);
  const [minDD, setMinDD] = useState(15);
  const [screenerRows, setScreenerRows] = useState([]);
  const [screenerStatus, setScreenerStatus] = useState(null);
  const [screenerProgress, setScreenerProgress] = useState(0);
  const [screenerError, setScreenerError] = useState(null);

  // Detail
  const [ticker, setTicker] = useState('BBCA');
  const [period, setPeriod] = useState('1y');
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showBB, setShowBB] = useState(true);
  const [showMA50, setShowMA50] = useState(true);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [newsItems, setNewsItems] = useState([]);
  const [detailSubTab, setDetailSubTab] = useState('overview');
  // FIX: simpan screenerRow terakhir yang dipakai, supaya ganti periode chart
  // tidak membuang cache sinyal (swing/scalp/accum/intraday/preARA) dari Screener.
  const lastScreenerRowRef = useRef(null);

  // Compare
  const [cmpInput, setCmpInput] = useState('BBCA, BBRI, BMRI, BBNI');
  const [cmpRows, setCmpRows] = useState([]);
  const [cmpLoading, setCmpLoading] = useState(false);

  // ── Demo Account ─────────────────────────────────────────
  const DEMO_KEY = 'ihsg_demo_v1';
  const loadDemo = () => { try { const d = localStorage.getItem(DEMO_KEY); return d ? JSON.parse(d) : { cash: 100000000, totalDeposit: 100000000, realizedPnl: 0, holdings: {}, history: [] }; } catch { return { cash: 100000000, totalDeposit: 100000000, realizedPnl: 0, holdings: {}, history: [] }; } };
  const [demoAcc, setDemoAcc] = useState(loadDemo);
  const [demoTicker, setDemoTicker] = useState('');
  const [demoLotInput, setDemoLotInput] = useState(1);
  const [demoAction, setDemoAction] = useState('buy');
  const [demoModalInput, setDemoModalInput] = useState('');
  const [demoMsg, setDemoMsg] = useState(null); // { type: 'ok'|'err', text }
  const [demoLookupData, setDemoLookupData] = useState(null); // harga real-time
  const [demoLookupLoading, setDemoLookupLoading] = useState(false);
  const [demoSubTab, setDemoSubTab] = useState('trade'); // 'trade'|'port'|'hist'|'modal'
  const [demoRefreshing, setDemoRefreshing] = useState(false);
  const [demoLastRefresh, setDemoLastRefresh] = useState(null);

  const saveDemo = (acc) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(acc)); } catch {} setDemoAcc(acc); };

  // Refresh harga semua holdings secara paralel dari /api/quote
  const demoRefreshPrices = useCallback(async (accOverride) => {
    const acc = accOverride || demoAcc;
    const keys = Object.keys(acc.holdings).filter(k => acc.holdings[k].lots > 0);
    if (keys.length === 0) { setDemoLastRefresh(new Date().toLocaleTimeString('id')); return; }
    setDemoRefreshing(true);
    const updated = { ...acc, holdings: { ...acc.holdings } };
    await Promise.all(keys.map(async (tkr) => {
      try {
        const data = await fetch('/api/quote?ticker=' + tkr).then(r => r.json());
        const price = data?.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw;
        if (price && price > 0) updated.holdings[tkr] = { ...updated.holdings[tkr], lastPrice: price };
      } catch {}
    }));
    saveDemo(updated);
    setDemoLastRefresh(new Date().toLocaleTimeString('id'));
    setDemoRefreshing(false);
  }, [demoAcc]);

  const demoLookup = useCallback(async (tkr) => {
    const t = (tkr || demoTicker).toUpperCase().trim();
    if (!t) return;
    setDemoLookupLoading(true); setDemoLookupData(null); setDemoMsg(null);
    try {
      const data = await fetch(`/api/quote?ticker=${t}`).then(r => r.json());
      const qr = data?.quoteSummary?.result?.[0];
      if (!qr) throw new Error('Ticker tidak ditemukan');
      const price = qr.price?.regularMarketPrice?.raw || 0;
      const name = qr.price?.longName || qr.price?.shortName || t;
      const chgPct = qr.price?.regularMarketChangePercent?.raw || 0;
      setDemoLookupData({ ticker: t, price, name, chgPct });
    } catch(e) { setDemoMsg({ type: 'err', text: e.message }); }
    setDemoLookupLoading(false);
  }, [demoTicker]);

  const demoTrade = useCallback((action) => {
    if (!demoLookupData) return;
    const { ticker: tkr, price } = demoLookupData;
    const lots = parseInt(demoLotInput) || 1;
    if (lots < 1) { setDemoMsg({ type: 'err', text: 'Lot minimal 1' }); return; }
    const total = price * lots * 100;
    const acc = { ...demoAcc, holdings: { ...demoAcc.holdings }, history: [...demoAcc.history] };

    if (action === 'buy') {
      if (total > acc.cash) { setDemoMsg({ type: 'err', text: `Saldo tidak cukup. Butuh ${fmtRp(total)}, punya ${fmtRp(acc.cash)}` }); return; }
      acc.cash -= total;
      const prev = acc.holdings[tkr];
      if (prev) {
        const newLots = prev.lots + lots;
        acc.holdings[tkr] = { ...prev, lots: newLots, avgPrice: Math.round((prev.avgPrice * prev.lots + price * lots) / newLots), lastPrice: price };
      } else {
        acc.holdings[tkr] = { lots, avgPrice: Math.round(price), lastPrice: price };
      }
      acc.history.push({ action: 'buy', ticker: tkr, lots, price: Math.round(price), total: Math.round(total), time: new Date().toLocaleString('id') });
      setDemoMsg({ type: 'ok', text: `Beli ${lots} lot ${tkr} @ ${fmtRp(price)} — total ${fmtRp(total)}` });
    } else {
      const held = acc.holdings[tkr];
      if (!held || held.lots < lots) { setDemoMsg({ type: 'err', text: `Tidak punya cukup lot ${tkr}` }); return; }
      const gainPerLembar = price - held.avgPrice;
      const realizedGain = gainPerLembar * lots * 100;
      acc.cash += total;
      acc.realizedPnl += realizedGain;
      if (held.lots === lots) { delete acc.holdings[tkr]; }
      else { acc.holdings[tkr] = { ...held, lots: held.lots - lots, lastPrice: price }; }
      acc.history.push({ action: 'sell', ticker: tkr, lots, price: Math.round(price), total: Math.round(total), gain: Math.round(realizedGain), time: new Date().toLocaleString('id') });
      setDemoMsg({ type: 'ok', text: `Jual ${lots} lot ${tkr} @ ${fmtRp(price)} — P/L: ${realizedGain >= 0 ? '+' : ''}${fmtRp(realizedGain)}` });
    }
    saveDemo(acc);
  }, [demoAcc, demoLookupData, demoLotInput]);

  const demoAdjustModal = useCallback((op) => {
    const amount = parseFloat(demoModalInput);
    if (!amount || amount <= 0) { setDemoMsg({ type: 'err', text: 'Masukkan jumlah yang valid' }); return; }
    if (op === 'sub' && amount > demoAcc.cash) { setDemoMsg({ type: 'err', text: 'Saldo tidak cukup untuk ditarik' }); return; }
    const acc = { ...demoAcc };
    if (op === 'add') { acc.cash += amount; acc.totalDeposit += amount; }
    else { acc.cash -= amount; acc.totalDeposit -= amount; }
    saveDemo(acc);
    setDemoMsg({ type: 'ok', text: `${op === 'add' ? 'Ditambah' : 'Ditarik'}: ${fmtRp(amount)}` });
  }, [demoAcc, demoModalInput]);

  const demoReset = useCallback(() => {
    if (!confirm('Reset akun demo? Semua posisi dan riwayat akan hilang.')) return;
    const fresh = { cash: 100000000, totalDeposit: 100000000, realizedPnl: 0, holdings: {}, history: [] };
    saveDemo(fresh);
    setDemoMsg({ type: 'ok', text: 'Akun demo direset. Modal awal Rp 100 juta.' });
  }, []);

  // Auto-refresh harga saat masuk tab demo
  useEffect(() => {
    if (tab === 'demo') demoRefreshPrices();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const apiFetch = useCallback(async (path, opts) => {
    const r = await fetch(path, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, []);

  // ── Screener ─────────────────────────────────────────────
  const runScreener = useCallback(async () => {
    setScreenerStatus('loading'); setScreenerProgress(0); setScreenerRows([]); setScreenerError(null);
    // Batch 15 tickers ke API — lebih kecil dari 20 agar tidak timeout di Vercel (limit 10s)
    const BATCH = 15;
    let allResults = [], batchErrors = 0, failedBatches = [];

    for (let i = 0; i < ALL_TICKERS.length; i += BATCH) {
      const batch = ALL_TICKERS.slice(i, i + BATCH);
      setScreenerProgress(Math.round(i / ALL_TICKERS.length * 100));
      try {
        const data = await apiFetch('/api/screener', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: batch, maxPBV, maxPER, maxRSI, minDD }),
        });
        allResults = allResults.concat(data.results || []);
        setScreenerRows([...allResults].sort((a, b) => b.Score - a.Score));
        ensureStats(allResults.map(r => r.Ticker));   // statistik dimuat per batch, bukan sekaligus 2,5 MB
      } catch (e) {
        batchErrors++;
        failedBatches.push(batch); // simpan batch yang gagal untuk retry
      }
    }

    // Retry sekali untuk batch yang gagal (dengan delay lebih lama)
    if (failedBatches.length > 0) {
      for (const batch of failedBatches) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const data = await apiFetch('/api/screener', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers: batch, maxPBV, maxPER, maxRSI, minDD }),
          });
          allResults = allResults.concat(data.results || []);
          batchErrors--;
        } catch (e) { /* retry juga gagal, skip */ }
      }
      setScreenerRows([...allResults].sort((a, b) => b.Score - a.Score));
      ensureStats(allResults.map(r => r.Ticker));
    }

    setScreenerProgress(100); setScreenerStatus('done');
    if (allResults.length === 0 && batchErrors > 0) {
      setScreenerError(`Semua batch gagal (${batchErrors} error). Yahoo Finance mungkin sedang blokir. Coba lagi.`);
    } else if (batchErrors > 0) {
      setScreenerError(`${batchErrors} batch gagal, ${allResults.length} saham berhasil diambil.`);
    }
  }, [maxPBV, maxPER, maxRSI, minDD, apiFetch]);

  // ── Detail ───────────────────────────────────────────────
  const loadDetail = useCallback(async (tkr = ticker, screenerRow = null, periodOverride = null) => {
    const t = tkr.toUpperCase().trim();
    const p = periodOverride || period;
    if (!t) return;
    // FIX: kalau caller tidak kasih screenerRow (misal ganti periode chart) tapi
    // ticker-nya sama dengan yang lagi dibuka, pakai cache terakhir yang tersimpan
    // di ref — supaya swing/scalp/accum/intraday/preARA tidak hilang & tidak
    // dihitung ulang dari nol dengan window data yang bisa beda.
    const effectiveScreenerRow = screenerRow || (lastScreenerRowRef.current?.Ticker === t ? lastScreenerRowRef.current : null);
    if (screenerRow) lastScreenerRowRef.current = screenerRow;
    setDetailLoading(true); setDetailData(null); setAiText(''); setNewsItems([]); setTicker(t);
    ensureStats(t);   // ~10 KB, bukan 2,5 MB
    try {
      const [chartData, quoteData] = await Promise.all([
        apiFetch(`/api/chart?ticker=${t}&range=${p}`),
        apiFetch(`/api/quote?ticker=${t}`),
      ]);
      const result = chartData?.chart?.result?.[0];
      const qResult = quoteData?.quoteSummary?.result?.[0] || {};
      if (!result) throw new Error('No chart data');
      const qd = result.indicators?.quote?.[0] || {};
      const tsRaw = result.timestamp || [];
      // Filter aligned — buang baris yang ada null di field manapun agar index array selalu sinkron
      const rawClose = qd.close  || [];
      const rawOpen  = qd.open   || [];
      const rawHigh  = qd.high   || [];
      const rawLow   = qd.low    || [];
      const rawVol   = qd.volume || [];
      const closes = [], opens = [], highs = [], lows = [], vols = [], ts = [];
      for (let i = 0; i < rawClose.length; i++) {
        if (rawClose[i] != null && rawHigh[i] != null && rawLow[i] != null && rawOpen[i] != null) {
          closes.push(rawClose[i]);
          opens.push(rawOpen[i]);
          highs.push(rawHigh[i]);
          lows.push(rawLow[i]);
          vols.push(rawVol[i] ?? 0);
          if (tsRaw[i] != null) ts.push(tsRaw[i]);
        }
      }
      if (closes.length === 0) throw new Error('No price data');
      const price = closes[closes.length - 1];
      const ath = Math.max(...highs);
      const atl = Math.min(...lows);
      const dd = (ath - price) / ath * 100;
      const rsiV = calcRSI(closes);
      const inf = extractInfo(qResult);
      // PBV correction kalau masih absurd (fallback path tanpa _fundamentals)
      if (inf.pbv != null && inf.pbv > 50 && price > 0) inf.pbv = price / inf.pbv;
      // PER correction kalau masih absurd
      if ((inf.per == null || inf.per > 500 || inf.per < 0) && inf.eps != null && inf.eps > 0 && price > 0) inf.per = price / inf.eps;

      // ── Score: gunakan PBV/PER/ROE/DER dari backend (_fundamentals) ──────
      // RSI dan DD dihitung dari chart (data live), sisanya dari backend.
      // Hasilnya IDENTIK dengan screener karena formula dan unit sama.
      const sc = invScore(inf.pbv, inf.per, rsiV, dd, inf.roe, inf.der, inf.sector);
      const bench = SECTOR_BENCH[inf.sector] || { pbv: 2.0, per: 15, roe: 0.12, der: 1.5 };
      const chg = inf.prev ? (price - inf.prev) / inf.prev * 100 : null;
      const hi52 = inf.w52h || ath;
      const lo52 = inf.w52l || atl;
      const pos52 = hi52 !== lo52 ? (price - lo52) / (hi52 - lo52) * 100 : 50;
      const smc = calcSMC(closes, highs, lows, opens);
      const signals = calcSignals(closes, highs, lows, vols);
      // Kalau dibuka dari screener, pakai sinyal cache — identik, tidak generate ulang
      const swingSignals    = effectiveScreenerRow?._swingSignals    ?? generateSwingSignals({ closes, highs, lows, volumes: vols });
      const scalpSignals    = effectiveScreenerRow?._scalpSignals    ?? generateScalpingSignals({ closes, highs, lows, volumes: vols });
      const accumSignals    = effectiveScreenerRow?._accumSignals    ?? detectAccumulation({ closes, volumes: vols });
      const intradayPattern = effectiveScreenerRow?._intradayPattern ?? detectIntradayPattern({ closes, opens, highs, lows, volumes: vols });
      const preARA          = effectiveScreenerRow?._preARA          ?? detectPreARA({ closes, opens, highs, lows, volumes: vols });
      const liquidityScore = calculateLiquidityScore({ volumes: vols, closes }, inf.mc);
      const todayGap = detectTodayGap(opens, closes, ts);
      setDetailData({
        closes, opens, highs, lows, vols, ts, price, ath, atl, dd, rsiV, inf, sc, bench,
        chg, hi52, lo52, pos52, ticker: t, smc, signals, todayGap,
        swingSignals, scalpSignals, accumSignals, intradayPattern, preARA, liquidityScore,
      });
    } catch (e) { setDetailData({ error: e.message }); }
    setDetailLoading(false);
    try {
      const r = await fetch(`/api/news?ticker=${t}`);
      const txt = await r.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(txt, 'application/xml');
      const items = Array.from(xml.querySelectorAll('item')).slice(0, 5).map(item => ({
        title: item.querySelector('title')?.textContent || '—',
        link: item.querySelector('link')?.textContent || '#',
        date: (item.querySelector('pubDate')?.textContent || '').substring(0, 22),
        source: item.querySelector('source')?.textContent || 'Google News',
      }));
      setNewsItems(items);
    } catch (e) { }
  }, [ticker, period, apiFetch]);

  // ── AI Analysis ──────────────────────────────────────────
  const runAI = useCallback(async () => {
    if (!groqKey) { setAiText('⚠️ Masukkan Groq API Key terlebih dahulu.'); return; }
    if (!detailData || detailData.error) return;
    const { price, dd, rsiV, inf, sc, smc, signals, swingSignals, scalpSignals, accumSignals, intradayPattern, preARA } = detailData;
    const newsText = newsItems.map(n => `• ${n.title}`).join('\n') || 'Berita tidak tersedia.';
    const smcText = `Bias: ${smc.bias}, BOS: ${smc.bos?.label || 'Tidak ada'}, CHoCH: ${smc.choch?.label || 'Tidak ada'}, OB aktif: ${smc.obs.length}, FVG: ${smc.fvgs.length}`;
    // FIX: sebelumnya hanya `signals` (indikator dasar) yang dikirim ke AI, sehingga
    // sinyal swing/scalp/akumulasi/intraday(BPJS-BSJP)/pre-ARA yang tampil di UI
    // (dan di Screener) tidak pernah "diketahui" oleh JARVIS/AI Analysis.
    const basicSigText = signals.map(s => `${s.type} (${s.source}: ${s.label})`).join(', ') || 'Tidak ada';
    const advSigText = [
      ...(swingSignals || []).map(s => `[Swing] ${s.reason}`),
      ...(scalpSignals || []).filter(s => s.type !== 'SCALP_NEUTRAL').map(s => `[Scalp] ${s.reason}`),
      ...(accumSignals || []).map(s => `[Akumulasi] ${s.reason}`),
    ].join('; ') || 'Tidak ada';
    const intradayText = (intradayPattern?.patterns || []).map(p => `[Intraday] ${p.label} — WR ${p.winRate}%, expectancy +${p.expectancy}% (${p.sampleDays} observasi)`).join('; ') || 'Tidak ada pola intraday yang lolos threshold';
    const preAraText = preARA?.signals?.length ? `Potensi ${preARA.potential} (${preARA.finalScore}/99) — ${preARA.signals.map(s => s.label).join(', ')}` : 'Tidak ada';
    const sigText = `${basicSigText}\nSWING/SCALP/AKUMULASI: ${advSigText}\nPOLA INTRADAY (BPJS/BSJP): ${intradayText}\nPRE-ARA: ${preAraText}`;

    const prompt = `Kamu adalah analis saham senior berlisensi di pasar modal Indonesia.
Analisis saham ${detailData.ticker}.JK secara komprehensif:

FUNDAMENTAL: Harga ${fmtRp(price)} | Sektor: ${inf.sector} | PBV: ${fmt(inf.pbv)}x | PER: ${fmt(inf.per, 1)}x | ROE: ${fmtPct(inf.roe)} | D/E: ${fmt(inf.der)}
TEKNIKAL: RSI ${rsiV.toFixed(1)} | DD: -${dd.toFixed(1)}% | Score: ${sc.total}/100 Grade ${sc.grade}
SMC: ${smcText}
SINYAL: ${sigText}
ANALIS: Target ${fmtRp(inf.targetMean)} (${inf.analystCount || '?'} analis) | Rekomendasi: ${inf.recKey || 'N/A'}
BERITA: ${newsText}

Format Bahasa Indonesia, maks 300 kata:
**🔍 DIAGNOSIS** (2 alasan utama)
**⚠️ RISIKO** (2 poin)
**🌱 KATALIS** (pemicu kenaikan)
**🏦 SMC INSIGHT** (Order Block & struktur pasar)
**📊 VALUASI** (murah/wajar/mahal)
**🎯 REKOMENDASI** (Akumulasi/Tunggu/Hindari + target price)`;

    setAiLoading(true); setAiText('');
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
        body: JSON.stringify({ model: groqModel, messages: [{ role: 'user', content: prompt }], max_tokens: 800, temperature: 0.65, stream: true }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err?.error?.message || 'HTTP ' + resp.status); }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]');
        for (const line of lines) {
          try { full += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ''; setAiText(full); } catch (e) { }
        }
      }
    } catch (e) { setAiText(`⚠️ Error: ${e.message}`); }
    setAiLoading(false);
  }, [groqKey, groqModel, detailData, newsItems]);

  // ── Compare ──────────────────────────────────────────────
  const runCompare = useCallback(async () => {
    const syms = cmpInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 5);
    setCmpLoading(true); setCmpRows([]);
    const results = [];
    for (const sym of syms) {
      try {
        const [cd, qd] = await Promise.all([
          apiFetch(`/api/chart?ticker=${sym}&range=1y`),
          apiFetch(`/api/quote?ticker=${sym}`),
        ]);
        const result = cd?.chart?.result?.[0];
        if (!result) continue;
        const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => v != null);
        const highs = (result.indicators?.quote?.[0]?.high || []).filter(v => v != null);
        const lows = (result.indicators?.quote?.[0]?.low || []).filter(v => v != null);
        const vols = (result.indicators?.quote?.[0]?.volume || []).filter(v => v != null);
        if (closes.length < 10) continue;
        const price = closes[closes.length - 1];
        const ath = Math.max(...highs);
        const dd = (ath - price) / ath * 100;
        const rsiV = calcRSI(closes);
        const inf = extractInfo(qd?.quoteSummary?.result?.[0] || {});
        const sc = invScore(inf.pbv, inf.per, rsiV, dd, inf.roe, inf.der, inf.sector);
        const sigs = calcSignals(closes, highs, lows, vols);
        results.push({ sym, name: inf.name, price, pbv: inf.pbv, per: inf.per, roe: inf.roe, der: inf.der, rsiV, dd, sec: inf.sector, sc, closes, ath, signals: sigs });
      } catch (e) { }
    }
    setCmpRows(results); setCmpLoading(false);
  }, [cmpInput, apiFetch]);

  const renderAI = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      const bold = line.replace(/\*\*(.+?)\*\*/g, (_, m) => `<b>${m}</b>`);
      return <p key={i} dangerouslySetInnerHTML={{ __html: bold }} style={{ margin: '2px 0', lineHeight: 1.75 }} />;
    });
  };

  const handleDetailNav = useCallback((tkr, screenerRow = null) => {
    setTab('detail');
    loadDetail(tkr, screenerRow);
  }, [loadDetail]);

  // ════════════════════════════════════════════════
  //  JARVIS - AI Trader Mode
  // ════════════════════════════════════════════════
  const openJarvis = useCallback(async (stockData) => {
    if (!groqKey) { alert('⚠️ Masukkan Groq API Key dulu di atas (Settings)'); return; }
    setJarvisStock(stockData);
    setJarvisOpen(true);
    setJarvisText('');
    setJarvisAsked('');
    setJarvisMode('recommend');
    setJarvisChatHistory([]);
    setJarvisChatInput('');
    setJarvisLoading(true);

    const price = stockData.Price || stockData.Harga || 0;
    // Ambil SL/TP dari sinyal teknikal actual (paling kuat), fallback ke estimate
    const _jarvisBestSig = [
      ...(stockData._swingSignals || []),
      ...(stockData._scalpSignals || []).filter(s => s.type !== 'SCALP_NEUTRAL'),
      ...(stockData._accumSignals || []),
    ].filter(s => s.tp1 && s.sl).sort((a, b) => b.strength - a.strength)[0] || null;
    const sl  = _jarvisBestSig?.sl  || Math.round(price * 0.95);
    const tp1 = _jarvisBestSig?.tp1 || Math.round(price * 1.08);
    const tp2 = _jarvisBestSig?.tp2 || Math.round(price * 1.15);
    const atrInfo = stockData._atr ? `ATR: Rp${stockData._atr.toLocaleString('id')} (${((stockData._atr/price)*100).toFixed(1)}%)` : '';
    const signals = (stockData._allBuy || []).sort((a,b) => b.strength - a.strength);
    const sigSummary = signals.slice(0,5).map(s => `${s._cat?.toUpperCase()}: ${s.reason} (kekuatan: ${s.strength})`).join('\n');

    const rrRatio = ((tp1 - price) / Math.max(price - sl, 1)).toFixed(1);
    const riskPct = ((price - sl) / price * 100).toFixed(1);

    const prompt = `Kamu adalah JARVIS — AI trader profesional untuk pasar modal Indonesia (BEI/IDX). Persona: singkat, tegas, langsung ke intinya seperti fund manager. TIDAK pernah bilang "DYOR", "pertimbangkan risiko", atau basa-basi. Langsung kasih keputusan.

DATA SAHAM: ${stockData.Ticker} (${stockData.Name || stockData.Nama || stockData.Ticker})
Harga: Rp${price.toLocaleString('id')} | Grade: ${stockData.Grade} | Score: ${stockData.Score}/100
RSI: ${stockData.RSI?.toFixed(1) || '—'} | DD dari ATH: -${stockData['DD%'] || stockData.DD || '—'}%
PBV: ${stockData.PBV?.toFixed(2) || '—'} | PER: ${stockData.PER?.toFixed(1) || '—'} | ROE: ${stockData['ROE%'] || '—'}%
${atrInfo}

LEVEL TEKNIKAL (dihitung dari ATR + support/resistance nyata):
Stop Loss: Rp${sl.toLocaleString('id')} (risiko ${riskPct}% dari harga)
TP1: Rp${tp1.toLocaleString('id')} (+${((tp1-price)/price*100).toFixed(1)}%)
TP2: Rp${tp2.toLocaleString('id')} (+${((tp2-price)/price*100).toFixed(1)}%)
R/R Ratio: 1:${rrRatio}

Pre-ARA Score: ${stockData._preARAScore || 0} | Sinyal Aktif: ${stockData._sigCount || 0}
${stockData._hasPreARA ? `⚡ Pre-ARA Potential: ${stockData._preARAPotential}` : ''}
${stockData._hasBPJS ? `☀️ Pola BELI PAGI JUAL SORE (WR: ${stockData._intradayPattern?.stats?.beliPagiWinRate}%)` : ''}
${stockData._hasBSJP ? `🌙 Pola BELI SORE JUAL PAGI (WR: ${stockData._intradayPattern?.stats?.beliSoreWinRate}%)` : ''}

SINYAL AKTIF (diurutkan kekuatan):
${sigSummary || 'Tidak ada sinyal spesifik'}

TUGASMU:
1. **Keputusan: BELI SEKARANG / TUNGGU / SKIP** (pilih satu)
2. Alasan: max 3 poin singkat pakai emoji
3. Entry ideal: range harga masuk spesifik
4. Konfirmasi: kondisi yang harus terpenuhi sebelum masuk
5. TP1 & TP2: boleh revisi dari level di atas jika ada alasan teknikal
6. Cut Loss: level wajib cut (dari data di atas atau revisi)
7. Holding: estimasi hari/minggu
8. R/R: evaluasi apakah layak (ideal > 1:2)
9. 1 kalimat final — trader instinct kamu

Format padat seperti briefing fund manager. Max 220 kata.`;

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
        body: JSON.stringify({
          model: groqModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600, temperature: 0.5, stream: true
        }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err?.error?.message || 'HTTP ' + resp.status); }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const d = JSON.parse(line.slice(6));
            const delta = d.choices?.[0]?.delta?.content || '';
            if (delta) setJarvisText(t => t + delta);
          } catch {}
        }
      }
    } catch(e) {
      setJarvisText('❌ Error: ' + e.message);
    }
    setJarvisLoading(false);
    setJarvisAsked(prompt);
  }, [groqKey, groqModel]);

  const sendJarvisChat = useCallback(async (question) => {
    if (!groqKey || !question.trim() || !jarvisStock) return;
    const userMsg = { role: 'user', content: question };
    const newHistory = [...jarvisChatHistory, userMsg];
    setJarvisChatHistory(newHistory);
    setJarvisChatInput('');
    setJarvisLoading(true);

    const systemMsg = { role: 'system', content: `Kamu adalah JARVIS — AI trader BEI. Tegas, singkat, langsung jawab. Konteks: saham ${jarvisStock.Ticker}, harga Rp${(jarvisStock.Price||jarvisStock.Harga||0).toLocaleString('id')}, Score ${jarvisStock.Score}. Tidak pernah bilang DYOR.` };
    const assistantContext = jarvisText ? [{ role: 'assistant', content: jarvisText }] : [];
    const messages = [systemMsg, ...assistantContext, ...jarvisChatHistory, userMsg];

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
        body: JSON.stringify({ model: groqModel, messages, max_tokens: 400, temperature: 0.5, stream: true }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err?.error?.message || 'HTTP ' + resp.status); }
      let aiReply = '';
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const tempId = Date.now();
      setJarvisChatHistory(h => [...h, { role: 'assistant', content: '', _id: tempId }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const d = JSON.parse(line.slice(6));
            const delta = d.choices?.[0]?.delta?.content || '';
            if (delta) {
              aiReply += delta;
              setJarvisChatHistory(h => h.map(m => m._id === tempId ? { ...m, content: aiReply } : m));
            }
          } catch {}
        }
      }
    } catch(e) {
      setJarvisChatHistory(h => [...h, { role: 'assistant', content: '❌ Error: ' + e.message }]);
    }
    setJarvisLoading(false);
  }, [groqKey, groqModel, jarvisStock, jarvisText, jarvisChatHistory]);

  // ════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════
  return (
    <>
      <Head>
        <title>IHSG Stock Analyzer v3.1</title>
        <meta name="description" content="Screener · SMC · AI Chatbot · Saham BEI" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <div className="app-wrap">
        {/* HEADER */}
        <div className="header">
          <div className="header-brand">
            <div className="header-logo">📈</div>
            <div>
              <div className="header-title">IHSG <span className="accent">Analyzer</span> <span className="ver">v3.1</span></div>
              <div className="header-sub">Screener · SMC · AI Chatbot · {ALL_TICKERS.length} Saham BEI</div>
            </div>
          </div>
          <div className="header-right">
            <div className="live-pill"><div className="live-dot" />Live via Yahoo Finance</div>
            <div className="disclaimer">⚠️ Bukan saran investasi<br />Selalu DYOR</div>
          </div>
        </div>

        {/* CONFIG */}
        <div className="config-bar">
          <div className="config-group">
            <label className="config-label">🔑 Groq API Key</label>
            <input className="config-input" type="password" value={groqKey} onChange={e => setGroqKey(e.target.value)} placeholder="gsk_…  (Gratis di console.groq.com)" style={{ minWidth: 280 }} />
          </div>
          <div className="config-group">
            <label className="config-label">🤖 Model</label>
            <select className="config-select" value={groqModel} onChange={e => setGroqModel(e.target.value)}>
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B — Terbaik ✦</option>
              <option value="llama-3.1-8b-instant">Llama 3.1 8B — Tercepat ⚡</option>
              <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
              <option value="gemma2-9b-it">Gemma 2 9B</option>
            </select>
          </div>
          <div className="info-box" style={{ marginLeft: 'auto' }}>
            ⚡ <b>Groq Gratis!</b> → <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a>
          </div>
        </div>

        {/* TABS */}
        <div className="tabs">
          {[['screener', '📋 Screener'], ['signals', '🎯 Sinyal'], ['detail', '🔬 Detail & AI'], ['chatbot', '⚡ JARVIS'], ['compare', '⚖️ Komparasi'], ['demo', '💼 Akun Demo'], ['guide', '📖 Panduan']].map(([id, label]) => (
            <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {/* ═══ SCREENER ═══ */}
        {tab === 'screener' && (
          <div>
            <div className="filter-panel">
              {[
                ['Maks. PBV', maxPBV, setMaxPBV, 0.1, 10, 0.1, v => parseFloat(v).toFixed(1)],
                ['Maks. PER', maxPER, setMaxPER, 0, 60, 1, v => parseInt(v)],
                ['Maks. RSI', maxRSI, setMaxRSI, 10, 60, 1, v => parseInt(v)],
                ['Min. Drawdown ATH (%)', minDD, setMinDD, 0, 80, 1, v => parseInt(v)],
              ].map(([label, val, setter, min, max, step, parse]) => (
                <div key={label} className="filter-group">
                  <label>{label} <span className="filter-val">{val}</span></label>
                  <input type="range" min={min} max={max} step={step} value={val} onChange={e => setter(parse(e.target.value))} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: '1.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-green" onClick={runScreener} disabled={screenerStatus === 'loading'}>
                {screenerStatus === 'loading' ? '⏳ Scanning…' : '🚀 Jalankan Screener'}
              </button>
              <div style={{ fontSize: '.77rem', color: 'var(--muted)' }}>
                Memindai <b style={{ color: 'var(--text2)' }}>{ALL_TICKERS.length} saham</b> BEI
              </div>
              {screenerStatus === 'loading' && (
                <div style={{ fontSize: '.77rem', color: 'var(--blue)', fontFamily: 'DM Mono,monospace' }}>
                  {screenerProgress}% — {screenerRows.length} kandidat
                </div>
              )}
            </div>
            {screenerError && <div className="error-box">⚠️ {screenerError}</div>}
            {screenerRows.length > 0 && (
              <>
                <div className="summary-grid">
                  {[
                    ['Total Kandidat', screenerRows.length, 'var(--text)'],
                    ['Grade A — Beli', screenerRows.filter(r => r.Grade === 'A').length, 'var(--green)'],
                    ['Grade B — Pantau', screenerRows.filter(r => r.Grade === 'B').length, 'var(--amber)'],
                    ['RSI Oversold <30', screenerRows.filter(r => r.RSI < 30).length, 'var(--purple)'],
                    ['Avg Score', (screenerRows.reduce((s, r) => s + r.Score, 0) / screenerRows.length).toFixed(1), 'var(--blue)'],
                  ].map(([label, val, col]) => (
                    <div key={label} className="sum-card">
                      <div className="sum-num" style={{ color: col }}>{val}</div>
                      <div className="sum-label">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Ticker</th><th>Nama</th><th>Sektor</th><th>Harga</th>
                        <th>PBV</th><th>PER</th><th>RSI</th><th>DD%</th><th>ROE%</th>
                        <th>Score</th><th>Grade</th><th>Verdict</th><th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {screenerRows.map((r, i) => (
                        <ScreenerRow key={r.Ticker} r={r} index={i} onDetail={handleDetailNav} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {screenerStatus === null && (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <div className="empty-title">Mulai Screening {ALL_TICKERS.length} Saham BEI</div>
                <div style={{ fontSize: '.82rem', marginTop: '.3rem' }}>Atur filter lalu tekan <b>Jalankan Screener</b></div>
              </div>
            )}
          </div>
        )}

        {/* ═══ SINYAL TRADING ═══ */}
        {tab === 'signals' && (() => {
          // ── Hitung semua sinyal + preARA per saham dari screener data ──────
          const enriched = screenerRows.map(r => {
            const swing  = (r._swingSignals  || []).filter(s => s.strength > 0);
            const scalp  = (r._scalpSignals  || []).filter(s => s.type !== 'SCALP_NEUTRAL' && s.strength > 0);
            const accum  = (r._accumSignals  || []);
            const bpjs   = r._intradayPattern?.patterns?.find(p => p.type === 'BELI_PAGI_JUAL_SORE') || null;
            const bsjp   = r._intradayPattern?.patterns?.find(p => p.type === 'BELI_SORE_JUAL_PAGI') || null;
            const preARA = r._preARA || null;

            const allBuy = [
              ...swing.map(s => ({ ...s, _cat: 'swing' })),
              ...scalp.map(s => ({ ...s, _cat: 'scalp' })),
              ...accum.map(s => ({ ...s, _cat: 'akumulasi' })),
              ...(bpjs ? [{ type:'BELI_PAGI_JUAL_SORE', reason: bpjs.reason, strength: bpjs.strength, _cat:'intraday' }] : []),
              ...(bsjp ? [{ type:'BELI_SORE_JUAL_PAGI',  reason: bsjp.reason, strength: bsjp.strength, _cat:'intraday' }] : []),
              ...(preARA && preARA.finalScore >= 35 && (preARA.signals?.length || 0) >= 2 ? [{
                type: 'PRE_ARA',
                reason: preARA.potentialDesc || preARA.potential,
                strength: preARA.finalScore,
                _cat: 'preara',
                icon: '🔮',
              }] : []),
            ];

            const price = r.Price || r.Harga || 0;
            const allActualSigs = [
              ...(r._swingSignals  || []),
              ...(r._scalpSignals  || []).filter(s => s.type !== 'SCALP_NEUTRAL'),
              ...(r._accumSignals  || []),
            ].filter(s => s.tp1 && s.sl && s.tp2);
            const bestSig = allActualSigs.sort((a, b) => b.strength - a.strength)[0] || null;

            return {
              ...r,
              _allBuy: allBuy,
              _sigCount: allBuy.length,
              _hasPreARA: !!(preARA && preARA.finalScore >= 35 && preARA.signals.length >= 2),
              _preARAScore: preARA?.finalScore || 0,
              _preARAPotential: preARA?.potential || null,
              _hasBPJS: !!bpjs,
              _hasBSJP: !!bsjp,
              _price: price,
              _bestSig: bestSig,
            };
          }).filter(r => r._sigCount > 0 || r.Score >= 55);

          const sorted = [...enriched].sort((a, b) =>
            (b._sigCount * 10 + b.Score) - (a._sigCount * 10 + a.Score)
          );

          const totalWithSig   = enriched.filter(r => r._sigCount > 0).length;
          const totalPreARA    = enriched.filter(r => r._hasPreARA).length;
          const totalBPJS      = enriched.filter(r => r._hasBPJS).length;
          const totalBSJP      = enriched.filter(r => r._hasBSJP).length;
          const totalMultiSig  = enriched.filter(r => r._sigCount >= 3).length;

          let filtered = sorted;
          if (sigFilter === 'preara')        filtered = sorted.filter(r => r._hasPreARA);
          else if (sigFilter === 'bpjs')     filtered = sorted.filter(r => r._hasBPJS);
          else if (sigFilter === 'bsjp')     filtered = sorted.filter(r => r._hasBSJP);
          else if (sigFilter === 'bsjp_gap') filtered = sorted.filter(r => {
            if (!r._hasBSJP) return false;
            const g = GAP_STATS[r.Ticker];
            return g && (g.cat === 'sering' || g.cat === 'sangat_sering');
          });
          else if (sigFilter === 'swing')     filtered = sorted.filter(r => r._allBuy.some(s => s._cat === 'swing'));
          else if (sigFilter === 'scalp')     filtered = sorted.filter(r => r._allBuy.some(s => s._cat === 'scalp'));
          else if (sigFilter === 'akumulasi') filtered = sorted.filter(r => r._allBuy.some(s => s._cat === 'akumulasi'));
          else if (sigFilter === 'multisig')  filtered = sorted.filter(r => r._sigCount >= 3);

          if (sortMode === 'score')           filtered = [...filtered].sort((a,b) => b.Score - a.Score);
          else if (sortMode === 'preara_score') filtered = [...filtered].sort((a,b) => b._preARAScore - a._preARAScore);
          else if (sortMode === 'sigcount')   filtered = [...filtered].sort((a,b) => b._sigCount - a._sigCount);
          // Sort BSJP by expectancy kalau filter bsjp/bsjp_gap aktif
          else if (sigFilter === 'bsjp' || sigFilter === 'bsjp_gap') {
            filtered = [...filtered].sort((a,b) => {
              const ea = parseFloat(a._intradayPattern?.patterns?.find(p => p.type==='BELI_SORE_JUAL_PAGI')?.expectancy || 0);
              const eb = parseFloat(b._intradayPattern?.patterns?.find(p => p.type==='BELI_SORE_JUAL_PAGI')?.expectancy || 0);
              return eb - ea;
            });
          }

          // ── LEADERBOARD: flatten semua sinyal menjadi baris individual ──
          // Setiap baris = 1 ticker × 1 sinyal, dengan winrate dari TICKER_SIGNAL_STATS
          const buildLeaderboard = (sortOverride) => {
            const rows = [];
            for (const r of enriched) {
              // Kumpulkan semua sinyal teknikal (swing + scalp + akumulasi)
              const allTechSigs = [
                ...(r._swingSignals  || []).filter(s => s.strength > 0),
                ...(r._scalpSignals  || []).filter(s => s.type !== 'SCALP_NEUTRAL' && s.strength > 0),
                ...(r._accumSignals  || []).filter(s => s.strength > 0),
              ];

              for (const sig of allTechSigs) {
                const bst = getBacktestStats(sig.reason, r.Ticker, sig.signalName);
                if (!bst) continue;

                // Ambil data dari horizon yang dipilih user
                let wr, avg, horizon;
                if (sigHorizon === 'best') {
                  wr = bst.winRate;
                  avg = bst.avgRet;
                  horizon = bst.bestHorizon;
                } else {
                  const h = bst.byHorizon?.[sigHorizon];
                  if (!h) continue;
                  wr = h.wr;
                  avg = h.avg;
                  horizon = sigHorizon + ' hari';
                }

                const n = bst.count || 0;
                if (wr === undefined || wr === null) continue;

                rows.push({
                  ticker: r.Ticker,
                  name: r.Name || r.Nama || '',
                  sektor: r.Sektor || r.Sector || '—',
                  price: r._price || 0,
                  score: r.Score,
                  grade: r.Grade,
                  sigName: sig.signalName || (() => {
                    for (const key of Object.keys(BACKTEST_STATS)) {
                      if (sig.reason?.includes(key)) return key;
                    }
                    return sig.reason || '—';
                  })(),
                  sigCat: (() => {
                    const t = sig.type || '';
                    if (t.includes('SWING')) return 'swing';
                    if (t.includes('SCALP')) return 'scalp';
                    if (t.includes('ACCUM')) return 'akumulasi';
                    return 'teknikal';
                  })(),
                  winrate: wr,
                  avgRet: avg != null && !isNaN(Number(avg)) ? Number(avg) : null,
                  horizon,
                  n,
                  isTickerSpecific: !!bst._tickerSpecific,
                  byHorizon: bst.byHorizon || null, // {3d,5d,7d,14d,30d,60d}: {wr,avg,n,p10,p25,p50,p75,p90}
                  techScore: r.TechnicalScore ?? null,   // 0-100, 50=netral — kondisi teknikal SEKARANG
                  techNote: r.TechnicalNote ?? null,
                  mlScore1d: r.MLScore1d ?? null,   // 0-100, 50=netral — probabilitas naik ML (1 hari)
                  mlScore2d: r.MLScore2d ?? null,   // 0-100, 50=netral — probabilitas naik ML (2 hari)
                  mlNote: r.MLNote ?? null,
                  strength: sig.strength,
                  tp1: sig.tp1,
                  tp2: sig.tp2,
                  sl: sig.sl,
                  holdingDays: sig.holdingDays,
                  _r: r, // referensi ke screener row asli
                });
              }

              // BPJS/BSJP juga masuk.
              // FIX #1 (sebelumnya): dulu winrate/avgRet SELALU dari deteksi live (candle 60
              // hari terakhir), padahal tombol "Distribusi" pakai TICKER_SIGNAL_STATS
              // (backtest historis) — dua angka beda sumber jadi kelihatan "gajelas". Kalau
              // ada data historis, itu yang dipakai (konsisten sama popup Distribusi).
              // FIX #2 (baru): baris ini dulu DIPUSH TANPA PEDULI `sigHorizon` yang lagi
              // dipilih user — jadi walaupun user filter "60 hari", BPJS/BSJP tetap selalu
              // muncul karena kode di bawah gak pernah ngecek sigHorizon sama sekali.
              // Sekarang: kalau user pilih horizon spesifik (bukan "Terbaik"), baris
              // intraday cuma muncul kalau ada data historis (bh) buat horizon itu, dan
              // angka WR/avg-nya dihitung ULANG sesuai horizon yang dipilih — bukan histori
              // pola perdagangan 1-hari yang selalu sama tanpa peduli filter. Kalau sinyal
              // itu cuma live-detection (belum ada backtest historis sama sekali), baris
              // disembunyikan saat horizon spesifik dipilih karena live-detection memang
              // tidak punya breakdown per-horizon — cuma valid untuk "Terbaik".
              const pushIntradayRow = (hasFlag, patternType, sigName) => {
                if (!hasFlag) return;
                const p = r._intradayPattern?.patterns?.find(x => x.type === patternType);
                const hist = (TICKER_SIGNAL_STATS[r.Ticker] || {})[sigName];
                const liveWr = patternType === 'BELI_PAGI_JUAL_SORE'
                  ? r._intradayPattern?.stats?.beliPagiWinRate
                  : r._intradayPattern?.stats?.beliSoreWinRate;

                // FIX: `bh` (byHorizon) di TICKER_SIGNAL_STATS mengukur "harga N hari SETELAH
                // sinyal muncul", bukan durasi transaksi overnight BSJP/BPJS itu sendiri
                // (yang cuma 1 hari). Dulu ini ditampilkan sebagai `row.horizon` polos
                // ("30d hari") berdampingan sama badge "Intraday" — kelihatan kontradiktif
                // ("kok Intraday tapi horizon 30D?"). Sekarang dikasih label "proyeksi N hari"
                // biar jelas itu jendela pengukuran hasil, bukan lama posisi ditahan.
                let wr, avg, horizonLabel, n, byHorizon;
                if (sigHorizon === 'best') {
                  wr = hist?.wr ?? liveWr;
                  avg = hist?.avg ?? (p?.expectancy != null && !isNaN(Number(p.expectancy)) ? Number(p.expectancy) : null);
                  horizonLabel = hist ? `Proyeksi ${hist.best || '60d'}` : 'Intraday (live)';
                  n = hist?.n ?? (p?.sampleDays || 0);
                  byHorizon = hist?.bh || null;
                } else {
                  // Horizon spesifik dipilih — tanpa data backtest per-horizon, sinyal ini
                  // tidak bisa dijawab untuk horizon tersebut, jadi tidak ditampilkan.
                  const h = hist?.bh?.[sigHorizon];
                  if (!h) return;
                  wr = h.wr; avg = h.avg; horizonLabel = `Proyeksi ${sigHorizon}`; n = h.n; byHorizon = hist.bh;
                }
                if (wr == null) return;
                rows.push({
                  ticker: r.Ticker, name: r.Name||r.Nama||'', sektor: r.Sektor||r.Sector||'—',
                  price: r._price||0, score: r.Score, grade: r.Grade,
                  sigName, sigCat: 'intraday',
                  winrate: wr,
                  avgRet: avg,
                  horizon: horizonLabel,
                  n,
                  isTickerSpecific: !!hist,
                  _liveOnly: !hist,
                  techScore: r.TechnicalScore ?? null,
                  techNote: r.TechnicalNote ?? null,
                  mlScore1d: r.MLScore1d ?? null,
                  mlScore2d: r.MLScore2d ?? null,
                  mlNote: r.MLNote ?? null,
                  strength: p?.strength || 70,
                  byHorizon,
                  _r: r,
                });
              };
              pushIntradayRow(r._hasBPJS, 'BELI_PAGI_JUAL_SORE', 'BPJS Beli Pagi Jual Sore');
              pushIntradayRow(r._hasBSJP, 'BELI_SORE_JUAL_PAGI', 'BSJP Beli Sore Jual Pagi');
            }

            // Bandingkan winrate historis (leaderboard) vs kondisi teknikal SEKARANG.
            // Ini yang menjawab "backtest-nya bagus, tapi apa sekarang masih relevan?"
            // — bukan cuma nampilin dua angka bersebelahan, tapi eksplisit nandain
            // kalau dua sumber itu SEPAKAT atau BERLAWANAN, sama kayak prinsip
            // konflik di unified verdict engine (lib/core/verdict.js).
            for (const row of rows) {
              if (row.techScore == null) { row.align = 'unknown'; }
              else {
                const histBullish = row.winrate >= 50;
                const techBullish = row.techScore >= 60;
                const techBearish = row.techScore <= 35;
                if (histBullish && techBullish) row.align = 'selaras';
                else if (histBullish && techBearish) row.align = 'berlawanan';
                else if (!histBullish && techBullish) row.align = 'berlawanan';
                else row.align = 'netral';
              }

              // Alignment KHUSUS untuk kolom ML (dipakai badge di kolomnya sendiri,
              // TIDAK ikut menentukan row.align di atas — filter "Selaras Aja"
              // yang sudah ada tetap berbasis Winrate vs Teknikal saja, tidak
              // berubah perilakunya cuma karena ML ditambahkan).
              const mlS = row.mlScore1d ?? row.mlScore2d; // pakai 1D kalau ada, fallback 2D
              if (mlS == null) { row.mlAlign = 'unknown'; continue; }
              const histBullish2 = row.winrate >= 50;
              const mlBullish = mlS >= 60;
              const mlBearish = mlS <= 35;
              if (histBullish2 && mlBullish) row.mlAlign = 'selaras';
              else if (histBullish2 && mlBearish) row.mlAlign = 'berlawanan';
              else if (!histBullish2 && mlBullish) row.mlAlign = 'berlawanan';
              else row.mlAlign = 'netral';
            }

            // Filter
            let out = rows.filter(row => row.winrate >= lbMinWR && row.n >= lbMinN);
            if (lbAlignOnly) out = out.filter(row => row.align === 'selaras');

            // Filter by sigFilter (kalau bukan semua/multisig)
            if (['swing','scalp','akumulasi','intraday'].includes(sigFilter)) {
              out = out.filter(row => row.sigCat === sigFilter);
            } else if (sigFilter === 'preara') {
              out = out.filter(row => row._r._hasPreARA);
            } else if (sigFilter === 'bpjs') {
              out = out.filter(row => row.sigCat === 'intraday' && row.sigName.startsWith('BPJS'));
            } else if (sigFilter === 'bsjp') {
              out = out.filter(row => row.sigCat === 'intraday' && row.sigName.startsWith('BSJP'));
            }

            // Sort
            const sortKey = sortOverride || lbSort;
            if (sortKey === 'winrate')  out.sort((a,b) => b.winrate - a.winrate);
            else if (sortKey === 'avgret') out.sort((a,b) => (b.avgRet||0) - (a.avgRet||0));
            else if (sortKey === 'score')  out.sort((a,b) => b.score - a.score);
            else if (sortKey === 'count')  out.sort((a,b) => b.n - a.n);
            else if (sortKey === 'tech')   out.sort((a,b) => (b.techScore ?? -1) - (a.techScore ?? -1));
            else if (sortKey === 'ml')     out.sort((a,b) => ((b.mlScore1d ?? b.mlScore2d) ?? -1) - ((a.mlScore1d ?? a.mlScore2d) ?? -1));

            return out;
          };

          const lbRows = sigViewMode === 'leaderboard' ? buildLeaderboard() : [];

          const CAT_COLOR = {
            swing: 'var(--blue)', scalp: 'var(--purple)', akumulasi: 'var(--amber)',
            intraday: 'var(--green)', preara: '#ff4d6a', teknikal: 'var(--muted)',
          };
          const CAT_LABEL = {
            swing: '🎯 Swing', scalp: '⚡ Scalp', akumulasi: '📈 Akumulasi',
            intraday: '⏰ Intraday', preara: '🔮 Pre-ARA', teknikal: '📊 Teknikal',
          };

          // ══════════════════════════════════════════════════════
          // EXPORT PDF — Top 100 Winrate Hunter / Cuan Seeker
          // Butuh: npm install jspdf jspdf-autotable
          // Dynamic import supaya tidak membengkakkan bundle awal &
          // aman dari SSR (jsPDF butuh DOM, jadi hanya di-load saat diklik).
          // ══════════════════════════════════════════════════════
          const exportTop100PDF = async (sortKey) => {
            if (exportingPDF) return;
            setExportingPDF(sortKey);
            try {
              const rows = buildLeaderboard(sortKey).slice(0, 100);
              if (rows.length === 0) {
                alert('Tidak ada kombinasi yang lolos filter saat ini — coba turunkan Min Winrate / Min Sample dulu.');
                return;
              }

              const { jsPDF } = await import('jspdf');
              const autoTableMod = await import('jspdf-autotable');
              const autoTable = autoTableMod.default;

              const isWinrate = sortKey !== 'avgret';
              const todayStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
              const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
              const pageW = doc.internal.pageSize.getWidth();
              const pageH = doc.internal.pageSize.getHeight();

              // ── Cover page ──
              doc.setFillColor(15, 15, 26);
              doc.rect(0, 0, pageW, pageH, 'F');
              doc.setTextColor(165, 180, 252);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(10);
              doc.text(isWinrate ? 'PAKET WINRATE HUNTER' : 'PAKET CUAN SEEKER', 18, 35);
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(26);
              doc.text(isWinrate ? 'Top 100 Sinyal - Akurasi Tertinggi' : 'Top 100 Sinyal - Avg Return Tertinggi', 18, 50, { maxWidth: pageW - 36 });
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(11);
              doc.setTextColor(210, 210, 220);
              const subLines = doc.splitTextToSize(
                isWinrate
                  ? 'Kombinasi saham dan sinyal teknikal dengan win rate (akurasi) tertinggi dari hasil screening hari ini, lengkap dengan horizon, jumlah sampel historis, dan level harga acuan.'
                  : 'Kombinasi saham dan sinyal teknikal dengan rata-rata return tertinggi dari hasil screening hari ini, lengkap dengan horizon, jumlah sampel historis, dan level harga acuan.',
                pageW - 36
              );
              doc.text(subLines, 18, 62);

              doc.setDrawColor(217, 119, 6);
              doc.setFillColor(254, 243, 199);
              doc.roundedRect(18, pageH - 26, pageW - 36, 14, 1.5, 1.5, 'FD');
              doc.setTextColor(120, 53, 15);
              doc.setFontSize(8);
              doc.setFont('helvetica', 'bold');
              doc.text('DISCLAIMER', 22, pageH - 20);
              doc.setFont('helvetica', 'normal');
              const discLines = doc.splitTextToSize(
                'Seluruh angka winrate dan return adalah hasil backtest historis, bukan jaminan atau prediksi hasil di masa depan. Pasar saham selalu mengandung risiko kerugian. Gunakan data ini sebagai salah satu alat bantu keputusan, bukan satu-satunya.',
                pageW - 48
              );
              doc.text(discLines, 22, pageH - 15);

              doc.setFontSize(8);
              doc.setTextColor(140, 140, 150);
              doc.text(`Disusun ${todayStr} - ${rows.length} kombinasi - Filter aktif: Min Winrate ${lbMinWR}%, Min Sample ${lbMinN} trade, Horizon ${sigHorizon === 'best' ? 'Terbaik' : sigHorizon}`, 18, pageH - 32);

              // Footer dipakai berulang — di tabel ringkasan & tiap blok lampiran distribusi
              const footerHook = (data) => {
                doc.setFontSize(7);
                doc.setTextColor(150, 150, 160);
                doc.text(`Leaderboard Sinyal - ${todayStr}`, 10, pageH - 5);
                doc.text(`Halaman ${data.pageNumber}`, pageW - 25, pageH - 5);
              };

              // ── Table page(s) — ringkasan top 100 ──
              doc.addPage();
              autoTable(doc, {
                head: [['#', 'Ticker', 'Sektor', 'Sinyal', 'Tipe', 'Winrate', 'Avg Ret', 'Horizon', 'Sample', 'Score', 'Harga', 'TP1', 'SL']],
                body: rows.map((row, i) => [
                  i + 1,
                  row.ticker,
                  row.sektor,
                  row.sigName + (row.isTickerSpecific ? ' *' : ''),
                  (CAT_LABEL[row.sigCat] || row.sigCat).replace(/^\S+\s/, ''),
                  `${row.winrate.toFixed(1)}%`,
                  row.avgRet != null ? `${row.avgRet > 0 ? '+' : ''}${row.avgRet.toFixed(1)}%` : '—',
                  row.horizon,
                  row.n,
                  `${row.grade || ''} ${row.score ?? ''}`.trim(),
                  fmtRp(row.price),
                  row.tp1 ? fmtRp(row.tp1) : '—',
                  row.sl ? fmtRp(row.sl) : '—',
                ]),
                startY: 12,
                margin: { left: 10, right: 10 },
                styles: { fontSize: 7, cellPadding: 1.8, lineColor: [230, 230, 235], lineWidth: 0.1 },
                headStyles: { fillColor: [15, 15, 26], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
                alternateRowStyles: { fillColor: [248, 249, 252] },
                columnStyles: {
                  0: { halign: 'center', cellWidth: 7 },
                  5: { halign: 'right' },
                  6: { halign: 'right' },
                  8: { halign: 'right' },
                  10: { halign: 'right' },
                  11: { halign: 'right' },
                  12: { halign: 'right' },
                },
                didDrawPage: footerHook,
              });

              // ── Lampiran — distribusi percentile per horizon, per kombinasi ──
              const HORIZON_ORDER = [
                { key: '1d',  label: '1 Hari' },
                { key: '2d',  label: '2 Hari' },
                { key: '3d',  label: '3 Hari' },
                { key: '5d',  label: '5 Hari' },
                { key: '7d',  label: '7 Hari' },
                { key: '14d', label: '14 Hari' },
                { key: '30d', label: '30 Hari' },
                { key: '60d', label: '60 Hari' },
              ];
              const fmtCell = (v) => v != null && !isNaN(Number(v)) ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%` : '—';

              doc.addPage();
              let curY = 14;
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(13);
              doc.setTextColor(15, 15, 26);
              doc.text('Lampiran - Distribusi Return per Horizon (Semua Skenario)', 10, curY);
              curY += 5;
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              doc.setTextColor(90, 90, 100);
              const introLines = doc.splitTextToSize(
                'Untuk setiap kombinasi pada tabel ringkasan, berikut rincian winrate dan return di setiap horizon waktu, dari skenario terburuk (P10) sampai skenario terbaik (P90). Median (P50/Biasanya) umumnya lebih menggambarkan hasil yang biasa dialami dibanding rata-rata (avg), yang bisa tertarik oleh segelintir trade ekstrem.',
                pageW - 20
              );
              doc.text(introLines, 10, curY + 3.5);
              curY += 3.5 + introLines.length * 3.4 + 5;
              footerHook({ pageNumber: doc.internal.getNumberOfPages() });

              const bottomLimit = pageH - 12;

              rows.forEach((row, i) => {
                const bh = row.byHorizon;
                const horizonsAvail = bh ? HORIZON_ORDER.filter(h => bh[h.key]) : [];
                const blockRows = horizonsAvail.length > 0 ? horizonsAvail.length : 1;
                const estHeight = 9 + 6 + blockRows * 5 + 5;

                if (curY + estHeight > bottomLimit) {
                  doc.addPage();
                  curY = 14;
                }

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9.5);
                doc.setTextColor(15, 15, 26);
                doc.text(`#${i + 1}  ${row.ticker} - ${row.sigName}${row.isTickerSpecific ? ' *' : ''}`, 10, curY);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(110, 110, 120);
                doc.text(
                  `${(CAT_LABEL[row.sigCat] || row.sigCat).replace(/^\S+\s/, '')} - Score ${row.grade || ''}${row.score ?? ''} - Harga ${fmtRp(row.price)} - TP1 ${row.tp1 ? fmtRp(row.tp1) : '—'} - SL ${row.sl ? fmtRp(row.sl) : '—'}`,
                  10, curY + 4
                );
                curY += 7;

                if (horizonsAvail.length > 0) {
                  autoTable(doc, {
                    head: [['Horizon', 'Sample', 'Winrate', 'Avg', 'Terburuk (P10)', 'Kurang Bagus (P25)', 'Biasanya (P50)', 'Bagus (P75)', 'Terbaik (P90)']],
                    body: horizonsAvail.map(h => {
                      const d = bh[h.key];
                      return [
                        h.label,
                        d.n ?? '—',
                        d.wr != null ? `${Number(d.wr).toFixed(1)}%` : '—',
                        fmtCell(d.avg),
                        fmtCell(d.p10), fmtCell(d.p25), fmtCell(d.p50), fmtCell(d.p75), fmtCell(d.p90),
                      ];
                    }),
                    startY: curY,
                    margin: { left: 10, right: 10 },
                    tableWidth: pageW - 20,
                    styles: { fontSize: 6.8, cellPadding: 1.3, lineColor: [230, 230, 235], lineWidth: 0.1 },
                    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 6.8 },
                    columnStyles: {
                      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
                      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
                      7: { halign: 'right' }, 8: { halign: 'right' },
                    },
                    didDrawPage: footerHook,
                  });
                  curY = doc.lastAutoTable.finalY + 5;
                } else {
                  doc.setFont('helvetica', 'italic');
                  doc.setFontSize(7.5);
                  doc.setTextColor(150, 150, 160);
                  doc.text('Data distribusi per horizon tidak tersedia untuk sinyal ini.', 10, curY);
                  curY += 7;
                }
              });

              const fname = `Top100-${isWinrate ? 'WinrateHunter' : 'CuanSeeker'}-${new Date().toISOString().slice(0, 10)}.pdf`;
              doc.save(fname);
            } catch (err) {
              console.error('Export PDF gagal:', err);
              alert('Gagal membuat PDF. Coba lagi atau cek console untuk detail error.');
            } finally {
              setExportingPDF(null);
            }
          };

          if (screenerRows.length === 0) return (
            <div className="empty-state">
              <div className="empty-icon">🎯</div>
              <div className="empty-title">Jalankan Screener dulu</div>
              <div style={{ fontSize: '.82rem', marginTop: '.3rem' }}>Sinyal dihasilkan dari data screener</div>
              <button className="btn btn-green" style={{ marginTop: '1rem' }} onClick={() => setTab('screener')}>🚀 Ke Screener</button>
            </div>
          );

          return (
            <div>
              {/* ── Stats bar ── */}
              <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: '1rem' }}>
                {[
                  ['Ada Sinyal',    totalWithSig,   'var(--text)',   'semua'],
                  ['Multi-Sinyal', totalMultiSig,  'var(--green)',  'multisig'],
                  ['🔮 Pre-ARA',   totalPreARA,    '#ff4d6a',      'preara'],
                  ['☀️ Beli Pagi', totalBPJS,      'var(--amber)', 'bpjs'],
                  ['🌙 Beli Sore', totalBSJP,      'var(--purple)','bsjp'],
                ].map(([label, val, col, f]) => (
                  <div key={label} className="sum-card" style={{ cursor:'pointer', border: sigFilter===f ? `2px solid ${col}` : '1px solid var(--border)', transition:'.15s' }} onClick={() => setSigFilter(sigFilter===f ? 'semua' : f)}>
                    <div className="sum-num" style={{ color: col }}>{val}</div>
                    <div className="sum-label">{label}</div>
                  </div>
                ))}
              </div>

              {/* ── View Mode Toggle ── */}
              <div style={{ display:'flex', gap:6, marginBottom:'1rem', alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:'.72rem', color:'var(--muted)', fontWeight:700, marginRight:4 }}>VIEW:</span>
                {[['cards','🃏 Kartu Saham'], ['leaderboard','🏆 Leaderboard Sinyal']].map(([id,label]) => (
                  <button key={id} onClick={() => setSigViewMode(id)} style={{
                    background: sigViewMode===id ? 'rgba(0,229,160,.15)' : 'var(--bg2)',
                    border: `1px solid ${sigViewMode===id ? 'var(--green)' : 'var(--border)'}`,
                    color: sigViewMode===id ? 'var(--green)' : 'var(--muted)',
                    borderRadius:8, padding:'6px 16px', fontSize:'.78rem', fontWeight:700, cursor:'pointer',
                  }}>{label}</button>
                ))}
              </div>

              {/* ── Filter + Sort bar ── */}
              <div style={{ display:'flex', gap:8, marginBottom:'1rem', flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:'.72rem', color:'var(--muted)', fontWeight:700 }}>FILTER:</span>
                {[
                  ['semua',     '🔍 Semua'],
                  ['multisig',  '🏆 3+ Sinyal'],
                  ['preara',    '🔮 Pre-ARA'],
                  ['bpjs',      '☀️ Beli Pagi'],
                  ['bsjp',      '🌙 Beli Sore'],
                  ['swing',     '🎯 Swing'],
                  ['scalp',     '⚡ Scalp'],
                  ['akumulasi', '📈 Akumulasi'],
                ].map(([id, label]) => (
                  <button key={id} onClick={() => setSigFilter(id)} style={{
                    background: sigFilter===id ? 'var(--green)22' : 'var(--bg2)',
                    border: `1px solid ${sigFilter===id ? 'var(--green)' : 'var(--border)'}`,
                    color: sigFilter===id ? 'var(--green)' : 'var(--muted)',
                    borderRadius:8, padding:'5px 12px', fontSize:'.75rem', fontWeight:700, cursor:'pointer',
                  }}>{label}</button>
                ))}

                {sigViewMode === 'cards' && (
                  <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ fontSize:'.72rem', color:'var(--muted)', fontWeight:700 }}>URUTKAN:</span>
                    {[['default','Sinyal+Score'],['score','Score'],['preara_score','Pre-ARA'],['sigcount','Jml Sinyal']].map(([id,label]) => (
                      <button key={id} onClick={() => setSortMode(id)} style={{
                        background: sortMode===id ? 'var(--blue)22' : 'var(--bg2)',
                        border: `1px solid ${sortMode===id ? 'var(--blue)' : 'var(--border)'}`,
                        color: sortMode===id ? 'var(--blue)' : 'var(--muted)',
                        borderRadius:8, padding:'5px 12px', fontSize:'.73rem', fontWeight:700, cursor:'pointer',
                      }}>{label}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* ══════════════════════════════════════════════════════
                  LEADERBOARD VIEW — baris per ticker×sinyal
              ══════════════════════════════════════════════════════ */}
              {sigViewMode === 'leaderboard' && (
                <div>
                  {/* Controls leaderboard */}
                  <div style={{ display:'flex', gap:10, marginBottom:'1rem', flexWrap:'wrap', alignItems:'center' }}>

                    {/* Horizon */}
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <span style={{ fontSize:'.71rem', color:'var(--muted)', fontWeight:700 }}>HORIZON:</span>
                      {[['best','⭐ Terbaik'],['1d','1 Hari'],['2d','2 Hari'],['3d','3 Hari'],['5d','5 Hari'],['7d','7 Hari'],['14d','14 Hari'],['30d','30 Hari'],['60d','60 Hari']].map(([id,label]) => (
                        <button key={id} onClick={() => setSigHorizon(id)} style={{
                          background: sigHorizon===id ? 'rgba(167,139,250,.2)' : 'var(--bg2)',
                          border: `1px solid ${sigHorizon===id ? 'var(--purple)' : 'var(--border)'}`,
                          color: sigHorizon===id ? 'var(--purple)' : 'var(--muted)',
                          borderRadius:6, padding:'4px 10px', fontSize:'.72rem', fontWeight:700, cursor:'pointer',
                        }}>{label}</button>
                      ))}
                    </div>

                    {/* Sort */}
                    <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft:'auto' }}>
                      <span style={{ fontSize:'.71rem', color:'var(--muted)', fontWeight:700 }}>SORT BY:</span>
                      {[['winrate','📊 Winrate'],['avgret','💰 Avg Return'],['score','⭐ Score'],['count','📈 Sample'],['tech','🧭 Teknikal'],['ml','🤖 ML']].map(([id,label]) => (
                        <button key={id} onClick={() => setLbSort(id)} style={{
                          background: lbSort===id ? 'var(--amber)22' : 'var(--bg2)',
                          border: `1px solid ${lbSort===id ? 'var(--amber)' : 'var(--border)'}`,
                          color: lbSort===id ? 'var(--amber)' : 'var(--muted)',
                          borderRadius:6, padding:'4px 10px', fontSize:'.72rem', fontWeight:700, cursor:'pointer',
                        }}>{label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Filter min WR dan min sample */}
                  <div style={{ display:'flex', gap:16, marginBottom:'1rem', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 16px', alignItems:'center', flexWrap:'wrap' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:'.72rem', color:'var(--muted)', fontWeight:700 }}>MIN WINRATE:</span>
                      {[0,40,45,50,55,60].map(v => (
                        <button key={v} onClick={() => setLbMinWR(v)} style={{
                          background: lbMinWR===v ? 'var(--green)22' : 'transparent',
                          border: `1px solid ${lbMinWR===v ? 'var(--green)' : 'var(--border)'}`,
                          color: lbMinWR===v ? 'var(--green)' : 'var(--muted)',
                          borderRadius:6, padding:'3px 10px', fontSize:'.72rem', fontWeight:700, cursor:'pointer',
                        }}>{v === 0 ? 'Semua' : `≥${v}%`}</button>
                      ))}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:'.72rem', color:'var(--muted)', fontWeight:700 }}>MIN SAMPLE:</span>
                      {[0,5,10,20,50].map(v => (
                        <button key={v} onClick={() => setLbMinN(v)} style={{
                          background: lbMinN===v ? 'var(--blue)22' : 'transparent',
                          border: `1px solid ${lbMinN===v ? 'var(--blue)' : 'var(--border)'}`,
                          color: lbMinN===v ? 'var(--blue)' : 'var(--muted)',
                          borderRadius:6, padding:'3px 10px', fontSize:'.72rem', fontWeight:700, cursor:'pointer',
                        }}>{v === 0 ? 'Semua' : `≥${v} trade`}</button>
                      ))}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <button onClick={() => setLbAlignOnly(v => !v)} title="Cuma tampilkan sinyal yang winrate historisnya bagus DAN kondisi teknikalnya sekarang juga mendukung" style={{
                        background: lbAlignOnly ? 'rgba(0,229,160,.15)' : 'transparent',
                        border: `1px solid ${lbAlignOnly ? 'var(--green)' : 'var(--border)'}`,
                        color: lbAlignOnly ? 'var(--green)' : 'var(--muted)',
                        borderRadius:6, padding:'3px 10px', fontSize:'.72rem', fontWeight:700, cursor:'pointer',
                      }}>✓ Selaras Aja</button>
                    </div>
                    <span style={{ marginLeft:'auto', fontSize:'.72rem', color:'var(--muted)' }}>
                      <b style={{ color:'var(--text)' }}>{lbRows.length}</b> kombinasi ditemukan
                    </span>
                  </div>

                  {/* Export PDF — top 100 by winrate / avg return */}
                  <div style={{ display:'flex', gap:8, marginBottom:'1rem', flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:'.72rem', color:'var(--muted)', fontWeight:700 }}>EXPORT PDF:</span>
                    <button
                      disabled={!!exportingPDF || lbRows.length === 0}
                      onClick={() => exportTop100PDF('winrate')}
                      style={{
                        background: 'rgba(0,229,160,.12)', border: '1px solid var(--green)', color: 'var(--green)',
                        borderRadius:8, padding:'6px 14px', fontSize:'.75rem', fontWeight:700,
                        cursor: exportingPDF ? 'wait' : 'pointer',
                        opacity: exportingPDF && exportingPDF !== 'winrate' ? .5 : 1,
                      }}
                    >{exportingPDF === 'winrate' ? '⏳ Membuat PDF…' : '📄 Top 100 Winrate Hunter'}</button>
                    <button
                      disabled={!!exportingPDF || lbRows.length === 0}
                      onClick={() => exportTop100PDF('avgret')}
                      style={{
                        background: 'rgba(255,184,77,.12)', border: '1px solid var(--amber)', color: 'var(--amber)',
                        borderRadius:8, padding:'6px 14px', fontSize:'.75rem', fontWeight:700,
                        cursor: exportingPDF ? 'wait' : 'pointer',
                        opacity: exportingPDF && exportingPDF !== 'avgret' ? .5 : 1,
                      }}
                    >{exportingPDF === 'avgret' ? '⏳ Membuat PDF…' : '📄 Top 100 Cuan Seeker'}</button>
                    <span style={{ fontSize:'.68rem', color:'var(--muted)' }}>
                      Selalu ambil top 100 dari kombinasi yang lolos filter Min Winrate/Sample saat ini, terlepas dari SORT BY di atas.
                    </span>
                  </div>

                  {/* Leaderboard table */}
                  {lbRows.length > 0 ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width:32 }}>#</th>
                            <th>Ticker</th>
                            <th>Sinyal</th>
                            <th>Tipe</th>
                            <th style={{ textAlign:'right' }}>Winrate</th>
                            <th style={{ textAlign:'right' }} title="Kondisi teknikal SAAT INI (0-100, 50=netral) — dibandingkan sama Winrate historis di sebelah kiri">Teknikal</th>
                            <th style={{ textAlign:'right' }} title="Probabilitas naik menurut model Machine Learning (0-100, 50=netral) — dilatih dari data historis 1-2 hari ke depan, dibandingkan sama Winrate historis">ML</th>
                            <th style={{ textAlign:'right' }}>Avg Ret</th>
                            <th>Horizon</th>
                            <th style={{ textAlign:'right' }}>Sample</th>
                            <th>Score</th>
                            <th style={{ textAlign:'right' }}>Harga</th>
                            <th>TP1</th>
                            <th>SL</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lbRows.slice(0, 100).map((row, i) => {
                            const wrColor = row.winrate >= 60 ? '#00e5a0' : row.winrate >= 50 ? '#ffb84d' : row.winrate >= 40 ? 'var(--text2)' : '#ff4d6a';
                            const retColor = (row.avgRet||0) >= 5 ? '#00e5a0' : (row.avgRet||0) >= 1 ? '#ffb84d' : (row.avgRet||0) >= 0 ? 'var(--text2)' : '#ff4d6a';
                            const catCol = CAT_COLOR[row.sigCat] || 'var(--muted)';
                            const techColor = row.techScore == null ? 'var(--muted)'
                              : row.techScore >= 60 ? '#00e5a0' : row.techScore <= 35 ? '#ff4d6a' : '#ffb84d';
                            const alignBadge = { selaras: ['✓', 'var(--green)', 'Selaras: winrate historis & teknikal sekarang sama-sama mendukung'],
                              berlawanan: ['⚠', '#ff4d6a', 'Berlawanan: winrate historis dan kondisi teknikal sekarang gak sejalan — cek dulu sebelum ambil'],
                              netral: ['·', 'var(--muted)', 'Netral: gak cukup kuat buat dibilang selaras atau berlawanan'],
                              unknown: [null, null, null] }[row.align] || [null, null, null];
                            const mlS = row.mlScore1d ?? row.mlScore2d;
                            const mlColor = mlS == null ? 'var(--muted)'
                              : mlS >= 60 ? '#00e5a0' : mlS <= 35 ? '#ff4d6a' : '#ffb84d';
                            const mlAlignBadge = { selaras: ['✓', 'var(--green)', 'Selaras: winrate historis & prediksi ML sama-sama mendukung'],
                              berlawanan: ['⚠', '#ff4d6a', 'Berlawanan: winrate historis dan prediksi ML gak sejalan — cek dulu sebelum ambil'],
                              netral: ['·', 'var(--muted)', 'Netral: gak cukup kuat buat dibilang selaras atau berlawanan'],
                              unknown: [null, null, null] }[row.mlAlign] || [null, null, null];
                            return (
                              <tr key={`${row.ticker}-${row.sigName}-${i}`}>
                                <td className="td-mono" style={{ color: 'var(--muted)', fontSize: '.73rem' }}>{i + 1}</td>
                                <td>
                                  <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: '.9rem', color: 'var(--text)', cursor: 'pointer' }}
                                    onClick={() => handleDetailNav(row.ticker, row._r)}>
                                    {row.ticker}
                                  </div>
                                  <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1 }}>{row.sektor}</div>
                                </td>
                                <td>
                                  <div style={{ fontSize: '.78rem', color: 'var(--text2)', maxWidth: 220 }}>
                                    {row.sigName}
                                    {row.isTickerSpecific && <span style={{ marginLeft: 4, fontSize: '.65rem', color: 'var(--amber)', fontWeight: 700 }}>★ Spesifik</span>}
                                    {row._liveOnly && <span style={{ marginLeft: 4, fontSize: '.65rem', color: 'var(--muted)', fontWeight: 700 }} title="Belum ada data backtest historis untuk ticker ini — WR dihitung live dari 60 candle terakhir">⚡ Live</span>}
                                  </div>
                                </td>
                                <td>
                                  <span style={{
                                    fontSize: '.68rem', fontWeight: 700, padding: '2px 8px',
                                    background: `${catCol}20`, color: catCol,
                                    border: `1px solid ${catCol}44`, borderRadius: 6,
                                  }}>{CAT_LABEL[row.sigCat]?.split(' ')[1] || row.sigCat}</span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ fontFamily: 'DM Mono,monospace', fontWeight: 800, fontSize: '.92rem', color: wrColor }}>{row.winrate.toFixed(1)}%</div>
                                  {/* Mini winrate bar */}
                                  <div style={{ width: 60, height: 4, background: 'var(--bg2)', borderRadius: 2, marginTop: 3, marginLeft: 'auto' }}>
                                    <div style={{ width: `${Math.min(row.winrate, 100)}%`, height: '100%', background: wrColor, borderRadius: 2 }} />
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right' }} title={row.techNote || ''}>
                                  {row.techScore != null ? (
                                    <>
                                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5 }}>
                                        {alignBadge[0] && (
                                          <span style={{ fontSize:'.75rem', fontWeight:800, color: alignBadge[1] }} title={alignBadge[2]}>{alignBadge[0]}</span>
                                        )}
                                        <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 800, fontSize: '.92rem', color: techColor }}>{Math.round(row.techScore)}</span>
                                      </div>
                                      <div style={{ width: 60, height: 4, background: 'var(--bg2)', borderRadius: 2, marginTop: 3, marginLeft: 'auto', position:'relative' }}>
                                        <div style={{ position:'absolute', left:'50%', top:-1, width:1, height:6, background:'var(--border)' }} />
                                        <div style={{ width: `${Math.min(row.techScore, 100)}%`, height: '100%', background: techColor, borderRadius: 2 }} />
                                      </div>
                                    </>
                                  ) : (
                                    <span style={{ fontSize:'.72rem', color:'var(--muted)' }}>—</span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }} title={row.mlNote || 'Model ML belum tersedia'}>
                                  {mlS != null ? (
                                    <>
                                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5 }}>
                                        {mlAlignBadge[0] && (
                                          <span style={{ fontSize:'.75rem', fontWeight:800, color: mlAlignBadge[1] }} title={mlAlignBadge[2]}>{mlAlignBadge[0]}</span>
                                        )}
                                        <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 800, fontSize: '.92rem', color: mlColor }}>{Math.round(mlS)}</span>
                                      </div>
                                      <div style={{ width: 60, height: 4, background: 'var(--bg2)', borderRadius: 2, marginTop: 3, marginLeft: 'auto', position:'relative' }}>
                                        <div style={{ position:'absolute', left:'50%', top:-1, width:1, height:6, background:'var(--border)' }} />
                                        <div style={{ width: `${Math.min(mlS, 100)}%`, height: '100%', background: mlColor, borderRadius: 2 }} />
                                      </div>
                                      {(row.mlScore1d != null || row.mlScore2d != null) && (
                                        <div style={{ fontSize:'.58rem', color:'var(--muted)', marginTop:2, textAlign:'right' }}>
                                          1D {row.mlScore1d != null ? Math.round(row.mlScore1d) : '—'} · 2D {row.mlScore2d != null ? Math.round(row.mlScore2d) : '—'}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span style={{ fontSize:'.72rem', color:'var(--muted)' }}>—</span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '.85rem', fontWeight: 700, color: retColor }}>
                                    {row.avgRet != null && !isNaN(Number(row.avgRet)) ? `${Number(row.avgRet) > 0 ? '+' : ''}${Number(row.avgRet).toFixed(1)}%` : '—'}
                                  </span>
                                  <div style={{ marginTop: 3 }}>
                                  <DistributionTriggerBtn signalKey={row.sigName} ticker={row.ticker} backtestData={row.ticker ? (TICKER_SIGNAL_STATS[row.ticker] || {})[row.sigName] : null} onClick={() => setDistSignal({signal: row.sigName, ticker: row.ticker})} />
                                  </div>
                                </td>
                                <td style={{ fontSize: '.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{row.horizon}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '.78rem', color: row.n >= 30 ? 'var(--green)' : row.n >= 10 ? 'var(--amber)' : 'var(--muted)' }}>
                                    {row.n}
                                  </span>
                                  <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>trade</div>
                                </td>
                                <td>
                                  {(() => {
                                    const gradeColors = { A:'#00e5a0', B:'#ffb84d', C:'#4d9fff', D:'#ff4d6a' };
                                    const gc = gradeColors[row.grade] || 'var(--muted)';
                                    return (
                                      <span style={{
                                        fontSize: '.73rem', fontWeight: 700, padding: '2px 7px',
                                        background: `${gc}22`, color: gc, borderRadius: 5,
                                      }}>{row.grade} {row.score}</span>
                                    );
                                  })()}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'DM Mono,monospace', fontSize: '.8rem' }}>{fmtRp(row.price)}</td>
                                <td style={{ fontFamily: 'DM Mono,monospace', fontSize: '.75rem', color: 'var(--green)' }}>
                                  {row.tp1 ? fmtRp(row.tp1) : '—'}
                                </td>
                                <td style={{ fontFamily: 'DM Mono,monospace', fontSize: '.75rem', color: 'var(--red)' }}>
                                  {row.sl ? fmtRp(row.sl) : '—'}
                                </td>
                                <td>
                                  <button onClick={() => handleDetailNav(row.ticker, row._r)}
                                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--blue)', borderRadius: 6, padding: '4px 10px', fontSize: '.72rem', cursor: 'pointer', fontWeight: 700 }}>
                                    Detail →
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">🔍</div>
                      <div className="empty-title">Tidak ada sinyal dengan filter ini</div>
                      <div style={{ fontSize:'.82rem', color:'var(--muted)', marginTop:'.3rem' }}>
                        Coba turunkan Min Winrate atau Min Sample, atau ubah filter sinyal
                      </div>
                      <button className="btn" style={{ marginTop:'1rem' }} onClick={() => { setLbMinWR(0); setLbMinN(0); }}>Reset Filter WR</button>
                    </div>
                  )}

                  <div className="info-box" style={{ marginTop:'1rem' }}>
                    💡 <b>★ Spesifik</b> = winrate dihitung dari histori ticker tersebut (data aktual). Tanpa bintang = data global semua saham BEI. <b>⚡ Live</b> = khusus sinyal intraday (BPJS/BSJP) yang belum punya data backtest historis untuk ticker ini, winrate dihitung on-the-fly dari 60 candle terakhir — bisa berubah tiap kali data di-refresh.
                    Data dari backtest 2 tahun · {sigHorizon === 'best' ? 'Menampilkan horizon terbaik per sinyal' : `Horizon ${sigHorizon} hari`}
                  </div>
                </div>
              )}

              
              {sigViewMode === 'cards' && (
                <div>
                  <div style={{ fontSize:'.75rem', color:'var(--muted)', marginBottom:'1rem' }}>
                    Menampilkan <b style={{ color:'var(--text)' }}>{Math.min(filtered.length, 60)}</b> dari <b>{filtered.length}</b> saham
                    {sigFilter !== 'semua' && <span> · Filter: <b style={{ color:'var(--green)' }}>{sigFilter}</b></span>}
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {filtered.slice(0, 60).map((r, idx) => {
                      const price = r._price || 0;
                      const bestSig = r._bestSig || null;
                      const hasManySignals = r._sigCount >= 3;
                      return (
                        <div key={r.Ticker + idx} style={{
                          background: 'var(--card)',
                          border: `1px solid ${hasManySignals ? 'var(--green)55' : 'var(--border)'}`,
                          borderLeft: `4px solid ${r._hasPreARA ? '#ff4d6a' : r._hasBPJS || r._hasBSJP ? 'var(--amber)' : 'var(--green)'}`,
                          borderRadius: 'var(--r)',
                          padding: '1rem 1.1rem',
                        }}>
                          {/* Row atas: ticker + harga + badge */}
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                            <div>
                              <span style={{ fontWeight:800, fontSize:'1.05rem', color:'var(--text)', cursor:'pointer', textDecoration:'underline dotted' }}
                                onClick={() => handleDetailNav(r.Ticker, r)}>
                                {r.Ticker}
                              </span>
                              <span style={{ fontSize:'.72rem', color:'var(--muted)', marginLeft:8 }}>{(r.Name||r.Nama||'').substring(0,30)}</span>
                              <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:2 }}>{r.Sektor || r.Sector || '—'}</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ fontFamily:'DM Mono,monospace', fontWeight:700, fontSize:'.95rem' }}>{fmtRp(price)}</div>
                              <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:4, flexWrap:'wrap' }}>
                                <span style={{ fontSize:'.7rem', background:`${gradeColor[r.Grade]}22`, color:gradeColor[r.Grade], borderRadius:6, padding:'2px 8px', fontWeight:700 }}>
                                  {r.Grade} · {r.Score}
                                </span>
                                {r._hasPreARA && (() => {
                                  const col = r._preARAPotential === 'SANGAT TINGGI' ? '#ff4d6a'
                                    : r._preARAPotential === 'TINGGI' ? '#ffb84d'
                                    : '#a78bfa';
                                  const lbl = r._preARAPotential === 'SANGAT TINGGI' ? '🔮 Pre-ARA !!!'
                                    : r._preARAPotential === 'TINGGI' ? '🔮 Pre-ARA'
                                    : '🔮 Waspada';
                                  return (
                                    <span style={{ fontSize:'.7rem', background:`${col}22`, color:col, borderRadius:6, padding:'2px 8px', fontWeight:700 }}>
                                      {lbl} {r._preARAScore}
                                    </span>
                                  );
                                })()}
                                {hasManySignals && (
                                  <span style={{ fontSize:'.7rem', background:'var(--green)22', color:'var(--green)', borderRadius:6, padding:'2px 8px', fontWeight:700 }}>
                                    🏆 {r._sigCount} sinyal
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Metric row */}
                          <div style={{ display:'flex', gap:16, fontSize:'.72rem', color:'var(--muted)', marginBottom:10, flexWrap:'wrap' }}>
                            <span>RSI <b style={{ color: r.RSI<30?'var(--green)':r.RSI>70?'var(--red)':'var(--text2)' }}>{r.RSI?.toFixed(1)||'—'}</b></span>
                            <span>DD <b style={{ color:'var(--amber)' }}>-{r['DD%'] || r.DD}%</b></span>
                            {r.PBV && <span>PBV <b>{r.PBV?.toFixed(1)}</b></span>}
                            {r.PER && <span>PER <b>{r.PER?.toFixed(1)}</b></span>}
                            {r['ROE%'] && <span>ROE <b style={{ color:'var(--green)' }}>{r['ROE%']}%</b></span>}
                            {bestSig?.atr && <span>ATR <b>{fmtRp(bestSig.atr)}</b></span>}
                          </div>

                          {/* TP / SL block */}
                          {bestSig ? (
                            <div style={{
                              display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1,
                              background:'var(--bg2)', border:'1px solid var(--border)',
                              borderRadius:9, overflow:'hidden', marginBottom:10,
                            }}>
                              {[
                                { label:'TP1', val: fmtRp(bestSig.tp1), sub: `+${bestSig.pct1 ?? ((bestSig.tp1-price)/price*100).toFixed(1)}%`, col:'var(--green)' },
                                { label:'TP2', val: fmtRp(bestSig.tp2), sub: `+${bestSig.pct2 ?? ((bestSig.tp2-price)/price*100).toFixed(1)}%`, col:'var(--blue)' },
                                { label:'SL',  val: fmtRp(bestSig.sl),  sub: `-${((price-bestSig.sl)/price*100).toFixed(1)}%`, col:'var(--red)' },
                                { label:'⏱ HOLD', val: bestSig.holdingDays||'—', sub: bestSig.type?.includes('SCALP')?'scalp':bestSig.type?.includes('ACCUM')?'akumulasi':'swing', col:'var(--text2)' },
                              ].map(({ label, val, sub, col }) => (
                                <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'7px 4px', borderRight:'1px solid var(--border)' }}>
                                  <span style={{ fontSize:'.58rem', color:'var(--muted)', fontWeight:700, letterSpacing:'.05em', marginBottom:2 }}>{label}</span>
                                  <span style={{ fontFamily:'DM Mono,monospace', fontSize:'.8rem', fontWeight:700, color:col, textAlign:'center', lineHeight:1.2 }}>{val}</span>
                                  <span style={{ fontSize:'.62rem', color:col, opacity:.75, marginTop:2 }}>{sub}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize:'.7rem', color:'var(--muted)', background:'var(--bg2)', borderRadius:7, padding:'6px 10px', marginBottom:10, fontStyle:'italic' }}>
                              TP/SL belum tersedia — sinyal teknikal tidak cukup data
                            </div>
                          )}

                          {/* Sinyal badges */}
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom: r._allBuy.length > 0 ? 10 : 0 }}>
                            {r._allBuy.sort((a,b) => b.strength - a.strength).slice(0,6).map((s, i) => (
                              <span key={i} style={{
                                fontSize:'.7rem', fontWeight:700,
                                background: `${CAT_COLOR[s._cat]}22`,
                                color: CAT_COLOR[s._cat],
                                border: `1px solid ${CAT_COLOR[s._cat]}44`,
                                borderRadius:6, padding:'3px 8px',
                              }}>
                                {s.icon || ''}{CAT_LABEL[s._cat]} · {s.strength}
                              </span>
                            ))}
                          </div>

                          {/* Top signal reasons + backtest WR */}
                          {r._allBuy.length > 0 && (
                            <div style={{ fontSize:'.74rem', color:'var(--text2)', background:'var(--bg2)', borderRadius:7, padding:'7px 10px', marginBottom:10 }}>
                              {r._allBuy.sort((a,b)=>b.strength-a.strength).slice(0,2).map((s,i) => {
                                const bst = getBacktestStats(s.reason, r.Ticker, s.signalName);
                                const wrC = !bst ? 'var(--muted)' : bst.winRate>=55?'#00e5a0':bst.winRate>=45?'#ffb84d':'#ff4d6a';
                                return (
                                <div key={i} style={{ marginBottom: i===0 && r._allBuy.length>1 ? 3 : 0, display:'flex', alignItems:'center', gap:6 }}>
                                  💡 {s.reason}
                                  {bst && <span style={{ fontSize:'.65rem', fontWeight:700, color:wrC, marginLeft:2, whiteSpace:'nowrap' }}>WR {bst.winRate}%{bst._tickerSpecific?' ★':''} · {bst.bestHorizon}</span>}
                                </div>
                              );})}
                            </div>
                          )}

                          {/* Intraday patterns */}
                          {(r._hasBPJS || r._hasBSJP) && (
                            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                              {r._hasBPJS && (() => {
                                const p = r._intradayPattern?.patterns?.find(x => x.type === 'BELI_PAGI_JUAL_SORE');
                                return (
                                  <div style={{ fontSize:'.72rem', background:'var(--amber)11', border:'1px solid var(--amber)44', borderRadius:7, padding:'5px 10px', color:'var(--amber)' }}>
                                    ☀️ <b>Beli Pagi Jual Sore</b> — WR {r._intradayPattern?.stats?.beliPagiWinRate}%
                                    {p?.expectancy ? ` · expectancy +${p.expectancy}%/hr` : ''}
                                    {p?.sampleDays ? ` · ${p.sampleDays}hr data` : ''}
                                  </div>
                                );
                              })()}
                              {r._hasBSJP && (() => {
                                const p = r._intradayPattern?.patterns?.find(x => x.type === 'BELI_SORE_JUAL_PAGI');
                                const g = GAP_STATS[r.Ticker];
                                const gapTier = g?.cat === 'sangat_sering' ? { label: '⚡ Sering gap', color: '#ffb84d' }
                                              : g?.cat === 'sering'        ? { label: '⚡ Gap lumayan', color: '#ffb84d' }
                                              : null;
                                return (
                                  <div style={{ fontSize:'.72rem', background:'var(--purple)11', border:'1px solid var(--purple)44', borderRadius:7, padding:'5px 10px', color:'var(--purple)' }}>
                                    🌙 <b>Beli Sore Jual Pagi</b> — WR {r._intradayPattern?.stats?.beliSoreWinRate}%
                                    {p?.expectancy ? ` · expectancy +${p.expectancy}%` : ''}
                                    {p?.sampleDays ? ` · ${p.sampleDays} observasi` : ''}
                                    {gapTier && (
                                      <span style={{ marginLeft:6, fontWeight:700, color: gapTier.color, background:'rgba(255,184,77,.1)', padding:'1px 7px', borderRadius:10, fontSize:'.65rem' }}>
                                        {gapTier.label} ({g.g5}% historis)
                                      </span>
                                    )}
                                    {g && (
                                      <div style={{ marginTop:4, color:'var(--muted)', fontSize:'.67rem' }}>
                                        Gap +5% terjadi {g.g5}% dari {g.n} hari trading · Gap +10%: {g.g10}%
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Pre-ARA detail */}
                          {r._hasPreARA && r._preARA && (
                            <div style={{ fontSize:'.72rem', background:'#ff4d6a11', border:'1px solid #ff4d6a44', borderRadius:7, padding:'6px 10px', marginBottom:10, color:'#ff4d6a' }}>
                              🔮 <b>Pre-ARA {r._preARAPotential}</b> ({r._preARAScore}/99) —{' '}
                              {(r._preARA.signals || []).slice(0,2).map(s => `${s.icon || ''} ${s.label || ''}`).join(' · ')}
                            </div>
                          )}

                          <div style={{ display:'flex', gap:8, marginTop:2 }}>
                            <button onClick={() => openJarvis(r)}
                              style={{ flex:1, background:'linear-gradient(135deg,#0f0f0f,#1a1a2e)', color:'#00d4ff', border:'1px solid #00d4ff44', borderRadius:7, padding:'8px', fontSize:'.8rem', fontWeight:800, cursor:'pointer', letterSpacing:'.03em' }}>
                              🤖 JARVIS
                            </button>
                            <button onClick={() => handleDetailNav(r.Ticker, r)}
                              style={{ flex:1, background:'var(--bg2)', color:'var(--blue)', border:'1px solid var(--border)', borderRadius:7, padding:'8px', fontSize:'.8rem', fontWeight:700, cursor:'pointer' }}>
                              🔬 Detail →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filtered.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-icon">🔍</div>
                      <div className="empty-title">Tidak ada saham untuk filter ini</div>
                      <button className="btn" style={{ marginTop:'1rem' }} onClick={() => setSigFilter('semua')}>Reset Filter</button>
                    </div>
                  )}
                </div>
              )}

              <div className="warn-box" style={{ marginTop:'1.5rem' }}>
                ⚠️ Sinyal teknikal bukan jaminan profit. Selalu pasang Stop Loss dan DYOR.
              </div>
            </div>
          );
        })()}
        {/* ═══ DETAIL & AI ═══ */}
        {tab === 'detail' && (
          <div>
            <div className="search-row">
              <input
                className="search-input"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && loadDetail()}
                placeholder="BBCA"
              />
              <select className="config-select" value={period} onChange={e => setPeriod(e.target.value)}>
                {[['1mo', '1 Bulan'], ['3mo', '3 Bulan'], ['6mo', '6 Bulan'], ['1y', '1 Tahun'], ['2y', '2 Tahun']].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <button className="btn" onClick={() => loadDetail()} disabled={detailLoading}>
                {detailLoading ? '⏳ Loading…' : '📥 Analisis'}
              </button>
            </div>

            {!detailData && !detailLoading && (
              <div className="empty-state"><div className="empty-icon">🔬</div><div className="empty-title">Masukkan kode saham</div></div>
            )}
            {detailLoading && (
              <div className="empty-state">
                <div style={{ fontSize: '2rem', marginBottom: '.8rem' }}>⏳</div>
                <div className="empty-title">Mengambil data {ticker}.JK…</div>
              </div>
            )}
            {detailData?.error && (
              <div className="empty-state">
                <div className="empty-icon">❌</div>
                <div className="empty-title">Gagal mengambil data {ticker}.JK</div>
                <div style={{ fontSize: '.8rem', color: 'var(--red)', marginTop: '.4rem' }}>{detailData.error}</div>
              </div>
            )}

            {detailData && !detailData.error && (() => {
              const {
                closes, highs, lows, vols, ts, price, dd, rsiV, inf, sc, bench,
                chg, hi52, lo52, pos52, smc, signals,
                swingSignals, scalpSignals, accumSignals, intradayPattern, preARA, liquidityScore,
              } = detailData;
              const vColor = gradeColor[sc.grade];
              const rng_col = pos52 < 30 ? 'var(--green)' : pos52 < 60 ? 'var(--amber)' : 'var(--red)';
              const pbvSt = inf.pbv ? (inf.pbv < bench.pbv * .7 ? '🟢 Murah' : inf.pbv < bench.pbv * 1.2 ? '🟡 Wajar' : '🔴 Mahal') : '—';
              const perSt = inf.per ? (inf.per < bench.per * .7 ? '🟢 Murah' : inf.per < bench.per * 1.2 ? '🟡 Wajar' : '🔴 Mahal') : '—';

              const allAdvancedSignals = [
                ...(swingSignals || []),
                ...(scalpSignals || []).filter(s => s.type !== 'SCALP_NEUTRAL'),
              ];

              return (
                <>
                  {/* Banner */}
                  <div className="ticker-banner">
                    <div>
                      <div className="ticker-name">{detailData.ticker}</div>
                      <div className="ticker-fullname">{inf.name || detailData.ticker}</div>
                      <div className="ticker-sector">{inf.sector} · {inf.industry}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div className="ticker-score">
                        <div className="ticker-score-val">{sc.total}</div>
                        <div className="ticker-score-lbl">Score /100</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div className="metric-label" style={{ marginBottom: 3 }}>Verdict</div>
                        <Verdict v={sc.verdict} />
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div className="metric-label" style={{ marginBottom: 3 }}>Mkt Cap</div>
                        <div style={{ fontFamily: 'DM Mono,monospace', fontSize: '.88rem' }}>{fmtMC(inf.mc)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="ticker-price-big">{fmtRp(price)}</div>
                        <div className="ticker-chg" style={{ color: chg >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {chg != null ? (chg >= 0 ? '▲' : '▼') + ' ' + Math.abs(chg).toFixed(2) + '%' : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Signal Bar - basic signals */}
                  {signals.length > 0 && (
                    <div className="signal-bar">
                      <span style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, marginRight: 8 }}>SINYAL AKTIF:</span>
                      {signals.map((s, i) => (
                        <span key={i} className={`signal-pill ${s.type === 'BUY' ? 'signal-buy' : 'signal-sell'}`}>
                          {s.type === 'BUY' ? '▲' : '▼'} {s.source}: {s.label}
                          <span className="signal-strength">{s.strength}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Advanced signals bar */}
                  {allAdvancedSignals.length > 0 && (
                    <div className="signal-bar" style={{ marginTop: '-0.5rem' }}>
                      <span style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, marginRight: 8 }}>SWING/SCALP:</span>
                      {allAdvancedSignals.slice(0, 4).map((s, i) => {
                        const bst = getBacktestStats(s.reason, detailData.ticker, s.signalName);
                        const wrC = !bst ? null : bst.winRate>=55?'#00e5a0':bst.winRate>=45?'#ffb84d':'#ff4d6a';
                        return (
                        <span key={i} className={`signal-pill ${s.type.includes('BUY') ? 'signal-buy' : 'signal-sell'}`}>
                          {s.type.includes('BUY') ? '▲' : '▼'} {s.reason}
                          {bst && <span style={{ marginLeft:4, fontWeight:700, color:wrC, fontSize:'.65rem' }}>WR {bst.winRate}%</span>}
                          <span className="signal-strength">{s.strength}%</span>
                        </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Accumulation signals */}
                  {accumSignals && accumSignals.length > 0 && (
                    <div className="signal-bar" style={{ marginTop: '-0.5rem' }}>
                      <span style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, marginRight: 8 }}>AKUMULASI:</span>
                      {accumSignals.map((s, i) => {
                        const bst = getBacktestStats(s.reason, detailData.ticker, s.signalName);
                        const wrC = !bst ? null : bst.winRate>=55?'#00e5a0':bst.winRate>=45?'#ffb84d':'#ff4d6a';
                        return (
                        <span key={i} className="signal-pill" style={{ background: 'rgba(167,139,250,.15)', color: 'var(--purple)', border: '1px solid rgba(167,139,250,.3)' }}>
                          📈 {s.reason} <span className="signal-strength">{s.strength.toFixed(0)}%</span>
                          {bst && <span style={{ marginLeft:4, fontWeight:700, color:wrC, fontSize:'.65rem' }}>WR {bst.winRate}%{bst._tickerSpecific?' ★':''}</span>}
                        </span>
                        );
                      })}
                      {liquidityScore && (
                        <span className="signal-pill" style={{
                          background: liquidityScore.tradeable ? 'rgba(0,229,160,.1)' : 'rgba(255,184,77,.1)',
                          color: liquidityScore.tradeable ? 'var(--green)' : 'var(--amber)',
                          border: `1px solid ${liquidityScore.tradeable ? 'rgba(0,229,160,.3)' : 'rgba(255,184,77,.3)'}`,
                        }}>
                          💧 Likuiditas: {liquidityScore.score}/100
                        </span>
                      )}
                    </div>
                  )}

                  {/* PRE-ARA: Prediksi Lonjakan Besar */}
                  {preARA && (
                    <div style={{
                      margin: '0.5rem 0',
                      padding: '0.9rem 1rem',
                      background: `${preARA.potentialColor}10`,
                      borderRadius: 10,
                      border: `1px solid ${preARA.potentialColor}44`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: '1.1rem' }}>🔮</span>
                        <span style={{ fontWeight: 700, color: preARA.potentialColor, fontSize: '.88rem' }}>
                          POTENSI LONJAKAN — {preARA.potential}
                        </span>
                        <span style={{
                          marginLeft: 'auto',
                          fontFamily: 'DM Mono,monospace',
                          fontSize: '.85rem',
                          fontWeight: 700,
                          color: preARA.potentialColor,
                        }}>
                          {preARA.finalScore}/99
                        </span>
                      </div>
                      <div style={{ fontSize: '.75rem', color: 'var(--text2)', marginBottom: 10 }}>
                        {preARA.potentialDesc}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {preARA.signals.map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: '.85rem', minWidth: 20 }}>{s.icon}</span>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text)' }}>{s.label}</span>
                              <span style={{ fontSize: '.72rem', color: 'var(--muted)', marginLeft: 8 }}>{s.detail}</span>
                            </div>
                            {s.signalName && (
                              <DistributionTriggerBtn
                                signalKey={s.signalName}
                                ticker={detailData.ticker}
                                backtestData={(TICKER_SIGNAL_STATS[detailData.ticker] || {})[s.signalName]}
                                onClick={() => setDistSignal({ signal: s.signalName, ticker: detailData.ticker })}
                              />
                            )}
                            <span style={{
                              fontSize: '.68rem', fontWeight: 700,
                              color: s.score >= 20 ? preARA.potentialColor : 'var(--muted)',
                              minWidth: 28, textAlign: 'right',
                            }}>+{s.score}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, fontSize: '.68rem', color: 'var(--muted)', borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 6 }}>
                        ⚠️ Ini adalah sinyal probabilistik berbasis data historis — bukan jaminan. Selalu gunakan stop loss.
                      </div>
                    </div>
                  )}

                  {/* Intraday Pattern: Beli Pagi/Jual Sore & Beli Sore/Jual Pagi */}
                  {intradayPattern && intradayPattern.patterns.length > 0 && (
                    <div style={{ margin: '0.5rem 0', padding: '0.75rem 1rem', background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,.07)' }}>
                      <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                        ⏰ POLA INTRADAY — DATA {intradayPattern.stats?.sample || 60} HARI
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {intradayPattern.patterns.map((p, i) => (
                          <div key={i} style={{ flex: '1 1 260px', padding: '0.6rem 0.9rem', background: 'rgba(255,255,255,.04)', borderRadius: 8, border: `1px solid ${p.color}44` }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: 4 }}>
                              <div style={{ fontWeight: 700, color: p.color, fontSize: '.85rem', flex: 1 }}>{p.label}</div>
                              {p.signalName && (
                                <DistributionTriggerBtn
                                  signalKey={p.signalName}
                                  ticker={detailData.ticker}
                                  backtestData={(TICKER_SIGNAL_STATS[detailData.ticker] || {})[p.signalName]}
                                  onClick={() => setDistSignal({ signal: p.signalName, ticker: detailData.ticker })}
                                />
                              )}
                            </div>
                            <div style={{ fontSize: '.75rem', color: 'var(--text2)', marginBottom: 6 }}>{p.reason}</div>
                            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginBottom: 6 }}>🕐 {p.timing}</div>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap:'wrap' }}>
                              <span style={{ fontSize: '.72rem' }}>Win Rate (live, 60hr): <b style={{ color: p.color }}>{p.winRate}%</b></span>
                              <span style={{ fontSize: '.72rem' }}>Avg Gain: <b style={{ color: 'var(--green)' }}>+{p.avgGain}%</b></span>
                              <span style={{ fontSize: '.72rem' }}>Avg Loss: <b style={{ color: 'var(--red)' }}>-{p.avgLoss}%</b></span>
                              <span style={{ fontSize: '.72rem' }}>Expectancy: <b style={{ color: p.color }}>+{p.expectancy}%</b></span>
                            </div>
                            {/* FIX: tampilkan juga angka historis dari TICKER_SIGNAL_STATS (sumber
                                yang sama dipakai tombol Distribusi) supaya kelihatan jelas kalau
                                Win Rate di atas itu cuma snapshot live 60 hari terakhir, bukan
                                backtest jangka panjang — dua angka ini WAJAR beda dan sengaja
                                dipisah biar gak disangka bug lagi. */}
                            {(() => {
                              const hist = p.signalName ? (TICKER_SIGNAL_STATS[detailData.ticker] || {})[p.signalName] : null;
                              if (!hist) return (
                                <div style={{ marginTop:5, fontSize:'.68rem', color:'var(--muted)' }}>
                                  📊 Belum ada data backtest historis untuk {detailData.ticker} pada sinyal ini.
                                </div>
                              );
                              return (
                                <div style={{ marginTop:5, fontSize:'.68rem', color:'var(--muted)' }}>
                                  📊 Backtest historis ({hist.n} trade, horizon terbaik {hist.best}): WR <b style={{ color: hist.wr >= 50 ? 'var(--green)' : 'var(--red)' }}>{hist.wr}%</b>, avg return <b style={{ color: hist.avg >= 0 ? 'var(--green)' : 'var(--red)' }}>{hist.avg >= 0 ? '+' : ''}{hist.avg}%</b>
                                </div>
                              );
                            })()}
                            <div style={{ marginTop:5, fontSize:'.68rem', color:'var(--muted)' }}>
                              Sample: {p.sampleDays} observasi · Kekuatan: <b style={{ color: p.color }}>{p.strength}/100</b>
                            </div>
                          </div>
                        ))}
                      </div>
                      {intradayPattern.dominant && (
                        <div style={{ marginTop: 8, fontSize: '.72rem', color: 'var(--muted)' }}>
                          ✅ Pola dominan: <b style={{ color: intradayPattern.dominant.color }}>{intradayPattern.dominant.label}</b>
                          {' '}— expectancy terbaik +{intradayPattern.dominant.expectancy}%
                        </div>
                      )}
                    </div>
                  )}
                  {intradayPattern && intradayPattern.patterns.length === 0 && (
                    <div style={{ margin: '0.3rem 0', padding: '0.5rem 1rem', background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,.05)', fontSize: '.72rem', color: 'var(--muted)' }}>
                      ⏰ Pola intraday tidak konsisten — {intradayPattern.stats.beliPagiWinRate}% bullish candle, {intradayPattern.stats.gapUpCount} gap up dari {intradayPattern.stats.sample} hari. Threshold: WR ≥ 60% dan expectancy ≥ 0.25% — belum terpenuhi.
                    </div>
                  )}

                  {/* Signal Notes — TP/SL/RR cards */}
                  {(swingSignals?.length > 0 || scalpSignals?.length > 0 || accumSignals?.length > 0) && (
                    <div style={{ margin: '0.5rem 0' }}>
                      <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>
                        📋 RENCANA TRADING
                      </div>
                      <SignalNote signals={swingSignals} type="swing" ticker={detailData.ticker} ddPct={dd} onDistSignal={setDistSignal} />
                      <SignalNote signals={scalpSignals} type="scalp" ticker={detailData.ticker} ddPct={dd} onDistSignal={setDistSignal} />
                      <SignalNote signals={accumSignals} type="accum" ticker={detailData.ticker} ddPct={dd} onDistSignal={setDistSignal} />
                    </div>
                  )}

                  {/* Sub Tabs */}
                  <div className="sub-tabs">
                    {[
                      ['overview', '📊 Overview'],
                      ['smc', '🏦 Smart Money'],
                      ['ai', '🤖 AI Analysis'],
                      ['news', '📰 Berita'],
                    ].map(([id, label]) => (
                      <button key={id} className={`sub-tab-btn ${detailSubTab === id ? 'active' : ''}`} onClick={() => setDetailSubTab(id)}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ── Overview ── */}
                  {detailSubTab === 'overview' && (
                    <>
                      {/* Gap hari ini — tampil kalau ada gap signifikan */}
                      {detailData.todayGap && !detailData.todayGap.isFlat && !detailData.todayGap.stale && (
                        <div style={{
                          padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                          background: detailData.todayGap.isGapUp ? 'rgba(255,184,77,.08)' : 'rgba(0,229,160,.08)',
                          border: `1px solid ${detailData.todayGap.isGapUp ? 'rgba(255,184,77,.3)' : 'rgba(0,229,160,.3)'}`,
                          display: 'flex', flexDirection: 'column', gap: 4,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '.85rem', color: detailData.todayGap.isGapUp ? '#ffb84d' : '#00e5a0' }}>
                              {detailData.todayGap.label}
                            </span>
                            <span style={{ fontSize: '.75rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
                              Close kemarin Rp{Math.round(detailData.todayGap.prevClose).toLocaleString('id')}
                              {' → '}
                              Open pagi Rp{Math.round(detailData.todayGap.todayOpen).toLocaleString('id')}
                            </span>
                            <span style={{
                              fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                              background: detailData.todayGap.level === 'besar' ? 'rgba(255,77,106,.15)' : 'rgba(255,255,255,.07)',
                              color: detailData.todayGap.level === 'besar' ? '#ff4d6a' : 'var(--muted)',
                            }}>
                              {detailData.todayGap.level?.toUpperCase()}
                            </span>
                          </div>
                          {detailData.todayGap.action && (
                            <div style={{ fontSize: '.78rem', color: 'var(--text)' }}>
                              {detailData.todayGap.action}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="metrics-grid">
                        <MetricCard label="PBV" value={inf.pbv ? fmt(inf.pbv) + 'x' : '—'} delta={inf.pbv ? 'Bench ' + bench.pbv + 'x' : null} deltaType={inf.pbv && inf.pbv < bench.pbv ? 'pos' : 'neg'} />
                        <MetricCard label="PER" value={inf.per ? fmt(inf.per, 1) + 'x' : '—'} delta={inf.per ? 'Bench ' + bench.per + 'x' : null} deltaType={inf.per && inf.per < bench.per ? 'pos' : 'neg'} />
                        <MetricCard label="RSI (14)" value={<span style={{ color: rsiV < 30 ? 'var(--green)' : rsiV > 70 ? 'var(--red)' : 'var(--text)' }}>{rsiV.toFixed(1)}</span>} delta={rsiV < 30 ? 'Oversold ⚡' : rsiV > 70 ? 'Overbought ⚠️' : 'Normal ✓'} deltaType={rsiV < 30 ? 'pos' : rsiV > 70 ? 'neg' : 'neu'} />
                        <MetricCard label="Drawdown ATH" value={<span className="td-red">-{dd.toFixed(1)}%</span>} delta={'ATH ' + fmtRp(Math.max(...(highs || [])))} deltaType="neu" />
                        <MetricCard label="ROE" value={inf.roe ? fmtPct(inf.roe) : '—'} delta={inf.roe ? (inf.roe > .15 ? 'Baik ✓' : 'Lemah ⚠️') : null} deltaType={inf.roe && inf.roe > .15 ? 'pos' : 'neg'} />
                        <MetricCard label="Div. Yield" value={inf.dyield ? (inf.dyield * 100).toFixed(2) + '%' : '—'} delta={inf.dyield && inf.dyield > .03 ? 'Defensif ✓' : null} deltaType="pos" />
                      </div>
                      <div className="metrics-grid" style={{ marginBottom: '1rem' }}>
                        <MetricCard label="D/E Ratio" value={inf.der != null ? fmt(inf.der) : '—'} delta={inf.der != null ? (inf.der < .5 ? 'Rendah ✓' : inf.der > 2 ? 'Tinggi ⚠️' : 'Moderat') : null} deltaType={inf.der != null ? (inf.der < .5 ? 'pos' : inf.der > 2 ? 'neg' : 'neu') : 'neu'} />
                        <MetricCard label="EPS TTM" value={inf.eps ? 'Rp ' + fmt(inf.eps, 0) : '—'} />
                        <MetricCard label="Target Analis" value={inf.targetMean ? fmtRp(inf.targetMean) : '—'} delta={inf.targetMean && price ? (((inf.targetMean - price) / price * 100).toFixed(1) + '% upside') : null} deltaType="pos" />
                        <MetricCard label="52w High" value={fmtRp(hi52)} />
                        <MetricCard label="Beta" value={inf.beta ? fmt(inf.beta) : '—'} delta={inf.beta ? (inf.beta > 1.5 ? 'Volatil ⚠️' : inf.beta < .8 ? 'Stabil ✓' : 'Normal') : null} deltaType={inf.beta ? (inf.beta > 1.5 ? 'neg' : 'pos') : 'neu'} />
                        <MetricCard label="Upside ATH" value={<span className="td-green">+{dd.toFixed(1)}%</span>} />
                      </div>

                      <div className="sec-hdr"><div className="sec-hdr-title">🎯 Investment Score</div></div>
                      <div className="score-section">
                        <div className="score-big">
                          <div className="score-num" style={{ color: vColor }}>{sc.total}</div>
                          <div className="score-denom">dari 100</div>
                          <div className="score-grade">Grade {sc.grade}</div>
                          <Verdict v={sc.verdict} />
                        </div>
                        <div className="card">
                          <div className="card-title" style={{ marginBottom: '.6rem', fontSize: '.8rem' }}>Breakdown</div>
                          <ScoreBreakdown bd={sc.breakdown} />
                        </div>
                        <div className="card">
                          <div style={{ display: 'flex', gap: '1rem', marginBottom: '.8rem' }}>
                            {[
                              ['PBV vs Sektor', pbvSt, inf.pbv ? fmt(inf.pbv) + 'x vs ' + bench.pbv + 'x' : '-'],
                              ['PER vs Sektor', perSt, inf.per ? fmt(inf.per, 1) + 'x vs ' + bench.per + 'x' : '-'],
                            ].map(([title, status, sub]) => (
                              <div key={title} style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '.6rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '.63rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{title}</div>
                                <div style={{ fontWeight: 700, fontSize: '.82rem' }}>{status}</div>
                                <div style={{ fontFamily: 'DM Mono,monospace', fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: '.77rem', color: 'var(--text2)', lineHeight: 1.7 }}>
                            <b>Sektor:</b> {inf.sector}<br /><b>Industri:</b> {inf.industry}<br />
                            {inf.biz ? inf.biz.substring(0, 220) + '…' : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="sec-hdr"><div className="sec-hdr-title">📈 Grafik Harga</div></div>
                      <div className="chart-box">
                        <div className="chart-opts">
                          <button className={`chart-opt-btn ${showBB ? 'on' : ''}`} onClick={() => setShowBB(v => !v)}>Bollinger</button>
                          <button className={`chart-opt-btn ${showMA50 ? 'on' : ''}`} onClick={() => setShowMA50(v => !v)}>MA50</button>
                          <div className="period-btns">
                            {[['1mo', '1B'], ['3mo', '3B'], ['6mo', '6B'], ['1y', '1T'], ['2y', '2T']].map(([v, l]) => (
                              <button key={v} className={`period-btn ${period === v ? 'on' : ''}`} onClick={() => { setPeriod(v); loadDetail(ticker, null, v); }}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <PriceChart closes={closes} dates={ts} highs={highs} lows={lows} vols={vols} showBB={showBB} showMA50={showMA50} />
                        <div style={{ marginTop: '.6rem' }}>
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 4 }}>RSI (14)</div>
                          <RSIChart closes={closes} />
                        </div>
                      </div>

                      <div className="range-bar-wrap">
                        <div className="range-bar-labels">
                          <span>52w Low: {fmtRp(lo52)}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text2)' }}>Posisi: {pos52.toFixed(0)}% dari range 52w</span>
                          <span>52w High: {fmtRp(hi52)}</span>
                        </div>
                        <div className="range-track">
                          <div className="range-fill" style={{ width: pos52.toFixed(1) + '%', background: rng_col }} />
                          <div className="range-marker" style={{ left: pos52.toFixed(1) + '%' }} />
                        </div>
                      </div>

                      <div className="sec-hdr"><div className="sec-hdr-title">📊 Fundamental</div></div>
                      <div className="funda-table">
                        <div className="funda-card">
                          {[
                            ['PBV', inf.pbv ? fmt(inf.pbv) + 'x' : '—', bench.pbv + 'x'],
                            ['PER', inf.per ? fmt(inf.per, 1) + 'x' : '—', bench.per + 'x'],
                            ['ROE', fmtPct(inf.roe), '>15%'],
                            ['ROA', fmtPct(inf.roa), '>5%'],
                            ['Gross Margin', fmtPct(inf.gm), '—'],
                            ['Op. Margin', fmtPct(inf.om), '—'],
                          ].map(([k, v, b]) => (
                            <div key={k} className="funda-row">
                              <div><div className="funda-key">{k}</div><div className="funda-bench">{b}</div></div>
                              <div className="funda-val">{v}</div>
                            </div>
                          ))}
                        </div>
                        <div className="funda-card">
                          {[
                            ['D/E Ratio', inf.der != null ? fmt(inf.der) : '—', '<0.5'],
                            ['EPS TTM', inf.eps ? 'Rp ' + fmt(inf.eps, 0) : '—', '—'],
                            ['Revenue TTM', inf.rev ? 'Rp ' + (inf.rev / 1e12).toFixed(2) + 'T' : '—', '—'],
                            ['Beta', inf.beta ? fmt(inf.beta) : '—', '<1.5'],
                            ['Div. Yield', inf.dyield ? (inf.dyield * 100).toFixed(2) + '%' : '—', '—'],
                            ['Target Analis', inf.targetMean ? fmtRp(inf.targetMean) : '—', inf.analystCount ? inf.analystCount + ' analis' : '—'],
                          ].map(([k, v, b]) => (
                            <div key={k} className="funda-row">
                              <div><div className="funda-key">{k}</div><div className="funda-bench">{b}</div></div>
                              <div className="funda-val">{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── SMART MONEY CONCEPT ── */}
                  {detailSubTab === 'smc' && (
                    <div>
                      <div className="sec-hdr"><div className="sec-hdr-title">🏦 Smart Money Concept</div></div>

                      {/* ── Bias Card ── */}
                      <div className="smc-bias-card" style={{
                        background: smc.bias === 'BULLISH' ? 'rgba(0,229,160,0.08)' : smc.bias === 'BEARISH' ? 'rgba(255,77,106,0.08)' : 'rgba(77,159,255,0.08)',
                        borderColor: smc.bias === 'BULLISH' ? 'rgba(0,229,160,0.3)' : smc.bias === 'BEARISH' ? 'rgba(255,77,106,0.3)' : 'rgba(77,159,255,0.3)',
                      }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>
                          {smc.bias === 'BULLISH' ? '📈' : smc.bias === 'BEARISH' ? '📉' : '⚖️'}
                        </div>
                        <div style={{
                          fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: '1.1rem',
                          color: smc.bias === 'BULLISH' ? 'var(--green)' : smc.bias === 'BEARISH' ? 'var(--red)' : 'var(--blue)',
                        }}>
                          Arah Pasar: {smc.bias === 'BULLISH' ? 'Naik (Bullish)' : smc.bias === 'BEARISH' ? 'Turun (Bearish)' : 'Sideways (Netral)'}
                        </div>
                        <div style={{ fontSize: '.82rem', color: 'var(--text2)', marginTop: 6, lineHeight: 1.6 }}>
                          {smc.bias === 'BULLISH'
                            ? 'Institusi besar cenderung sedang membeli. Harga berpotensi naik.'
                            : smc.bias === 'BEARISH'
                            ? 'Institusi besar cenderung sedang menjual. Harga berpotensi turun.'
                            : 'Belum ada arah yang jelas. Lebih baik tunggu konfirmasi dulu.'}
                        </div>
                        {(smc.bos || smc.choch) && (
                          <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 6 }}>
                            {smc.bos && <span style={{ marginRight: 10 }}>📌 {smc.bos.label}</span>}
                            {smc.choch && <span>🔄 {smc.choch.label}</span>}
                          </div>
                        )}
                      </div>

                      {/* ── Penjelasan singkat BOS/CHoCH ── */}
                      {(smc.bos || smc.choch) && (
                        <div className="info-box" style={{ marginTop: '1rem', fontSize: '.8rem', lineHeight: 1.8 }}>
                          {smc.bos && (
                            <div>📌 <b>Break of Structure (BOS)</b> — Harga berhasil menembus level penting sebelumnya.
                              {smc.bos.label?.includes('BULL')
                                ? ' Ini sinyal tren naik sedang terbentuk.'
                                : ' Ini sinyal tren turun sedang terbentuk.'}
                            </div>
                          )}
                          {smc.choch && (
                            <div style={{ marginTop: smc.bos ? 4 : 0 }}>🔄 <b>Change of Character (CHoCH)</b> — Ada tanda-tanda arah pasar mulai berbalik.
                              Belum pasti, tapi patut diperhatikan sebagai sinyal awal.
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>

                        {/* ── Order Blocks ── */}
                        <div className="card">
                          <div className="card-title" style={{ marginBottom: '.4rem' }}>📦 Zona Order Block (OB)</div>
                          <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginBottom: '.7rem', lineHeight: 1.5 }}>
                            Zona harga di mana institusi besar (bank, fund) pernah masuk dalam jumlah besar. Harga sering kembali ke zona ini sebelum melanjutkan tren.
                          </div>
                          {smc.obs.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Tidak ada zona OB terdeteksi saat ini.</div>}
                          {smc.obs.slice().reverse().map((ob, i) => {
                            const isBull = ob.type.includes('BULL');
                            const distPct = ((closes[closes.length - 1] - ob.price) / ob.price * 100);
                            const isNear = Math.abs(distPct) < 5;
                            return (
                              <div key={i} className="smc-item" style={{ borderColor: isBull ? 'rgba(0,229,160,.3)' : 'rgba(255,77,106,.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span className={`smc-tag ${isBull ? 'smc-bull' : 'smc-bear'}`}>
                                    {isBull ? '🟢 Zona Beli OB' : '🔴 Zona Jual OB'}
                                  </span>
                                  {isNear && <span style={{ fontSize: '.68rem', color: 'var(--amber)', fontWeight: 700 }}>⚡ Dekat!</span>}
                                </div>
                                <div style={{ fontSize: '.75rem', color: 'var(--text2)', marginTop: 4, fontFamily: 'DM Mono,monospace' }}>
                                  {fmtRp(ob.low)} — {fmtRp(ob.high)}
                                </div>
                                <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
                                  {isNear
                                    ? (isBull ? '✅ Harga mendekati zona support institusi — potensi pantul naik' : '⚠️ Harga mendekati zona resistance institusi — waspadai tekanan jual')
                                    : `${distPct > 0 ? '+' : ''}${distPct.toFixed(1)}% dari harga sekarang`}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div>
                          {/* ── FVG ── */}
                          <div className="card" style={{ marginBottom: '1rem' }}>
                            <div className="card-title" style={{ marginBottom: '.4rem' }}>🕳️ Gap Harga (Fair Value Gap)</div>
                            <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginBottom: '.7rem', lineHeight: 1.5 }}>
                              Area harga yang "terlewat" karena pergerakan terlalu cepat. Harga biasanya kembali mengisi gap ini sebelum melanjutkan arah.
                            </div>
                            {smc.fvgs.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Tidak ada gap terdeteksi saat ini.</div>}
                            {smc.fvgs.slice().reverse().slice(0, 3).map((fvg, i) => {
                              const isBull = fvg.type.includes('BULL');
                              const midFvg = (fvg.top + fvg.bottom) / 2;
                              const distPct = ((closes[closes.length - 1] - midFvg) / midFvg * 100);
                              return (
                                <div key={i} className="smc-item" style={{ borderColor: isBull ? 'rgba(0,229,160,.3)' : 'rgba(255,77,106,.3)' }}>
                                  <span className={`smc-tag ${isBull ? 'smc-bull' : 'smc-bear'}`}>
                                    {isBull ? '🟢 Gap Bullish' : '🔴 Gap Bearish'}
                                  </span>
                                  <div style={{ fontSize: '.75rem', color: 'var(--text2)', marginTop: 4, fontFamily: 'DM Mono,monospace' }}>
                                    {fmtRp(fvg.bottom)} — {fmtRp(fvg.top)}
                                  </div>
                                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
                                    {isBull
                                      ? 'Gap ke atas — bisa jadi support jika harga turun ke sini'
                                      : 'Gap ke bawah — bisa jadi resistance jika harga naik ke sini'}
                                    {Math.abs(distPct) < 8 && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>⚡ Dekat ({distPct > 0 ? '+' : ''}{distPct.toFixed(1)}%)</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* ── Key Levels ── */}
                          <div className="card">
                            <div className="card-title" style={{ marginBottom: '.4rem' }}>📍 Level Harga Penting</div>
                            <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginBottom: '.7rem', lineHeight: 1.5 }}>
                              Level support (batas bawah) dan resistance (batas atas) berdasarkan pergerakan historis.
                            </div>
                            {smc.keyLevels.map((lvl, i) => (
                              <div key={i} className="funda-row">
                                <div className="funda-key" style={{ fontSize: '.78rem' }}>
                                  {lvl.type === 'res' ? '🔴' : '🟢'} {lvl.label}
                                </div>
                                <div className={`funda-val ${lvl.type === 'res' ? 'td-red' : 'td-green'}`} style={{ fontFamily: 'DM Mono,monospace', fontSize: '.78rem' }}>
                                  {fmtRp(lvl.price)}
                                </div>
                              </div>
                            ))}
                            <div className="funda-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
                              <div className="funda-key" style={{ fontSize: '.78rem', fontWeight: 700 }}>Harga Sekarang</div>
                              <div className="funda-val" style={{ fontFamily: 'DM Mono,monospace', fontSize: '.78rem', color: 'var(--text)' }}>{fmtRp(price)}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Panduan Cara Baca ── */}
                      <div style={{ marginTop: '1rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '.8rem', color: 'var(--text2)', marginBottom: '.6rem' }}>📚 Cara Membaca Analisis Ini</div>
                        <div style={{ fontSize: '.77rem', color: 'var(--muted)', lineHeight: 1.9 }}>
                          <div>🟢 <b>Zona Beli OB</b> — Kalau harga turun mendekati zona ini, institusi besar cenderung mulai beli lagi. Bisa jadi peluang beli dengan risiko terukur.</div>
                          <div>🔴 <b>Zona Jual OB</b> — Kalau harga naik mendekati zona ini, institusi cenderung jual. Waspadai tekanan balik.</div>
                          <div>🕳️ <b>Gap Harga (FVG)</b> — Harga yang bergerak terlalu cepat sering "kembali" mengisi gap ini. Bisa jadi target harga berikutnya.</div>
                          <div>📌 <b>BOS (Break of Structure)</b> — Konfirmasi tren. Bullish BOS = tren naik terkonfirmasi. Bearish BOS = tren turun terkonfirmasi.</div>
                          <div>🔄 <b>CHoCH (Change of Character)</b> — Tanda awal tren mau berbalik arah. Belum konfirmasi, tapi layak diwaspadai.</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── AI ANALYSIS ── */}
                  {detailSubTab === 'ai' && (
                    <div>
                      <div className="sec-hdr"><div className="sec-hdr-title">🤖 Analisis AI Mendalam</div></div>

                      {/* Signal notes ringkas di atas AI output */}
                      {(swingSignals?.length > 0 || scalpSignals?.length > 0) && (
                        <div style={{ marginBottom: '1rem' }}>
                          <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>
                            📋 SINYAL AKTIF — KONTEKS UNTUK AI
                          </div>
                          <SignalNote signals={swingSignals} type="swing" ticker={detailData.ticker} ddPct={dd} onDistSignal={setDistSignal} />
                          <SignalNote signals={scalpSignals} type="scalp" ticker={detailData.ticker} ddPct={dd} onDistSignal={setDistSignal} />
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
                        <button className="btn btn-green" onClick={runAI} disabled={aiLoading}>
                          {aiLoading ? '⏳ Analyzing…' : '▶ Generate Analisis AI'}
                        </button>
                        <div style={{ fontSize: '.77rem', color: 'var(--muted)' }}>
                          Analisis mencakup fundamental, teknikal, SMC, dan berita terkini
                        </div>
                      </div>
                      <div className="ai-output" style={{ minHeight: 200 }}>
                        {aiText
                          ? renderAI(aiText)
                          : <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                            Klik ▶ Generate untuk analisis AI komprehensif.<br /><br />
                            Analisis akan mencakup: Diagnosis, Risiko, Katalis, SMC Insight, Valuasi, dan Rekomendasi.
                          </span>
                        }
                      </div>
                    </div>
                  )}

                  {/* ── NEWS ── */}
                  {detailSubTab === 'news' && (
                    <div>
                      <div className="sec-hdr"><div className="sec-hdr-title">📰 Berita Terkini</div></div>
                      {newsItems.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Mengambil berita…</div>}
                      {newsItems.map((n, i) => (
                        <div key={i} className="news-item">
                          <div className="news-title">{n.title}</div>
                          <div className="news-meta">📅 {n.date} · {n.source}</div>
                          <a className="news-link" href={n.link} target="_blank" rel="noreferrer">→ Baca selengkapnya</a>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ═══ CHATBOT ═══ */}
        {tab === 'chatbot' && (
          <div>
            {!groqKey && <div className="warn-box" style={{ marginBottom: '1rem' }}>⚠️ Masukkan Groq API Key di panel atas.</div>}
            <JarvisChat
              groqKey={groqKey}
              groqModel={groqModel}
              screenerRows={screenerRows}
              detailData={detailData}
              newsItems={newsItems}
            />
          </div>
        )}

        {/* ═══ COMPARE ═══ */}
        {tab === 'compare' && (
          <div>
            <div className="search-row">
              <input
                className="search-input"
                value={cmpInput}
                onChange={e => setCmpInput(e.target.value.toUpperCase())}
                placeholder="BBCA, BBRI, BMRI, BBNI"
              />
              <button className="btn" onClick={runCompare} disabled={cmpLoading}>
                {cmpLoading ? '⏳ Loading…' : '🔄 Bandingkan'}
              </button>
            </div>
            {!cmpRows.length && !cmpLoading && (
              <div className="empty-state">
                <div className="empty-icon">⚖️</div>
                <div className="empty-title">Bandingkan hingga 5 saham</div>
              </div>
            )}
            {cmpRows.length > 0 && (
              <>
                <div className="table-wrap" style={{ marginBottom: '1.2rem' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Ticker</th><th>Nama</th><th>Harga</th><th>PBV</th><th>PER</th>
                        <th>RSI</th><th>ROE%</th><th>D/E</th><th>DD%</th><th>Score</th>
                        <th>Sinyal</th><th>Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmpRows.map(r => (
                        <tr key={r.sym}>
                          <td className="td-ticker">{r.sym}</td>
                          <td style={{ fontSize: '.77rem' }}>{r.name?.substring(0, 22) || '—'}</td>
                          <td className="td-mono">{fmtRp(r.price)}</td>
                          <td className={`td-mono ${r.pbv && r.pbv < 1 ? 'td-green' : ''}`}>{r.pbv ? fmt(r.pbv) : '—'}</td>
                          <td className="td-mono">{r.per ? fmt(r.per, 1) : '—'}</td>
                          <td className={`td-mono ${r.rsiV < 30 ? 'td-green' : r.rsiV > 70 ? 'td-red' : ''}`}>{r.rsiV.toFixed(1)}</td>
                          <td className={`td-mono ${r.roe && r.roe > .15 ? 'td-green' : ''}`}>{r.roe ? fmtPct(r.roe) : '—'}</td>
                          <td className="td-mono">{r.der != null ? fmt(r.der) : '—'}</td>
                          <td className="td-mono td-red">-{r.dd.toFixed(1)}%</td>
                          <td className="td-mono" style={{ fontWeight: 700, color: gradeColor[r.sc.grade] }}>{r.sc.total}</td>
                          <td style={{ fontSize: '.7rem' }}>
                            {r.signals.slice(0, 2).map((s, i) => (
                              <span key={i} style={{ display: 'block', color: s.type === 'BUY' ? 'var(--green)' : 'var(--red)' }}>
                                {s.type === 'BUY' ? '▲' : '▼'} {s.source}
                              </span>
                            ))}
                            {r.signals.length === 0 && <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                          <td><Verdict v={r.sc.verdict} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="sec-hdr"><div className="sec-hdr-title">📈 Performa Relatif (Base = 100)</div></div>
                <div className="chart-box"><RelativeChart rows={cmpRows} /></div>
              </>
            )}
          </div>
        )}

        {/* ═══ DEMO ACCOUNT ═══ */}
        {tab === 'demo' && (() => {
          const holdingsKeys = Object.keys(demoAcc.holdings).filter(k => demoAcc.holdings[k].lots > 0);
          const portVal = holdingsKeys.reduce((s, k) => s + (demoAcc.holdings[k].lastPrice || demoAcc.holdings[k].avgPrice) * demoAcc.holdings[k].lots * 100, 0);
          const costBasis = holdingsKeys.reduce((s, k) => s + demoAcc.holdings[k].avgPrice * demoAcc.holdings[k].lots * 100, 0);
          const unrealPnl = portVal - costBasis;
          const totalAset = demoAcc.cash + portVal;

          return (
            <div>
              {/* Stats + refresh button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                  {demoRefreshing ? '⏳ Mengambil harga terbaru…' : demoLastRefresh ? `🕐 Update terakhir: ${demoLastRefresh}` : ''}
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => demoRefreshPrices()} disabled={demoRefreshing} style={{ fontSize: '.75rem' }}>
                  {demoRefreshing ? '⏳' : '🔄'} Refresh Harga
                </button>
              </div>
              <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '1.2rem' }}>
                {[
                  ['💰 Saldo Tunai', fmtRp(demoAcc.cash), 'var(--text)'],
                  ['📦 Nilai Portofolio', fmtRp(portVal), 'var(--blue)'],
                  ['🏦 Total Aset', fmtRp(totalAset), 'var(--amber)'],
                  ['📊 Unrealized P/L', (unrealPnl >= 0 ? '+' : '') + fmtRp(unrealPnl), unrealPnl >= 0 ? 'var(--green)' : 'var(--red)'],
                ].map(([label, val, col]) => (
                  <div key={label} className="sum-card">
                    <div className="sum-num" style={{ color: col, fontSize: '1.1rem' }}>{val}</div>
                    <div className="sum-label">{label}</div>
                  </div>
                ))}
              </div>

              {/* Sub-tabs */}
              <div className="tabs" style={{ marginBottom: '1rem' }}>
                {[['trade','💹 Trading'],['port','📋 Portofolio'],['hist','📜 Riwayat'],['modal','💳 Modal']].map(([id, label]) => (
                  <button key={id} className={`tab-btn ${demoSubTab === id ? 'active' : ''}`} onClick={() => { setDemoSubTab(id); setDemoMsg(null); }}>{label}</button>
                ))}
              </div>

              {/* Notification */}
              {demoMsg && (
                <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: '1rem', fontSize: '.82rem', fontWeight: 500, background: demoMsg.type === 'ok' ? 'rgba(0,229,160,.12)' : 'rgba(255,77,106,.12)', color: demoMsg.type === 'ok' ? 'var(--green)' : 'var(--red)', border: `1px solid ${demoMsg.type === 'ok' ? 'rgba(0,229,160,.3)' : 'rgba(255,77,106,.3)'}` }}>
                  {demoMsg.type === 'ok' ? '✅ ' : '❌ '}{demoMsg.text}
                </div>
              )}

              {/* ── TRADING ── */}
              {demoSubTab === 'trade' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="card">
                    <div className="sec-hdr"><div className="sec-hdr-title">🔍 Cek Harga Real-time</div></div>
                    <div className="search-row" style={{ marginBottom: '0.8rem' }}>
                      <input className="search-input" value={demoTicker} onChange={e => setDemoTicker(e.target.value.toUpperCase())} placeholder="Kode saham, cth: BBCA" onKeyDown={e => e.key === 'Enter' && demoLookup()} />
                      <button className="btn" onClick={() => demoLookup()} disabled={demoLookupLoading}>{demoLookupLoading ? '⏳' : '🔍 Cek'}</button>
                    </div>
                    {/* Quick picks */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
                      {['BBCA','BBRI','BMRI','TLKM','GOTO','ASII','UNVR','BREN'].map(t => (
                        <button key={t} onClick={() => { setDemoTicker(t); demoLookup(t); }} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--blue)', borderRadius: 20, padding: '3px 10px', fontSize: '.72rem', cursor: 'pointer' }}>{t}</button>
                      ))}
                    </div>
                    {demoLookupData && (
                      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{demoLookupData.name}</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono,monospace' }}>{fmtRp(demoLookupData.price)}</div>
                        <div style={{ fontSize: '.8rem', color: demoLookupData.chgPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {demoLookupData.chgPct >= 0 ? '▲' : '▼'} {Math.abs(demoLookupData.chgPct * 100).toFixed(2)}% hari ini
                        </div>
                        {demoAcc.holdings[demoLookupData.ticker] && (
                          <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 6 }}>
                            Dipegang: {demoAcc.holdings[demoLookupData.ticker].lots} lot · avg {fmtRp(demoAcc.holdings[demoLookupData.ticker].avgPrice)}
                          </div>
                        )}
                      </div>
                    )}
                    {demoLookupData && (
                      <div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: '0.6rem', alignItems: 'center' }}>
                          <label style={{ fontSize: '.78rem', color: 'var(--muted)', minWidth: 40 }}>Aksi</label>
                          <select className="config-select" value={demoAction} onChange={e => setDemoAction(e.target.value)} style={{ flex: 1 }}>
                            <option value="buy">🟢 Beli</option>
                            <option value="sell">🔴 Jual</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: '0.8rem', alignItems: 'center' }}>
                          <label style={{ fontSize: '.78rem', color: 'var(--muted)', minWidth: 40 }}>Lot</label>
                          <input type="number" className="config-input" min="1" value={demoLotInput} onChange={e => setDemoLotInput(e.target.value)} style={{ flex: 1 }} />
                          <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>× 100 lembar</span>
                        </div>
                        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: '0.8rem', padding: '6px 10px', background: 'var(--bg2)', borderRadius: 6 }}>
                          Estimasi total: <b style={{ color: 'var(--text)' }}>{fmtRp(demoLookupData.price * (parseInt(demoLotInput) || 1) * 100)}</b>
                          {demoAction === 'buy' && <span style={{ color: 'var(--muted)' }}> · Sisa saldo: <b style={{ color: demoAcc.cash >= demoLookupData.price * (parseInt(demoLotInput)||1) * 100 ? 'var(--green)' : 'var(--red)' }}>{fmtRp(demoAcc.cash - demoLookupData.price * (parseInt(demoLotInput)||1) * 100)}</b></span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-green" onClick={() => { setDemoAction('buy'); demoTrade('buy'); }} style={{ flex: 1 }}>🟢 Beli</button>
                          <button className="btn" onClick={() => { setDemoAction('sell'); demoTrade('sell'); }} style={{ flex: 1, border: '1px solid var(--red)', color: 'var(--red)' }}>🔴 Jual</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="card">
                    <div className="sec-hdr"><div className="sec-hdr-title">📋 Posisi Aktif</div></div>
                    {holdingsKeys.length === 0 ? (
                      <div className="empty-state" style={{ padding: '2rem 0' }}>
                        <div className="empty-icon" style={{ fontSize: '2rem' }}>📭</div>
                        <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Belum ada posisi. Mulai beli saham!</div>
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Kode</th><th>Lot</th><th>Avg</th><th>Harga</th><th>P/L</th></tr></thead>
                          <tbody>
                            {holdingsKeys.map(k => {
                              const h = demoAcc.holdings[k];
                              const lp = h.lastPrice || h.avgPrice;
                              const pnl = (lp - h.avgPrice) * h.lots * 100;
                              const pnlPct = ((lp - h.avgPrice) / h.avgPrice * 100).toFixed(1);
                              return (
                                <tr key={k} onClick={() => { setDemoTicker(k); demoLookup(k); }} style={{ cursor: 'pointer' }}>
                                  <td className="td-ticker">{k}</td>
                                  <td className="td-mono">{h.lots}</td>
                                  <td className="td-mono" style={{ fontSize: '.72rem' }}>{Math.round(h.avgPrice).toLocaleString('id')}</td>
                                  <td className="td-mono" style={{ fontSize: '.72rem' }}>{Math.round(lp).toLocaleString('id')}</td>
                                  <td className={`td-mono ${pnl >= 0 ? 'td-green' : 'td-red'}`} style={{ fontSize: '.72rem' }}>
                                    {pnl >= 0 ? '+' : ''}{Math.round(pnl / 1000)}k<br />
                                    <span style={{ fontSize: '.65rem', opacity: 0.7 }}>({pnlPct}%)</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── PORTOFOLIO ── */}
              {demoSubTab === 'port' && (
                <div className="card">
                  <div className="sec-hdr"><div className="sec-hdr-title">📦 Detail Portofolio</div></div>
                  {holdingsKeys.length === 0 ? (
                    <div className="empty-state"><div className="empty-icon">📭</div><div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Belum ada posisi.</div></div>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Kode</th><th>Lot</th><th>Lembar</th><th>Avg Beli</th><th>Harga Terakhir</th><th>Nilai Beli</th><th>Nilai Sekarang</th><th>Unrealized P/L</th><th>%</th></tr></thead>
                          <tbody>
                            {holdingsKeys.map(k => {
                              const h = demoAcc.holdings[k];
                              const lp = h.lastPrice || h.avgPrice;
                              const lembar = h.lots * 100;
                              const nilBeli = h.avgPrice * lembar;
                              const nilNow = lp * lembar;
                              const pnl = nilNow - nilBeli;
                              const pct = ((lp - h.avgPrice) / h.avgPrice * 100).toFixed(1);
                              return (
                                <tr key={k}>
                                  <td className="td-ticker" onClick={() => { setDemoTicker(k); demoLookup(k); setDemoSubTab('trade'); }} style={{ cursor: 'pointer' }}>{k}</td>
                                  <td className="td-mono">{h.lots}</td>
                                  <td className="td-mono">{lembar.toLocaleString('id')}</td>
                                  <td className="td-mono">{Math.round(h.avgPrice).toLocaleString('id')}</td>
                                  <td className="td-mono">{Math.round(lp).toLocaleString('id')}</td>
                                  <td className="td-mono" style={{ fontSize: '.75rem' }}>{fmtRp(nilBeli)}</td>
                                  <td className="td-mono" style={{ fontSize: '.75rem' }}>{fmtRp(nilNow)}</td>
                                  <td className={`td-mono ${pnl >= 0 ? 'td-green' : 'td-red'}`} style={{ fontSize: '.75rem' }}>{pnl >= 0 ? '+' : ''}{fmtRp(pnl)}</td>
                                  <td className={`td-mono ${pnl >= 0 ? 'td-green' : 'td-red'}`}>{pct}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', fontSize: '.8rem', flexWrap: 'wrap' }}>
                        <div className="info-box">Total Nilai Portofolio: <b>{fmtRp(portVal)}</b></div>
                        <div className="info-box">Unrealized P/L: <b style={{ color: unrealPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{unrealPnl >= 0 ? '+' : ''}{fmtRp(unrealPnl)}</b></div>
                        <div className="info-box">Realized P/L: <b style={{ color: demoAcc.realizedPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{demoAcc.realizedPnl >= 0 ? '+' : ''}{fmtRp(demoAcc.realizedPnl)}</b></div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── RIWAYAT ── */}
              {demoSubTab === 'hist' && (
                <div className="card">
                  <div className="sec-hdr"><div className="sec-hdr-title">📜 Riwayat Transaksi</div></div>
                  {demoAcc.history.length === 0 ? (
                    <div className="empty-state"><div className="empty-icon">📭</div><div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Belum ada transaksi.</div></div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Waktu</th><th>Kode</th><th>Aksi</th><th>Lot</th><th>Harga</th><th>Total</th><th>Realized P/L</th></tr></thead>
                        <tbody>
                          {[...demoAcc.history].reverse().map((h, i) => (
                            <tr key={i}>
                              <td style={{ fontSize: '.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h.time}</td>
                              <td className="td-ticker">{h.ticker}</td>
                              <td><span style={{ fontSize: '.72rem', padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: h.action === 'buy' ? 'rgba(0,229,160,.15)' : 'rgba(255,77,106,.15)', color: h.action === 'buy' ? 'var(--green)' : 'var(--red)' }}>{h.action === 'buy' ? '🟢 Beli' : '🔴 Jual'}</span></td>
                              <td className="td-mono">{h.lots}</td>
                              <td className="td-mono">{h.price.toLocaleString('id')}</td>
                              <td className="td-mono" style={{ fontSize: '.75rem' }}>{fmtRp(h.total)}</td>
                              <td className={`td-mono ${h.gain >= 0 ? 'td-green' : h.gain < 0 ? 'td-red' : ''}`} style={{ fontSize: '.75rem' }}>
                                {h.gain != null ? ((h.gain >= 0 ? '+' : '') + fmtRp(h.gain)) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── MODAL ── */}
              {demoSubTab === 'modal' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="card">
                    <div className="sec-hdr"><div className="sec-hdr-title">💳 Kelola Modal Demo</div></div>
                    <div className="search-row" style={{ marginBottom: '0.8rem' }}>
                      <input type="number" className="search-input" value={demoModalInput} onChange={e => setDemoModalInput(e.target.value)} placeholder="Jumlah Rupiah, cth: 10000000" />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
                      {[1e6, 5e6, 10e6, 50e6, 100e6].map(n => (
                        <button key={n} onClick={() => setDemoModalInput(String(n))} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--blue)', borderRadius: 20, padding: '3px 10px', fontSize: '.72rem', cursor: 'pointer' }}>
                          +{n >= 1e9 ? (n/1e9)+'M' : n >= 1e6 ? (n/1e6)+'jt' : n}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
                      <button className="btn btn-green" onClick={() => demoAdjustModal('add')} style={{ flex: 1 }}>➕ Tambah Modal</button>
                      <button className="btn" onClick={() => demoAdjustModal('sub')} style={{ flex: 1, border: '1px solid var(--red)', color: 'var(--red)' }}>➖ Tarik Modal</button>
                    </div>
                    <button className="btn" onClick={demoReset} style={{ width: '100%', opacity: 0.6 }}>🔄 Reset Akun Demo</button>
                  </div>
                  <div className="card">
                    <div className="sec-hdr"><div className="sec-hdr-title">📊 Ringkasan Akun</div></div>
                    {[
                      ['Saldo Tunai', fmtRp(demoAcc.cash), 'var(--text)'],
                      ['Total Deposito', fmtRp(demoAcc.totalDeposit), 'var(--muted)'],
                      ['Nilai Portofolio', fmtRp(portVal), 'var(--blue)'],
                      ['Total Aset', fmtRp(totalAset), 'var(--amber)'],
                      ['Unrealized P/L', (unrealPnl >= 0 ? '+' : '') + fmtRp(unrealPnl), unrealPnl >= 0 ? 'var(--green)' : 'var(--red)'],
                      ['Realized P/L', (demoAcc.realizedPnl >= 0 ? '+' : '') + fmtRp(demoAcc.realizedPnl), demoAcc.realizedPnl >= 0 ? 'var(--green)' : 'var(--red)'],
                      ['Return Total', (() => { const ret = (totalAset - demoAcc.totalDeposit) / demoAcc.totalDeposit * 100; return (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%'; })(), (totalAset >= demoAcc.totalDeposit ? 'var(--green)' : 'var(--red)')],
                    ].map(([label, val, col]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                        <span style={{ color: 'var(--muted)' }}>{label}</span>
                        <span style={{ fontWeight: 600, color: col, fontFamily: 'DM Mono,monospace' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══ GUIDE ═══ */}
        {tab === 'guide' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <div className="sec-hdr"><div className="sec-hdr-title">🎯 Investment Score</div></div>
              <table className="guide-table">
                <thead><tr><th>Komponen</th><th>Maks</th><th>Keterangan</th></tr></thead>
                <tbody>
                  {[
                    ['PBV vs Benchmark', '20', 'Makin murah vs sektor'],
                    ['PER vs Benchmark', '20', 'PER rendah = lebih murah'],
                    ['RSI Oversold', '20', '<30=20pt, <40=15pt'],
                    ['Drawdown ATH', '10', 'Makin dalam = makin tinggi'],
                    ['ROE', '15', 'ROE>15%=nilai penuh'],
                    ['D/E Ratio', '15', 'Utang rendah=lebih aman'],
                  ].map(([k, m, d]) => (
                    <tr key={k}><td>{k}</td><td className="td-mono">{m}</td><td>{d}</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="sec-hdr" style={{ marginTop: '1.5rem' }}><div className="sec-hdr-title">🏦 Smart Money Concept</div></div>
              {[
                ['Order Block (OB)', 'Zona harga di mana institusi/smart money menempatkan order besar sebelum impulse move.'],
                ['Fair Value Gap (FVG)', 'Gap tak terpenuhi antara 2 candle. Harga cenderung kembali mengisi FVG.'],
                ['Break of Structure (BOS)', 'Harga menerobos high/low sebelumnya — konfirmasi kelanjutan tren.'],
                ['Change of Character (CHoCH)', 'Pembalikan swing high/low — sinyal awal perubahan tren.'],
                ['Market Bias', 'Kombinasi MA20/MA50 + posisi harga menentukan bias Bullish/Bearish/Neutral.'],
              ].map(([k, v]) => (
                <p key={k} style={{ fontSize: '.82rem', color: 'var(--text2)', lineHeight: 2 }}>
                  <b style={{ color: 'var(--text)' }}>{k}</b> — {v}
                </p>
              ))}

              <div className="sec-hdr" style={{ marginTop: '1.5rem' }}><div className="sec-hdr-title">🎯 Swing & Scalp Signals</div></div>
              {[
                ['SWING_BUY', 'Sinyal beli jangka menengah (hari–minggu). Kombinasi RSI, MACD, EMA.'],
                ['SWING_SELL', 'Sinyal jual/hindari jangka menengah. RSI overbought atau death cross.'],
                ['SCALP_BUY', 'Sinyal beli cepat (menit–jam). Membutuhkan volatilitas tinggi (ATR > 1.5%).'],
                ['SCALP_SELL', 'Sinyal jual cepat. Stochastic overbought atau fast EMA crossover.'],
                ['ACCUMULATION', 'Potensi akumulasi institusional. Volume besar + harga sideways.'],
                ['Liquidity Score', 'Kelayakan trading berdasarkan volume harian dan market cap.'],
              ].map(([k, v]) => (
                <p key={k} style={{ fontSize: '.82rem', color: 'var(--text2)', lineHeight: 2 }}>
                  <b style={{ color: 'var(--text)' }}>{k}</b> — {v}
                </p>
              ))}
            </div>
            <div>
              <div className="sec-hdr"><div className="sec-hdr-title">📖 Glosarium</div></div>
              {[
                ['PBV', 'Price to Book Value. <1 = dijual di bawah nilai aset.'],
                ['PER', 'Price to Earnings. Rendah = lebih murah secara laba.'],
                ['RSI', 'Relative Strength Index. <30=Oversold, >70=Overbought.'],
                ['Drawdown ATH', '% penurunan dari harga tertinggi sepanjang masa.'],
                ['ROE', 'Return on Equity. >15% = perusahaan efisien.'],
                ['D/E Ratio', 'Utang/Ekuitas. <0.5=konservatif, >2=berisiko.'],
                ['Risk/Reward', 'Perbandingan potensi profit vs risiko. Idealnya >1:2.'],
                ['Stop Loss', 'Batas harga jual untuk membatasi kerugian.'],
                ['Order Block', 'Zona institusional tempat smart money menempatkan posisi besar.'],
                ['ATR', 'Average True Range. Ukuran volatilitas harga. Scalping butuh ATR > 1.5%.'],
                ['Stochastic', 'Oscillator momentum. K<20 oversold, K>80 overbought.'],
              ].map(([k, v]) => (
                <p key={k} style={{ fontSize: '.82rem', color: 'var(--text2)', lineHeight: 2 }}>
                  <b style={{ color: 'var(--text)' }}>{k}</b> — {v}
                </p>
              ))}
              <div className="warn-box" style={{ marginTop: '1rem' }}>⚠️ Hanya untuk edukasi & riset. Bukan saran investasi. Selalu DYOR.</div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        :root {
          --bg:#0a0e1a;--bg2:#0f1525;--card:#131929;--card2:#1a2236;
          --border:#1e2d4a;--border2:#243352;--text:#e8edf8;--text2:#a8b8d8;
          --muted:#5a6f8f;--green:#00e5a0;--green-dim:rgba(0,229,160,0.12);
          --red:#ff4d6a;--red-dim:rgba(255,77,106,0.12);--blue:#4d9fff;
          --blue-dim:rgba(77,159,255,0.12);--amber:#ffb84d;--amber-dim:rgba(255,184,77,0.12);
          --purple:#a78bfa;--r:14px;--r-sm:8px;
        }
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh;}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:var(--bg);}
        ::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px;}
        body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(77,159,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(77,159,255,0.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0;}
        .app-wrap{position:relative;z-index:1;max-width:1400px;margin:0 auto;padding:0 1.5rem 3rem;}
        .header{display:flex;align-items:center;justify-content:space-between;padding:1.5rem 0 1.2rem;border-bottom:1px solid var(--border);margin-bottom:1.5rem;}
        .header-brand{display:flex;align-items:center;gap:12px;}
        .header-logo{width:38px;height:38px;background:linear-gradient(135deg,#4d9fff,#a78bfa);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 20px rgba(77,159,255,0.3);animation:glow 3s ease-in-out infinite;}
        @keyframes glow{0%,100%{box-shadow:0 0 15px rgba(77,159,255,.25)}50%{box-shadow:0 0 30px rgba(77,159,255,.5)}}
        .header-title{font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;letter-spacing:-.3px;}
        .accent{color:#4d9fff;}.ver{font-size:.7rem;color:var(--muted);font-weight:400;}
        .header-sub{font-size:.72rem;color:var(--muted);margin-top:1px;}
        .header-right{display:flex;align-items:center;gap:12px;}
        .live-pill{display:flex;align-items:center;gap:5px;background:var(--green-dim);border:1px solid rgba(0,229,160,.25);border-radius:20px;padding:4px 10px;font-size:.68rem;font-weight:600;color:var(--green);}
        .live-dot{width:6px;height:6px;background:var(--green);border-radius:50%;animation:pulse 2s infinite;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .disclaimer{font-size:.7rem;color:var(--muted);text-align:right;}
        .config-bar{display:flex;gap:12px;align-items:flex-end;background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:1rem 1.2rem;margin-bottom:1.2rem;flex-wrap:wrap;}
        .config-group{display:flex;flex-direction:column;gap:5px;}
        .config-label{font-size:.67rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;}
        .config-input{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text);font-family:'DM Mono',monospace;font-size:.8rem;padding:.45rem .75rem;outline:none;transition:.2s;}
        .config-input:focus{border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-dim);}
        .config-select{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text);font-family:'DM Sans',sans-serif;font-size:.8rem;padding:.45rem .75rem;outline:none;cursor:pointer;}
        .tabs{display:flex;gap:4px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:4px;margin-bottom:1.5rem;width:fit-content;}
        .tab-btn{background:none;border:none;cursor:pointer;color:var(--muted);font-family:'DM Sans',sans-serif;font-size:.82rem;font-weight:600;padding:.45rem 1rem;border-radius:9px;transition:all .2s;white-space:nowrap;}
        .tab-btn:hover{color:var(--text2);background:var(--card2);}
        .tab-btn.active{background:var(--card2);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.4);border:1px solid var(--border2);}
        .sub-tabs{display:flex;gap:4px;margin-bottom:1.2rem;flex-wrap:wrap;}
        .sub-tab-btn{background:var(--card);border:1px solid var(--border);cursor:pointer;color:var(--muted);font-family:'DM Sans',sans-serif;font-size:.78rem;font-weight:600;padding:.4rem .9rem;border-radius:8px;transition:all .2s;}
        .sub-tab-btn:hover{color:var(--text2);}
        .sub-tab-btn.active{background:var(--blue-dim);color:var(--blue);border-color:rgba(77,159,255,.4);}
        .search-row{display:flex;gap:10px;margin-bottom:1.2rem;align-items:flex-end;}
        .search-input{flex:1;background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text);font-family:'DM Mono',monospace;font-size:.95rem;font-weight:500;padding:.6rem 1rem;outline:none;transition:.2s;text-transform:uppercase;letter-spacing:1px;}
        .search-input:focus{border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-dim);}
        .btn{background:var(--blue);color:#fff;border:none;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:.82rem;padding:.6rem 1.3rem;border-radius:var(--r-sm);transition:all .2s;white-space:nowrap;}
        .btn:hover:not(:disabled){background:#3a8ff0;transform:translateY(-1px);box-shadow:0 4px 12px rgba(77,159,255,.3);}
        .btn:disabled{opacity:.5;cursor:not-allowed;}
        .btn-outline{background:transparent;color:var(--blue);border:1px solid var(--border2);}
        .btn-outline:hover:not(:disabled){background:var(--blue-dim);border-color:var(--blue);}
        .btn-green{background:var(--green);color:#0a0e1a;}
        .btn-green:hover:not(:disabled){background:#00cc8f;box-shadow:0 4px 12px rgba(0,229,160,.3);}
        .btn-sm{padding:.35rem .85rem;font-size:.75rem;}
        .verdict{display:inline-block;border-radius:6px;padding:4px 12px;font-family:'Syne',sans-serif;font-size:.78rem;font-weight:700;letter-spacing:.3px;}
        .vd-a{background:var(--green-dim);color:var(--green);border:1px solid rgba(0,229,160,.25);}
        .vd-b{background:var(--amber-dim);color:var(--amber);border:1px solid rgba(255,184,77,.25);}
        .vd-c{background:var(--blue-dim);color:var(--blue);border:1px solid rgba(77,159,255,.25);}
        .vd-d{background:var(--red-dim);color:var(--red);border:1px solid rgba(255,77,106,.25);}
        .metric-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:.85rem .9rem;transition:.2s;}
        .metric-card:hover{border-color:var(--border2);}
        .metric-label{font-size:.63rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:4px;}
        .metric-value{font-family:'DM Mono',monospace;font-size:1.15rem;font-weight:500;color:var(--text);line-height:1.2;}
        .metric-delta{font-size:.72rem;font-weight:600;margin-top:2px;}
        .delta-pos{color:var(--green);}.delta-neg{color:var(--red);}.delta-neu{color:var(--muted);}
        .metrics-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:1rem;}
        .ticker-banner{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:1.1rem 1.4rem;display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:1rem;}
        .ticker-name{font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:800;}
        .ticker-fullname{font-size:.83rem;color:var(--text2);margin-top:1px;}
        .ticker-sector{font-size:.7rem;color:var(--muted);margin-top:2px;}
        .ticker-price-big{font-family:'DM Mono',monospace;font-size:2rem;font-weight:500;text-align:right;}
        .ticker-chg{font-size:.85rem;font-weight:600;text-align:right;}
        .ticker-score{text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:.6rem 1rem;min-width:90px;}
        .ticker-score-val{font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:var(--blue);}
        .ticker-score-lbl{font-size:.62rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
        .signal-bar{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:.6rem 1rem;margin-bottom:.5rem;flex-wrap:wrap;}
        .signal-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700;}
        .signal-buy{background:rgba(0,229,160,.12);color:var(--green);border:1px solid rgba(0,229,160,.25);}
        .signal-sell{background:rgba(255,77,106,.12);color:var(--red);border:1px solid rgba(255,77,106,.25);}
        .signal-strength{background:rgba(255,255,255,.08);border-radius:4px;padding:1px 5px;font-size:.65rem;margin-left:3px;}
        .score-section{display:grid;grid-template-columns:auto 1fr 1.5fr;gap:1rem;margin-bottom:1rem;}
        .score-big{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:1.5rem 1.2rem;text-align:center;min-width:130px;}
        .score-num{font-family:'DM Mono',monospace;font-size:3rem;font-weight:500;line-height:1;}
        .score-denom{font-size:.7rem;color:var(--muted);font-weight:600;margin-top:2px;}
        .score-grade{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;margin:.5rem 0 .4rem;}
        .card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:1.2rem;}
        .card-title{font-family:'Syne',sans-serif;font-size:.88rem;font-weight:700;color:var(--text);}
        .breakdown-bars{display:flex;flex-direction:column;gap:8px;padding:.4rem 0;}
        .breakdown-row{display:flex;align-items:center;gap:10px;}
        .breakdown-label{font-size:.72rem;color:var(--text2);width:80px;flex-shrink:0;}
        .breakdown-bar-wrap{flex:1;background:var(--bg2);border-radius:4px;height:8px;overflow:hidden;}
        .breakdown-bar-fill{height:100%;border-radius:4px;transition:width .6s cubic-bezier(.4,0,.2,1);}
        .breakdown-val{font-family:'DM Mono',monospace;font-size:.72rem;color:var(--text2);width:28px;text-align:right;}
        .chart-box{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:1rem;margin-bottom:1rem;}
        .chart-opts{display:flex;gap:8px;margin-bottom:.8rem;flex-wrap:wrap;align-items:center;}
        .chart-opt-btn{background:var(--bg2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-sm);padding:.3rem .75rem;font-size:.73rem;font-weight:600;cursor:pointer;transition:.2s;font-family:'DM Sans',sans-serif;}
        .chart-opt-btn:hover{color:var(--text2);}
        .chart-opt-btn.on{background:var(--blue-dim);color:var(--blue);border-color:rgba(77,159,255,.35);}
        .period-btns{display:flex;gap:4px;margin-left:auto;}
        .period-btn{background:none;border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:.25rem .6rem;font-size:.72rem;font-weight:700;cursor:pointer;transition:.15s;font-family:'DM Mono',monospace;}
        .period-btn:hover{color:var(--text2);}
        .period-btn.on{background:var(--blue-dim);color:var(--blue);border-color:rgba(77,159,255,.35);}
        .range-bar-wrap{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:.8rem 1.1rem;margin:.8rem 0;}
        .range-bar-labels{display:flex;justify-content:space-between;font-size:.68rem;color:var(--muted);margin-bottom:6px;}
        .range-track{background:var(--bg2);border-radius:4px;height:8px;position:relative;overflow:visible;}
        .range-fill{height:100%;border-radius:4px;position:absolute;left:0;}
        .range-marker{position:absolute;top:-3px;width:2px;height:14px;background:white;border-radius:1px;transform:translateX(-50%);box-shadow:0 0 6px rgba(255,255,255,.4);}
        .funda-table{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;}
        .funda-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;}
        .funda-row{display:flex;justify-content:space-between;align-items:center;padding:.5rem .85rem;border-bottom:1px solid var(--border);}
        .funda-row:last-child{border-bottom:none;}
        .funda-key{font-size:.76rem;color:var(--text2);}
        .funda-val{font-family:'DM Mono',monospace;font-size:.78rem;color:var(--text);font-weight:500;}
        .funda-bench{font-size:.68rem;color:var(--muted);}
        .news-item{background:var(--card);border:1px solid var(--border);border-left:3px solid var(--blue);border-radius:var(--r-sm);padding:.85rem 1rem;margin-bottom:.65rem;}
        .news-title{font-size:.83rem;font-weight:600;color:var(--text);line-height:1.45;}
        .news-meta{font-size:.68rem;color:var(--muted);font-family:'DM Mono',monospace;margin-top:3px;}
        .news-link{font-size:.7rem;color:var(--blue);text-decoration:none;display:inline-block;margin-top:4px;}
        .news-link:hover{text-decoration:underline;}
        .ai-output{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:1.1rem 1.2rem;font-size:.82rem;line-height:1.75;color:var(--text2);min-height:120px;font-family:'DM Sans',sans-serif;}
        .filter-panel{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:1.1rem 1.2rem;margin-bottom:1.2rem;}
        .filter-group label{display:block;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:5px;}
        .filter-group input[type=range]{width:100%;accent-color:var(--blue);cursor:pointer;}
        .filter-val{font-family:'DM Mono',monospace;font-size:.82rem;color:var(--blue);font-weight:500;display:inline-block;margin-left:6px;}
        .summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:1.2rem;}
        .sum-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:.9rem 1rem;text-align:center;}
        .sum-num{font-family:'DM Mono',monospace;font-size:1.6rem;font-weight:500;}
        .sum-label{font-size:.67rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}
        .table-wrap{overflow-x:auto;border-radius:var(--r);border:1px solid var(--border);}
        table{width:100%;border-collapse:collapse;font-size:.8rem;}
        thead{background:var(--bg2);position:sticky;top:0;}
        th{padding:.65rem .9rem;text-align:left;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);white-space:nowrap;border-bottom:1px solid var(--border);}
        td{padding:.6rem .9rem;border-bottom:1px solid var(--border);color:var(--text2);}
        tr:last-child td{border-bottom:none;}
        tr:hover td{background:var(--card2);color:var(--text);}
        .td-mono{font-family:'DM Mono',monospace;}
        .td-ticker{font-family:'Syne',sans-serif;font-weight:700;color:var(--text);font-size:.85rem;}
        .td-green{color:var(--green);font-weight:600;}.td-red{color:var(--red);font-weight:600;}
        .sec-hdr{display:flex;align-items:center;gap:8px;padding-bottom:.6rem;margin:1.3rem 0 .8rem;border-bottom:1px solid var(--border);}
        .sec-hdr-title{font-family:'Syne',sans-serif;font-size:.9rem;font-weight:700;}
        .sec-hdr-sub{font-size:.7rem;color:var(--muted);margin-left:auto;}
        .info-box{background:var(--blue-dim);border:1px solid rgba(77,159,255,.25);border-radius:var(--r-sm);padding:.55rem .9rem;font-size:.77rem;color:var(--blue);line-height:1.55;}
        .warn-box{background:var(--amber-dim);border:1px solid rgba(255,184,77,.25);border-radius:var(--r-sm);padding:.55rem .9rem;font-size:.77rem;color:var(--amber);line-height:1.55;margin-top:.6rem;}
        .error-box{background:var(--red-dim);border:1px solid rgba(255,77,106,.25);border-radius:var(--r-sm);padding:.55rem .9rem;font-size:.77rem;color:var(--red);line-height:1.55;margin-bottom:1rem;}
        .info-box a,.warn-box a{color:inherit;}
        .empty-state{text-align:center;padding:3.5rem 2rem;color:var(--muted);border:1.5px dashed var(--border);border-radius:var(--r);}
        .empty-icon{font-size:2.5rem;margin-bottom:.8rem;}
        .empty-title{font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;color:var(--text2);margin-bottom:.4rem;}
        .guide-table{width:100%;border-collapse:collapse;font-size:.82rem;margin:.6rem 0;}
        .guide-table th{background:var(--bg2);padding:.5rem .8rem;text-align:left;font-size:.7rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px;}
        .guide-table td{padding:.5rem .8rem;border-bottom:1px solid var(--border);color:var(--text2);}
        .smc-bias-card{border:1px solid;border-radius:var(--r);padding:1.2rem;text-align:center;margin-bottom:.5rem;}
        .smc-item{border:1px solid;border-radius:var(--r-sm);padding:.7rem .9rem;margin-bottom:.6rem;background:var(--bg2);}
        .smc-tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:700;}
        .smc-bull{background:rgba(0,229,160,.15);color:var(--green);}
        .smc-bear{background:rgba(255,77,106,.15);color:var(--red);}
        .chatbot-wrap{background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;}
        .chat-messages{height:420px;overflow-y:auto;padding:1.2rem;display:flex;flex-direction:column;gap:.8rem;}
        .chat-msg{display:flex;}
        .chat-msg.user{justify-content:flex-end;}
        .chat-msg.assistant{justify-content:flex-start;}
        .chat-bubble{max-width:75%;padding:.7rem 1rem;border-radius:12px;font-size:.83rem;line-height:1.65;}
        .chat-msg.user .chat-bubble{background:var(--blue);color:#fff;border-radius:12px 12px 2px 12px;}
        .chat-msg.assistant .chat-bubble{background:var(--bg2);color:var(--text2);border:1px solid var(--border);border-radius:12px 12px 12px 2px;}
        .chat-bubble p{margin:1px 0;}
        .chat-typing{display:flex;gap:4px;align-items:center;padding:.7rem 1rem;}
        .chat-typing span{width:7px;height:7px;background:var(--muted);border-radius:50%;animation:bounce .9s infinite;}
        .chat-typing span:nth-child(2){animation-delay:.15s;}
        .chat-typing span:nth-child(3){animation-delay:.3s;}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
        .chat-quick{display:flex;gap:6px;padding:.7rem 1.2rem;border-top:1px solid var(--border);flex-wrap:wrap;background:var(--bg2);}
        .chat-quick-btn{background:var(--card);border:1px solid var(--border);color:var(--text2);border-radius:20px;padding:4px 10px;font-size:.72rem;cursor:pointer;transition:.15s;white-space:nowrap;font-family:'DM Sans',sans-serif;}
        .chat-quick-btn:hover{border-color:var(--blue);color:var(--blue);}
        .chat-input-row{display:flex;gap:8px;padding:1rem 1.2rem;border-top:1px solid var(--border);}
        .chat-input{flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text);font-family:'DM Sans',sans-serif;font-size:.85rem;padding:.55rem 1rem;outline:none;transition:.2s;}
        .chat-input:focus{border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-dim);}
        @media(max-width:900px){
          .metrics-grid{grid-template-columns:repeat(3,1fr);}
          .summary-grid{grid-template-columns:repeat(3,1fr);}
          .filter-panel{grid-template-columns:repeat(2,1fr);}
          .score-section{grid-template-columns:1fr;}
          .funda-table{grid-template-columns:1fr;}
        }
        @media(max-width:600px){
          .metrics-grid{grid-template-columns:repeat(2,1fr);}
          .tabs{overflow-x:auto;width:100%;}
        }
        /* JARVIS MODAL */
        .jarvis-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);}
        .jarvis-modal{background:#0a0a0f;border:1px solid #00d4ff33;border-radius:16px;width:100%;max-width:620px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 0 60px #00d4ff22,0 0 120px #0000ff11;}
        .jarvis-header{display:flex;align-items:center;gap:12px;padding:1rem 1.2rem;border-bottom:1px solid #ffffff11;}
        .jarvis-title{font-size:1rem;font-weight:900;color:#00d4ff;letter-spacing:.08em;font-family:'DM Mono',monospace;}
        .jarvis-ticker{font-size:.8rem;color:#ffffff88;font-family:'DM Mono',monospace;}
        .jarvis-close{margin-left:auto;background:none;border:none;color:#ffffff55;font-size:1.2rem;cursor:pointer;padding:4px 8px;border-radius:6px;transition:.15s;}
        .jarvis-close:hover{color:#fff;background:#ffffff11;}
        .jarvis-body{flex:1;overflow-y:auto;padding:1.2rem;min-height:200px;}
        .jarvis-text{font-size:.83rem;line-height:1.75;color:#e0e0e0;white-space:pre-wrap;font-family:'DM Sans',sans-serif;}
        .jarvis-text strong,.jarvis-text b{color:#00d4ff;}
        .jarvis-tabs{display:flex;gap:8px;padding:.8rem 1.2rem;border-top:1px solid #ffffff11;border-bottom:1px solid #ffffff11;}
        .jarvis-tab-btn{flex:1;padding:7px;border-radius:8px;border:1px solid #ffffff22;background:none;color:#ffffff55;font-size:.78rem;font-weight:700;cursor:pointer;transition:.15s;font-family:'DM Sans',sans-serif;}
        .jarvis-tab-btn.active{background:#00d4ff22;border-color:#00d4ff;color:#00d4ff;}
        .jarvis-chat{display:flex;flex-direction:column;gap:8px;padding:.8rem 1.2rem;flex:1;overflow-y:auto;max-height:300px;}
        .jarvis-chat-msg{padding:.6rem .9rem;border-radius:10px;font-size:.8rem;line-height:1.6;max-width:90%;}
        .jarvis-chat-msg.user{background:#00d4ff22;color:#00d4ff;align-self:flex-end;border-radius:10px 10px 2px 10px;}
        .jarvis-chat-msg.ai{background:#ffffff0d;color:#e0e0e0;align-self:flex-start;border-radius:10px 10px 10px 2px;border:1px solid #ffffff11;}
        .jarvis-input-row{display:flex;gap:8px;padding:.8rem 1.2rem;border-top:1px solid #ffffff11;}
        .jarvis-input{flex:1;background:#ffffff0d;border:1px solid #ffffff22;border-radius:8px;color:#fff;font-size:.82rem;padding:.5rem .9rem;outline:none;font-family:'DM Sans',sans-serif;}
        .jarvis-input:focus{border-color:#00d4ff55;}
        .jarvis-send{background:#00d4ff22;border:1px solid #00d4ff55;color:#00d4ff;border-radius:8px;padding:.5rem .9rem;font-size:.82rem;font-weight:700;cursor:pointer;white-space:nowrap;}
        .jarvis-loading{display:flex;gap:5px;align-items:center;padding:.5rem 0;}
        .jarvis-loading span{width:6px;height:6px;background:#00d4ff;border-radius:50%;animation:jbounce .8s infinite;}
        .jarvis-loading span:nth-child(2){animation-delay:.13s;}
        .jarvis-loading span:nth-child(3){animation-delay:.26s;}
        @keyframes jbounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        .jarvis-quick{display:flex;gap:6px;flex-wrap:wrap;padding:0 1.2rem .6rem;}
        .jarvis-quick-btn{background:#ffffff0a;border:1px solid #ffffff1a;color:#ffffff77;border-radius:20px;padding:4px 10px;font-size:.72rem;cursor:pointer;transition:.15s;font-family:'DM Sans',sans-serif;}
        .jarvis-quick-btn:hover{border-color:#00d4ff;color:#00d4ff;}
      `}</style>

      {/* ═══ JARVIS MODAL ═══ */}
      {jarvisOpen && jarvisStock && (
        <div className="jarvis-overlay" onClick={e => e.target === e.currentTarget && setJarvisOpen(false)}>
          <div className="jarvis-modal">
            <div className="jarvis-header">
              <div>
                <div className="jarvis-title">⚡ JARVIS — IHSG DESTROYER</div>
                <div className="jarvis-ticker">{jarvisStock.Ticker} · Rp{(jarvisStock.Price||jarvisStock.Harga||0).toLocaleString('id')} · Score {jarvisStock.Score}</div>
              </div>
              <button className="jarvis-close" onClick={() => setJarvisOpen(false)}>✕</button>
            </div>

            <div className="jarvis-tabs">
              <button className={`jarvis-tab-btn ${jarvisMode==='recommend'?'active':''}`} onClick={() => setJarvisMode('recommend')}>
                📊 Rekomendasi
              </button>
              <button className={`jarvis-tab-btn ${jarvisMode==='chat'?'active':''}`} onClick={() => setJarvisMode('chat')}>
                💬 Tanya Jarvis
              </button>
            </div>

            {jarvisMode === 'recommend' && (
              <div className="jarvis-body">
                {jarvisLoading && !jarvisText && (
                  <div className="jarvis-loading">
                    <span/><span/><span/>
                    <span style={{color:'#00d4ff55',fontSize:'.75rem',marginLeft:8,fontFamily:'DM Mono,monospace'}}>JARVIS ANALYZING...</span>
                  </div>
                )}
                {jarvisText && (
                  <div className="jarvis-text"
                    dangerouslySetInnerHTML={{__html: jarvisText
                      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
                      .replace(/\*(.+?)\*/g, '<em>$1</em>')
                      .replace(/^(#{1,3})\s(.+)$/gm, '<b style="color:#00d4ff;font-size:.9rem">$2</b>')
                      .replace(/^(\d+\.)\s/gm, '<span style="color:#00d4ff">$1</span> ')
                      .replace(/🔴|❌/g, '<span style="color:#ff4d6a">$&</span>')
                      .replace(/🟢|✅/g, '<span style="color:#00ff88">$&</span>')
                      .replace(/🟡|⚠️/g, '<span style="color:#ffd166">$&</span>')
                    }}
                  />
                )}
                {jarvisLoading && jarvisText && (
                  <div className="jarvis-loading" style={{marginTop:8}}>
                    <span/><span/><span/>
                  </div>
                )}
              </div>
            )}

            {jarvisMode === 'chat' && (
              <>
                <div className="jarvis-chat">
                  {jarvisChatHistory.length === 0 && (
                    <div style={{color:'#ffffff33',fontSize:'.78rem',textAlign:'center',padding:'1rem'}}>
                      Tanya apapun tentang {jarvisStock.Ticker} ke Jarvis...
                    </div>
                  )}
                  {jarvisChatHistory.map((m, i) => (
                    <div key={i} className={`jarvis-chat-msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                      {m.content || <span style={{opacity:.5}}>...</span>}
                    </div>
                  ))}
                </div>
                <div className="jarvis-quick">
                  {['Kapan waktu terbaik masuk?','Potensi ARA besok?','Volume mencurigakan?','Bagaimana sentimen sektoral?'].map(q => (
                    <button key={q} className="jarvis-quick-btn" onClick={() => sendJarvisChat(q)}>{q}</button>
                  ))}
                </div>
                <div className="jarvis-input-row">
                  <input
                    className="jarvis-input"
                    placeholder="Tanya Jarvis..."
                    value={jarvisChatInput}
                    onChange={e => setJarvisChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !jarvisLoading && sendJarvisChat(jarvisChatInput)}
                  />
                  <button className="jarvis-send" disabled={jarvisLoading} onClick={() => sendJarvisChat(jarvisChatInput)}>
                    {jarvisLoading ? '⏳' : 'Kirim →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {distSignal && (
          <ReturnDistributionModal 
            signalKey={distSignal.signal} 
            ticker={distSignal.ticker}
            backtestData={distSignal.ticker ? (TICKER_SIGNAL_STATS[distSignal.ticker] || {})[distSignal.signal] : null}
            globalBH={BACKTEST_STATS[distSignal.signal]?.byHorizon || null}
            onClose={() => setDistSignal(null)} 
          />
        )}
    </>
  );
}