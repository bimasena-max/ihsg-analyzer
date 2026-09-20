// pages/api/screener.js
import { getSectorsValuationBatch } from './sectors-client.js';
// Skor teknikal 0-100 untuk leaderboard — dihitung dari OHLCV yang SUDAH
// di-fetch di bawah (tidak ada request Yahoo tambahan, tidak menyentuh
// auth/cookie/fetchWithRetry sama sekali).
import { snapshot } from '../../lib/core/indicators.js';
import { scoreTechnical } from '../../lib/core/verdict.js';
import { buildLastBarFeatures, FEATURE_COLS } from '../../lib/core/ml-features.js';

// ── Prediksi ML on-demand (1D/2D) ────────────────────────────────────────────
// Model dilatih di Python (ml/train.py) lalu di-export ke ONNX supaya bisa
// di-load di runtime Node/Vercel tanpa spawn python3 (tidak tersedia di
// serverless function — lihat catatan di sectors-client.js).
// Sama seperti TechnicalScore di atas: TIDAK ada fetch Yahoo tambahan, pakai
// OHLCV yang sudah difetch fetchTicker(). Kalau model/fitur tidak tersedia,
// return null — screener tetap jalan normal, cuma kolom ml jadi null.
let _onnxSessions = null; // { '1d': InferenceSession|null, '2d': ... } | 'unavailable'

async function loadOnnxSessions() {
  if (_onnxSessions !== null) return _onnxSessions;
  try {
    const ort = await import('onnxruntime-node');
    const path = await import('path');
    const fs = await import('fs');
    const modelDir = path.join(process.cwd(), 'ml', 'models');
    const sessions = {};
    for (const h of ['1d', '2d']) {
      const p = path.join(modelDir, `model_${h}.onnx`);
      sessions[h] = fs.existsSync(p) ? await ort.InferenceSession.create(p) : null;
    }
    _onnxSessions = (sessions['1d'] || sessions['2d']) ? sessions : 'unavailable';
  } catch (err) {
    console.warn('[ml] ONNX runtime tidak tersedia:', err.message);
    _onnxSessions = 'unavailable';
  }
  return _onnxSessions;
}

async function predictMlSafe(sym, { closes, highs, lows, vols, dates }) {
  try {
    const sessions = await loadOnnxSessions();
    if (sessions === 'unavailable') return null;
    const { vector, missing } = buildLastBarFeatures({ closes, highs, lows, vols, dates });
    if (!vector) return null;

    const ort = await import('onnxruntime-node');
    const out = {};
    for (const h of ['1d', '2d']) {
      const session = sessions[h];
      if (!session) continue;
      const tensor = new ort.Tensor('float32', Float32Array.from(vector), [1, FEATURE_COLS.length]);
      const inputName = session.inputNames[0];
      const results = await session.run({ [inputName]: tensor });
      const outputName = session.outputNames[session.outputNames.length - 1];
      const raw = results[outputName].data;
      const probNaik = raw.length >= 2 ? raw[1] : raw[0];
      out[h] = Math.round(probNaik * 1000) / 1000;
    }
    return Object.keys(out).length ? out : null;
  } catch (err) {
    console.warn(`[ml] prediksi gagal untuk ${sym}:`, err.message);
    return null;
  }
}

// Skor 0-100 dari probabilitas ONNX (0-1), format sama seperti TechnicalScore
// supaya bisa dipakai badge/warna/mini-bar yang sama persis di leaderboard.
function mlProbToScore(prob) {
  if (prob == null || !isFinite(prob)) return null;
  return Math.round(prob * 1000) / 10; // 0.653 -> 65.3
}

// PENTING: Harus sama dengan SECTOR_BENCH di pages/index.js (frontend)
const SECTOR_BENCH = {
  'Financial Services':     { pbv: 1.5, per: 12, roe: 0.12, der: 3.0 },
  'Consumer Cyclical':      { pbv: 2.0, per: 18, roe: 0.15, der: 1.5 },
  'Consumer Defensive':     { pbv: 3.0, per: 20, roe: 0.18, der: 1.0 },
  'Basic Materials':        { pbv: 1.5, per: 10, roe: 0.10, der: 1.2 },
  'Energy':                 { pbv: 1.2, per:  8, roe: 0.08, der: 1.0 },
  'Industrials':            { pbv: 2.0, per: 15, roe: 0.12, der: 1.5 },
  'Technology':             { pbv: 4.0, per: 30, roe: 0.20, der: 0.8 },
  'Healthcare':             { pbv: 3.0, per: 25, roe: 0.17, der: 0.9 },
  'Utilities':              { pbv: 1.5, per: 14, roe: 0.10, der: 2.0 },
  'Communication Services': { pbv: 2.5, per: 18, roe: 0.14, der: 1.5 },
  'Real Estate':            { pbv: 1.0, per: 12, roe: 0.08, der: 2.5 },
};

const YF_COOKIE = '_ga=GA1.1.1442514189.1763943382; GUC=AQEBCAFpxedp8EIfugSr&s=AQAAANzbWMPY&g=acSf2g; A1=d=AQABBNSjI2kCEDuPypN1y_hjeoidl-z8jhcFEgEBCAHnxWnwaVrxyiMA_eMDAAcI1KMjaez8jhc&S=AQAAAt44GSMEmjM3V1nBW8LZOMg; A3=d=AQABBNSjI2kCEDuPypN1y_hjeoidl-z8jhcFEgEBCAHnxWnwaVrxyiMA_eMDAAcI1KMjaez8jhc&S=AQAAAt44GSMEmjM3V1nBW8LZOMg; A1S=d=AQABBNSjI2kCEDuPypN1y_hjeoidl-z8jhcFEgEBCAHnxWnwaVrxyiMA_eMDAAcI1KMjaez8jhc&S=AQAAAt44GSMEmjM3V1nBW8LZOMg; DSS=sdtp=mcafee&sdts=1774881804&ts=1763943380&cnt=0; _ga_40HG6NTJFD=GS2.1.s1774881629$o195$g1$t1774881805$j60$l0$h0; cmp=t=1774882491&j=0&u=1---; gpp=DBAA; gpp_sid=-1; PRF=dock-collapsed%3Dtrue; axids=gam=y-sAPB7ItE2uI9l0kHewqSqhv.Q0OhF5ux~A&dv360=eS1LeUJ4MmE5RTJ1SHlSV2s1RDFId1NWV2tVRFlJc0h4RH5B&ydsp=y-0huNZpNE2uJ9b4PwbrQnhocaRqf.XX73~A&tbla=y-gMBXVm1E2uKeKSKXr_h4vshNcexONg90~A; tbla_id=bb3e88d1-1334-4058-ae90-43d7a2eed7ee-tuct101ff703; _ga_YD9K1W9DLN=GS2.1.s1774882490$o1$g1$t1774882758$j54$l0$h0; fes-ds-session=pv%3D9';

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
  'Cookie': YF_COOKIE,
};

