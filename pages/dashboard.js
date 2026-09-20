// pages/dashboard.js
// Tampilan baru (Tahap 6). Halaman lama tetap ada di / — belum dihapus supaya
// fitur yang belum dipindah (JARVIS, komparasi, akun demo, panduan) tidak hilang.
//
// Yang berubah dibanding halaman lama:
//   - Satu verdict menonjol per saham, bukan empat sinyal yang saling bertentangan
//   - Ringkasan dulu, angka mentah di balik expand
//   - Dibangun untuk layar sempit lebih dulu, bukan tabel desktop yang dipaksa mengecil

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import VerdictCard from '../components/verdict/VerdictCard';
import { snapshot } from '../lib/core/indicators';
import { invScore } from '../lib/core/scoring';
import { generateSwingSignals, generateScalpingSignals } from '../lib/core/signals';
import { buildVerdict } from '../lib/core/verdict';
import { HORIZONS, HORIZON_LABEL } from '../lib/core/constants';

const PESAN_ERROR = {
  NOT_FOUND:  (t) => `${t} tidak ada di Bursa Efek Indonesia, atau kodenya salah.`,
  RATE_LIMIT: () => 'Sumber data sedang membatasi permintaan. Coba lagi sebentar lagi.',
  AUTH:       () => 'Koneksi ke sumber data ditolak. Ini masalah di sisi server, bukan di saham yang dicari.',
  NETWORK:    () => 'Tidak bisa menghubungi sumber data.',
  UPSTREAM:   () => 'Sumber data sedang bermasalah.',
  PARSE:      () => 'Balasan dari sumber data tidak bisa dibaca.',
};

function pesanDari(err, ticker) {
  const f = PESAN_ERROR[err?.kind];
  return f ? f(ticker) : (err?.error || 'Terjadi kesalahan yang tidak dikenali.');
}

function ohlcvDari(chart) {
  const r = chart?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) return null;
  const out = { dates: [], opens: [], highs: [], lows: [], closes: [], vols: [] };
  (r.timestamp || []).forEach((t, i) => {
    if (q.close?.[i] == null) return;
    out.dates.push(new Date(t * 1000).toISOString().slice(0, 10));
    out.opens.push(q.open[i]); out.highs.push(q.high[i]);
    out.lows.push(q.low[i]);   out.closes.push(q.close[i]);
    out.vols.push(q.volume?.[i] ?? 0);
  });
  return out.closes.length ? out : null;
}

