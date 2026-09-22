// components/ml/ai-insight-logic.js
// Logika murni (tanpa React, tanpa DOM) untuk panel "Teknikal vs Prediksi AI".
// Dipisah dari JSX supaya bisa diuji dengan node biasa dan gampang dicari kalau
// angka di layar terlihat aneh.

import { HORIZONS } from '../../lib/core/constants';

// ── Ambang ───────────────────────────────────────────────────────────────────
// SAMA dengan kolom ML di leaderboard (pages/index.js: mlBullish >= 60,
// mlBearish <= 35, histBullish = winrate >= 50). Kalau mau diubah, ubah di sini
// dan di leaderboard sekaligus supaya dua tempat itu tidak saling bertentangan.
export const ML_BULLISH = 0.60;
export const ML_BEARISH = 0.35;
export const WR_BULLISH = 50;

// Di bawah ini "rekam jejak" terlalu sedikit untuk dipercaya sebagai pola.
export const MIN_SAMPEL = 20;

// Horizon yang sama dengan backtest teknikal (lib/core/constants.js): 1, 2, 3, 5, 7, 14, 30, 60 hari bursa.
export const HORIZON_LIST = HORIZONS;
export const HORIZON_BARS = Object.fromEntries(HORIZON_LIST.map((h) => [h, parseInt(h, 10)]));
export const HORIZON_LABEL = Object.fromEntries(HORIZON_LIST.map((h) => [h, `${parseInt(h, 10)} hari`]));

/** Jumlah bar harga yang digambar / dihitung rekam jejaknya. Horizon panjang butuh jendela lebih lebar
 *  supaya masih ada cukup hari yang hasilnya sudah ketahuan (30 hari ke depan baru ketahuan 30 hari kemudian). */
export const windowBars = (h) => Math.min(250, Math.max(90, 3 * h));

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ── Format ───────────────────────────────────────────────────────────────────
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** '2026-09-14' -> '14 Sep 2026'. Tidak pakai toLocaleDateString supaya hasilnya sama di semua browser. */
export function tanggalID(iso, { tahun = true } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '—';
  const s = `${parseInt(m[3], 10)} ${BULAN[parseInt(m[2], 10) - 1]}`;
  return tahun ? `${s} ${m[1]}` : s;
}

/** 0.6321 -> '63.2' (persen, satu desimal). */
export function pct(x, d = 1) {
  return isNum(x) ? (x * 100).toFixed(d) : '—';
}

