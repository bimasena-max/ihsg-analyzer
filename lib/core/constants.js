// lib/core/constants.js
// SATU-SATUNYA sumber konstanta yang dipakai frontend maupun API routes.
// Sebelumnya SECTOR_BENCH di-copy di pages/index.js, pages/api/screener.js,
// dan pages/api/quote.js (3 salinan). Jangan bikin salinan baru.

export const SECTOR_BENCH = {
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

// Dipakai kalau sektor tidak dikenali. PENTING: harus lengkap (pbv/per/roe/der).
// Versi lama di pages/index.js cuma punya {pbv, per} — kebetulan tidak merusak skor
// karena ada fallback `bench.roe || 0.12`, tapi itu bug yang menunggu terjadi.
export const DEFAULT_BENCH = { pbv: 2.0, per: 15, roe: 0.12, der: 1.5 };

export function benchFor(sector) {
  return SECTOR_BENCH[sector] || DEFAULT_BENCH;
}

// ── Horizon backtest ────────────────────────────────────────────────────────
// '1d' dan '2d' BELUM ada di CSV backtest lama (backtest_trades_v2.csv cuma
// punya ret_3d..ret_60d). Dua horizon ini baru terisi setelah backtest
// dijalankan ulang dari OHLC mentah — lihat docs/ROADMAP.md Tahap 3.
export const HORIZONS = ['1d', '2d', '3d', '5d', '7d', '14d', '30d', '60d'];
export const HORIZON_LABEL = {
  '1d': '1 Hari', '2d': '2 Hari', '3d': '3 Hari', '5d': '5 Hari',
  '7d': '7 Hari', '14d': '14 Hari', '30d': '30 Hari', '60d': '60 Hari',
};

// Horizon yang dipakai unified verdict untuk "sinyal cepat".
export const FAST_HORIZONS = ['1d', '2d'];

// ── Cache ───────────────────────────────────────────────────────────────────
// Semua endpoint yang membaca data pasar yang SAMA harus pakai TTL yang sama,
// kalau tidak halaman screener dan halaman detail bisa menampilkan status
// berbeda untuk saham yang sama di waktu yang sama.
// Sebelumnya: chart=300, news=300, quote=600, screener=1800 (4 nilai berbeda).
export const CACHE = {
  // Data harga/OHLC + turunannya (chart, quote, screener) — satu angka.
  MARKET: 600,
  // Berita boleh lebih pendek, tidak dipakai untuk skor.
  NEWS: 300,
  // Data asing IDX cuma update sekali sehari setelah closing.
  FOREIGN: 1800,
  // Statistik backtest statis sampai job backtest berikutnya jalan.
  BACKTEST: 86400,
};

export const VERDICTS = ['BELI', 'PERHATIKAN', 'TAHAN', 'HINDARI'];
