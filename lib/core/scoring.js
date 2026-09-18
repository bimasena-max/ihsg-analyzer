// lib/core/scoring.js
// SATU sumber invScore. Sebelumnya ada 3 salinan identik:
//   pages/index.js:5477, pages/api/screener.js:596, pages/api/quote.js:135
// Formula di bawah sengaja TIDAK diubah supaya skor lama tidak bergeser —
// perbaikannya ada di jumlah salinan (3 -> 1), bukan di angkanya.

import { benchFor } from './constants.js';

export const SCORE_WEIGHTS = { PBV: 20, PER: 20, RSI: 20, Drawdown: 10, ROE: 20, 'D/E': 10 };
export const SCORE_MAX = 100;

export const GRADE_THRESHOLD = { A: 75, B: 55, C: 35 };

export function gradeOf(total) {
  if (total >= GRADE_THRESHOLD.A) return 'A';
  if (total >= GRADE_THRESHOLD.B) return 'B';
  if (total >= GRADE_THRESHOLD.C) return 'C';
  return 'D';
}

export function verdictOfGrade(grade) {
  return { A: 'BELI', B: 'PERHATIKAN', C: 'TAHAN', D: 'HINDARI' }[grade] || 'HINDARI';
}

/**
 * Skor fundamental + valuasi 0-100.
 * @param {number} pbv  Price to Book Value
 * @param {number} per  Price to Earnings Ratio
 * @param {number} rsiV RSI 14 terakhir
 * @param {number} dd   Drawdown dari ATH, dalam persen (contoh: 23.4)
 * @param {number} roe  Return on Equity, desimal (0.15 = 15%)
 * @param {number} der  Debt to Equity
 * @param {string} sector Nama sektor Yahoo Finance
 */
export function invScore(pbv, per, rsiV, dd, roe, der, sector) {
  const bench = benchFor(sector);
  const breakdown = {
    PBV: pbv > 0
      ? Math.round(Math.max(0, Math.min(20, 20 * (1 - Math.pow(pbv / bench.pbv, 1.3)))))
      : 0,
    PER: per > 0 && per < 500
      ? Math.round(Math.max(0, Math.min(20, 20 * (1 - Math.pow(per / bench.per, 1.3)))))
      : 0,
    RSI: rsiV < 25 ? 20 : rsiV < 30 ? 17 : rsiV < 35 ? 14 : rsiV < 40 ? 11
       : rsiV < 45 ? 8 : rsiV < 50 ? 5 : rsiV < 55 ? 2 : 0,
    Drawdown: typeof dd === 'number' ? Math.round(Math.max(0, 10 - dd * 0.3)) : 5,
    ROE: roe > 0 ? Math.round(Math.min(20, (roe / bench.roe) * 20)) : 0,
    'D/E': typeof der === 'number' ? Math.round(Math.max(0, 10 * (1 - der / bench.der))) : 5,
  };

  const total = Math.round(Object.values(breakdown).reduce((s, v) => s + v, 0));
  const grade = gradeOf(total);

  return { total, grade, verdict: verdictOfGrade(grade), breakdown };
}