export default function Dashboard() {
  const [ticker, setTicker] = useState('');
  const [input, setInput] = useState('');
  const [horizon, setHorizon] = useState('3d');
  const [muat, setMuat] = useState(false);
  const [galat, setGalat] = useState(null);
  const [data, setData] = useState(null);      // { ohlcv, fundamental, harga, perubahan }
  const [aliran, setAliran] = useState(null);

  const ambil = useCallback(async (t) => {
    setMuat(true); setGalat(null); setData(null); setAliran(null);

    const [chartRes, quoteRes, flowRes] = await Promise.allSettled([
      fetch(`/api/chart?ticker=${t}&range=1y&interval=1d`).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw j;
        return j;
      }),
      fetch(`/api/quote?ticker=${t}`).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw j;
        return j;
      }),
      fetch(`/api/foreign-flow?mode=streak&limit=100`).then((r) => (r.ok ? r.json() : null)),
    ]);

    setMuat(false);

    // Chart wajib. Sisanya opsional — kalau gagal, pilarnya hilang dan
    // verdict engine menurunkan keyakinan, bukan mengarang angka.
    if (chartRes.status === 'rejected') {
      setGalat(pesanDari(chartRes.reason, t));
      return;
    }

    const ohlcv = ohlcvDari(chartRes.value);
    if (!ohlcv || ohlcv.closes.length < 60) {
      setGalat(`Data historis ${t} terlalu pendek untuk dianalisis (butuh minimal 60 hari bursa).`);
      return;
    }

    const meta = chartRes.value?.chart?.result?.[0]?.meta || {};
    const harga = meta.regularMarketPrice ?? ohlcv.closes.at(-1);
    const sebelum = meta.chartPreviousClose ?? ohlcv.closes.at(-2);

    let fundamental = null;
    if (quoteRes.status === 'fulfilled') {
      const f = quoteRes.value?.quoteSummary?.result?.[0]?._fundamentals;
      if (f) {
        const snap = snapshot(ohlcv);
        fundamental = invScore(f.pbv, f.per, snap.rsi, snap.drawdownPct, f.roe, f.der, f.sector);
      }
    }

    if (flowRes.status === 'fulfilled' && flowRes.value) {
      const semua = [...(flowRes.value.topBuy || []), ...(flowRes.value.topSell || [])];
      setAliran(semua.find((r) => r.ticker === t) || null);
    }

    setData({ ohlcv, fundamental, harga, perubahan: sebelum ? ((harga - sebelum) / sebelum) * 100 : null });
  }, []);

  useEffect(() => { if (ticker) ambil(ticker); }, [ticker, ambil]);

  const verdict = data && buildVerdict({
    fundamental: data.fundamental,
    snapshot: snapshot(data.ohlcv),
    swingSignals: generateSwingSignals(data.ohlcv),
    scalpingSignals: generateScalpingSignals(data.ohlcv),
    foreign: aliran,
    horizon,
  });

  return (
    <>
      <Head>
        <title>{ticker ? `${ticker} — Analisis` : 'Analisis Saham IHSG'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <main>
        <form onSubmit={(e) => { e.preventDefault(); const t = input.trim().toUpperCase(); if (t) setTicker(t); }}>
          <label htmlFor="kode">Kode saham</label>
          <div className="cari">
            <input
              id="kode" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="BBCA" autoComplete="off" autoCapitalize="characters"
              spellCheck="false" maxLength={6}
            />
            <button type="submit" disabled={muat || !input.trim()}>
              {muat ? 'Menganalisis' : 'Analisis'}
            </button>
          </div>
        </form>

        <nav aria-label="Horizon waktu">
          {HORIZONS.map((h) => (
            <button
              key={h} type="button"
              className={h === horizon ? 'aktif' : ''}
              onClick={() => setHorizon(h)}
            >
              {HORIZON_LABEL[h]}
            </button>
          ))}
        </nav>

        {horizon === '1d' || horizon === '2d' ? (
          <p className="catatan">
            Horizon ini belum punya data backtest. Verdict tetap dihitung dari indikator,
            tapi tanpa win rate historis — keyakinannya otomatis lebih rendah.
          </p>
        ) : null}

        {galat && <p className="galat">{galat}</p>}

        {!ticker && !galat && (
          <p className="kosong">Masukkan kode saham untuk melihat satu penilaian gabungan dari fundamental, teknikal, dan aliran asing.</p>
        )}

        {verdict && (
          <VerdictCard
            ticker={ticker}
            verdict={verdict}
            harga={data.harga}
            perubahan={data.perubahan}
          />
        )}
      </main>

      <style jsx global>{`
        :root {
          --ink:    #0d1420;
          --panel:  #16202e;
          --line:   #24344a;
          --teks:   #e3eaf3;
          --mute:   #7c8ea6;
          --naik:   #2cb67d;
          --turun:  #e0555a;
          --tunggu: #d9a227;
          --sans: 'IBM Plex Sans', system-ui, sans-serif;
          --mono: 'IBM Plex Mono', ui-monospace, monospace;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0; background: var(--ink); color: var(--teks);
          font-family: var(--sans); font-variant-numeric: tabular-nums;
          -webkit-font-smoothing: antialiased;
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }
      `}</style>

      <style jsx>{`
        main { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }

        label { display: block; font: 400 13px/1 var(--sans); color: var(--mute); margin-bottom: 8px; }
        .cari { display: flex; gap: 8px; }
        input {
          flex: 1; min-width: 0; height: 46px; padding: 0 12px;
          background: var(--panel); border: 1px solid var(--line); border-radius: 4px;
          color: var(--teks); font: 500 17px/1 var(--mono); letter-spacing: 0.08em;
        }
        input::placeholder { color: var(--mute); letter-spacing: 0.08em; }
        input:focus-visible, button:focus-visible { outline: 2px solid var(--teks); outline-offset: 2px; }
        .cari button {
          height: 46px; padding: 0 18px; border: 1px solid var(--line);
          border-radius: 4px; background: var(--teks); color: var(--ink);
          font: 500 15px/1 var(--sans); cursor: pointer;
        }
        .cari button:disabled { background: var(--panel); color: var(--mute); cursor: not-allowed; }

        nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 18px 0 14px; }
        nav button {
          min-height: 34px; padding: 0 12px; border: 1px solid var(--line);
          border-radius: 3px; background: transparent; color: var(--mute);
          font: 400 13px/1 var(--sans); cursor: pointer;
        }
        nav button.aktif { color: var(--teks); border-color: var(--teks); }

        .catatan, .kosong, .galat {
          font: 400 13px/1.6 var(--sans); max-width: 62ch;
        }
        .catatan { color: var(--tunggu); border-left: 2px solid var(--tunggu); padding-left: 12px; margin: 0 0 16px; }
        .kosong { color: var(--mute); margin: 24px 0 0; }
        .galat { color: var(--turun); border-left: 2px solid var(--turun); padding-left: 12px; margin: 16px 0 0; }
      `}</style>
    </>
  );
}
