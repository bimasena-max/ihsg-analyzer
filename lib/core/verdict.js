// lib/core/verdict.js
// UNIFIED SIGNAL ENGINE — satu-satunya tempat yang memutuskan verdict akhir.
//
// Masalah yang dipecahkan: sebelumnya ada 4 sistem sinyal yang jalan sendiri-sendiri
// (invScore fundamental, calcSignals teknikal, generateSwingSignals,
// generateScalpingSignals) dan tidak pernah direkonsiliasi, jadi tab "Screener"
// bisa bilang BELI sementara tab "Sinyal" bilang SELL untuk saham yang sama.
//
// Prinsip desain:
//   1. Bobot per pilar EKSPLISIT dan berubah sesuai horizon. Horizon 1-2 hari
//      hampir tidak dipengaruhi fundamental; horizon 30-60 hari sebaliknya.
//   2. Pilar yang datanya tidak ada TIDAK dihitung nol diam-diam — bobotnya
//      dinormalisasi ulang dan kekurangannya dilaporkan di `dataQuality`.
//   3. Konflik antar pilar tidak disembunyikan. Konflik mengubah label aksi
//      (contoh: "BELI (tunggu koreksi)") dan selalu ikut dikembalikan di
//      `conflicts` supaya bisa ditampilkan ke user.
//   4. Output SATU objek. Semua halaman/tab render dari objek yang sama.

import { FAST_HORIZONS } from './constants.js';

// ── Bobot per pilar, per kelompok horizon ───────────────────────────────────
// Angka ini adalah asumsi awal yang harus dikalibrasi ulang setelah backtest
// 1D/2D selesai (docs/ROADMAP.md Tahap 3). Ditaruh di sini, bukan disebar di UI.
const WEIGHTS = {
  fast:   { fundamental: 0.10, technical: 0.30, scalping: 0.30, swing: 0.10, flow: 0.20 },
  medium: { fundamental: 0.25, technical: 0.25, scalping: 0.10, swing: 0.25, flow: 0.15 },
  slow:   { fundamental: 0.45, technical: 0.20, scalping: 0.00, swing: 0.25, flow: 0.10 },
};

function weightProfile(horizon) {
  if (FAST_HORIZONS.includes(horizon)) return WEIGHTS.fast;
  if (['3d', '5d', '7d', '14d'].includes(horizon)) return WEIGHTS.medium;
  return WEIGHTS.slow;
}

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ── Skor per pilar (0-100, 50 = netral) ─────────────────────────────────────

function scoreFundamental(fundamental) {
  if (!fundamental || typeof fundamental.total !== 'number') return null;
  return { score: clamp(fundamental.total), note: `Grade ${fundamental.grade} (${fundamental.total}/100)` };
}

function scoreTechnical(snap) {
  if (!snap) return null;
  let s = 50;
  const notes = [];

  if (snap.rsi < 30)      { s += 15; notes.push(`RSI ${snap.rsi.toFixed(0)} oversold`); }
  else if (snap.rsi < 45) { s += 7;  notes.push(`RSI ${snap.rsi.toFixed(0)} lemah`); }
  else if (snap.rsi > 70) { s -= 15; notes.push(`RSI ${snap.rsi.toFixed(0)} overbought`); }
  else if (snap.rsi > 60) { s -= 7;  notes.push(`RSI ${snap.rsi.toFixed(0)} agak panas`); }

  if (snap.macdHist != null && snap.macdHistPrev != null) {
    if (snap.macdHist > 0 && snap.macdHistPrev <= 0) { s += 12; notes.push('MACD golden cross'); }
    else if (snap.macdHist < 0 && snap.macdHistPrev >= 0) { s -= 12; notes.push('MACD death cross'); }
    else if (snap.macdHist > 0) s += 4;
    else s -= 4;
  }

  if (snap.bb) {
    if (snap.price <= snap.bb.lower) { s += 10; notes.push('Harga di lower Bollinger'); }
    else if (snap.price >= snap.bb.upper) { s -= 10; notes.push('Harga di upper Bollinger'); }
  }

  if (snap.ma20 && snap.ma50) {
    if (snap.ma20 > snap.ma50) { s += 6; notes.push('MA20 di atas MA50'); }
    else { s -= 6; notes.push('MA20 di bawah MA50'); }
  }

  if (snap.volRatio > 1.8 && snap.price > snap.prevClose) {
    s += 8; notes.push(`Volume ${snap.volRatio.toFixed(1)}x rata-rata + harga naik`);
  }

  return { score: clamp(s), note: notes.join(' · ') || 'Netral' };
}

