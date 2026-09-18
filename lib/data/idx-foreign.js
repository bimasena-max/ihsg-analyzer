// lib/data/idx-foreign.js
// Sumber data net foreign buy/sell harian per ticker.
//
// PENTING — ini sumber data yang BERBEDA dari Yahoo Finance. Yahoo tidak punya
// breakdown asing/lokal sama sekali, jadi fitur ini tidak bisa menumpang
// endpoint yang sudah ada.
//
// Pilihan sumber (urut dari yang paling masuk akal untuk proyek pribadi):
//
//   1. IDX Stock Summary (dipakai di sini) — endpoint JSON publik yang SUDAH
//      dipakai proyek ini di pages/api/sectors-client.js untuk PBV/PER.
//      Gratis, resmi, dan sudah terbukti bisa diakses dari infra yang sama.
//      Kelemahan: hanya snapshot harian (tidak ada histori), jadi histori
//      harus kita kumpulkan sendiri hari demi hari.
//
//   2. Sectors.app / Invezgo / IndexAlpha — API komersial yang menyediakan
//      broker summary + foreign flow lengkap dengan HISTORI. Berbayar, tapi
//      menghemat berbulan-bulan pengumpulan data. Dipakai kalau butuh streak
//      yang panjang sejak hari pertama.
//
//   3. Scraping situs pihak ketiga — TIDAK dipakai. Rapuh dan status legalnya
//      abu-abu.
//
// NAMA FIELD di response IDX pernah berubah antar versi situs. Karena itu
// pemetaan di bawah sengaja menerima beberapa ejaan sekaligus, sama seperti
// pola yang sudah dipakai parseIDXRows() di sectors-client.js. Jalankan
// `node scripts/probe-idx-foreign.mjs` untuk melihat nama field yang aktual
// hari ini sebelum mengandalkan hasilnya.

const IDX_SUMMARY_URL = 'https://www.idx.co.id/primary/TradingSummary/GetStockSummary';

const IDX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  Referer: 'https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/',
};

export class ForeignDataError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'ForeignDataError';
    this.kind = kind; // NETWORK | EMPTY | SCHEMA
  }
  toJSON() { return { error: this.message, kind: this.kind }; }
}

const num = (v) => {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/[,\s]/g, '')) : Number(v);
  return isFinite(n) ? n : null;
};

const pick = (row, keys) => {
  for (const k of keys) {
    if (row[k] != null) return row[k];
    const lower = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (lower && row[lower] != null) return row[lower];
  }
  return null;
};

/** Ubah satu baris Stock Summary IDX jadi bentuk yang kita pakai. */
export function parseForeignRow(row) {
  const ticker = String(pick(row, ['StockCode', 'Code', 'code']) || '').toUpperCase().trim();
  if (!ticker) return null;

  const fBuy = num(pick(row, ['ForeignBuy', 'Foreign_Buy', 'foreignBuy', 'FBuy']));
  const fSell = num(pick(row, ['ForeignSell', 'Foreign_Sell', 'foreignSell', 'FSell']));
  if (fBuy == null && fSell == null) return null;

  return {
    ticker,
    foreignBuy: fBuy ?? 0,
    foreignSell: fSell ?? 0,
    netForeign: (fBuy ?? 0) - (fSell ?? 0),
    close: num(pick(row, ['Close', 'close', 'Previous'])),
    value: num(pick(row, ['Value', 'value'])),
  };
}

/**
 * Ambil snapshot net asing seluruh bursa untuk satu tanggal.
 * @param {string} dateISO 'YYYY-MM-DD'. Default: hari ini.
 */
export async function fetchForeignSnapshot(dateISO) {
  const d = dateISO || new Date().toISOString().slice(0, 10);
  const url = `${IDX_SUMMARY_URL}?length=9999&start=0&date=${d.replace(/-/g, '')}`;

  let json;
  try {
    const res = await fetch(url, { headers: IDX_HEADERS, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new ForeignDataError('NETWORK', `IDX membalas HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    if (e instanceof ForeignDataError) throw e;
    throw new ForeignDataError('NETWORK', `Gagal menghubungi IDX: ${e.message}`);
  }

  const rows = json?.data || json?.Data || json?.results || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ForeignDataError('EMPTY', `IDX tidak mengembalikan baris untuk tanggal ${d} (hari libur bursa?)`);
  }

  const parsed = rows.map(parseForeignRow).filter(Boolean);
  if (parsed.length === 0) {
    throw new ForeignDataError(
      'SCHEMA',
      `IDX mengembalikan ${rows.length} baris tapi tidak ada field asing yang dikenali. `
      + `Field yang tersedia: ${Object.keys(rows[0]).join(', ')}`,
    );
  }

  return { date: d, rows: parsed, coverage: parsed.length / rows.length };
}

// ── Streak ──────────────────────────────────────────────────────────────────

/**
 * Hitung streak dari histori harian satu ticker.
 * @param {Array<{date:string, netForeign:number}>} history urut lama -> baru
 * @returns {{netStreak:number, netToday:number, net5d:number, net20d:number, days:number}}
 *   netStreak positif = N hari beruntun net buy, negatif = N hari beruntun net sell.
 */
export function computeStreak(history) {
  const h = (history || []).filter((d) => typeof d?.netForeign === 'number');
  if (h.length === 0) return { netStreak: 0, netToday: 0, net5d: 0, net20d: 0, days: 0 };

  const last = h[h.length - 1];
  const dir = Math.sign(last.netForeign);
  let streak = 0;
  if (dir !== 0) {
    for (let i = h.length - 1; i >= 0; i--) {
      if (Math.sign(h[i].netForeign) !== dir) break;
      streak++;
    }
  }

  const sum = (n) => h.slice(-n).reduce((s, d) => s + d.netForeign, 0);

  return {
    netStreak: streak * (dir || 0),
    netToday: last.netForeign,
    net5d: sum(5),
    net20d: sum(20),
    days: h.length,
  };
}

/** Bentuk ringkas yang dikonsumsi verdict.js */
export function foreignSummary(history) {
  const s = computeStreak(history);
  if (s.days === 0) return null;
  return { ...s, stale: s.days < 3 };  // < 3 hari histori = streak belum berarti
}

/**
 * Bangun dua daftar peringkat: top net buy dan top net sell, berdasarkan streak.
 * @param {Object<string, Array>} historyByTicker  { BBCA: [{date, netForeign}, ...] }
 * @param {object} opts
 * @param {string[]} [opts.universe] batasi ke daftar ticker tertentu (mis. syariah)
 * @param {'streak'|'harian'|'mingguan'|'bulanan'} [opts.mode]
 */
export function rankForeignFlow(historyByTicker, { universe = null, mode = 'streak', limit = 20 } = {}) {
  const key = { harian: 'netToday', mingguan: 'net5d', bulanan: 'net20d', streak: 'netStreak' }[mode] || 'netStreak';

  const rows = Object.entries(historyByTicker)
    .filter(([t]) => !universe || universe.includes(t))
    .map(([ticker, hist]) => ({ ticker, ...computeStreak(hist) }))
    .filter((r) => r.days > 0);

  const sorted = [...rows].sort((a, b) => b[key] - a[key]);

  return {
    mode,
    metric: key,
    topBuy: sorted.filter((r) => r[key] > 0).slice(0, limit),
    topSell: sorted.filter((r) => r[key] < 0).reverse().slice(0, limit),
    universeSize: rows.length,
  };
}