let _crumb = null;

async function getCrumb() {
  if (_crumb) return _crumb;
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: YF_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    if (text && text.length > 0 && !text.includes('<') && !text.includes('{')) {
      _crumb = text.trim();
      return _crumb;
    }
  } catch (_) {}
  return null;
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(10000) });
      if (r.status === 429 || r.status === 503) {
        if (i < retries) await new Promise(res => setTimeout(res, 900 * (i + 1)));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      if (i < retries) await new Promise(res => setTimeout(res, 500 * (i + 1)));
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// KURS USD/IDR — diambil live, fallback ke hardcode
// ══════════════════════════════════════════════════════════════════════════════

let _usdIdr = null;

async function getUSDIDR() {
  if (_usdIdr) return _usdIdr;
  try {
    const r = await fetchWithRetry(
      'https://query1.finance.yahoo.com/v8/finance/chart/USDIDR=X?range=1d&interval=1d'
    );
    const rate = r?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (rate && rate > 10000) {
      _usdIdr = rate;
      return _usdIdr;
    }
  } catch (_) {}
  _usdIdr = 16300; // fallback
  return _usdIdr;
}

// ══════════════════════════════════════════════════════════════════════════════
// TECHNICAL INDICATORS
// ══════════════════════════════════════════════════════════════════════════════

function calcEMA(arr, period) {
  const k = 2 / (period + 1);
  let ema = arr[0];
  return arr.map((v, i) => i === 0 ? ema : (ema = v * k + ema * (1 - k)));
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMACD(closes) {
  const ema12    = calcEMA(closes, 12);
  const ema26    = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal   = calcEMA(macdLine, 9);
  const hist     = macdLine.map((v, i) => v - signal[i]);
  return { macdLine, signal, hist };
}

function calcBollinger(closes, period = 20) {
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const mean  = slice.reduce((a, b) => a + b, 0) / period;
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
  });
}

function calcATR(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i]  - closes[i - 1]),
    ));
  }
  if (trs.length < period) return new Array(closes.length).fill(null);
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = new Array(period + 1).fill(null);
  result[period] = atr;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push(atr);
  }
  return result;
}

