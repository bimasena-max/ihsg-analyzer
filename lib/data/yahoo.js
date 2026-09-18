// lib/data/yahoo.js
// SATU modul untuk semua akses Yahoo Finance.
//
// Masalah lama:
//   - Cookie session Yahoo di-hardcode identik di chart.js, quote.js, screener.js.
//     Cookie itu punya masa berlaku. Begitu expired, ketiga endpoint mati
//     bersamaan dan tidak ada yang bisa memperbaiki dirinya sendiri.
//   - getCrumb() ditulis dua kali dengan perilaku berbeda.
//   - Kegagalan ditelan `catch {}` lalu mengembalikan null, jadi UI menampilkan
//     "tidak ada data" padahal yang terjadi adalah rate limit atau auth mati.
//
// Sekarang:
//   - Cookie diambil sendiri dari Yahoo saat pertama kali dipakai, di-cache di
//     memori, dan di-refresh otomatis kalau kena 401/403/invalid crumb.
//   - Cookie hardcoded lama boleh dipasang lewat env YF_COOKIE sebagai
//     cadangan darurat, TIDAK ditulis di source code.
//   - Setiap kegagalan melempar YahooError dengan `kind` yang bisa dibedakan
//     (AUTH / RATE_LIMIT / NOT_FOUND / NETWORK / UPSTREAM). Tidak ada fallback diam.

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
};

export class YahooError extends Error {
  constructor(kind, message, { status = null, retriable = false } = {}) {
    super(message);
    this.name = 'YahooError';
    this.kind = kind;           // AUTH | RATE_LIMIT | NOT_FOUND | NETWORK | UPSTREAM | PARSE
    this.status = status;
    this.retriable = retriable;
  }
  toJSON() {
    return { error: this.message, kind: this.kind, status: this.status, retriable: this.retriable };
  }
}

// ── Session (cookie + crumb) ────────────────────────────────────────────────

let _session = null;          // { cookie, crumb, at }
let _sessionPromise = null;    // dedupe permintaan bersamaan
const SESSION_TTL_MS = 30 * 60 * 1000;

async function fetchSession() {
  // 1. Ambil cookie consent dari halaman utama Yahoo.
  let cookie = process.env.YF_COOKIE || '';
  try {
    const r = await fetch('https://fc.yahoo.com/', {
      headers: BASE_HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const setCookie = r.headers.get('set-cookie');
    if (setCookie) {
      const fresh = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
      if (fresh) cookie = fresh;
    }
  } catch {
    // Biarkan — kalau env YF_COOKIE ada, masih bisa jalan. Kalau tidak,
    // getCrumb di bawah yang akan melempar AUTH dengan pesan jelas.
  }

  // 2. Tukar cookie jadi crumb.
  const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...BASE_HEADERS, Cookie: cookie },
    signal: AbortSignal.timeout(8000),
  });
  const text = (await r.text()).trim();

  if (!r.ok) {
    throw new YahooError('AUTH', `Gagal ambil crumb Yahoo (HTTP ${r.status})`, { status: r.status, retriable: true });
  }
  if (!text || text.includes('<') || text.includes('{')) {
    throw new YahooError('AUTH', 'Yahoo mengembalikan crumb tidak valid — kemungkinan cookie ditolak', { retriable: true });
  }

  return { cookie, crumb: text, at: Date.now() };
}

export async function getSession({ force = false } = {}) {
  if (!force && _session && Date.now() - _session.at < SESSION_TTL_MS) return _session;
  if (!_sessionPromise) {
    _sessionPromise = fetchSession()
      .then((s) => { _session = s; return s; })
      .finally(() => { _sessionPromise = null; });
  }
  return _sessionPromise;
}

// ── Fetch inti ──────────────────────────────────────────────────────────────

