// pages/api/chart.js
// Tipis. Semua logika auth/retry ada di lib/data/yahoo.js, semua kebijakan
// cache ada di lib/core/cache.js. Endpoint ini cuma menerjemahkan HTTP.

import { fetchChart, YahooError } from '../../lib/data/yahoo.js';
import { applyCache } from '../../lib/core/cache.js';

const STATUS_BY_KIND = {
  AUTH: 502, RATE_LIMIT: 429, NOT_FOUND: 404,
  NETWORK: 504, UPSTREAM: 502, PARSE: 502,
};

export default async function handler(req, res) {
  const { ticker, range = '1y', interval = '1d' } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker wajib diisi', kind: 'BAD_REQUEST' });

  try {
    const data = await fetchChart(ticker, { range, interval });
    const meta = applyCache(res, 'MARKET');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ ...data, _meta: meta });
  } catch (e) {
    if (e instanceof YahooError) {
      // Kegagalan dilaporkan apa adanya, bukan diganti objek kosong.
      // Frontend bisa membedakan "saham ini memang tidak ada" (404) dari
      // "sumber data lagi bermasalah" (502/504) dan menampilkan pesan berbeda.
      return res.status(STATUS_BY_KIND[e.kind] ?? 502).json(e.toJSON());
    }
    return res.status(500).json({ error: e.message, kind: 'UNKNOWN' });
  }
}
