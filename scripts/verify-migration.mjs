// scripts/verify-migration.mjs
// Membuktikan refactor TIDAK mengubah angka.
//
// Jalankan: node scripts/verify-migration.mjs
//
// 1. invScore versi lib/ dibandingkan dengan salinan lama (ditulis ulang persis
//    di bawah) pada 200.000 kombinasi acak. Kalau ada satu saja yang beda,
//    skrip gagal — artinya refactor menggeser skor dan harus diperiksa.
// 2. calcRSI versi lib/ dibandingkan dengan dua implementasi lama.

import { invScore } from '../lib/core/scoring.js';
import { calcRSI } from '../lib/core/indicators.js';
import { buildVerdict } from '../lib/core/verdict.js';

// ── Salinan LAMA persis seperti di pages/index.js:5477 ──────────────────────
const SECTOR_BENCH_OLD = {
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

function invScoreOldIndex(pbv, per, rsiV, dd, roe, der, sector) {
  const bench = SECTOR_BENCH_OLD[sector] || { pbv: 2.0, per: 15 };  // <- versi index.js, roe/der hilang
  const bd = {
    PBV:      pbv && pbv > 0 ? Math.round(Math.max(0, Math.min(20, 20 * (1 - Math.pow(pbv / bench.pbv, 1.3))))) : 0,
    PER:      per && per > 0 && per < 500 ? Math.round(Math.max(0, Math.min(20, 20 * (1 - Math.pow(per / bench.per, 1.3))))) : 0,
    RSI:      rsiV < 25 ? 20 : rsiV < 30 ? 17 : rsiV < 35 ? 14 : rsiV < 40 ? 11 : rsiV < 45 ? 8 : rsiV < 50 ? 5 : rsiV < 55 ? 2 : 0,
    Drawdown: typeof dd === 'number' ? Math.round(Math.max(0, 10 - dd * 0.3)) : 5,
    ROE:      roe && roe > 0 ? Math.round(Math.min(20, (roe / (bench.roe || 0.12)) * 20)) : 0,
    'D/E':    typeof der === 'number' ? Math.round(Math.max(0, 10 * (1 - der / (bench.der || 1.5)))) : 5,
  };
  const total = Math.round(Object.values(bd).reduce((s, v) => s + v, 0));
  const grade = total >= 75 ? 'A' : total >= 55 ? 'B' : total >= 35 ? 'C' : 'D';
  const verdict = grade === 'A' ? 'BELI' : grade === 'B' ? 'PERHATIKAN' : grade === 'C' ? 'TAHAN' : 'HINDARI';
  return { total, grade, verdict, breakdown: bd };
}

function calcRSIOld(closes, w = 14) {
  if (closes.length < w + 1) return 50;
  let g = 0, l = 0;
  for (let i = 1; i <= w; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= w; l /= w;
  for (let i = w + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g = (g * (w - 1) + (d > 0 ? d : 0)) / w;
    l = (l * (w - 1) + (d < 0 ? -d : 0)) / w;
  }
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / l);
}

// ── Jalankan ────────────────────────────────────────────────────────────────
const SECTORS = [...Object.keys(SECTOR_BENCH_OLD), 'Sektor Tidak Dikenal', '—'];
let mismatch = 0, checked = 0;
const contoh = [];

function rnd(min, max) { return min + Math.random() * (max - min); }

for (let i = 0; i < 200000; i++) {
  const sector = SECTORS[Math.floor(Math.random() * SECTORS.length)];
  const args = [
    Math.random() < 0.08 ? null : rnd(0.05, 12),   // pbv
    Math.random() < 0.08 ? null : rnd(0.5, 600),   // per
    rnd(5, 95),                                    // rsi
    Math.random() < 0.05 ? null : rnd(0, 90),      // dd
    Math.random() < 0.08 ? null : rnd(-0.3, 0.6),  // roe
    Math.random() < 0.05 ? null : rnd(0, 6),       // der
    sector,
  ];
  const a = invScore(...args);
  const b = invScoreOldIndex(...args);
  checked++;
  if (a.total !== b.total || a.grade !== b.grade || a.verdict !== b.verdict) {
    mismatch++;
    if (contoh.length < 5) contoh.push({ args, baru: a.total, lama: b.total });
  }
}

console.log(`invScore: ${checked} kombinasi dicek, ${mismatch} beda`);
if (mismatch) { console.log(contoh); }

// RSI
let rsiMismatch = 0;
for (let i = 0; i < 2000; i++) {
  const n = 20 + Math.floor(Math.random() * 300);
  const closes = [100];
  for (let j = 1; j < n; j++) closes.push(Math.max(1, closes[j - 1] * (1 + rnd(-0.07, 0.07))));
  if (Math.abs(calcRSI(closes) - calcRSIOld(closes)) > 1e-9) rsiMismatch++;
}
console.log(`calcRSI: 2000 seri dicek, ${rsiMismatch} beda`);

// Verdict engine — cek perilaku, bukan angka lama (ini modul baru)
const kasus = [
  {
    nama: 'Fundamental bagus + overbought -> tunggu koreksi',
    input: {
      fundamental: { total: 72, grade: 'B', verdict: 'PERHATIKAN' },
      snapshot: { rsi: 76, price: 1200, bb: { upper: 1150, lower: 900, mid: 1025 }, ma20: 1100, ma50: 1050, macdHist: 2, macdHistPrev: 1, prevClose: 1180, volRatio: 1.1 },
      horizon: '30d',
    },
  },
  {
    nama: 'Semua pilar hilang -> tidak boleh ngaku yakin',
    input: { horizon: '1d' },
  },
  {
    nama: 'Teknikal bagus tapi asing net sell 5 hari -> turun 1 tingkat',
    input: {
      fundamental: { total: 60, grade: 'B' },
      snapshot: { rsi: 28, price: 880, bb: { upper: 1100, lower: 885, mid: 990 }, ma20: 950, ma50: 900, macdHist: 1, macdHistPrev: -1, prevClose: 860, volRatio: 2.2 },
      foreign: { netStreak: -5 },
      horizon: '3d',
    },
  },
];

console.log('\nUnified verdict engine:');
for (const k of kasus) {
  const v = buildVerdict(k.input);
  console.log(`  ${k.nama}`);
  console.log(`    -> ${v.label} | skor ${v.score} | keyakinan ${v.confidence} | coverage ${v.dataQuality.coverage}`);
  if (v.conflicts.length) console.log(`    -> konflik: ${v.conflicts.map((c) => c.id).join(', ')}`);
}

process.exit(mismatch || rsiMismatch ? 1 : 0);
