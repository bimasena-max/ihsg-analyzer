// pages/api/backtest-stats.js
// Menggantikan 2,5 MB literal yang dulu ikut dibundel ke browser.
//   /api/backtest-stats                  -> index ringan (ticker -> daftar sinyal)
//   /api/backtest-stats?ticker=BBCA      -> statistik satu ticker (~10 KB)
//   /api/backtest-stats?ticker=BBCA&signal=...&horizon=1d -> satu angka + asalnya

import { globalStats, statsIndex, tickerStats, statsFor, availableHorizons } from '../../lib/data/backtest.js';
import { applyCache } from '../../lib/core/cache.js';

export default function handler(req, res) {
  const { ticker, signal, horizon, scope } = req.query;
  const meta = applyCache(res, 'BACKTEST');

  try {
    if (scope === 'global') return res.status(200).json({ stats: globalStats(), _meta: meta });

    if (ticker && signal) {
      const stats = statsFor(ticker, signal, horizon || '3d');
      return res.status(200).json({
        stats,
        horizonsTersedia: availableHorizons(ticker, signal),
        _meta: meta,
      });
    }

    if (ticker) {
      const stats = tickerStats(ticker);
      if (!stats) {
        return res.status(404).json({
          error: `Belum ada statistik backtest untuk ${ticker}`,
          kind: 'NO_DATA',
          _meta: meta,
        });
      }
      return res.status(200).json({ ticker: String(ticker).toUpperCase(), stats, _meta: meta });
    }

    return res.status(200).json({ index: statsIndex(), _meta: meta });
  } catch (e) {
    return res.status(500).json({ error: e.message, kind: 'STATS_READ' });
  }
}
