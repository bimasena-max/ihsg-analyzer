# Status — apa yang sudah jadi, apa yang belum

## Cara pasang

Paket ini sudah berisi `pages/index.js` yang **sudah dipatch**, jadi tidak ada langkah edit manual lagi.

```bash
# dari root proyek lama
cp -r lib data ml scripts docs components .github /path/proyek/
cp pages/index.js pages/dashboard.js /path/proyek/pages/
cp pages/api/*.js /path/proyek/pages/api/
cp backtest_bei.py vercel.json /path/proyek/

npm run dev            # halaman lama di /, tampilan baru di /dashboard
node scripts/verify-migration.mjs    # harus "0 beda"
```

Satu file lama bisa dihapus: `lib/ticker_signal_stats_v2.js` (2,35 MB, tidak di-import siapa pun).

## Angka sebelum dan sesudah

| | Sebelum | Sesudah |
|---|---|---|
| `pages/index.js` | 9.772 baris / 2,85 MB | 4.553 baris / ~300 KB |
| Data backtest ke browser | 2,5 MB tiap buka halaman | ~10 KB per ticker, diambil saat dibutuhkan |
| Salinan `invScore` | 3 | 1 |
| Salinan `SECTOR_BENCH` | 3 | 1 |
| Salinan indikator | 2 | 1 |
| Nilai TTL cache | 4 berbeda | 1 untuk data pasar |
| Cookie Yahoo | hardcoded di 3 file | diambil & di-refresh sendiri |
| Verdict akhir | 4 sistem tak direkonsiliasi | 1 engine, konflik eksplisit |

Semua sudah lolos: 200.000 kombinasi `invScore` dan 2.000 seri `calcRSI` — **nol pergeseran angka**. Bundle-check esbuild lolos untuk `index.js`, `dashboard.js`, dan semua modul.

---

## Selesai dan bisa langsung dipakai

**Tahap 1 — fondasi.** `lib/core/` (constants, indicators, scoring, signals, verdict, cache), `lib/data/` (yahoo, backtest, idx-foreign), semua API route memakainya. Auth Yahoo memperbarui diri sendiri; error punya `kind` sehingga UI bisa membedakan "saham tidak ada" dari "sumber data mati".

**Tahap 2 — pemecahan.** 4.658 baris data keluar jadi JSON, 462 baris generator sinyal pindah ke `lib/core/signals.js`, 129 baris indikator/scoring duplikat dihapus. `pages/index.js` tinggal UI.

**Tahap 6 — tampilan baru.** `/dashboard`: satu verdict menonjol, meter per pilar dengan penanda netral, konflik ditampilkan sebagai kalimat, angka mentah di balik expand. Halaman lama **sengaja tidak dihapus** — JARVIS, komparasi, akun demo, dan panduan belum dipindah, dan menghapusnya sekarang berarti kehilangan fitur.

**Kode Tahap 3, 4, 5 sudah ditulis dan lolos cek sintaks**, tapi belum menghasilkan data. Alasannya di bawah.

---

## Yang tidak bisa diselesaikan dari sini

Bukan karena kodenya belum ada — kodenya sudah ada. Tiga hal ini butuh mesin dan waktu, bukan pengetikan.

### 1. Backtest 1D/2D — butuh unduh ulang OHLC

`backtest_bei.py` sudah dimodifikasi: `ret_1d` dan `ret_2d` ditambahkan, dan return intraday BPJS/BSJP dipindah ke kolomnya sendiri (`ret_intraday`) — sebelumnya menumpang `ret_3d`, yang artinya kolom "3 hari" di UI selama ini menampilkan angka 1 hari untuk dua sinyal itu.

Yang tersisa cuma menjalankannya, dan itu perlu mengunduh 3 tahun OHLC untuk 322 ticker dari Yahoo. Hitungan jam, dan harus dari mesin yang tidak diblokir Yahoo.

```bash
pip install yfinance pandas numpy tqdm
python backtest_bei.py --years 3
python scripts/generate-backtest-json.py backtest_trades_v2.csv
```

Setelah itu horizon 1D/2D otomatis terisi di UI. **Bobot di `lib/core/verdict.js` perlu dikalibrasi ulang** dengan hasil sebenarnya — angka yang ada sekarang asumsi awal yang jujur, bukan hasil pengukuran.

Generator-nya sudah gua uji dengan CSV yang ada sekarang, dan dia melaporkan dengan benar:

```
94.328 baris dibaca
Horizon tersedia: 3d, 5d, 7d, 14d, 30d, 60d
Horizon BELUM ada: 1d, 2d -> jalankan ulang backtest_bei.py versi baru dulu
```

