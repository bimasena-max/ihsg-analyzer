// lib/client/stats-store.js
// Menggantikan literal TICKER_SIGNAL_STATS (2,5 MB) yang dulu ikut dibundel
// ke browser setiap kali halaman dibuka.
//
// Cara kerja: objek `TICKER_SIGNAL_STATS` di bawah dimulai KOSONG dan diisi
// per ticker sesuai kebutuhan lewat /api/backtest-stats (~10 KB per ticker).
// Semua pembacaan lama yang bentuknya sinkron — `TICKER_SIGNAL_STATS[t] || {}` —
// tetap jalan tanpa diubah: sebelum data datang hasilnya undefined, persis
// seperti ticker yang memang tidak punya statistik.
//
// Komponen yang perlu render ulang setelah data masuk memakai useStatsVersion().

import { useEffect, useState } from 'react';

export const TICKER_SIGNAL_STATS = {};

let version = 0;
const listeners = new Set();
const inflight = new Map();

function bump() {
  version++;
  for (const cb of listeners) cb(version);
}

/**
 * Pastikan statistik untuk ticker-ticker ini sudah ada di memori.
 * Aman dipanggil berkali-kali: ticker yang sudah ada / sedang diambil dilewati.
 */
export function ensureStats(tickers) {
  const list = (Array.isArray(tickers) ? tickers : [tickers])
    .map((t) => String(t || '').toUpperCase())
    .filter((t) => t && !(t in TICKER_SIGNAL_STATS) && !inflight.has(t));

  if (list.length === 0) return Promise.resolve();

  const jobs = list.map((t) => {
    const p = fetch(`/api/backtest-stats?ticker=${encodeURIComponent(t)}`)
      .then(async (r) => {
        // 404 = memang belum ada backtest untuk ticker ini. Itu jawaban yang
        // valid, bukan error — disimpan sebagai objek kosong supaya tidak
        // di-fetch berulang kali.
        TICKER_SIGNAL_STATS[t] = r.ok ? (await r.json()).stats || {} : {};
      })
      .catch((e) => {
        console.warn('[stats-store] gagal ambil statistik', t, e.message);
        // TIDAK disimpan sebagai {} — biar dicoba lagi nanti, bukan
        // dianggap "ticker ini memang tidak punya data".
      })
      .finally(() => { inflight.delete(t); });
    inflight.set(t, p);
    return p;
  });

  return Promise.all(jobs).then(bump);
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Dipakai komponen supaya ikut render ulang saat statistik baru masuk. */
export function useStatsVersion() {
  const [v, setV] = useState(version);
  useEffect(() => subscribe(setV), []);
  return v;
}

/** Berapa ticker yang sudah dimuat — untuk indikator/diagnostik di UI. */
export function loadedCount() {
  return Object.keys(TICKER_SIGNAL_STATS).length;
}