// Sinyal swing/scalping dari generator lama: array {type:'BUY'|'SELL', strength}
function scoreSignalList(signals, label) {
  if (!Array.isArray(signals) || signals.length === 0) return null;
  const w = { KUAT: 15, SEDANG: 9, LEMAH: 5 };
  let s = 50;
  for (const sig of signals) {
    const pts = w[sig.strength] ?? 9;
    s += sig.type === 'SELL' ? -pts : pts;
  }
  const buys = signals.filter((x) => x.type !== 'SELL').length;
  const sells = signals.length - buys;
  return {
    score: clamp(s),
    note: `${buys} sinyal beli / ${sells} sinyal jual (${label})`,
    buys,
    sells,
  };
}

// foreign = { netStreak, netValue, avgNetValue5d } — lihat lib/data/idx-foreign.js
// netStreak positif = beruntun net buy, negatif = beruntun net sell.
function scoreForeign(foreign) {
  if (!foreign || typeof foreign.netStreak !== 'number') return null;
  const st = foreign.netStreak;
  let s = 50 + clamp(st, -6, 6) * 6;
  const arah = st > 0 ? 'net buy' : st < 0 ? 'net sell' : 'netral';
  return {
    score: clamp(s),
    note: st === 0 ? 'Asing netral' : `Asing ${arah} ${Math.abs(st)} hari beruntun`,
  };
}

// ── Konflik ─────────────────────────────────────────────────────────────────

function detectConflicts({ fundamental, technical, swing, scalping, flow, snap }) {
  const out = [];

  const fundStrong = fundamental && fundamental.score >= 55;
  const fundWeak = fundamental && fundamental.score < 35;
  const overbought = snap && (snap.rsi > 68 || (snap.bb && snap.price >= snap.bb.upper));

  if (fundStrong && overbought) {
    out.push({
      id: 'FUND_OK_TECH_HOT',
      between: ['fundamental', 'technical'],
      pesan: 'Fundamental bagus tapi harga lagi overbought. Bukan sinyal jual — lebih masuk akal menunggu koreksi daripada masuk di puncak.',
      efek: 'label',
    });
  }

  if (fundWeak && technical && technical.score >= 65) {
    out.push({
      id: 'FUND_WEAK_TECH_OK',
      between: ['fundamental', 'technical'],
      pesan: 'Teknikal menarik tapi fundamental lemah. Kalau diambil, perlakukan sebagai trading jangka pendek, bukan investasi.',
      efek: 'label',
    });
  }

  if (swing && scalping && Math.abs(swing.score - scalping.score) >= 30) {
    out.push({
      id: 'SWING_VS_SCALP',
      between: ['swing', 'scalping'],
      pesan: `Sinyal swing dan scalping berlawanan (${swing.score.toFixed(0)} vs ${scalping.score.toFixed(0)}). Yang dipakai adalah yang sesuai horizon yang dipilih.`,
      efek: 'confidence',
    });
  }

  if (flow && flow.score < 35 && technical && technical.score >= 60) {
    out.push({
      id: 'FOREIGN_OUT_TECH_OK',
      between: ['flow', 'technical'],
      pesan: 'Teknikal positif tapi asing masih jualan beruntun. Sinyal diturunkan satu tingkat sampai aliran asing berhenti negatif.',
      efek: 'downgrade',
    });
  }

  return out;
}

// ── Engine ──────────────────────────────────────────────────────────────────

const ORDER = ['HINDARI', 'TAHAN', 'PERHATIKAN', 'BELI'];

function baseAction(score) {
  if (score >= 68) return 'BELI';
  if (score >= 55) return 'PERHATIKAN';
  if (score >= 40) return 'TAHAN';
  return 'HINDARI';
}

function downgrade(action, steps = 1) {
  const i = ORDER.indexOf(action);
  return ORDER[Math.max(0, i - steps)];
}

