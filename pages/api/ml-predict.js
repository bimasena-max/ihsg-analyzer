// pages/api/ml-predict.js
// Prediksi ML on-demand: dipanggil panel "Prediksi AI" saat user menekan tombol
// Prediksi untuk satu horizon (1, 2, 3, 5, 7, 14, 30, atau 60 hari bursa).
//
//   GET /api/ml-predict?ticker=BBCA&horizon=5d
//
// Tipis, seperti chart.js: ambil data Yahoo lewat lib/data/yahoo.js (auth/retry di
// sana), hitung lewat lib/data/ml-predict.js, kebijakan cache di lib/core/cache.js.
// Tidak memakai onnxruntime dan tidak menyentuh pages/api/screener.js.

import { fetchChart, toOHLCV, YahooError } from '../../lib/data/yahoo.js';
import { applyCache } from '../../lib/core/cache.js';
import { hitungPrediksi, normalisasiHorizon, PrediksiError, HORIZONS } from '../../lib/data/ml-predict.js';

const STATUS_YAHOO = {
  AUTH: 502, RATE_LIMIT: 429, NOT_FOUND: 404,
  NETWORK: 504, UPSTREAM: 502, PARSE: 502,
};
const STATUS_PREDIKSI = { MODEL_MISSING: 404, MODEL_INVALID: 500, DATA_KURANG: 422 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only', kind: 'BAD_REQUEST' });
  }

  const ticker = String(req.query.ticker || '').toUpperCase().replace(/\.JK$/, '').trim();
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'ticker wajib diisi dengan kode saham yang valid', kind: 'BAD_REQUEST' });
  }
  const horizon = normalisasiHorizon(req.query.horizon);
  if (!horizon) {
    return res.status(400).json({ error: `horizon harus salah satu dari ${HORIZONS.join(', ')}`, kind: 'BAD_REQUEST' });
  }

  try {
    // 2 tahun (~495 bar): fitur dd_from_high memakai jendela 252 bar dan EMA butuh
    // pemanasan, jadi histori panjang membuat fitur persis seperti saat model dilatih.
    const chart = await fetchChart(ticker, { range: '2y', interval: '1d' });
    const hasil = hitungPrediksi(toOHLCV(chart), horizon);
    const meta = applyCache(res, 'MARKET');
    return res.status(200).json({ ticker, horizon, ...hasil, _meta: meta });
  } catch (e) {
    if (e instanceof PrediksiError) return res.status(STATUS_PREDIKSI[e.kind] ?? 500).json(e.toJSON());
    if (e instanceof YahooError) return res.status(STATUS_YAHOO[e.kind] ?? 502).json(e.toJSON());
    return res.status(500).json({ error: e.message, kind: 'UNKNOWN' });
  }
}
