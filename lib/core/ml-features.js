// lib/core/ml-features.js
// Port JavaScript dari ml/features.py — HARUS menghasilkan angka yang sama
// persis dengan versi Python, karena model ONNX dilatih dari fitur Python.
//
// Kalau features.py berubah, file ini WAJIB diupdate mengikuti — kalau tidak,
// prediksi model jadi berbasis input yang salah (silent bug paling berbahaya
// di seluruh pipeline ML ini).
//
// Beda dari Python: di sini kita cuma butuh fitur untuk BAR TERAKHIR (real-time
// inference saat user pencet Screener), bukan seluruh matriks historis untuk
// training. Jadi fungsi ini return satu objek {fitur: angka}, bukan DataFrame.

import {
  calcRSISeries, calcEMA, calcMACD, calcATR,
} from './indicators.js';

const isNum = (v) => typeof v === 'number' && isFinite(v);

export const MIN_BARS = 200;

// Urutan HARUS sama persis dengan FEATURE_COLS di ml/features.py —
// model ONNX menerima input berdasarkan posisi array, bukan nama.
export const FEATURE_COLS = [
  'rsi14', 'rsi9', 'rsi14_chg3', 'macd_hist', 'macd_hist_chg',
  'bb_pos', 'bb_width', 'dist_ema5', 'dist_ema20', 'dist_ema50',
  'atr_ratio', 'ret_1', 'ret_3', 'ret_5', 'vol_ratio', 'vol_trend',
  'dd_from_high', 'dow',
];

/**
 * Bangun fitur ML untuk bar TERAKHIR dari deret OHLCV.
 * closes/highs/lows/vols: array angka, urut lama -> baru (sama seperti
 * konvensi lib/core/indicators.js).
 * dates: array Date atau string tanggal ISO, urutan sama dengan closes
 *        (dibutuhkan untuk fitur 'dow' — day of week).
 *
 * Return: { features: {nama: angka}, vector: [angka...], missing: [nama...] }
 *   - vector sudah dalam urutan FEATURE_COLS, siap dilempar ke model ONNX
 *   - missing berisi nama fitur yang gagal dihitung (data kurang) — kalau
 *     tidak kosong, JANGAN jalankan inference, sama seperti features.py
 *     yang men-dropna() baris dengan fitur kosong.
 */
