// pages/api/ml-insight.js
// Bahan untuk panel "Teknikal vs Prediksi AI" di halaman detail saham:
// kartu model (seberapa bisa dipercaya), riwayat prediksi out-of-sample, dan
// riwayat prediksi harian sungguhan untuk SATU ticker.
//
// Tipis, seperti chart.js: semua logika baca-file ada di lib/data/ml-insight.js,
// kebijakan cache di lib/core/cache.js. Tidak memuat model, tidak memanggil Yahoo.
//
//   GET /api/ml-insight?ticker=BBCA

import { bangunInsight } from '../../lib/data/ml-insight.js';
import { applyCache } from '../../lib/core/cache.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only', kind: 'BAD_REQUEST' });
  }

  const ticker = String(req.query.ticker || '').toUpperCase().replace(/\.JK$/, '').trim();
  // Kode saham IDX: 4 huruf (kadang campur angka). Batas 2-6 supaya input aneh
  // tidak pernah sampai ke pembacaan file.
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'ticker wajib diisi dengan kode saham yang valid', kind: 'BAD_REQUEST' });
  }

  try {
    const body = bangunInsight(ticker);
    const meta = applyCache(res, 'MARKET');
    return res.status(200).json({ ...body, _meta: meta });
  } catch (e) {
    return res.status(500).json({ error: e.message, kind: 'UNKNOWN' });
  }
}