/**
 * @param {object} input
 * @param {object}  input.fundamental hasil invScore()
 * @param {object}  input.snapshot    hasil indicators.snapshot()
 * @param {array}   input.swingSignals
 * @param {array}   input.scalpingSignals
 * @param {object}  input.foreign     hasil foreignSummary()
 * @param {object}  input.backtest    stats horizon terpilih {wr, avg, n}
 * @param {string}  input.horizon     '1d' | '2d' | '3d' | ...
 */
export function buildVerdict({
  fundamental = null,
  snapshot: snap = null,
  swingSignals = null,
  scalpingSignals = null,
  foreign = null,
  backtest = null,
  horizon = '3d',
} = {}) {
  const pillars = {
    fundamental: scoreFundamental(fundamental),
    technical:   scoreTechnical(snap),
    swing:       scoreSignalList(swingSignals, 'swing'),
    scalping:    scoreSignalList(scalpingSignals, 'scalping'),
    flow:        scoreForeign(foreign),
  };

  const w = weightProfile(horizon);

  // Normalisasi ulang bobot atas pilar yang datanya ADA.
  // Pilar yang hilang tidak dihitung 50 atau 0 diam-diam.
  const available = Object.entries(pillars).filter(([k, v]) => v && w[k] > 0);
  const missing = Object.entries(pillars).filter(([k, v]) => !v && w[k] > 0).map(([k]) => k);
  const totalWeight = available.reduce((s, [k]) => s + w[k], 0);

  if (totalWeight === 0) {
    return {
      action: 'TAHAN',
      label: 'Data tidak cukup',
      score: null,
      confidence: 'RENDAH',
      horizon,
      pillars,
      weights: w,
      conflicts: [],
      reasons: ['Tidak ada satu pun pilar data yang tersedia untuk saham ini.'],
      dataQuality: { missing, coverage: 0 },
      disclaimer: DISCLAIMER,
    };
  }

  const score = available.reduce((s, [k, v]) => s + v.score * (w[k] / totalWeight), 0);
  const coverage = totalWeight / Object.values(w).reduce((s, v) => s + v, 0);

  const conflicts = detectConflicts({ ...pillars, snap });

  let action = baseAction(score);
  let label = action;

  for (const c of conflicts) {
    if (c.id === 'FUND_OK_TECH_HOT' && (action === 'BELI' || action === 'PERHATIKAN')) {
      label = 'BELI (tunggu koreksi)';
    }
    if (c.id === 'FUND_WEAK_TECH_OK' && action === 'BELI') {
      label = 'BELI (trading only)';
    }
    if (c.efek === 'downgrade') {
      action = downgrade(action, 1);
      label = action;
    }
  }

  // Confidence: fungsi dari coverage data, jumlah konflik, dan ukuran sampel backtest.
  let confidence = 'SEDANG';
  const n = backtest?.n ?? 0;
  if (coverage >= 0.8 && conflicts.length === 0 && n >= 100) confidence = 'TINGGI';
  if (coverage < 0.5 || conflicts.length >= 2 || (n > 0 && n < 30)) confidence = 'RENDAH';

  // Data tipis tidak boleh keluar sebagai ajakan beli yang percaya diri.
  if (confidence === 'RENDAH' && action === 'BELI') {
    action = 'PERHATIKAN';
    label = 'PERHATIKAN (data terbatas)';
  }

  const reasons = available
    .sort((a, b) => w[b[0]] - w[a[0]])
    .map(([k, v]) => `${PILLAR_LABEL[k]}: ${v.note}`);

  if (backtest && backtest.n) {
    reasons.push(
      `Backtest ${horizon}: win rate ${backtest.wr}% dari ${backtest.n} kejadian, rata-rata ${backtest.avg > 0 ? '+' : ''}${backtest.avg}%`,
    );
  }

  return {
    action,
    label,
    score: Math.round(score),
    confidence,
    horizon,
    pillars,
    weights: w,
    conflicts,
    reasons,
    dataQuality: { missing, coverage: Math.round(coverage * 100) / 100 },
    disclaimer: DISCLAIMER,
  };
}

const PILLAR_LABEL = {
  fundamental: 'Fundamental',
  technical: 'Teknikal',
  swing: 'Swing',
  scalping: 'Scalping',
  flow: 'Aliran asing',
};

export const DISCLAIMER =
  'Skor ini hasil hitungan statistik dari data historis, bukan ramalan dan bukan saran finansial. Win rate masa lalu tidak menjamin hasil ke depan.';
