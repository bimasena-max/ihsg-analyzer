// lib/data/ml-predict.js
// Prediksi ML on-demand untuk SATU saham dan SATU horizon, dipanggil saat user
// menekan tombol "Prediksi" (pages/api/ml-predict.js).
//
//   OHLCV dari Yahoo -> fitur (lib/core/ml-features.js, sama dengan ml/features.py)
//   -> jumlahkan pohon (lib/core/ml-trees.js) dari ml/models/tree_<h>d.json
//   -> probabilitas harga h hari bursa ke depan LEBIH TINGGI dari penutupan terakhir.
//
// Tanpa onnxruntime, tanpa python. Fungsi di sini murni (data masuk -> hasil keluar)
// supaya bisa diuji tanpa jaringan; pengambilan data Yahoo ada di handler API.

import fs from 'fs';
import path from 'path';
import { HORIZONS } from '../core/constants.js';
import { buildLastBarFeatures, FEATURE_COLS, MIN_BARS } from '../core/ml-features.js';
import { cekModelPohon, probabilitasPohon } from '../core/ml-trees.js';
import { createMemoCache } from '../core/cache.js';

export { HORIZONS };

const MODELS_DIR = path.join(process.cwd(), 'ml', 'models');
const memo = createMemoCache(10 * 60 * 1000);

/** Galat yang bisa dibedakan handler: MODEL_MISSING | MODEL_INVALID | DATA_KURANG. */
export class PrediksiError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'PrediksiError';
    this.kind = kind;
  }
  toJSON() { return { error: this.message, kind: this.kind }; }
}

/** '5' | 5 | '5d' -> '5d' kalau termasuk HORIZONS, selain itu null. */
export function normalisasiHorizon(h) {
  const s = `${String(h ?? '').trim().toLowerCase().replace(/d$/, '')}d`;
  return HORIZONS.includes(s) ? s : null;
}

/** Baca & validasi tree_<h>d.json (di-cache). Melempar PrediksiError kalau tidak ada / rusak. */
export function bacaPohon(h, dir = MODELS_DIR) {
  const file = path.join(dir, `tree_${h}.json`);
  const key = `pohon:${file}`;
  const hit = memo.get(key);
  if (hit) return hit;

  let model;
  try {
    model = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new PrediksiError('MODEL_MISSING',
        `Model horizon ${h} belum ada di server (ml/models/tree_${h}.json). `
        + 'Jalankan workflow "ML harian" di GitHub, lalu git pull dan deploy ulang.');
    }
    throw new PrediksiError('MODEL_INVALID', `Berkas model horizon ${h} tidak bisa dibaca: ${e.message}`);
  }
  const masalah = cekModelPohon(model, FEATURE_COLS.length);
  if (masalah) throw new PrediksiError('MODEL_INVALID', `Model horizon ${h} ditolak: ${masalah}`);
  if (JSON.stringify(model.fitur) !== JSON.stringify(FEATURE_COLS)) {
    throw new PrediksiError('MODEL_INVALID', `Urutan fitur model horizon ${h} tidak sama dengan kode. Latih ulang model.`);
  }
  return memo.set(key, model);
}

/**
 * Apakah bar terakhir masih berjalan (pasar BEI belum tutup)? Dinilai dari jam WIB.
 * Bar yang belum selesai dibuang: model dilatih dan diuji pada penutupan harian penuh,
 * jadi angkanya harus dihitung dari penutupan terakhir yang sudah final.
 */
export function barMasihBerjalan(tanggalBarTerakhir, nowMs = Date.now()) {
  const wib = new Date(nowMs + 7 * 3600 * 1000);
  const hariIni = wib.toISOString().slice(0, 10);
  const hari = wib.getUTCDay();                                  // 0=Minggu .. 6=Sabtu (dalam WIB)
  const menit = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  return tanggalBarTerakhir === hariIni && hari >= 1 && hari <= 5 && menit < 16 * 60 + 30;
}

/**
 * ohlcv: { dates: ['YYYY-MM-DD', ...], highs, lows, closes, vols } (keluaran toOHLCV()).
 * Mengembalikan { p, asOf, bars, barBerjalanDibuang, fitur }.
 */
export function hitungPrediksi(ohlcv, horizon, { dir = MODELS_DIR, nowMs = Date.now() } = {}) {
  const model = bacaPohon(horizon, dir);

  let n = ohlcv?.closes?.length || 0;
  let dibuang = false;
  if (n && barMasihBerjalan(ohlcv.dates[n - 1], nowMs)) { n -= 1; dibuang = true; }
  if (n < MIN_BARS) {
    throw new PrediksiError('DATA_KURANG',
      `Data harga saham ini hanya ${n} bar; model butuh minimal ${MIN_BARS} bar (sekitar 10 bulan bursa).`);
  }

  const potong = (a) => a.slice(0, n);
  const { vector, features, missing } = buildLastBarFeatures({
    closes: potong(ohlcv.closes), highs: potong(ohlcv.highs), lows: potong(ohlcv.lows), vols: potong(ohlcv.vols),
    // jam 12:00 UTC supaya hari-dalam-minggu benar di zona waktu server mana pun
    dates: potong(ohlcv.dates).map((d) => new Date(`${d}T12:00:00Z`)),
  });
  if (!vector) {
    throw new PrediksiError('DATA_KURANG', `Fitur belum bisa dihitung (${(missing || []).join(', ') || 'data tidak lengkap'}).`);
  }

  const p = probabilitasPohon(model, vector);
  return {
    p: Math.round(p * 1000) / 1000,
    asOf: ohlcv.dates[n - 1],
    bars: n,
    barBerjalanDibuang: dibuang,
    fitur: Object.fromEntries(FEATURE_COLS.map((k, i) => [k, Math.round(vector[i] * 10000) / 10000])),
  };
}
