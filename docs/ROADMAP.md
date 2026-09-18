# Urutan Pengerjaan

Prinsipnya: fondasi dulu. Fitur baru yang dibangun di atas bug lama akan mewarisi bug itu, dan memperbaikinya belakangan jadi dua kali kerja.

Contoh konkret kenapa urutan ini penting: kalau Top Foreign Buy (poin B) dibangun sebelum unified verdict engine ada, dia akan jadi tab ke-8 yang berdiri sendiri — persis masalah yang mau kita hilangkan. Aliran asing seharusnya jadi salah satu input skor, bukan pulau baru.

---

## Tahap 1 — Fondasi **(SELESAI, ada di paket ini)**

| Yang dikerjakan | Kenapa |
|---|---|
| `lib/core/scoring.js` — invScore satu sumber | Dulu 3 salinan (index.js, screener.js, quote.js), bukan 2 seperti dugaan awal |
| `lib/core/indicators.js` — indikator satu sumber | `calcRSI` dulu ditulis 2 kali dengan default berbeda |
| `lib/core/constants.js` | `SECTOR_BENCH` dulu 3 salinan; salinan di index.js malah tidak lengkap |
| `lib/core/cache.js` + semua route diseragamkan | Dulu 4 TTL berbeda, bukan 2 |
| `lib/data/yahoo.js` | Cookie Yahoo hardcoded identik di 3 file — begitu expired, 3 endpoint mati bersamaan |
| `lib/core/verdict.js` — unified signal engine | 4 sistem sinyal akhirnya direkonsiliasi |
| `data/backtest/*.json` + `/api/backtest-stats` | 2,5 MB literal keluar dari bundle browser |
| `scripts/verify-migration.mjs` | Bukti 200.000 kombinasi bahwa skor tidak bergeser |

**Cara verifikasi:** `node scripts/verify-migration.mjs` → harus `0 beda`.

---

## Tahap 2 — Pecah `pages/index.js` **(SELESAI sebagian — lihat STATUS.md)**

Setelah 4.658 baris data keluar, sisanya ±5.100 baris: UI + 58 `useState` + 4 generator sinyal + renderer canvas.

Urutan pemecahan (dari yang paling aman):

1. Fungsi murni (`getHistoricalTPSL`, `detectGapUpCandidate`, `calcSMC`, generator swing/scalping) → `lib/core/signals.js`. Tidak menyentuh React sama sekali.
2. Komponen presentasional (`MetricCard`, `Verdict`, `ScoreBreakdown`, `SignalNote`) → `components/shared/`.
3. Chart canvas → `components/chart/`.
4. Per tab → `components/screener/`, `components/detail/`, dst.
5. State global (yang dipakai lintas tab) → satu context; sisanya turun ke komponen masing-masing.

Selesai kalau: `pages/index.js` di bawah 300 baris dan cuma mengurus routing tab.

---

## Tahap 3 — Backtest 1D/2D **(kode siap, tinggal dijalankan di mesin lu)**

**Temuan yang mengubah rencana:** `backtest_trades_v2.csv` cuma punya kolom `ret_3d` sampai `ret_60d`. Tidak ada `ret_1d` dan `ret_2d`. Jadi 1D/2D **tidak bisa dihitung dari CSV yang ada** — harus backtest ulang dari OHLC mentah.

**Temuan kedua, lebih penting:** untuk sinyal BPJS dan BSJP, kolom `ret_3d` bukan return 3 hari. `backtest_bei.py` menyimpan return intraday/overnight di kolom itu. Artinya angka "3 hari" yang tampil di UI untuk dua sinyal itu sebenarnya angka 1 hari yang salah label. Ini harus dibereskan bareng, bukan setelahnya.

Langkah:

1. Tambah `ret_1d`, `ret_2d` ke `TradeRow` dan `build_summary` di `backtest_bei.py`.
2. Pisahkan kolom intraday jadi `ret_intraday` sendiri, berhenti menumpang `ret_3d`.
3. Jalankan ulang backtest penuh (butuh unduh ulang OHLC — ini bagian paling lama, hitung jam bukan menit).
4. Generate ulang `data/backtest/*.json` dari CSV baru.
5. **Kalibrasi ulang bobot** di `lib/core/verdict.js` pakai hasil 1D/2D yang sebenarnya.

Jangan cuma menambah label "1D" di dropdown tanpa langkah 1–4. Itu menampilkan angka 3 hari dengan nama 1 hari.

---

## Tahap 4 — Top Foreign Buy & Sell **(kode siap, tinggal nunggu histori terkumpul)**

Sumber data sudah diputuskan: **IDX Stock Summary**, endpoint JSON yang sudah dipakai proyek ini di `sectors-client.js` untuk PBV/PER. Gratis, resmi, dan infranya sudah terbukti jalan.

