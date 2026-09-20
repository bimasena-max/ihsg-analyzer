// PATCHED — definisi bersama dipindah ke lib/. Jangan tulis ulang di sini.
import { invScore } from '../../lib/core/scoring.js';
import { calcRSI } from '../../lib/core/indicators.js';
import { SECTOR_BENCH, DEFAULT_BENCH } from '../../lib/core/constants.js';
import { applyCache } from '../../lib/core/cache.js';
import { yahooJSON, fetchQuoteSummary, YahooError } from '../../lib/data/yahoo.js';
// pages/api/quote.js
// Menghitung invScore di server menggunakan logika IDENTIK dengan screener.js
// Sehingga Score di Detail & AI selalu sama dengan Score di Screener.

import { getSectorsValuation } from './sectors-client.js';


let _usdIdr = null;
let _usdIdrAt = 0;
const USDIDR_TTL = 6 * 60 * 60 * 1000;

// Kurs dipakai untuk konversi book value Yahoo yang kadang dalam USD.
// Kalau gagal, kita TIDAK diam-diam memakai angka karangan: nilainya null
// dan pemanggil bisa memutuskan (di bawah: PBV berbasis kurs di-skip).
async function getUSDIDR() {
  if (_usdIdr && Date.now() - _usdIdrAt < USDIDR_TTL) return _usdIdr;
  try {
    const data = await yahooJSON('https://query1.finance.yahoo.com/v8/finance/chart/USDIDR=X?range=1d&interval=1d', { retries: 1 });
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (rate && rate > 10000) { _usdIdr = rate; _usdIdrAt = Date.now(); return _usdIdr; }
  } catch (e) {
    console.warn('[quote] kurs USDIDR gagal diambil:', e.kind || e.message);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// FUNDAMENTAL CALCULATION — identik dengan screener.js
// ═══════════════════════════════════════════════════════════════════

function calculateFundamentals(qr, sectorsVal, price, usdIdr) {
  const sd = qr.summaryDetail        || {};
  const ks = qr.defaultKeyStatistics || {};
  const fd = qr.financialData        || {};

  let pbv = null, per = null, roe = null, der = null;

  // PBV
  if (sectorsVal?.pbv != null) {
    pbv = sectorsVal.pbv;
  } else if (sectorsVal?.bookValue != null && sectorsVal.bookValue > 0 && sectorsVal.bookValue < 1 && price > 100) {
    const bvpsIDR = sectorsVal.bookValue * usdIdr;
    pbv = bvpsIDR > 0 ? Math.round((price / bvpsIDR) * 100) / 100 : null;
  } else {
    const bookValueRaw = ks.bookValue?.raw ?? sd.bookValue?.raw ?? null;
    const pbvFromYahoo = ks.priceToBook?.raw ?? sd.priceToBook?.raw ?? null;
    if (bookValueRaw != null && bookValueRaw > 0 && bookValueRaw < 1 && price > 100) {
      const bvpsIDR = bookValueRaw * usdIdr;
      pbv = bvpsIDR > 0 ? Math.round((price / bvpsIDR) * 100) / 100 : null;
    } else if (pbvFromYahoo != null && pbvFromYahoo >= 0.1 && pbvFromYahoo < 100) {
      pbv = Math.round(pbvFromYahoo * 100) / 100;
    }
  }

  // PER
  if (sectorsVal?.per != null) {
    per = sectorsVal.per;
  } else {
    const perRaw = sd.trailingPE?.raw ?? ks.trailingPE?.raw ?? null;
    const epsRaw = ks.trailingEps?.raw ?? null;
    per = perRaw != null && perRaw > 0 && perRaw < 500 ? Math.round(perRaw * 100) / 100 : null;
    if (per == null && epsRaw != null && epsRaw > 0 && price > 0) {
      const perCalc = price / epsRaw;
      if (perCalc > 0 && perCalc < 500) per = Math.round(perCalc * 100) / 100;
    }
  }

  // ROE — output selalu DESIMAL (0.18 = 18%) agar invScore konsisten.
  // Normalisasi: abs > 2 dianggap sudah persen → bagi 100. Cap abs > 2 setelah konversi = null.
  if (sectorsVal?.roe != null) {
    const v = Math.abs(sectorsVal.roe) > 2 ? sectorsVal.roe / 100 : sectorsVal.roe;
    roe = Math.abs(v) > 2 ? null : v;
  } else {
    const roeRaw = fd.returnOnEquity?.raw ?? null;
    if (roeRaw != null) {
      const v = Math.abs(roeRaw) > 2 ? roeRaw / 100 : roeRaw;
      roe = Math.abs(v) > 2 ? null : v;
    }
  }

  // DER — kembalikan dalam RATIO (1.5 = 150%)
  if (sectorsVal?.der != null) {
    der = sectorsVal.der;
  } else {
    const derRaw = fd.debtToEquity?.raw ?? null;
    der = derRaw != null ? Math.round((derRaw / 100) * 100) / 100 : null;
  }

  return { pbv, per, roe, der };
}

// ═══════════════════════════════════════════════════════════════════
// INVESTMENT SCORE — copy persis dari screener.js
// Jika ubah di sini, ubah juga di screener.js dan sebaliknya.
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════

const STATUS_BY_KIND = {
  AUTH: 502, RATE_LIMIT: 429, NOT_FOUND: 404,
  NETWORK: 504, UPSTREAM: 502, PARSE: 502,
};

export default async function handler(req, res) {
  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker wajib diisi', kind: 'BAD_REQUEST' });

  try {
    const [qr, usdIdr] = await Promise.all([
      fetchQuoteSummary(ticker),
      getUSDIDR(),
    ]);

    const sectorsVal = await getSectorsValuation(ticker).catch((e) => {
      console.warn('[quote] sectors-client gagal:', e.message);
      return null;
    });

    const price = qr.price?.regularMarketPrice?.raw ?? qr.summaryDetail?.regularMarketPrice?.raw ?? 0;
    const sector = qr.assetProfile?.sector || '—';

    const { pbv, per, roe, der } = calculateFundamentals(qr, sectorsVal, price, usdIdr);

    // RSI & drawdown yang sebenarnya dihitung dari chart di sisi pemanggil.
    // Skor di bawah adalah skor fundamental murni (RSI netral 50, dd 0) —
    // dinamai jelas supaya tidak tertukar dengan skor akhir.
    const fundamentalOnly = invScore(pbv, per, 50, 0, roe, der, sector);

    qr._fundamentals = {
      pbv, per, roe, der,
      roeDisplay: roe != null ? parseFloat((roe * 100).toFixed(2)) : null,
      derDisplay: der,
      sector,
      bench: SECTOR_BENCH[sector] || DEFAULT_BENCH,
      source: sectorsVal?.source || 'yahoo',
      usdIdr,
      usdIdrStale: usdIdr == null,
      fundamentalOnlyScore: fundamentalOnly,
    };

    if (sectorsVal) qr._sectorsValuation = sectorsVal;

    const meta = applyCache(res, 'MARKET');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ quoteSummary: { result: [qr] }, _meta: meta });
  } catch (e) {
    if (e instanceof YahooError) return res.status(STATUS_BY_KIND[e.kind] ?? 502).json(e.toJSON());
    return res.status(500).json({ error: e.message, kind: 'UNKNOWN' });
  }
}
