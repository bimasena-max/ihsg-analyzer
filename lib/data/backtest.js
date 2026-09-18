// lib/data/backtest.js
// Pengganti dua literal raksasa yang dulu ditulis tangan di pages/index.js:
//   BACKTEST_STATS      (103 baris)
//   TICKER_SIGNAL_STATS (4.553 baris, ~2,5 MB)
//
// Total 2,5 MB itu ikut terkirim ke browser setiap kali halaman dibuka,
// padahal satu sesi paling cuma butuh beberapa ticker.
//
// Sekarang: data disimpan sebagai JSON hasil generate (data/backtest/*.json),
// dibaca di server, dan frontend cuma mengambil potongan yang dibutuhkan
// lewat /api/backtest-stats. Shard terbesar ~10 KB.
//
// File JSON di data/backtest/ ADALAH OUTPUT, bukan sumber. Jangan diedit tangan —
// regenerate dengan `node scripts/extract-backtest-stats.mjs` (migrasi sekali)
// atau dari backtest_bei.py (lihat docs/ROADMAP.md Tahap 3).

import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'data', 'backtest');

let _global = null;
let _index = null;
const _tickerCache = new Map();

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new Error(`File statistik backtest rusak: ${file} — ${e.message}`);
  }
}

/** Statistik global per nama sinyal. */
export function globalStats() {
  if (!_global) _global = readJSON(path.join(DIR, 'global.json')) || {};
  return _global;
}

/** Daftar ticker -> nama sinyal yang punya data (ringan, aman dikirim ke browser). */
export function statsIndex() {
  if (!_index) _index = readJSON(path.join(DIR, 'index.json')) || {};
  return _index;
}

/** Statistik satu ticker. Mengembalikan null (bukan melempar) kalau memang belum ada. */
export function tickerStats(ticker) {
  const t = String(ticker || '').toUpperCase();
  if (!t) return null;
  if (_tickerCache.has(t)) return _tickerCache.get(t);
  const data = readJSON(path.join(DIR, 'tickers', `${t}.json`));
  _tickerCache.set(t, data);
  return data;
}

/**
 * Statistik untuk satu ticker + sinyal + horizon, dengan fallback eksplisit
 * ke statistik global. `source` selalu ikut dikembalikan supaya UI bisa jujur
 * memberi tahu user angka ini dari mana.
 */
export function statsFor(ticker, signalName, horizon = '3d') {
  const perTicker = tickerStats(ticker)?.[signalName];
  const bh = perTicker?.bh?.[horizon];
  if (bh && bh.n > 0) {
    return { ...bh, source: 'ticker', signal: signalName, ticker, horizon };
  }

  const g = globalStats()[signalName]?.byHorizon?.[horizon];
  if (g && g.n > 0) {
    return { ...g, source: 'global', signal: signalName, ticker, horizon };
  }

  return null;
}

/** Horizon apa saja yang benar-benar punya data (bukan sekadar label di UI). */
export function availableHorizons(ticker, signalName) {
  const perTicker = tickerStats(ticker)?.[signalName]?.bh;
  const g = globalStats()[signalName]?.byHorizon;
  const keys = new Set([...Object.keys(perTicker || {}), ...Object.keys(g || {})]);
  return [...keys];
}
