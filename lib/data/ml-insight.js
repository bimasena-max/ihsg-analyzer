// lib/data/ml-insight.js
// Membaca semua yang dibutuhkan panel "Teknikal vs Prediksi AI" untuk SATU ticker:
//
//   ml/models/model_<h>d.json     kartu model: akurasi walk-forward, baseline, AUC, kalibrasi
//   ml/models/oos_<h>d.json       prediksi out-of-sample per ticker (ditulis ml/train.py)
//   data/predictions/<tgl>-<h>d.json   prediksi harian sungguhan (ditulis ml/predict.py)
//
// Tidak ada model yang dimuat dan tidak ada request ke Yahoo di sini — cuma baca
// JSON kecil, sama seperti lib/data/backtest.js. Semua file boleh tidak ada:
// hasilnya `null` / daftar kosong, bukan error, karena training pertama kali
// memang belum tentu sudah jalan.

import fs from 'fs';
import path from 'path';
import { createMemoCache } from '../core/cache.js';

export const HORIZONS = ['1d', '2d'];

const MODELS_DIR = path.join(process.cwd(), 'ml', 'models');
const PRED_DIR = path.join(process.cwd(), 'data', 'predictions');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// File-file ini hanya berubah saat deploy baru / job harian commit baru, jadi cukup
// di-cache beberapa menit per instance.
const memo = createMemoCache(10 * 60 * 1000);

/** Baca JSON. ENOENT -> { data: null }. JSON rusak -> { data: null, error } (tidak melempar). */
function readJSON(file) {
  const key = `json:${file}`;
  const hit = memo.get(key);
  if (hit) return hit;
  let out;
  try {
    out = { data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    out = e.code === 'ENOENT'
      ? { data: null }
      : { data: null, error: `${path.basename(file)} tidak bisa dibaca: ${e.message}` };
  }
  return memo.set(key, out);
}

/** Kartu model -> ringkasan yang aman dikirim ke browser. */
export function bacaKartu(h, dir = MODELS_DIR) {
  const { data, error } = readJSON(path.join(dir, `model_${h}.json`));
  if (!data) return { kartu: null, peringatan: error || null };

  const folds = Array.isArray(data.folds) ? data.folds : [];
  const dari = folds.map((f) => f?.uji_dari).filter(Boolean).sort()[0] || null;
  const sampai = folds.map((f) => f?.uji_sampai).filter(Boolean).sort().slice(-1)[0] || null;

  return {
    kartu: {
      horizon: h,
      algoritma: data.algoritma ?? null,
      dilatih: data.dilatih ?? null,
      baris_latih: data.baris_latih ?? null,
      jumlah_ticker: data.jumlah_ticker ?? null,
      akurasi: isNum(data.akurasi_walk_forward) ? data.akurasi_walk_forward : null,
      baseline: isNum(data.baseline_selalu_naik) ? data.baseline_selalu_naik : null,
      auc: isNum(data.auc) ? data.auc : null,
      // boolean apa adanya; undefined -> null supaya UI menurunkan sendiri dari angka
      lolos: typeof data.lolos_baseline === 'boolean' ? data.lolos_baseline : null,
      jumlah_fold: folds.length,
      uji_dari: dari,
      uji_sampai: sampai,
      kalibrasi: (Array.isArray(data.kalibrasi) ? data.kalibrasi : [])
        .filter((b) => isNum(b?.prediksi) && isNum(b?.kenyataan))
        .map((b) => ({ prediksi: b.prediksi, kenyataan: b.kenyataan, n: b.n ?? null })),
    },
    peringatan: null,
  };
}

/**
 * Prediksi out-of-sample satu ticker. Format file: per-mil (0-1000) atau null,
 * satu daftar tanggal bersama. Dikembalikan sebagai probabilitas 0-1.
 */
export function bacaUjiMundur(h, ticker, dir = MODELS_DIR) {
  const { data, error } = readJSON(path.join(dir, `oos_${h}.json`));
  if (!data) return { ujiMundur: null, peringatan: error || null };
  const arr = data.p?.[ticker];
  if (!Array.isArray(data.dates) || !Array.isArray(arr) || arr.length !== data.dates.length) {
    return { ujiMundur: null, peringatan: null };
  }
  const p = arr.map((v) => (isNum(v) ? Math.round(v) / 1000 : null));
  if (!p.some((v) => v != null)) return { ujiMundur: null, peringatan: null };
  return { ujiMundur: { dates: data.dates, p, dibuat: data.dibuat ?? null }, peringatan: null };
}

/** Isi `prediksi` dari satu file harian, di-cache per (path, mtime). */
function bacaBerkasHarian(file) {
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { return null; }
  const key = `harian:${file}:${mtime}`;
  const hit = memo.get(key);
  if (hit !== null) return hit.v;
  let v = null;
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    v = { tanggal: d?.tanggal ?? null, prediksi: d?.prediksi && typeof d.prediksi === 'object' ? d.prediksi : {} };
  } catch { v = null; }
  memo.set(key, { v });
  return v;
}

/**
 * Riwayat prediksi harian sungguhan satu ticker, urut tanggal naik.
 * Kunci tanggalnya `tanggal_data` (bar terakhir yang dipakai model), BUKAN tanggal
 * berkas — itulah tanggal harga yang diprediksi. Kalau dua berkas menunjuk
 * tanggal_data yang sama (job dijalankan ulang), berkas yang lebih baru menang.
 */
export function bacaHarian(h, ticker, { dir = PRED_DIR, maxFiles = 90 } = {}) {
  let names;
  try {
    const re = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${h}\\.json$`);
    names = fs.readdirSync(dir).filter((f) => re.test(f)).sort().slice(-maxFiles);
  } catch (e) {
    if (e.code === 'ENOENT') return { harian: [], terbaru: null };
    throw e;
  }

  const perTanggal = new Map();
  for (const name of names) {
    const berkas = bacaBerkasHarian(path.join(dir, name));
    const rec = berkas?.prediksi?.[ticker];
    if (!rec || !isNum(rec.prob_naik)) continue;
    const d = rec.tanggal_data || berkas.tanggal;
    if (!d) continue;
    perTanggal.set(d, { d, p: rec.prob_naik, berkas: name });
  }
  const harian = [...perTanggal.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { harian, terbaru: harian.length ? harian[harian.length - 1] : null };
}

/** Paket lengkap untuk /api/ml-insight. */
export function bangunInsight(ticker, { modelsDir = MODELS_DIR, predDir = PRED_DIR, maxFiles = 90 } = {}) {
  const peringatan = [];
  const horizons = {};
  for (const h of HORIZONS) {
    const k = bacaKartu(h, modelsDir);
    const u = bacaUjiMundur(h, ticker, modelsDir);
    const r = bacaHarian(h, ticker, { dir: predDir, maxFiles });
    if (k.peringatan) peringatan.push(k.peringatan);
    if (u.peringatan) peringatan.push(u.peringatan);
    horizons[h] = {
      kartu: k.kartu,
      uji_mundur: u.ujiMundur,
      harian: r.harian.map(({ d, p }) => ({ d, p })),
      terbaru: r.terbaru,
    };
  }
  return { ticker, horizons, peringatan };
}