function classify(status) {
  if (status === 401 || status === 403) return new YahooError('AUTH', `Yahoo menolak autentikasi (HTTP ${status})`, { status, retriable: true });
  if (status === 404) return new YahooError('NOT_FOUND', 'Ticker tidak ditemukan di Yahoo Finance', { status });
  if (status === 429) return new YahooError('RATE_LIMIT', 'Kena rate limit Yahoo Finance', { status, retriable: true });
  if (status >= 500) return new YahooError('UPSTREAM', `Yahoo Finance error (HTTP ${status})`, { status, retriable: true });
  return new YahooError('UPSTREAM', `Yahoo Finance membalas HTTP ${status}`, { status });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON ke Yahoo dengan auth otomatis + retry bertingkat.
 * Melempar YahooError kalau gagal. TIDAK pernah mengembalikan null diam-diam.
 */
export async function yahooJSON(url, { needCrumb = false, retries = 2, timeoutMs = 15000 } = {}) {
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let session = null;
    try {
      // Cookie hanya wajib untuk endpoint yang butuh crumb (quoteSummary).
      // Endpoint chart publik tetap jalan tanpa cookie — jadi kalau auth lagi
      // bermasalah, chart tidak ikut mati.
      if (needCrumb) session = await getSession({ force: attempt > 0 });

      const finalUrl = needCrumb ? `${url}${url.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(session.crumb)}` : url;
      const headers = { ...BASE_HEADERS };
      if (session?.cookie) headers.Cookie = session.cookie;

      const res = await fetch(finalUrl, { headers, signal: AbortSignal.timeout(timeoutMs) });

      if (!res.ok) {
        const err = classify(res.status);
        if (err.kind === 'AUTH') _session = null; // paksa refresh di percobaan berikutnya
        if (err.retriable && attempt < retries) { lastErr = err; await sleep(600 * (attempt + 1)); continue; }
        throw err;
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new YahooError('PARSE', 'Balasan Yahoo bukan JSON yang valid (kemungkinan halaman consent/blokir)', { status: res.status });
      }
    } catch (e) {
      if (e instanceof YahooError) {
        if (e.retriable && attempt < retries) { lastErr = e; await sleep(600 * (attempt + 1)); continue; }
        throw e;
      }
      const netErr = new YahooError('NETWORK', `Gagal menghubungi Yahoo Finance: ${e.message}`, { retriable: true });
      if (attempt < retries) { lastErr = netErr; await sleep(600 * (attempt + 1)); continue; }
      throw netErr;
    }
  }

  throw lastErr ?? new YahooError('NETWORK', 'Gagal menghubungi Yahoo Finance');
}

// ── Helper level tinggi ─────────────────────────────────────────────────────

export const toJK = (ticker) => (String(ticker).toUpperCase().endsWith('.JK') ? String(ticker).toUpperCase() : `${String(ticker).toUpperCase()}.JK`);

export async function fetchChart(ticker, { range = '1y', interval = '1d' } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${toJK(ticker)}`
    + `?range=${range}&interval=${interval}&includePrePost=false&events=div,splits`;
  const data = await yahooJSON(url);
  const result = data?.chart?.result?.[0];
  if (!result) {
    const msg = data?.chart?.error?.description || 'Yahoo tidak mengembalikan data chart';
    throw new YahooError('NOT_FOUND', msg);
  }
  return data;
}

export async function fetchQuoteSummary(ticker, modules = 'summaryDetail,defaultKeyStatistics,financialData,quoteType,assetProfile,price') {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${toJK(ticker)}?modules=${modules}`;
  const data = await yahooJSON(url, { needCrumb: true });
  const result = data?.quoteSummary?.result?.[0];
  if (!result) throw new YahooError('NOT_FOUND', 'Yahoo tidak mengembalikan data fundamental untuk ticker ini');
  return result;
}

/** Ubah chart JSON Yahoo jadi array OHLCV yang dipakai indicators.js */
export function toOHLCV(chartJson) {
  const r = chartJson?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) throw new YahooError('PARSE', 'Struktur chart Yahoo tidak dikenali');

  const ts = r.timestamp || [];
  const out = { dates: [], opens: [], highs: [], lows: [], closes: [], vols: [] };
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue; // hari libur / data bolong
    out.dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
    out.opens.push(q.open[i]);
    out.highs.push(q.high[i]);
    out.lows.push(q.low[i]);
    out.closes.push(q.close[i]);
    out.vols.push(q.volume?.[i] ?? 0);
  }
  return out;
}
