#!/usr/bin/env python3
# Taruh di: pages/api/fundamental.py
# Usage: python fundamental.py PSSI BBCA TLKM
# Output: JSON ke stdout

import sys, json
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_one(sym):
    try:
        info = yf.Ticker(f"{sym}.JK").info
        bv   = info.get('bookValue')
        per  = info.get('trailingPE')
        roe  = info.get('returnOnEquity')
        der  = info.get('debtToEquity')
        mc   = info.get('marketCap')
        return {
            'ticker':    sym,
            'bookValue': bv,
            'per':       per if per and 0 < per < 500 else None,
            'roe':       round(roe * 100, 2) if roe is not None else None,
            'der':       round(der / 100, 2) if der is not None else None,
            'mc':        mc,
            'error':     None,
        }
    except Exception as e:
        return {'ticker': sym, 'error': str(e)}

tickers = [t.upper().replace('.JK','') for t in sys.argv[1:]]
results = {}
with ThreadPoolExecutor(max_workers=5) as ex:
    for fut in as_completed({ex.submit(fetch_one, t): t for t in tickers}):
        r = fut.result()
        results[r['ticker']] = r

print(json.dumps([results.get(t, {'ticker': t, 'error': 'not found'}) for t in tickers]))