/** Persen sudah dalam satuan persen (mis. 2.1) -> '+2.1'. */
export function signed(x, d = 1) {
  if (!isNum(x)) return '—';
  return `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;
}

/** '60d' -> '60 hari' */
export function horizonHari(h) {
  const m = /^(\d+)d$/.exec(String(h || ''));
  return m ? `${m[1]} hari` : (h || '');
}

// ── Arah tebakan ─────────────────────────────────────────────────────────────
/** Kategori untuk kata-kata di layar: naik / turun / netral / none. */
export function callFor(p) {
  if (!isNum(p)) return 'none';
  if (p >= ML_BULLISH) return 'naik';
  if (p <= ML_BEARISH) return 'turun';
  return 'netral';
}

/**
 * Arah tebakan mentah (di atas / di bawah 50%). Dipakai untuk penanda di chart dan
 * rekam jejak — sama dengan cara train.py menghitung akurasi: (p > 0.5) == naik.
 */
export function leanFor(p) {
  if (!isNum(p) || p === 0.5) return null;
  return p > 0.5 ? 'naik' : 'turun';
}

export function verdictFor(p) {
  switch (callFor(p)) {
    case 'naik':   return { code: 'naik',   label: 'AI condong naik',  color: 'var(--green)' };
    case 'turun':  return { code: 'turun',  label: 'AI condong turun', color: 'var(--red)' };
    case 'netral': return { code: 'netral', label: 'AI netral',        color: 'var(--amber)' };
    default:       return { code: 'none',   label: 'Belum ada prediksi', color: 'var(--muted)' };
  }
}

/** Kalimat "artinya apa" untuk satu angka probabilitas. */
export function bacaAngka(p, h) {
  if (!isNum(p)) return '';
  const n = Math.round(p * 100);
  const hari = parseInt(h, 10);
  const kapan = hari === 1 ? 'besok' : `${hari} hari bursa lagi`;
  return `Dari 100 kondisi pasar yang mirip hari ini, model memperkirakan sekitar ${n} berakhir lebih tinggi ${kapan}. `
    + 'Angka 50 berarti sama saja dengan tebak-tebakan.';
}

// ── Tanggal & harga ──────────────────────────────────────────────────────────
function shiftDay(iso, delta) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return new Date(t + delta * 86400000).toISOString().slice(0, 10);
}

/** Epoch detik (Yahoo) -> 'YYYY-MM-DD'. */
export function isoFromEpoch(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

/** Balasan /api/chart (format Yahoo) -> { dates, closes }, baris dengan close null dibuang. */
export function pricesFromChartJson(json) {
  const r = json?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q || !Array.isArray(r.timestamp)) return null;
  const dates = [], closes = [];
  r.timestamp.forEach((t, i) => {
    const c = q.close?.[i];
    if (t == null || c == null) return;
    dates.push(isoFromEpoch(t));
    closes.push(c);
  });
  return closes.length ? { dates, closes } : null;
}

/**
 * Tempel deret probabilitas (uji mundur + prediksi harian) ke sumbu tanggal harga.
 *   oos:     { dates: [...], p: [0..1 | null, ...] }  atau null
 *   harian:  [{ d: 'YYYY-MM-DD', p: 0..1 }, ...]
 * Hasil: array sepanjang `dates`, isinya { p, src } atau null.
 * Prediksi harian menimpa uji mundur kalau tanggalnya sama.
 * Toleransi ±1 hari (beda zona waktu Yahoo vs yfinance) hanya boleh mengisi slot
 * yang KOSONG, supaya tidak pernah menimpa titik yang cocok persis.
 */
export function alignSeries(dates, oos, harian) {
  const pos = new Map(dates.map((d, i) => [d, i]));
  const out = new Array(dates.length).fill(null);

  const place = (list, src) => {
    const sisa = [];
    for (const { d, p } of list) {
      if (!isNum(p)) continue;
      if (pos.has(d)) out[pos.get(d)] = { p, src };
      else sisa.push({ d, p });
    }
    for (const { d, p } of sisa) {
      for (const delta of [-1, 1]) {
        const j = pos.get(shiftDay(d, delta));
        if (j != null && out[j] == null) { out[j] = { p, src }; break; }
      }
    }
  };

  const oosList = [];
  if (oos && Array.isArray(oos.dates) && Array.isArray(oos.p)) {
    oos.dates.forEach((d, i) => oosList.push({ d, p: oos.p[i] }));
  }
  place(oosList, 'uji_mundur');
  place(Array.isArray(harian) ? harian : [], 'harian');
  return out;
}

/**
 * Titik-titik tebakan AI + hasilnya, untuk penanda di chart dan rekam jejak.
 * `h` = jumlah bar ke depan yang dinilai (1 atau 2).
 * outcome: 'hit' (arah benar) | 'miss' | 'pending' (hasilnya belum ketahuan) | 'none' (tepat 50%)
 * "Naik" = close h bar kemudian LEBIH TINGGI dari close hari itu — definisi yang sama
 * dengan label training (ml/features.py: label()).
 */
export function buildPoints(closes, ai, h) {
  return ai.map((a, i) => {
    if (!a) return null;
    const lean = leanFor(a.p);
    const j = i + h;
    let outcome = 'pending';
    let ret = null;
    if (j < closes.length) {
      const naik = closes[j] > closes[i];
      ret = closes[i] ? closes[j] / closes[i] - 1 : null;
      outcome = lean == null ? 'none' : ((lean === 'naik') === naik ? 'hit' : 'miss');
    } else if (lean == null) {
      outcome = 'none';
    }
    return { i, p: a.p, src: a.src, lean, call: callFor(a.p), outcome, ret };
  });
}

/**
 * Rekam jejak dari titik yang hasilnya sudah ketahuan.
 * upShare = persentase hari yang memang naik di jendela yang sama = akurasi kalau
 * kerjanya cuma menebak "naik" terus. Itulah pembanding yang jujur untuk AI.
 */
export function trackRecord(points, closes, h) {
  const r = {
    n: 0, hits: 0, acc: null, upShare: null,
    strongN: 0, strongHits: 0,
    naikN: 0, naikHits: 0, turunN: 0, turunHits: 0,
    pending: 0, kecil: true,
  };
  let upDays = 0;
  for (const pt of points) {
    if (!pt) continue;
    if (pt.outcome === 'pending') { r.pending++; continue; }
    if (pt.outcome === 'none') continue;
    r.n++;
    if (closes[pt.i + h] > closes[pt.i]) upDays++;
    const hit = pt.outcome === 'hit';
    if (hit) r.hits++;
    if (pt.lean === 'naik') { r.naikN++; if (hit) r.naikHits++; }
    else { r.turunN++; if (hit) r.turunHits++; }
    if (pt.call === 'naik' || pt.call === 'turun') { r.strongN++; if (hit) r.strongHits++; }
  }
  r.acc = r.n ? r.hits / r.n : null;
  r.upShare = r.n ? upDays / r.n : null;
  r.kecil = r.n < MIN_SAMPEL;
  return r;
}

// ── Kartu model & kalibrasi ──────────────────────────────────────────────────
/**
 * Dari tabel kalibrasi walk-forward (kartu.kalibrasi = [{prediksi, kenyataan, n}]),
 * ambil baris yang paling dekat dengan p. Kalau tidak ada yang cukup dekat
 * (jarak > 0.08) kembalikan null — lebih baik diam daripada mengarang.
 */
export function calibrationLookup(kalibrasi, p) {
  if (!Array.isArray(kalibrasi) || !kalibrasi.length || !isNum(p)) return null;
  let best = null;
  for (const b of kalibrasi) {
    if (!isNum(b?.prediksi) || !isNum(b?.kenyataan)) continue;
    const dist = Math.abs(b.prediksi - p);
    if (!best || dist < best.dist) best = { ...b, dist };
  }
  return best && best.dist <= 0.08 ? best : null;
}

/** Ringkasan "apakah model ini lolos uji" dari kartu model. */
export function reliability(kartu) {
  if (!kartu) return { status: 'tak-ada' };
  const { akurasi, baseline, auc } = kartu;
  const selisih = isNum(akurasi) && isNum(baseline) ? (akurasi - baseline) * 100 : null;
  // Kriteria sama dengan ml/train.py: akurasi > baseline + 1 poin dan AUC > 0.52.
  const lolos = typeof kartu.lolos === 'boolean'
    ? kartu.lolos
    : (isNum(akurasi) && isNum(baseline) && akurasi > baseline + 0.01 && (auc ?? 0) > 0.52);
  return {
    status: lolos ? 'lolos' : 'gagal',
    akurasi, baseline, selisih, auc,
    dilatih: kartu.dilatih || null,
    ujiDari: kartu.uji_dari || null,
    ujiSampai: kartu.uji_sampai || null,
  };
}

// ── Teknikal vs AI ───────────────────────────────────────────────────────────
/**
 * techRows: [{ dir: 'BUY'|'SELL', wr: number|null (persen), avgRet, n, ... }]
 * Hanya baris BUY dengan winrate yang dihitung: statistik backtest di aplikasi ini
 * adalah "berapa persen kejadian sinyal berakhir naik".
 *   'kuat'   = minimal satu sinyal beli punya winrate >= 50%
 *   'lemah'  = ada sinyal beli, tapi semuanya winrate < 50%
 *   'kosong' = tidak ada sinyal beli berdata backtest
 */
export function techStance(techRows) {
  const buys = (techRows || []).filter((r) => r && r.dir === 'BUY' && isNum(r.wr));
  if (!buys.length) return 'kosong';
  return buys.some((r) => r.wr >= WR_BULLISH) ? 'kuat' : 'lemah';
}

export function alignment(techRows, p) {
  const tech = techStance(techRows);
  const ai = callFor(p);

  if (ai === 'none') {
    return { code: 'tanpa-ai', tone: 'muted', title: 'Belum ada prediksi AI',
      text: 'Tekan tombol Prediksi di kartu kanan untuk membandingkannya dengan sinyal teknikal.' };
  }
  if (tech === 'kosong') {
    return { code: 'tanpa-teknikal', tone: 'muted', title: 'Tidak ada sinyal teknikal untuk dibandingkan',
      text: 'Hari ini tidak ada sinyal beli berdata backtest, jadi hanya AI yang bicara di sini.' };
  }
  if (ai === 'netral') {
    return { code: 'ai-netral', tone: 'amber', title: 'AI belum punya pendapat kuat',
      text: 'Probabilitasnya dekat 50%, hampir seperti lempar koin. Angka AI belum menambah keyakinan ke arah mana pun.' };
  }
  if (tech === 'kuat' && ai === 'naik') {
    return { code: 'selaras-naik', tone: 'green', title: 'Teknikal dan AI searah: condong naik',
      text: 'Dua cara yang berbeda sama-sama condong naik. Itu lebih meyakinkan daripada satu sumber saja, tapi tetap probabilitas, bukan jaminan.' };
  }
  if (tech === 'lemah' && ai === 'turun') {
    return { code: 'selaras-lemah', tone: 'red', title: 'Teknikal dan AI sama-sama tidak mendukung naik',
      text: 'Sinyal teknikalnya historisnya kurang bagus (winrate di bawah 50%) dan AI juga condong turun.' };
  }
  return { code: 'berlawanan', tone: 'amber', title: 'Teknikal dan AI tidak searah',
    text: 'Yang satu condong naik, yang lain tidak. Cek dulu sebelum ambil.' };
}

/**
 * Baris sinyal untuk kartu kiri: yang punya data backtest dulu (urutan asli dipertahankan,
 * pemanggil sudah mengurutkan menurut kekuatan sinyal), lalu yang belum, maksimal `max` baris.
 */
export function pickTechRows(rows, max = 4) {
  const list = (rows || []).filter(Boolean);
  const berdata = list.filter((r) => isNum(r.wr));
  const tanpa = list.filter((r) => !isNum(r.wr));
  return [...berdata, ...tanpa].slice(0, max);
}

// ── Prediksi on-demand & ringkasan ───────────────────────────────────────────
/** Horizon awal: samakan dengan horizon sinyal teknikal pertama yang punya data backtest, kalau tidak ada '1d'. */
export function defaultHorizon(techRows) {
  const r = (techRows || []).find((x) => x && isNum(x.wr) && HORIZON_LIST.includes(x.horizon));
  return r ? r.horizon : '1d';
}

/**
 * Nilai fitur yang dilihat model (dari /api/ml-predict) -> satu kalimat awam.
 * Satuan fitur: rsi14 0-100; dist_ema20, dd_from_high, ret_5 berupa pecahan (0.05 = 5%).
 */
export function ringkasFitur(f) {
  if (!f) return '';
  const out = [];
  if (isNum(f.rsi14)) out.push(`RSI ${Math.round(f.rsi14)} (${f.rsi14 < 30 ? 'jenuh jual' : f.rsi14 > 70 ? 'jenuh beli' : 'netral'})`);
  if (isNum(f.dist_ema20)) out.push(`harga ${Math.abs(f.dist_ema20 * 100).toFixed(1)}% ${f.dist_ema20 >= 0 ? 'di atas' : 'di bawah'} rata-rata 20 hari`);
  if (isNum(f.dd_from_high) && f.dd_from_high < -0.02) out.push(`${Math.abs(f.dd_from_high * 100).toFixed(0)}% di bawah puncak setahun`);
  if (isNum(f.ret_5)) out.push(`${f.ret_5 >= 0 ? 'naik' : 'turun'} ${Math.abs(f.ret_5 * 100).toFixed(1)}% dalam 5 hari terakhir`);
  return out.length ? `${out.join(', ')}.` : '';
}

/**
 * Berapa horizon yang lolos uji. Penting untuk kejujuran: kalau 8 horizon diuji sekaligus,
 * satu yang lolos sendirian bisa saja kebetulan.
 */
export function ringkasLolos(horizons) {
  const daftar = [];
  let total = 0;
  for (const k of HORIZON_LIST) {
    const kartu = horizons?.[k]?.kartu;
    if (!kartu) continue;
    total++;
    if (reliability(kartu).status === 'lolos') daftar.push(k);
  }
  return { total, lolos: daftar.length, daftar };
}