function calcStochastic(highs, lows, closes, period = 14) {
  const raw = closes.map((_, i) => {
    if (i < period - 1) return { k: null, d: null };
    const sliceH  = highs.slice(i - period + 1, i + 1);
    const sliceL  = lows.slice(i - period + 1, i + 1);
    const highest = Math.max(...sliceH);
    const lowest  = Math.min(...sliceL);
    const range   = highest - lowest;
    const k       = range === 0 ? 50 : ((closes[i] - lowest) / range) * 100;
    return { k, d: null };
  });
  return raw.map((v, i, arr) => {
    if (i < 2 || v.k === null || arr[i-1].k === null || arr[i-2].k === null) return v;
    return { ...v, d: (arr[i].k + arr[i-1].k + arr[i-2].k) / 3 };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// AREA BELI
// ══════════════════════════════════════════════════════════════════════════════

function calcBuyZone(closes, highs, lows) {
  if (closes.length < 50) return null;
  const n     = closes.length;
  const price = closes[n - 1];

  // Bollinger Band bawah (support dinamis)
  const bb    = calcBollinger(closes, 20);
  const bbLow = bb[n - 1]?.lower;

  // EMA support
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema20v = ema20[n - 1];
  const ema50v = ema50[n - 1];

  // Fibonacci dari 52-week high/low
  const high52 = Math.max(...highs);
  const low52  = Math.min(...lows);
  const range  = high52 - low52;
  const fib618 = high52 - range * 0.618; // support kuat
  const fib786 = high52 - range * 0.786; // support dalam

  // Kumpulkan semua level support
  const supports = [bbLow, ema20v, ema50v, fib618, fib786].filter(v => v != null && v > 0);
  if (supports.length === 0) return null;

  // Area beli = rata-rata support terbawah (ambil 3 terendah)
  const sorted = [...supports].sort((a, b) => a - b);
  const bottom3 = sorted.slice(0, Math.min(3, sorted.length));
  const zoneHigh = Math.max(...bottom3);
  const zoneLow  = Math.min(...bottom3);

  // Tentukan apakah harga sekarang DALAM area beli
  const inZone  = price >= zoneLow * 0.97 && price <= zoneHigh * 1.03;

  // Hitung strength: seberapa banyak indikator konfirmasi
  let confirmCount = 0;
  if (bbLow  && price <= bbLow  * 1.03) confirmCount++;
  if (ema20v && price <= ema20v * 1.03) confirmCount++;
  if (ema50v && price <= ema50v * 1.03) confirmCount++;
  if (price <= fib618 * 1.03)           confirmCount++;
  if (price <= fib786 * 1.03)           confirmCount++;

  const strength = Math.round((confirmCount / 5) * 100);

  return {
    zoneLow:   Math.round(zoneLow),
    zoneHigh:  Math.round(zoneHigh),
    inZone,
    strength,
    levels: {
      bbLow:   bbLow  ? Math.round(bbLow)  : null,
      ema20:   Math.round(ema20v),
      ema50:   Math.round(ema50v),
      fib618:  Math.round(fib618),
      fib786:  Math.round(fib786),
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SIGNAL GENERATION — target dihitung dari ATR + level teknikal nyata
// Bukan hardcoded multiplier — tiap saham punya target berbeda sesuai volatilitasnya.
// ══════════════════════════════════════════════════════════════════════════════

// Cari resistance terdekat di atas harga (swing high)
function findNearestResistance(highs, price) {
  const swingHighs = [];
  for (let i = 2; i < highs.length - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      swingHighs.push(highs[i]);
    }
  }
  const above = swingHighs.filter(h => h > price * 1.005).sort((a, b) => a - b);
  return above.length > 0 ? above[0] : null;
}

// Hitung Fibonacci extension untuk target lebih jauh
function calcFibTargets(closes, highs, lows) {
  const recentLow  = Math.min(...lows.slice(-30));
  const recentHigh = Math.max(...highs.slice(-30));
  const swingRange = recentHigh - recentLow;
  return {
    ext1272: Math.round(recentHigh + swingRange * 0.272),
    ext1618: Math.round(recentHigh + swingRange * 0.618),
  };
}

// Estimasi holding days berdasarkan tipe sinyal + RSI + ATR ratio
// Makin volatile (ATR tinggi) = target lebih cepat kena = hold lebih pendek
// Makin oversold (RSI rendah) = pantul lebih kencang = hold lebih pendek
function estimateHoldingDays(rsi, atrRatio, signalType) {
  // volatilityFactor: 1.0 = baseline ATR 2%/hari, >1 lebih cepat, <1 lebih lambat
  const volatilityFactor = atrRatio > 0 ? Math.min(2.5, atrRatio / 0.02) : 0.5;

  if (signalType === 'SCALP') {
    // Target scalp = 1–1.8x ATR. Hari = target / kecepatan harian.
    const base = Math.max(1, Math.round(1.2 / volatilityFactor));
    const end  = Math.max(base + 1, Math.round(base * 1.8));
    return `${base}\u2013${end} hari`;
  }

  // Swing: base dari RSI (seberapa oversold), dikoreksi kecepatan ATR
  let baseDays;
  if      (rsi < 25) baseDays = 3;
  else if (rsi < 35) baseDays = 6;
  else if (rsi < 45) baseDays = 10;
  else               baseDays = 16;

  const adjusted = Math.round(baseDays / Math.max(0.4, volatilityFactor));
  const minDays  = Math.max(2, adjusted);
  const maxDays  = Math.round(minDays * 2.2);
  return `${minDays}\u2013${maxDays} hari`;
}

function generateSwingSignals(closes, highs, lows) {
  if (closes.length < 50) return [];

  const n         = closes.length;
  const price     = closes[n - 1];
  const rsi       = calcRSI(closes);
  const macd      = calcMACD(closes);
  const bb        = calcBollinger(closes);
  const ema20     = calcEMA(closes, 20);
  const ema50     = calcEMA(closes, 50);
  const atrArr    = calcATR(highs, lows, closes, 14);
  const atr       = atrArr[n - 1] || (price * 0.02);
  const atrRatio  = atr / price;
  const curBB     = bb[n - 1];

  // Level teknikal
  const bbUpper    = curBB?.upper ? Math.round(curBB.upper) : null;
  const bbMid      = curBB?.mid ? Math.round(curBB.mid) : (curBB?.middle ? Math.round(curBB.middle) : null);
  const ema20v     = Math.round(ema20[n - 1]);
  const resistance = findNearestResistance(highs, price);
  const fibs       = calcFibTargets(closes, highs, lows);
  const high52     = Math.max(...highs);

  function swingTargets(tp1Mult = 1.5, tp2Mult = 3.0, slMult = 1.5) {
    const atrTP1 = Math.round(price + atr * tp1Mult);
    const atrTP2 = Math.round(price + atr * tp2Mult);
    const candidates1 = [bbMid, ema20v, atrTP1].filter(v => v && v > price * 1.005 && v < price * 1.4);
    const tp1 = candidates1.length > 0 ? Math.min(...candidates1) : atrTP1;
    const candidates2 = [bbUpper, resistance, fibs.ext1272, atrTP2].filter(v => v && v > tp1 * 1.01);
    const tp2 = candidates2.length > 0 ? Math.min(...candidates2) : atrTP2;
    const sl   = Math.round(price - atr * slMult);
    const pct1 = ((tp1 - price) / price * 100).toFixed(1);
    const pct2 = ((tp2 - price) / price * 100).toFixed(1);
    const rr   = ((tp1 - price) / Math.max(price - sl, 1)).toFixed(1);
    return { tp1, tp2, sl, pct1, pct2, rr };
  }

  const signals = [];

  if (rsi < 40 && curBB?.lower && price < curBB.lower * 1.05) {
    const { tp1, tp2, sl, pct1, pct2, rr } = swingTargets(1.5, 3.0, 1.5);
    signals.push({
      type: 'SWING_BUY',
      signalName: 'RSI+BB Lower Bounce',
      reason: `RSI oversold (${rsi.toFixed(0)}) + harga di bawah BB Lower — bounce setup`,
      strength: 80,
      holdingDays: estimateHoldingDays(rsi, atrRatio, 'SWING'),
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr, atr: Math.round(atr),
    });
  }

  if (macd.hist[n-1] > 0 && macd.hist[n-2] <= 0 && price > ema20[n-1] * 0.97) {
    const { tp1, tp2, sl, pct1, pct2, rr } = swingTargets(2.0, 4.0, 1.5);
    signals.push({
      type: 'SWING_BUY',
      signalName: 'MACD Crossover Bullish',
      reason: `MACD crossover bullish — histogram baru hijau, di atas EMA20`,
      strength: 75,
      holdingDays: estimateHoldingDays(rsi, atrRatio, 'SWING'),
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr, atr: Math.round(atr),
    });
  }

  if (ema20[n-1] > ema50[n-1] && ema20[n-2] <= ema50[n-2]) {
    const tp1 = resistance || fibs.ext1272 || Math.round(price + atr * 3.5);
    const tp2 = Math.round(Math.min(high52, price + atr * 6));
    const sl  = Math.round(price - atr * 2.0);
    const pct1 = ((tp1 - price) / price * 100).toFixed(1);
    const pct2 = ((tp2 - price) / price * 100).toFixed(1);
    const rr   = ((tp1 - price) / Math.max(price - sl, 1)).toFixed(1);
    signals.push({
      type: 'SWING_BUY',
      signalName: 'Golden Cross EMA20/50',
      reason: `Golden Cross EMA20/50 baru terjadi — trend reversal bullish`,
      strength: 85,
      holdingDays: estimateHoldingDays(rsi, atrRatio, 'SWING'),
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr, atr: Math.round(atr),
    });
  }

  if (rsi < 45 && rsi > 30 && closes[n-1] > closes[n-2] && closes[n-2] > closes[n-3]) {
    const { tp1, tp2, sl, pct1, pct2, rr } = swingTargets(1.2, 2.5, 1.2);
    signals.push({
      type: 'SWING_BUY',
      signalName: 'RSI Recovery + 2 Candle Hijau',
      reason: `RSI recovery (${rsi.toFixed(0)}) + 2 candle hijau berturut — momentum awal`,
      strength: 70,
      holdingDays: estimateHoldingDays(rsi, atrRatio, 'SWING'),
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr, atr: Math.round(atr),
    });
  }

  return signals;
}

function generateScalpingSignals(closes, highs, lows) {
  if (closes.length < 20) return [];

  const n         = closes.length;
  const price     = closes[n - 1];
  const rsi       = calcRSI(closes, 9);
  const ema5      = calcEMA(closes, 5);
  const ema13     = calcEMA(closes, 13);
  const stoch     = calcStochastic(highs, lows, closes, 9);
  const atrArr    = calcATR(highs, lows, closes, 14);
  const atr       = atrArr[n - 1];
  const curStoch  = stoch[n - 1];
  const prevStoch = stoch[n - 2];

  if (!atr || !curStoch || curStoch.k === null) return [];

  const atrRatio = atr / price;
  if (atrRatio <= 0.012)
    return [{ type: 'SCALP_NEUTRAL', reason: `Volatilitas terlalu rendah (ATR ${(atrRatio*100).toFixed(1)}%) — tunggu breakout`, strength: 0 }];

  const resistance = findNearestResistance(highs, price);

  function scalpTargets(tp1Mult = 1.0, tp2Mult = 1.8, slMult = 0.8) {
    const tp1Raw = Math.round(price + atr * tp1Mult);
    const res    = resistance;
    const tp1    = (res && res < tp1Raw * 1.01 && res > price * 1.005) ? res : tp1Raw;
    const tp2    = Math.round(price + atr * tp2Mult);
    const sl     = Math.round(price - atr * slMult);
    const pct1   = ((tp1 - price) / price * 100).toFixed(1);
    const pct2   = ((tp2 - price) / price * 100).toFixed(1);
    const rr     = ((tp1 - price) / Math.max(price - sl, 1)).toFixed(1);
    return { tp1, tp2, sl, pct1, pct2, rr };
  }

  const signals = [];

  if (curStoch.k < 25 && prevStoch?.k !== null && curStoch.k > prevStoch.k && ema5[n-1] > ema13[n-1] * 0.98) {
    const { tp1, tp2, sl, pct1, pct2, rr } = scalpTargets(1.0, 1.8, 0.8);
    signals.push({
      type: 'SCALP_BUY',
      signalName: 'Stochastic Oversold + Naik',
      reason: `Stochastic K=${curStoch.k.toFixed(0)} oversold + mulai naik, EMA5 > EMA13`,
      strength: 85,
      holdingDays: estimateHoldingDays(rsi, atrRatio, 'SCALP'),
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr, atr: Math.round(atr),
    });
  }

  if (rsi < 35 && price < ema5[n-1] && ema5[n-1] > ema13[n-1] * 0.98) {
    const { tp1, tp2, sl, pct1, pct2, rr } = scalpTargets(0.8, 1.5, 0.7);
    signals.push({
      type: 'SCALP_BUY',
      signalName: 'RSI-9 Pullback ke EMA5',
      reason: `RSI-9 oversold (${rsi.toFixed(0)}) + pullback ke EMA5, EMA trend bullish`,
      strength: 78,
      holdingDays: estimateHoldingDays(rsi, atrRatio, 'SCALP'),
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr, atr: Math.round(atr),
    });
  }

  if (curStoch.k < 15 && curStoch.d && curStoch.d < 20) {
    const { tp1, tp2, sl, pct1, pct2, rr } = scalpTargets(1.2, 2.2, 0.9);
    signals.push({
      type: 'SCALP_BUY',
      signalName: 'Stochastic Deeply Oversold',
      reason: `Stochastic K=${curStoch.k.toFixed(0)} D=${curStoch.d.toFixed(0)} — deeply oversold, quick bounce potential`,
      strength: 88,
      holdingDays: estimateHoldingDays(rsi, atrRatio, 'SCALP'),
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr, atr: Math.round(atr),
    });
  }

  return signals;
}

function detectAccumulation(closes, volumes) {
  if (closes.length < 50 || !volumes || volumes.length < 50) return [];

  const n          = closes.length;
  const price      = closes[n - 1];
  const avgVol20   = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const avgVol50   = volumes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const recentVol  = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const priceChange = ((closes[n-1] - closes[n-20]) / closes[n-20]) * 100;
  if (avgVol20 === 0) return [];

  // Estimasi ATR dari volatilitas harian 20 hari
  const dailyVols = [];
  for (let i = Math.max(1, n-20); i < n; i++) {
    if (closes[i-1] > 0) dailyVols.push(Math.abs((closes[i] - closes[i-1]) / closes[i-1]));
  }
  const avgDailyVol = dailyVols.reduce((a,b)=>a+b,0) / (dailyVols.length || 1);
  const estATR = price * avgDailyVol * 1.5;

  function accumTargets(tp1Mult = 2.5, tp2Mult = 5.0, slMult = 2.0) {
    const tp1  = Math.round(price + estATR * tp1Mult);
    const tp2  = Math.round(price + estATR * tp2Mult);
    const sl   = Math.round(price - estATR * slMult);
    const pct1 = ((tp1 - price) / price * 100).toFixed(1);
    const pct2 = ((tp2 - price) / price * 100).toFixed(1);
    const rr   = ((tp1 - price) / Math.max(price - sl, 1)).toFixed(1);
    const volRatio  = recentVol / avgVol20;
    const holdMin   = Math.max(7, Math.round(14 / Math.max(volRatio, 1)));
    return { tp1, tp2, sl, pct1, pct2, rr, holdLabel: `${holdMin}–${holdMin*2} hari` };
  }

  const signals = [];

  if (recentVol > avgVol20 * 1.3 && Math.abs(priceChange) < 8) {
    const volRatio = Math.round(recentVol / avgVol20 * 10) / 10;
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = accumTargets(2.5, 5.0, 2.0);
    signals.push({
      type: 'ACCUMULATION',
      signalName: 'Volume Spike Sideways',
      reason: `Volume spike ${volRatio}× rata-rata, harga masih sideways — smart money masuk`,
      strength: Math.min(90, (recentVol/avgVol20)*35),
      volRatio,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr,
    });
  }

  if (avgVol20 > avgVol50 * 1.2 && priceChange > 0 && priceChange < 15) {
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = accumTargets(3.5, 7.0, 2.5);
    signals.push({
      type: 'ACCUMULATION',
      signalName: 'Volume Avg Naik Terkontrol',
      reason: `Volume rata-rata 20hr meningkat vs 50hr, harga naik terkontrol — breakout candidate`,
      strength: 75,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr,
    });
  }

  if (recentVol < avgVol20 * 0.7 && priceChange < -8) {
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = accumTargets(4.0, 8.0, 3.0);
    signals.push({
      type: 'ACCUMULATION',
      signalName: 'Volume Exhaustion Bottom',
      reason: `Volume mengering setelah turun ${priceChange.toFixed(1)}% — exhaustion bottom potential`,
      strength: 70,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1, tp1, tp2, sl, riskReward: rr,
    });
  }

  return signals;
}

function calculateLiquidityScore(volumes, price, marketCap) {
  if (!volumes || volumes.length === 0)
    return { score: 0, dollarVolume: 0, mcapB: 0, issues: ['No volume data'], tradeable: false, label: 'Sangat rendah' };

  const avgVolume    = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const dollarVolume = avgVolume * price;
  const mcapB        = (marketCap || 0) / 1e9;
  let score = 0;
  const issues = [];

  if (dollarVolume > 5e9)      score += 30;
  else if (dollarVolume > 1e9) score += 20;
  else if (dollarVolume > 5e8) score += 10;
  else issues.push('Volume rendah');

  if (mcapB > 10)     score += 30;
  else if (mcapB > 5) score += 20;
  else if (mcapB > 1) score += 10;
  else issues.push('Market cap kecil');

  const volStdDev = Math.sqrt(volumes.slice(-20).reduce((s, v) => s + (v - avgVolume) ** 2, 0) / Math.min(20, volumes.length));
  const cv = avgVolume > 0 ? volStdDev / avgVolume : 1;
  if (cv < 0.5)      score += 20;
  else if (cv < 1.0) score += 10;
  else issues.push('Volume tidak konsisten');

  score += Math.min(20, (dollarVolume / 1e9) * 5);

  return {
    score:       Math.min(100, Math.round(score)),
    dollarVolume,
    mcapB,
    issues,
    tradeable:   score >= 40,
    label:       score >= 75 ? 'Likuid' : score >= 50 ? 'Cukup' : score >= 25 ? 'Rendah' : 'Sangat rendah',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// INVESTMENT SCORE
// PENTING: Formula & threshold HARUS sama persis dengan index.js di frontend.
//
// Threshold baku:
//   Score >= 75 → Grade A → BELI
//   Score 55-74 → Grade B → PERHATIKAN
//   Score 35-54 → Grade C → TAHAN
//   Score < 35  → Grade D → HINDARI
// ══════════════════════════════════════════════════════════════════════════════

function invScore(pbv, per, rsiV, dd, roe, der, sector) {
  const bench = SECTOR_BENCH[sector] || { pbv: 2.0, per: 15, roe: 0.12, der: 1.5 };
  const bd = {
    PBV:      pbv && pbv > 0 ? Math.round(Math.max(0, Math.min(20, 20 * (1 - Math.pow(pbv / bench.pbv, 1.3))))) : 0,
    PER:      per && per > 0 && per < 500 ? Math.round(Math.max(0, Math.min(20, 20 * (1 - Math.pow(per / bench.per, 1.3))))) : 0,
    RSI:      rsiV < 25 ? 20 : rsiV < 30 ? 17 : rsiV < 35 ? 14 : rsiV < 40 ? 11 : rsiV < 45 ? 8 : rsiV < 50 ? 5 : rsiV < 55 ? 2 : 0,
    Drawdown: typeof dd === 'number' ? Math.round(Math.max(0, 10 - dd * 0.3)) : 5,
    ROE:      roe && roe > 0 ? Math.round(Math.min(20, (roe / (bench.roe || 0.12)) * 20)) : 0,
    'D/E':    typeof der === 'number' ? Math.round(Math.max(0, 10 * (1 - der / (bench.der || 1.5)))) : 5,
  };
  const total   = Math.round(Object.values(bd).reduce((s, v) => s + v, 0));
  const grade   = total >= 75 ? 'A' : total >= 55 ? 'B' : total >= 35 ? 'C' : 'D';
  const verdict = grade === 'A' ? 'BELI' : grade === 'B' ? 'PERHATIKAN' : grade === 'C' ? 'TAHAN' : 'HINDARI';
  return { total, grade, verdict, breakdown: bd };
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNDAMENTAL CALCULATION - KONSISTEN DENGAN DETAIL SAHAM
// ══════════════════════════════════════════════════════════════════════════════

function calculateFundamentals(qr, sectorsVal, price, usdIdr) {
  const sd = qr.summaryDetail        || {};
  const ks = qr.defaultKeyStatistics || {};
  const fd = qr.financialData        || {};

  let pbv = null;
  let per = null;
  let roe = null;
  let der = null;

  // ── PBV: Primary dari IDX/Sectors, fallback Yahoo ──
  if (sectorsVal?.pbv != null) {
    pbv = sectorsVal.pbv;
  } else if (sectorsVal?.bookValue != null && sectorsVal.bookValue > 0 && sectorsVal.bookValue < 1 && price > 100) {
    const bvpsIDR = sectorsVal.bookValue * usdIdr;
    pbv = bvpsIDR > 0 ? Math.round((price / bvpsIDR) * 100) / 100 : null;
  } else {
    const bookValueRaw = ks.bookValue?.raw ?? sd.bookValue?.raw ?? null;
    const pbvFromYahoo = ks.priceToBook?.raw ?? sd.priceToBook?.raw ?? null;
    
    if (bookValueRaw != null && bookValueRaw > 0 && bookValueRaw < 1 && price > 100) {
      const bvpsIDR = bookValueRaw * usdIdr;
      pbv = bvpsIDR > 0 ? Math.round((price / bvpsIDR) * 100) / 100 : null;
    } else if (pbvFromYahoo != null && pbvFromYahoo >= 0.1 && pbvFromYahoo < 100) {
      pbv = Math.round(pbvFromYahoo * 100) / 100;
    }
  }

  // ── PER: Primary dari IDX/Sectors, fallback Yahoo ──
  if (sectorsVal?.per != null) {
    per = sectorsVal.per;
  } else {
    const perRaw = sd.trailingPE?.raw ?? ks.trailingPE?.raw ?? null;
    const epsRaw = ks.trailingEps?.raw ?? null;
    
    per = perRaw != null && perRaw > 0 && perRaw < 500
      ? Math.round(perRaw * 100) / 100
      : null;
    
    if (per == null && epsRaw != null && epsRaw > 0 && price > 0) {
      const perCalc = price / epsRaw;
      if (perCalc > 0 && perCalc < 500) per = Math.round(perCalc * 100) / 100;
    }
  }

  // ── ROE: Primary dari IDX/Sectors (sudah %), fallback Yahoo (perlu konversi) ──
  if (sectorsVal?.roe != null) {
    roe = sectorsVal.roe;
  } else {
    const roeRaw = fd.returnOnEquity?.raw ?? null;
    roe = roeRaw != null ? Math.round(roeRaw * 1000) / 10 : null;
  }

  // ── DER: Primary dari IDX/Sectors (sudah ratio), fallback Yahoo (perlu konversi) ──
  if (sectorsVal?.der != null) {
    der = sectorsVal.der;
  } else {
    const derRaw = fd.debtToEquity?.raw ?? null;
    der = derRaw != null ? Math.round((derRaw / 100) * 100) / 100 : null;
  }

  return { pbv, per, roe, der };
}

// ══════════════════════════════════════════════════════════════════════════════
// INTRADAY PATTERN: BPJS & BSJP
// Formula berbasis EXPECTANCY (bukan sekadar winrate) supaya sinyal bermakna.
// Expectancy = (WR × avgGain) − ((1−WR) × avgLoss)
// Threshold: WR ≥ 60% DAN expectancy ≥ 0.25% per hari
// ══════════════════════════════════════════════════════════════════════════════

function detectIntradayPattern(closes, opens, highs, lows, volumes) {
  const n = closes.length;
  if (n < 20 || !opens || opens.length < 20) return null;

  const sample = Math.min(60, n); // analisis 60 hari untuk statistik lebih robust
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

  // BPJS: Beli Pagi Jual Sore (beli open, jual close)
  const bpjsWR = validDays > 0 ? bullishCount / validDays : 0;
  const bpjsAvgGain = bullishCount > 0 ? totalBullGain / bullishCount : 0;
  const bpjsAvgLoss = bearishCount > 0 ? totalBullLoss / bearishCount : 0;
  const bpjsExpectancy = bpjsWR * bpjsAvgGain - (1 - bpjsWR) * bpjsAvgLoss;

  // BSJP: Beli Sore Jual Pagi (beli close, jual open besok)
  const gapTotal = gapUpCount + gapDownCount;
  const bsjpWR = gapTotal > 0 ? gapUpCount / gapTotal : 0;
  const bsjpAvgGain = gapUpCount > 0 ? totalGapGain / gapUpCount : 0;
  const bsjpAvgLoss = gapDownCount > 0 ? totalGapLoss / gapDownCount : 0;
  const bsjpExpectancy = bsjpWR * bsjpAvgGain - (1 - bsjpWR) * bsjpAvgLoss;

  const patterns = [];

  // Threshold: WR ≥ 60% DAN expectancy ≥ 0.25% (benar-benar ada edge)
  if (bpjsWR >= 0.60 && bpjsExpectancy >= 0.25) {
    patterns.push({
      type: 'BELI_PAGI_JUAL_SORE',
      signalName: 'BPJS Beli Pagi Jual Sore',
      label: '☀️ Beli Pagi, Jual Sore',
      reason: `${Math.round(bpjsWR * 100)}% candle bullish (${validDays}hr) — avg gain ${bpjsAvgGain.toFixed(2)}%, expectancy +${bpjsExpectancy.toFixed(2)}%/hari`,
      timing: 'Masuk di harga Open (09:00–09:30), exit di Close (15:45–16:00)',
      winRate: Math.round(bpjsWR * 100),
      avgGain: bpjsAvgGain.toFixed(2),
      avgLoss: bpjsAvgLoss.toFixed(2),
      expectancy: bpjsExpectancy.toFixed(2),
      sampleDays: validDays,
      strength: Math.min(95, Math.round(bpjsWR * 70 + bpjsExpectancy * 10)),
    });
  }

  if (bsjpWR >= 0.60 && bsjpExpectancy >= 0.25 && gapTotal >= 10) {
    patterns.push({
      type: 'BELI_SORE_JUAL_PAGI',
      signalName: 'BSJP Beli Sore Jual Pagi',
      label: '🌙 Beli Sore, Jual Pagi',
      reason: `${Math.round(bsjpWR * 100)}% gap up pagi (${gapTotal} observasi) — avg gap ${bsjpAvgGain.toFixed(2)}%, expectancy +${bsjpExpectancy.toFixed(2)}%`,
      timing: 'Masuk di Close (15:45–16:00), exit di Open besok (09:00–09:30)',
      winRate: Math.round(bsjpWR * 100),
      avgGain: bsjpAvgGain.toFixed(2),
      avgLoss: bsjpAvgLoss.toFixed(2),
      expectancy: bsjpExpectancy.toFixed(2),
      sampleDays: gapTotal,
      strength: Math.min(95, Math.round(bsjpWR * 70 + bsjpExpectancy * 10)),
    });
  }

  if (patterns.length === 0) return null;

  // Kalau keduanya ada, ambil yang dominan saja (mutual exclusive untuk sinyal tab)
  let dominant = patterns[0];
  if (patterns.length === 2) {
    dominant = patterns[0].expectancy >= patterns[1].expectancy ? patterns[0] : patterns[1];
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

// ══════════════════════════════════════════════════════════════════════════════
// PRE-ARA DETECTOR — dikopi dari index.js supaya backend bisa kirim hasilnya
// ══════════════════════════════════════════════════════════════════════════════

function detectPreARA(closes, opens, highs, lows, volumes) {
  const n = closes.length;
  if (n < 30) return null;

  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const avgVol5  = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const avgVol3  = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
  if (avgVol20 === 0) return null;

  const rsi      = calcRSI(closes);
  const ema20    = calcEMA(closes, 20);
  const ema5     = calcEMA(closes, 5);
  const atrArr   = calcATR(highs, lows, closes, 14);
  const atr      = atrArr[atrArr.length - 1] || 0;

  const priceChange5  = (closes[n-1] - closes[n-6])  / closes[n-6]  * 100;
  const high20 = Math.max(...highs.slice(-20));
  const low20  = Math.min(...lows.slice(-20));
  const range20Pct = (high20 - low20) / low20 * 100;

  const avgRange5  = highs.slice(-5).map((h, i) => h - lows.slice(-5)[i]).reduce((a, b) => a + b, 0) / 5;
  const avgRange20 = highs.slice(-20).map((h, i) => h - lows.slice(-20)[i]).reduce((a, b) => a + b, 0) / 20;
  const compression = avgRange20 > 0 ? avgRange5 / avgRange20 : 1;

  const rsiArr = [];
  for (let i = Math.max(0, n-10); i < n; i++) rsiArr.push(calcRSI(closes.slice(0, i+1)));
  const rsiSlope = rsiArr.length > 5 ? rsiArr[rsiArr.length-1] - rsiArr[rsiArr.length-6] : 0;

  const signals = [];
  let totalScore = 0;

  if (avgVol5 > avgVol20 * 1.8 && Math.abs(priceChange5) < 5) {
    const score = Math.min(30, Math.round((avgVol5 / avgVol20) * 12));
    totalScore += score;
    signals.push({ icon: '📦', label: 'Akumulasi Tersembunyi', signalName: 'Akumulasi Tersembunyi', detail: `Volume ${(avgVol5/avgVol20).toFixed(1)}x rata-rata, harga sideways ${priceChange5.toFixed(1)}%`, score });
  }
  if (compression < 0.55 && avgRange20 > 0) {
    const score = Math.round((1 - compression) * 25);
    totalScore += score;
    signals.push({ icon: '🗜️', label: 'Candle Compression', signalName: 'Candle Compression', detail: `Range 5hr = ${(compression*100).toFixed(0)}% dari normal — energi terkumpul`, score });
  }
  const lastVol = volumes[n-1];
  if (lastVol > avgVol20 * 3 && closes[n-1] >= closes[n-2] * 0.99) {
    const score = Math.min(25, Math.round((lastVol / avgVol20) * 6));
    totalScore += score;
    signals.push({ icon: '💥', label: 'Volume Meledak', signalName: 'Volume Meledak', detail: `Volume hari ini ${(lastVol/avgVol20).toFixed(1)}x rata-rata`, score });
  }
  if (rsi > 30 && rsi < 55 && rsiSlope > 8) {
    const score = Math.min(20, Math.round(rsiSlope * 1.2));
    totalScore += score;
    signals.push({ icon: '📈', label: 'RSI Recovery Diam-diam', signalName: 'RSI Recovery Diam-diam', detail: `RSI naik ${rsiSlope.toFixed(0)} poin dalam 5 hari`, score });
  }
  const consolidationHigh = Math.max(...highs.slice(-10, -1));
  if (closes[n-1] > consolidationHigh * 1.01 && lastVol > avgVol20 * 1.5 && range20Pct < 15) {
    totalScore += 25;
    signals.push({ icon: '🚀', label: 'Breakout Konsolidasi', signalName: 'Breakout Konsolidasi', detail: `Harga tembus resistance ${Math.round(consolidationHigh)} dengan volume ${(lastVol/avgVol20).toFixed(1)}x`, score: 25 });
  }

  if (signals.length === 0) return null;

  const finalScore = Math.min(99, totalScore);

  // Holding days dinamis dari ATR: makin volatile → move lebih cepat → hold lebih pendek
  const price_      = closes[n - 1] || 1;
  const atrRatioPre = atr > 0 ? atr / price_ : 0.02;
  const vf          = Math.min(2.5, atrRatioPre / 0.02);
  const daysARA     = Math.max(1, Math.round(1.5 / Math.max(0.5, vf)));
  const daysHigh    = Math.max(3, Math.round(5   / Math.max(0.5, vf)));
  const daysMed     = Math.max(5, Math.round(10  / Math.max(0.5, vf)));

  let potential, potentialColor, potentialDesc;
  if (finalScore >= 70 && signals.length >= 3) {
    potential = 'SANGAT TINGGI'; potentialColor = '#ff4d6a';
    potentialDesc = `Kombinasi sinyal kuat — potensi ARA dalam ${daysARA}–${daysARA * 3} hari`;
  } else if (finalScore >= 50 && signals.length >= 2) {
    potential = 'TINGGI'; potentialColor = '#ffb84d';
    potentialDesc = `Sinyal akumulasi terdeteksi — pantau ketat ${daysHigh}–${daysHigh * 2} hari`;
  } else {
    potential = 'SEDANG'; potentialColor = '#a78bfa';
    potentialDesc = `Beberapa sinyal awal — konfirmasi dalam ${daysMed}–${daysMed * 2} hari`;
  }
  return { signals, finalScore, potential, potentialColor, potentialDesc };
}

// ══════════════════════════════════════════════════════════════════════════════
// PER-TICKER FETCHER
// ══════════════════════════════════════════════════════════════════════════════

async function fetchTicker(sym, maxPBV, maxPER, maxRSI, crumb, usdIdr, sectorsMap = new Map()) {
  const symJK = sym.endsWith('.JK') ? sym : sym + '.JK';
  const qs = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';

  const [chartData, quoteData] = await Promise.all([
    fetchWithRetry(`https://query1.finance.yahoo.com/v8/finance/chart/${symJK}?range=1y&interval=1d&includePrePost=false&events=div,splits${qs}`),
    fetchWithRetry(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symJK}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,price${qs}`),
  ]);

  if (!chartData) return null;

  const result = chartData?.chart?.result?.[0];
  if (!result) return null;

  const qd = result.indicators?.quote?.[0] || {};
  const rawClose = qd.close  || [];
  const rawOpen  = qd.open   || [];
  const rawHigh  = qd.high   || [];
  const rawLow   = qd.low    || [];
  const rawVol   = qd.volume || [];
  const rawTs    = result.timestamp || [];
  const closes = [], opens = [], highs = [], lows = [], volumes = [], dates = [];
  for (let i = 0; i < rawClose.length; i++) {
    if (rawClose[i] != null && rawHigh[i] != null && rawLow[i] != null && rawOpen[i] != null) {
      closes.push(rawClose[i]);
      opens.push(rawOpen[i]);
      highs.push(rawHigh[i]);
      lows.push(rawLow[i]);
      volumes.push(rawVol[i] ?? 0);
      dates.push(rawTs[i] != null ? new Date(rawTs[i] * 1000) : null);
    }
  }

  if (closes.length < 20) return null;

  const price = closes[closes.length - 1];
  const ath   = Math.max(...highs);
  const dd    = (ath - price) / ath * 100;
  const rsiV  = calcRSI(closes);

  // Skor teknikal "saat ini" (0-100, 50=netral) — dipakai leaderboard untuk
  // dibandingkan sama winrate historis. Formula SAMA dengan yang dipakai
  // unified verdict engine di /dashboard, supaya angkanya konsisten di
  // seluruh aplikasi, bukan skor ke-3 yang beda lagi.
  const techSnap  = snapshot({ closes, highs, lows, vols: volumes });
  const techScore = scoreTechnical(techSnap);

  // Prediksi ML (1D/2D) — pakai OHLCV yang sudah difetch di atas, tanpa
  // request Yahoo tambahan. null kalau model/fitur belum tersedia.
  const ml = await predictMlSafe(sym, { closes, highs, lows, vols: volumes, dates });
  const mlScore1d = mlProbToScore(ml?.['1d']);
  const mlScore2d = mlProbToScore(ml?.['2d']);

  const qr = quoteData?.quoteSummary?.result?.[0] || {};
  const pr = qr.price                || {};
  const sd = qr.summaryDetail        || {};
  const ap = qr.assetProfile         || {};

  const sectorsVal = sectorsMap.get(sym) || null;
  
  // Fundamental dari Sectors.app (primer) atau Yahoo Finance (fallback)
  const { pbv, per, roe: roeRaw, der: derRaw } = calculateFundamentals(qr, sectorsVal, price, usdIdr);

  // ── Normalisasi unit SEBELUM masuk invScore ──────────────────────────────
  // ROE: Yahoo tidak konsisten (kadang 0.18, kadang -82.9). Normalisasi ke desimal, cap ±200%.
  const roe = (() => {
    if (roeRaw == null) return null;
    const v = Math.abs(roeRaw) > 2 ? roeRaw / 100 : roeRaw;
    return Math.abs(v) > 2 ? null : v;
  })();
  const der = derRaw;

  const mc   = pr.marketCap?.raw ?? sd.marketCap?.raw ?? null;
  const name = pr.longName || pr.shortName || ap.longName || sym;
  const sec  = ap.sector || '—';

  // ── FILTER: buang hanya yang benar-benar tidak punya data teknikal ──────────
  // Jangan filter by hasBuySignal — ini yang menyebabkan banyak saham hilang.
  // Semua saham ditampilkan, diurutkan by Score. User bisa lihat sendiri mana yang menarik.
  const extremelyBad = (pbv && pbv > maxPBV * 2) && (per && per > maxPER * 2) && (rsiV > 80);
  if (extremelyBad) return null;

  // ── SCORE ──────────────────────────────────────────────────────────────────
  const sc = invScore(pbv, per, rsiV, dd, roe, der, sec);

  // Generate signals
  const swingSignals = generateSwingSignals(closes, highs, lows);
  const scalpSignals = generateScalpingSignals(closes, highs, lows);
  const accumSignals = detectAccumulation(closes, volumes);
  const intradayPattern = detectIntradayPattern(closes, opens, highs, lows, volumes);
  const preARA = detectPreARA(closes, opens, highs, lows, volumes);

  return {
    Ticker:         sym,
    Nama:           (name || sym).substring(0, 26),
    Sektor:         sec,
    Harga:          Math.round(price),
    PBV:            pbv,
    PER:            per,
    RSI:            Math.round(rsiV * 10) / 10,
    'DD%':          Math.round(dd * 10) / 10,
    'ROE%':         roe != null ? parseFloat((roe * 100).toFixed(2)) : null,
    'D/E':          der,
    Score:          sc.total,
    Grade:          sc.grade,
    Verdict:        sc.verdict,
    ScoreBreakdown: sc.breakdown,
    'MktCap(B)':    mc != null ? Math.round(mc / 1e9 * 10) / 10 : null,
    TechnicalScore: techScore?.score ?? null,
    TechnicalNote:  techScore?.note ?? null,
    // Prediksi ML (probabilitas naik, 0-100, 50=netral) — null kalau model
    // belum dilatih/di-export ONNX. Sama seperti TechnicalScore, dihitung
    // dari data yang sudah difetch, tanpa panggilan Yahoo tambahan.
    MLScore1d: mlScore1d,
    MLScore2d: mlScore2d,
    MLNote: ml == null
      ? 'Model ML belum tersedia'
      : `Probabilitas naik: 1D ${mlScore1d ?? '—'}% · 2D ${mlScore2d ?? '—'}%`,
    // ✅ Flatten untuk frontend compatibility
    _swingSignals:  swingSignals,
    _scalpSignals:  scalpSignals,
    _accumSignals:  accumSignals,
    _liquidityScore: calculateLiquidityScore(volumes, price, mc),
    _intradayPattern: intradayPattern,
    _preARA:        preARA,
    // Original nested structure
    signals: {
      swing:        swingSignals,
      scalp:        scalpSignals,
      accumulation: accumSignals,
      liquidity:    calculateLiquidityScore(volumes, price, mc),
    },
    buyZone: calcBuyZone(closes, highs, lows),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// API HANDLER
// ══════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ✅ Filter default SANGAT LONGGAR - hampir semua saham bisa masuk
  const { tickers, maxPBV = 10, maxPER = 50, maxRSI = 70 } = req.body;
  if (!tickers || !Array.isArray(tickers) || tickers.length === 0)
    return res.status(400).json({ error: 'tickers array required' });

  const [crumb, usdIdr, sectorsMap] = await Promise.all([
    getCrumb(),
    getUSDIDR(),
    getSectorsValuationBatch(tickers),
  ]);

  const results = [];
  const errors  = [];
  const BATCH   = 5;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch   = tickers.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(sym => fetchTicker(sym, maxPBV, maxPER, maxRSI, crumb, usdIdr, sectorsMap))
    );
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      if (s.status === 'fulfilled' && s.value) results.push(s.value);
      else if (s.status === 'rejected') errors.push(`${batch[j]}: ${s.reason?.message || 'unknown'}`);
    }
    if (i + BATCH < tickers.length) await new Promise(res => setTimeout(res, 150));
  }

  results.sort((a, b) => b.Score - a.Score);

  res.setHeader('Cache-Control', 's-maxage=1800');
  return res.status(200).json({
    results,
    total:          results.length,
    screened:       tickers.length,
    usdIdr,
    sectorsEnabled: sectorsMap.size > 0,
    errors:         errors.length > 0 ? errors : undefined,
  });
}