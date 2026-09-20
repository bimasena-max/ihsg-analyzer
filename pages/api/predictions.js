// pages/api/predictions.js
// Membaca hasil batch job ML (data/predictions/). Tidak ada model yang dimuat
// di sini — Vercel serverless bukan tempat untuk itu.

import fs from 'fs';
import path from 'path';
import { applyCache } from '../../lib/core/cache.js';

const DIR = path.join(process.cwd(), 'data', 'predictions');

export default function handler(req, res) {
  const { horizon = '1d', ticker } = req.query;
  const meta = applyCache(res, 'BACKTEST');

  if (!fs.existsSync(DIR)) {
    return res.status(200).json({ tersedia: false, alasan: 'Batch prediksi belum pernah jalan.', _meta: meta });
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(`-${horizon}.json`)).sort();
  if (!files.length) {
    return res.status(200).json({ tersedia: false, alasan: `Belum ada prediksi untuk horizon ${horizon}. Model kemungkinan belum lolos baseline.`, _meta: meta });
  }

  const data = JSON.parse(fs.readFileSync(path.join(DIR, files[files.length - 1]), 'utf8'));

  if (ticker) {
    const t = String(ticker).toUpperCase();
    return res.status(200).json({
      tersedia: Boolean(data.prediksi?.[t]),
      ticker: t,
      prediksi: data.prediksi?.[t] || null,
      model: data.model,
      disclaimer: data.disclaimer,
      _meta: meta,
    });
  }

  return res.status(200).json({ tersedia: true, ...data, _meta: meta });
}
