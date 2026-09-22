// lib/core/ml-trees.js
// Evaluator ensemble pohon LightGBM dalam JavaScript murni.
//
// Berkas modelnya (ml/models/tree_<h>d.json) ditulis oleh ml/train.py
// (export_trees) dalam format datar "lgbm-flat-v1":
//   { format, horizon, fitur: [...], sigmoid, trees: [{ f, t, l, r, v }, ...] }
// per pohon: f = indeks fitur, t = ambang, l/r = anak kiri/kanan
//   (>= 0 : indeks simpul berikutnya, < 0 : daun dengan indeks ~n), v = nilai daun.
// Aturan LightGBM untuk fitur numerik: nilai <= ambang -> kiri.
//
// Kenapa bukan onnxruntime-node: modul native itu berat, sulit dibawa ke function
// Vercel, dan tidak bisa membaca keluaran ZipMap. Menjumlahkan nilai daun tidak
// butuh dependensi apa pun, dan hasilnya sama dengan predict_proba Python sampai
// ~1e-16 (train.py menolak menulis berkas kalau selisihnya > 1e-9).
//
// Algoritma di sini HARUS sama dengan evaluasi_pohon() di ml/train.py.

/** Bentuk berkas yang dikenali? Mengembalikan null kalau valid, atau alasan penolakan. */
export function cekModelPohon(model, jumlahFitur) {
  if (!model || model.format !== 'lgbm-flat-v1') return 'format model tidak dikenali';
  if (!Array.isArray(model.trees) || !model.trees.length) return 'model tidak punya pohon';
  if (Array.isArray(model.fitur) && jumlahFitur != null && model.fitur.length !== jumlahFitur) {
    return `jumlah fitur model (${model.fitur.length}) tidak sama dengan kode (${jumlahFitur})`;
  }
  if (typeof model.sigmoid !== 'number') return 'parameter sigmoid hilang';
  return null;
}

/** Probabilitas kelas "naik" (0-1) untuk satu vektor fitur berurutan seperti FEATURE_COLS. */
export function probabilitasPohon(model, x) {
  let skor = 0;
  for (const tr of model.trees) {
    if (!tr.f.length) { skor += tr.v[0]; continue; }      // pohon satu daun
    let n = 0;
    while (n >= 0) n = x[tr.f[n]] <= tr.t[n] ? tr.l[n] : tr.r[n];
    skor += tr.v[~n];
  }
  return 1 / (1 + Math.exp(-model.sigmoid * skor));
}