Kendalanya satu: IDX cuma memberi **snapshot hari ini**, tidak ada histori. Streak butuh histori.

Karena itu:

1. Jalankan `node scripts/probe-idx-foreign.mjs` dulu — memastikan nama field asing yang aktual hari ini (nama field di IDX pernah berubah, jadi adapter sengaja menerima beberapa ejaan).
2. Pasang cron harian (Vercel Cron, sore setelah bursa tutup) yang memanggil `/api/foreign-flow?mode=snapshot`.
3. Tunggu terkumpul. Endpoint akan menandai `peringatan` selama histori di bawah 10 hari bursa, dan verdict engine memberi bobot rendah pada streak yang masih tipis.
4. Kalau tidak mau menunggu: API komersial (Sectors.app, Invezgo, IndexAlpha) menjual histori broker summary + foreign flow. Berbayar, tapi streak langsung panjang sejak hari pertama.

Filter Harian/Mingguan/Bulanan/Streak sudah didukung `rankForeignFlow()`. Filter kategori (syariah dll.) lewat parameter `universe`.

---

## Tahap 5 — Machine learning **(pipeline siap, butuh data Tahap 3)**

Baru masuk akal setelah Tahap 3, karena targetnya (`ret_1d`, `ret_2d`) belum ada sebelum itu.

**Pendekatan yang direkomendasikan** — sengaja bukan deep learning:

- **Model:** gradient boosting (LightGBM atau XGBoost). Untuk data tabular ~100 ribu baris dengan 20-30 fitur, ini hampir selalu mengalahkan neural network, latihnya hitungan menit, dan kontribusi tiap fitur bisa dijelaskan.
- **Target:** klasifikasi biner "return 1D/2D positif atau tidak", bukan regresi nilai return. Regresi return saham jangka pendek didominasi noise.
- **Fitur:** yang sudah ada — RSI 14 & 9, MACD histogram, posisi harga relatif Bollinger, jarak ke EMA 5/20/50, ATR ratio, rasio volume, drawdown dari ATH, plus net asing dari Tahap 4. Ditambah sektor sebagai kategori.
- **Validasi:** walk-forward, **bukan** random split. Random split pada data time-series membocorkan masa depan ke data latih dan menghasilkan akurasi yang kelihatan bagus tapi palsu. Skema: latih 2023, uji Q1 2024; latih sampai Q1 2024, uji Q2 2024; dan seterusnya.
- **Tolok ukur kejujuran:** bandingkan dengan dua baseline — tebak selalu "naik", dan win rate sinyal yang sudah ada. Model yang tidak mengalahkan keduanya tidak dipasang, betapapun bagus angka latihnya.

**Di mana dijalankan:** batch job terjadwal, bukan inference realtime.

Alasannya: Vercel serverless tidak cocok memuat model setiap request (cold start + tidak ada state), dan prediksi harian tidak berubah dalam hitungan detik. Jadi — job Python harian (GitHub Actions cukup) menghitung prediksi untuk seluruh watchlist, menyimpannya sebagai `data/predictions/YYYY-MM-DD.json`, dan frontend tinggal membaca. Pola persis sama dengan `data/backtest/`. Tidak perlu server Python yang hidup terus.

**Di UI:** tampilkan sebagai probabilitas dengan rentang (misal "58% ± 6%"), bukan panah naik/turun. Sertakan jumlah sampel dan tanggal latih terakhir. Kalau model belum mengalahkan baseline untuk suatu saham, jangan tampilkan angkanya sama sekali — tampilkan "belum cukup andal untuk saham ini".

---

## Tahap 6 — Redesign UI **(SELESAI — /dashboard)**

Dikerjakan terakhir karena butuh unified verdict (Tahap 1) dan komponen yang sudah dipecah (Tahap 2). Mendesain ulang 7 tab yang saling bertentangan cuma memperindah kebingungan.

Arah:

- **Satu verdict menonjol per saham.** Yang di atas layar cuma: label verdict, skor, tingkat keyakinan, satu kalimat alasan. Sisanya di balik expand.
- **Progressive disclosure.** Ringkasan → alasan per pilar → angka mentah. Tiga lapis, bukan semua ditumpuk.
- **Konflik ditampilkan, bukan disembunyikan.** "Fundamental bagus, tapi lagi overbought" jauh lebih berguna daripada dua tab yang diam-diam bertentangan.
- **Dark mode dipertahankan**, yang diperbaiki kepadatannya: target sentuh minimal 44px, tabel jadi kartu di layar sempit.
- **Chart canvas dipertahankan** (performanya bagus, tanpa dependensi), tapi di mobile: kurangi jumlah label sumbu, tebalkan garis, dan sediakan mode fullscreen landscape.
