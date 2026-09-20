// pages/api/sectors-client.js
// Primary: IDX screener (kalau tidak diblock)
// Fallback: yfinance via Python subprocess

import { execFile } from 'child_process';
import path from 'path';

const IDX_SCREENER_URL = 'https://www.idx.co.id/primary/StockScreener/GetStockScreener?start=0&length=9999&code=';
const IDX_SUMMARY_URL  = 'https://www.idx.co.id/primary/StockSummary/GetStockSummary?start=0&length=9999';

const IDX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  'Referer': 'https://www.idx.co.id/id/investor/stock-screener',
};

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const SCRIPT  = path.join(process.cwd(), 'pages', 'api', 'fundamental.py');

let _idxCache    = null;
let _idxCachedAt = 0;
const _yfCache   = new Map();
const CACHE_TTL  = 6 * 60 * 60 * 1000;

async function tryIDX(url) {
  try {
    const res = await fetch(url, { headers: IDX_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const json = await res.json();
    const rows = json?.data || json?.Data || json?.result || json?.Result || [];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows;
  } catch { return null; }
}

function parseIDXRows(rows) {
  const map = new Map();
  const safe = v => { const n = parseFloat(v); return isFinite(n) ? Math.round(n * 100) / 100 : null; };
  for (const row of rows) {
    const ticker = (row.Code || row.code || '').toUpperCase().trim();
    if (!ticker) continue;
    const pbv = safe(row.PBV ?? row.Pbv ?? row.pbv);
    const per = safe(row.PER ?? row.Per ?? row.per);
    const roeRaw = safe(row.ROE ?? row.Roe ?? row.roe);
    const roe = roeRaw != null ? Math.round(roeRaw / 100 * 10000) / 10000 : null;
    const der = safe(row.DER ?? row.Der ?? row.der);
    map.set(ticker, {
      pbv: pbv > 0 ? pbv : null,
      per: per > 0 && per < 10000 ? per : null,
      roe: roe ?? null,
      der: der >= 0 ? der : null,
      source: 'idx',
    });
  }
  return map;
}

async function fetchIDXAll() {
  if (_idxCache && Date.now() - _idxCachedAt < CACHE_TTL) return _idxCache;
  const rows = await tryIDX(IDX_SUMMARY_URL) || await tryIDX(IDX_SCREENER_URL);
  if (rows) {
    _idxCache    = parseIDXRows(rows);
    _idxCachedAt = Date.now();
    console.log(`[idx] Loaded ${_idxCache.size} tickers`);
  } else {
    console.warn('[idx] Semua endpoint gagal');
  }
  return _idxCache || new Map();
}

function runPython(tickers) {
  return new Promise(resolve => {
    execFile(PYTHON, [SCRIPT, ...tickers], { timeout: 30000 }, (err, stdout) => {
      if (err) { console.warn('[yf] python error:', err.message); resolve([]); return; }
      try { resolve(JSON.parse(stdout.trim())); }
      catch { resolve([]); }
    });
  });
}

async function fetchYFinance(tickers) {
  const now     = Date.now();
  const missing = tickers.filter(t => { const c = _yfCache.get(t); return !c || now - c.ts > CACHE_TTL; });

  if (missing.length > 0) {
    console.log(`[yf] Fetching ${missing.length} tickers via Python...`);
    const rows = await runPython(missing);
    for (const row of rows) {
      if (!row || row.error) continue;
      const bv = row.bookValue;
      let pbv = null;
      if (bv != null && bv > 0 && bv < 1) { pbv = null; }
      const roeDecimal = row.roe != null ? Math.round(row.roe / 100 * 10000) / 10000 : null;
      _yfCache.set(row.ticker, {
        ts: now,
        data: { pbv: pbv, per: row.per, roe: roeDecimal, der: row.der, bookValue: bv, source: 'yfinance' }
      });
    }
  }

  const result = new Map();
  for (const t of tickers) {
    const c = _yfCache.get(t);
    if (c?.data) result.set(t, c.data);
  }
  return result;
}

export async function getSectorsValuation(ticker) {
  const sym = ticker.replace(/\.JK$/i, '').toUpperCase();
  const map = await fetchIDXAll();
  if (map.get(sym)) return map.get(sym);
  const yf = await fetchYFinance([sym]);
  return yf.get(sym) || null;
}

export async function getSectorsValuationBatch(tickers) {
  const idxMap = await fetchIDXAll();
  const result  = new Map();
  const missing = [];

  for (const ticker of tickers) {
    const sym = ticker.replace(/\.JK$/i, '').toUpperCase();
    if (idxMap.has(sym)) result.set(sym, idxMap.get(sym));
    else missing.push(sym);
  }

  if (missing.length > 0) {
    const yfMap = await fetchYFinance(missing);
    for (const [sym, val] of yfMap) result.set(sym, val);
  }

  return result;
}