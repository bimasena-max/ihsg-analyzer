#!/usr/bin/env node
// scripts/collect-foreign-snapshot.mjs
// Ambil satu snapshot net asing IDX hari ini, simpan ke data/foreign/.
//
// SENGAJA dijalankan sebagai script, BUKAN dari dalam pages/api/foreign-flow.js
// yang di-deploy ke Vercel. Vercel serverless function filesystem-nya read-only
// di luar /tmp, dan /tmp sendiri tidak persisten antar invocation — jadi
// fs.writeFileSync dari dalam API route yang live TIDAK PERNAH benar-benar
// menyimpan apa pun, walau kodenya kelihatan jalan tanpa error.
//
// Script ini jalan di GitHub Actions (filesystem penuh, persisten dalam satu
// job, dan hasilnya di-commit balik ke repo) — pola yang sama persis dengan
// data/backtest/*.json.
//
//   node scripts/collect-foreign-snapshot.mjs [YYYY-MM-DD]

import fs from 'fs';
import path from 'path';
import { fetchForeignSnapshot, ForeignDataError } from '../lib/data/idx-foreign.js';

const DIR = path.join(process.cwd(), 'data', 'foreign');

async function main() {
  const date = process.argv[2];
  try {
    const snap = await fetchForeignSnapshot(date);
    fs.mkdirSync(DIR, { recursive: true });
    const file = path.join(DIR, `${snap.date}.json`);
    fs.writeFileSync(file, JSON.stringify(snap));
    console.log(`Tersimpan: ${file} (${snap.rows.length} baris, coverage ${(snap.coverage * 100).toFixed(0)}%)`);
  } catch (e) {
    if (e instanceof ForeignDataError) {
      console.error(`Gagal (${e.kind}): ${e.message}`);
      // Hari libur bursa itu wajar (kind=EMPTY) — bukan kegagalan yang harus
      // menggagalkan job GitHub Actions.
      process.exit(e.kind === 'EMPTY' ? 0 : 1);
    }
    console.error('Gagal tidak terduga:', e.message);
    process.exit(1);
  }
}

main();