export function buildLastBarFeatures({ closes, highs, lows, vols, dates }) {
  const n = closes?.length || 0;
  // Screener mengambil range=1y dari Yahoo, dan BEI cuma buka ~247 hari per
  // tahun. Syarat lama 260 bar TIDAK PERNAH terpenuhi, jadi MLScore selalu null
  // ("Model ML belum tersedia") untuk semua saham walau model sudah ada.
  // 200 bar cukup: RSI/ATR (Wilder), MACD, dan EMA50 sudah konvergen di titik ini,
  // dan dd_from_high memakai window parsial persis seperti Python
  // (`rolling(252, min_periods=20)`). predict.py (batch harian) tetap minta 260
  // karena datanya diambil lebih panjang.
  if (n < MIN_BARS) {
    return { features: null, vector: null, missing: [`data_kurang_dari_${MIN_BARS}_bar`] };
  }

  const c = closes, h = highs, l = lows, v = vols;
  const i = n - 1; // bar terakhir

  const rsi14Series = calcRSISeries(c, 14);
  const rsi9Series = calcRSISeries(c, 9);
  const rsi14 = rsi14Series[i];
  const rsi9 = rsi9Series[i];
  const rsi14_3ago = rsi14Series[i - 3];
  const rsi14_chg3 = isNum(rsi14) && isNum(rsi14_3ago) ? rsi14 - rsi14_3ago : null;

  const macd = calcMACD(c, 12, 26, 9);
  const macd_hist = macd.hist[i];
  const macd_hist_prev = macd.hist[i - 1];
  const macd_hist_chg = isNum(macd_hist) && isNum(macd_hist_prev) ? macd_hist - macd_hist_prev : null;

  // features.py: sd20 = c.rolling(20).std() — pandas memakai std SAMPEL (bagi 19).
  // calcBollinger() di indicators.js memakai std populasi (bagi 20) untuk pita di
  // UI, jadi sengaja TIDAK dipakai di sini: selisihnya ~2,6% pada lebar pita dan
  // menggeser bb_pos/bb_width dari yang dilihat model saat dilatih.
  //   bb_pos = (c - (ma20 - 2*sd20)) / (4*sd20) ; bb_width = 4*sd20 / ma20
  let bb_pos = null, bb_width = null;
  if (i >= 19) {
    const win = c.slice(i - 19, i + 1);
    if (win.every(isNum)) {
      const mid = win.reduce((sum, x) => sum + x, 0) / 20;
      const sd = Math.sqrt(win.reduce((sum, x) => sum + (x - mid) ** 2, 0) / 19);
      const span = 4 * sd;
      bb_pos = span !== 0 ? (c[i] - (mid - 2 * sd)) / span : null;
      bb_width = mid !== 0 ? span / mid : null;
    }
  }

  const ema5 = calcEMA(c, 5)[i];
  const ema20 = calcEMA(c, 20)[i];
  const ema50 = calcEMA(c, 50)[i];
  const dist_ema5 = isNum(ema5) && ema5 !== 0 ? c[i] / ema5 - 1 : null;
  const dist_ema20 = isNum(ema20) && ema20 !== 0 ? c[i] / ema20 - 1 : null;
  const dist_ema50 = isNum(ema50) && ema50 !== 0 ? c[i] / ema50 - 1 : null;

  const atrArr = calcATR(h, l, c, 14);
  const atrLast = atrArr[i];
  const atr_ratio = isNum(atrLast) && c[i] !== 0 ? atrLast / c[i] : null;

  const ret_1 = isNum(c[i - 1]) && c[i - 1] !== 0 ? c[i] / c[i - 1] - 1 : null;
  const ret_3 = isNum(c[i - 3]) && c[i - 3] !== 0 ? c[i] / c[i - 3] - 1 : null;
  const ret_5 = isNum(c[i - 5]) && c[i - 5] !== 0 ? c[i] / c[i - 5] - 1 : null;

  const vol20Slice = v.slice(Math.max(0, i - 19), i + 1).filter(isNum);
  const vol20 = vol20Slice.length === 20
    ? vol20Slice.reduce((s, x) => s + x, 0) / 20
    : null;
  const vol_ratio = isNum(vol20) && vol20 !== 0 ? v[i] / vol20 : null;

  // vol_trend = vol20_sekarang / vol20_10bar_lalu - 1
  let vol_trend = null;
  if (i - 10 >= 19) {
    const vol20PrevSlice = v.slice(i - 10 - 19, i - 10 + 1).filter(isNum);
    if (vol20PrevSlice.length === 20) {
      const vol20Prev = vol20PrevSlice.reduce((s, x) => s + x, 0) / 20;
      vol_trend = isNum(vol20) && vol20Prev !== 0 ? vol20 / vol20Prev - 1 : null;
    }
  }

  // dd_from_high: rolling 252 bar (min_periods 20) max, dari harga close
  const lookback = Math.min(252, i + 1);
  if (lookback < 20) {
    return { features: null, vector: null, missing: ['dd_from_high_data_kurang'] };
  }
  const windowSlice = c.slice(i - lookback + 1, i + 1).filter(isNum);
  const rollingHigh = windowSlice.length ? Math.max(...windowSlice) : null;
  const dd_from_high = isNum(rollingHigh) && rollingHigh !== 0 ? c[i] / rollingHigh - 1 : null;

  // day of week: Python pandas dayofweek -> Senin=0 ... Minggu=6, sama
  // dengan JS Date.getDay() digeser (JS: Minggu=0 ... Sabtu=6).
  let dow = null;
  if (dates && dates[i] != null) {
    const d = dates[i] instanceof Date ? dates[i] : new Date(dates[i]);
    if (!isNaN(d.getTime())) {
      const jsDay = d.getDay(); // 0=Minggu..6=Sabtu
      dow = jsDay === 0 ? 6 : jsDay - 1; // -> 0=Senin..6=Minggu
    }
  }

  const features = {
    rsi14, rsi9, rsi14_chg3, macd_hist, macd_hist_chg,
    bb_pos, bb_width, dist_ema5, dist_ema20, dist_ema50,
    atr_ratio, ret_1, ret_3, ret_5, vol_ratio, vol_trend,
    dd_from_high, dow,
  };

  const missing = FEATURE_COLS.filter((k) => !isNum(features[k]));
  if (missing.length > 0) {
    return { features, vector: null, missing };
  }

  const vector = FEATURE_COLS.map((k) => features[k]);
  return { features, vector, missing: [] };
}
