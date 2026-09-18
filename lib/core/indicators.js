// lib/core/indicators.js
// SATU sumber untuk semua fungsi indikator. Di-import frontend DAN API routes.
// Sebelumnya calcRSI ada 2 salinan (pages/index.js + pages/api/screener.js)
// dengan default period yang ditulis beda (w=14 vs period=14).
//
// Kontrak semua fungsi di file ini:
//   - input array angka (closes/highs/lows/vols), urut lama -> baru
//   - TIDAK melempar error untuk data pendek; mengembalikan null / array berisi null
//   - TIDAK memodifikasi array input

const isNum = (v) => typeof v === 'number' && isFinite(v);

function cleanSeries(arr) {
  return Array.isArray(arr) ? arr.filter(isNum) : [];
}

// ── RSI ─────────────────────────────────────────────────────────────────────
// Wilder's smoothing. Mengembalikan nilai terakhir (bukan array) supaya
// kompatibel dengan pemakaian lama: calcRSI(closes) -> number.
export function calcRSI(closes, period = 14) {
  const c = cleanSeries(closes);
  if (c.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = c[i] - c[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

// Versi array — dibutuhkan untuk bikin fitur ML (butuh RSI di setiap bar).
export function calcRSISeries(closes, period = 14) {
  const c = cleanSeries(closes);
  const out = new Array(c.length).fill(null);
  if (c.length < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = c[i] - c[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// ── Moving averages ─────────────────────────────────────────────────────────
export function calcMA(arr, window) {
  const a = Array.isArray(arr) ? arr : [];
  return a.map((_, i) => {
    if (i < window - 1) return null;
    let s = 0;
    for (let j = i - window + 1; j <= i; j++) {
      if (!isNum(a[j])) return null;
      s += a[j];
    }
    return s / window;
  });
}

export function calcEMA(arr, period) {
  const a = Array.isArray(arr) ? arr : [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = null;
  for (let i = 0; i < a.length; i++) {
    if (!isNum(a[i])) { out.push(prev); continue; }
    prev = prev === null ? a[i] : a[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

// ── MACD ────────────────────────────────────────────────────────────────────
export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const ef = calcEMA(closes, fast);
  const es = calcEMA(closes, slow);
  const macd = ef.map((v, i) => (isNum(v) && isNum(es[i]) ? v - es[i] : null));
  const sig = calcEMA(macd.map((v) => (isNum(v) ? v : 0)), signal);
  const hist = macd.map((v, i) => (isNum(v) && isNum(sig[i]) ? v - sig[i] : null));
  return { macd, signal: sig, hist };
}

// ── Bollinger Bands ─────────────────────────────────────────────────────────
export function calcBollinger(arr, window = 20, mult = 2) {
  const a = Array.isArray(arr) ? arr : [];
  return a.map((_, i) => {
    if (i < window - 1) return null;
    const slice = a.slice(i - window + 1, i + 1);
    if (slice.some((v) => !isNum(v))) return null;
    const mid = slice.reduce((s, v) => s + v, 0) / window;
    const sd = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / window);
    return { mid, upper: mid + mult * sd, lower: mid - mult * sd, width: (4 * sd) / mid };
  });
}

// ── Stochastic ──────────────────────────────────────────────────────────────
export function calcStochastic(highs, lows, closes, period = 14, smooth = 3) {
  const n = closes?.length || 0;
  if (n < period) return { k: 50, d: 50 };
  const kArr = [];
  for (let i = period - 1; i < n; i++) {
    const hh = Math.max(...highs.slice(i - period + 1, i + 1));
    const ll = Math.min(...lows.slice(i - period + 1, i + 1));
    kArr.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
  }
  const k = kArr[kArr.length - 1];
  const dSlice = kArr.slice(-smooth);
  const d = dSlice.reduce((s, v) => s + v, 0) / dSlice.length;
  return { k, d };
}

// ── ATR ─────────────────────────────────────────────────────────────────────
export function calcATR(highs, lows, closes, period = 14) {
  const n = closes?.length || 0;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  const tr = [0];
  for (let i = 1; i < n; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  let atr = tr.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  out[period] = atr;
  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i] = atr;
  }
  return out;
}

export function calcATRStopLoss(price, atr, multiplier = 1.5) {
  if (!isNum(price) || !isNum(atr)) return null;
  return Math.round(price - atr * multiplier);
}

// ── Level harga ─────────────────────────────────────────────────────────────
export function findNearestResistance(highs, price, lookback = 60) {
  const h = (highs || []).slice(-lookback).filter(isNum);
  const above = h.filter((v) => v > price * 1.01);
  return above.length ? Math.round(Math.min(...above)) : null;
}

export function calcFibTargets(closes, highs, lows, lookback = 90) {
  const h = (highs || []).slice(-lookback).filter(isNum);
  const l = (lows || []).slice(-lookback).filter(isNum);
  if (!h.length || !l.length) return {};
  const hi = Math.max(...h), lo = Math.min(...l), range = hi - lo;
  if (range <= 0) return {};
  return {
    r236: Math.round(hi - range * 0.236),
    r382: Math.round(hi - range * 0.382),
    r500: Math.round(hi - range * 0.5),
    r618: Math.round(hi - range * 0.618),
    ext1272: Math.round(hi + range * 0.272),
    ext1618: Math.round(hi + range * 0.618),
  };
}

// ── Helper ringkas untuk konsumen (verdict engine, ML feature builder) ──────
// Satu panggilan -> semua indikator terakhir, supaya tidak ada tempat lain
// yang menghitung ulang dengan parameter berbeda.
export function snapshot({ closes = [], highs = [], lows = [], vols = [] }) {
  const n = closes.length;
  if (n < 2) return null;
  const price = closes[n - 1];
  const bb = calcBollinger(closes, 20);
  const macd = calcMACD(closes);
  const atrArr = calcATR(highs, lows, closes, 14);
  const atr = atrArr[n - 1] ?? price * 0.02;
  const vol20 = vols.slice(-20).filter(isNum);
  const volAvg = vol20.length ? vol20.reduce((s, v) => s + v, 0) / vol20.length : null;
  const hi = highs.length ? Math.max(...highs.filter(isNum)) : price;

  return {
    n,
    price,
    prevClose: closes[n - 2],
    rsi: calcRSI(closes),
    rsi9: calcRSI(closes, 9),
    macdHist: macd.hist[n - 1],
    macdHistPrev: macd.hist[n - 2],
    bb: bb[n - 1],
    bbWidth: bb[n - 1]?.width ?? null,
    ma20: calcMA(closes, 20)[n - 1],
    ma50: calcMA(closes, 50)[n - 1],
    ema5: calcEMA(closes, 5)[n - 1],
    ema20: calcEMA(closes, 20)[n - 1],
    ema50: calcEMA(closes, 50)[n - 1],
    stoch: calcStochastic(highs, lows, closes),
    atr,
    atrRatio: price ? atr / price : null,
    volAvg,
    volCur: vols[n - 1] ?? null,
    volRatio: volAvg ? vols[n - 1] / volAvg : null,
    drawdownPct: hi > 0 ? ((hi - price) / hi) * 100 : 0,
    resistance: findNearestResistance(highs, price),
    fibs: calcFibTargets(closes, highs, lows),
  };
}
