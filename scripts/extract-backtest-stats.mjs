// scripts/extract-backtest-stats.mjs
// Migrasi sekali jalan: menarik BACKTEST_STATS dan TICKER_SIGNAL_STATS yang
// dulu ditulis tangan di pages/index.js keluar jadi file JSON.
//
//   node scripts/extract-backtest-stats.mjs path/ke/index.js.lama
//
// Setelah ini, sumber kebenaran statistik backtest adalah data/backtest/*.json
// yang di-generate dari backtest_bei.py — bukan literal di dalam komponen UI.

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const src = process.argv[2] || 'pages/index.js';
const outDir = path.join(process.cwd(), 'data', 'backtest');

const lines = fs.readFileSync(src, 'utf8').split('\n');
const findStart = (name) => lines.findIndex((l) => l.startsWith(`const ${name} = {`));
const findEnd = (from) => lines.findIndex((l, i) => i >= from && l.trimEnd() === '};');

const btStart = findStart('BACKTEST_STATS');
const tsStart = findStart('TICKER_SIGNAL_STATS');
if (btStart < 0 || tsStart < 0) {
  console.error('Literal BACKTEST_STATS / TICKER_SIGNAL_STATS tidak ditemukan di', src);
  process.exit(1);
}

const tmp = path.join(process.cwd(), '.stats-tmp.mjs');
fs.writeFileSync(tmp,
  'export ' + lines.slice(btStart, findEnd(btStart) + 1).join('\n') + '\n' +
  'export ' + lines.slice(tsStart, findEnd(tsStart) + 1).join('\n') + '\n');

const { BACKTEST_STATS, TICKER_SIGNAL_STATS } = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

fs.mkdirSync(path.join(outDir, 'tickers'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'global.json'), JSON.stringify(BACKTEST_STATS));

const index = {};
for (const [ticker, sinyal] of Object.entries(TICKER_SIGNAL_STATS)) {
  fs.writeFileSync(path.join(outDir, 'tickers', `${ticker}.json`), JSON.stringify(sinyal));
  index[ticker] = Object.keys(sinyal);
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));

const pairs = Object.values(index).reduce((s, v) => s + v.length, 0);
console.log(`OK — ${Object.keys(BACKTEST_STATS).length} sinyal global, ${Object.keys(index).length} ticker, ${pairs} pasangan ticker×sinyal.`);
console.log(`Sekarang hapus baris ${btStart + 1}-${findEnd(tsStart) + 1} dari ${src} dan ambil datanya lewat /api/backtest-stats.`);