### 2. Streak asing — butuh waktu berjalan, bukan waktu ngoding

IDX cuma memberi snapshot hari ini. Tidak ada endpoint histori yang gratis dan legal. Streak butuh histori, jadi histori harus dikumpulkan hari demi hari.

**Koreksi dari paket sebelumnya:** rencana awal memasang cron Vercel yang memanggil `/api/foreign-flow?mode=snapshot` untuk menulis file dari dalam API route yang live. Itu tidak akan pernah bekerja — filesystem Vercel serverless read-only di luar `/tmp`, dan `/tmp` sendiri tidak persisten antar invocation. Kodenya akan jalan tanpa error tapi tidak pernah benar-benar menyimpan apa pun.

Sekarang pengumpulan snapshot pindah ke `scripts/collect-foreign-snapshot.mjs`, dijalankan lewat `.github/workflows/foreign-flow-daily.yml` (jadwal sama, tapi di GitHub Actions yang filesystem-nya penuh dan persisten dalam satu job). Endpoint `/api/foreign-flow` di Vercel sekarang cuma membaca. Sekitar 10 hari bursa sebelum streak-nya berarti; sebelum itu endpoint mengembalikan `peringatan` dan verdict engine memberi bobot rendah.

Sebelum deploy, jalankan `node scripts/probe-idx-foreign.mjs` dari mesin lu. Nama field asing di IDX pernah berubah antar versi situs, jadi adapternya sengaja menerima beberapa ejaan sekaligus dan skrip itu menunjukkan nama yang aktual hari ini.

Kalau tidak mau menunggu: Sectors.app, Invezgo, atau IndexAlpha menjual histori broker summary + foreign flow. Berbayar, tapi streak langsung panjang sejak hari pertama.

### 3. Model ML — butuh data dari poin 1

`ml/features.py`, `ml/train.py`, `ml/predict.py`, dan workflow GitHub Actions sudah siap. Tapi targetnya adalah arah harga 1D/2D, dan label itu baru ada setelah backtest di poin 1 selesai. Melatih sekarang berarti melatih terhadap data yang belum ada.

Yang sudah diputuskan dan tertanam di kode:

- **LightGBM**, bukan deep learning. Untuk data tabular dengan 18 fitur, gradient boosting hampir selalu menang, latihnya menit bukan jam, dan kontribusi tiap fitur bisa dijelaskan ke user.
- **Klasifikasi arah**, bukan regresi besaran. Return 1-2 hari didominasi noise; memprediksi berapa persisnya adalah janji yang tidak bisa ditepati.
- **Walk-forward dengan gap**, bukan random split. Random split membocorkan masa depan ke data latih dan menghasilkan akurasi yang kelihatan bagus tapi palsu. Gap sepanjang horizon mencegah label terakhir data latih memakai harga yang sudah masuk periode uji.
- **Dua baseline wajib dikalahkan**: tebak selalu "naik", dan win rate sinyal yang sudah ada. `predict.py` **menolak menulis prediksi** kalau model tidak lolos. Lebih baik UI tidak menampilkan apa-apa daripada menampilkan angka yang belum layak.
- **Kalibrasi diperiksa**: model yang bilang 70% harus benar sekitar 70% dari waktu, kalau tidak angkanya menyesatkan.
- **Batch harian, bukan inference realtime.** Vercel serverless tidak cocok memuat model tiap request, dan prediksi harian toh tidak berubah dalam hitungan detik.

```bash
pip install -r ml/requirements.txt
python ml/train.py --horizon 1 --years 3     # setelah backtest selesai
python ml/predict.py --horizon 1
```

---

## Sisa pekerjaan yang murni ngoding

Ini bisa dikerjakan kapan saja, tidak menunggu apa pun:

- Pindahkan JARVIS, komparasi, akun demo, dan panduan dari `pages/index.js` ke komponen, lalu `/dashboard` menggantikan `/`.
- Sambungkan `/api/predictions` ke `VerdictCard` sebagai pilar keenam setelah model lolos baseline.
- Chart canvas untuk layar sempit: kurangi label sumbu, tebalkan garis, tambah mode fullscreen landscape.

## Satu hal soal keamanan

Cookie sesi Yahoo yang tertanam di source code sudah dihapus dan sekarang dibaca dari environment variable `YF_COOKIE` (opsional — kosongkan saja, modulnya ambil sendiri). Kalau repo ini pernah di-push ke GitHub publik, cookie itu masih ada di riwayat commit. Sebaiknya logout dari sesi Yahoo yang bersangkutan.
