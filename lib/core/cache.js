// lib/core/cache.js
// Satu tempat yang menentukan header cache + satu timestamp bersama.
//
// Masalah lama: chart.js s-maxage=300, news.js 300, quote.js 600,
// screener.js 1800 — empat nilai berbeda untuk data pasar yang sama, jadi
// halaman list dan halaman detail bisa menampilkan status berbeda untuk saham
// yang sama di waktu yang sama.
//
// Sekarang semua endpoint yang membaca data pasar dibulatkan ke "bucket"
// waktu yang sama (CACHE.MARKET). Selama berada di bucket yang sama, semua
// endpoint pasti menjawab dari snapshot yang sama.

import { CACHE } from './constants.js';

/** Awal bucket saat ini, dalam epoch detik. Sama untuk semua endpoint. */
export function bucketStart(ttlSeconds) {
  return Math.floor(Date.now() / 1000 / ttlSeconds) * ttlSeconds;
}

/**
 * Pasang header cache + metadata snapshot.
 * Kembalikan objek meta yang HARUS ikut disertakan di body response, supaya
 * frontend bisa mendeteksi kalau dua panel berasal dari snapshot berbeda.
 */
export function applyCache(res, kind = 'MARKET') {
  const ttl = CACHE[kind] ?? CACHE.MARKET;
  const start = bucketStart(ttl);
  res.setHeader('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=${Math.round(ttl / 2)}`);
  res.setHeader('X-Snapshot-Bucket', String(start));
  return {
    snapshotBucket: start,
    snapshotAt: new Date(start * 1000).toISOString(),
    ttl,
  };
}

/** Cache in-memory sederhana untuk pemakaian dalam satu instance serverless. */
export function createMemoCache(ttlMs) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() - hit.at > ttlMs) { store.delete(key); return null; }
      return hit.value;
    },
    set(key, value) {
      store.set(key, { value, at: Date.now() });
      return value;
    },
    clear() { store.clear(); },
  };
}
