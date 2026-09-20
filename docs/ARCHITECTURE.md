# Arsitektur Target — ihsg-analyzer

## Aturan dasar

Satu hal dihitung di satu tempat. Kalau dua file menghitung hal yang sama, cepat atau lambat keduanya akan berbeda dan tidak ada yang tahu mana yang benar. Itulah yang sudah terjadi di versi sekarang.

Tiga aturan turunannya:

1. **Rumus tinggal di `lib/`.** Halaman dan API route boleh memanggil, tidak boleh menghitung sendiri.
2. **Data hasil generate tinggal di `data/`.** Tidak pernah ditulis tangan di dalam file komponen.
3. **Kegagalan dilaporkan, bukan diganti nilai kosong.** Setiap error punya `kind` supaya UI bisa membedakan "saham ini memang tidak ada" dari "sumber data lagi mati".

## Struktur folder

```
lib/
  core/
    constants.js      Benchmark sektor, daftar horizon, TTL cache. Satu-satunya.
    indicators.js     RSI, MACD, Bollinger, EMA/MA, ATR, Stochastic, Fibonacci.
                      Dipakai frontend DAN API route. Plus snapshot() yang
                      menghitung semua indikator terakhir sekali jalan.
    scoring.js        invScore fundamental. Dulu 3 salinan, sekarang 1.
    verdict.js        UNIFIED SIGNAL ENGINE. Satu-satunya yang memutuskan
                      verdict akhir dari 5 pilar + aturan konflik.
    cache.js          Kebijakan cache + "snapshot bucket" bersama.
  data/
    yahoo.js          Semua akses Yahoo Finance. Auth diperbarui sendiri.
    backtest.js       Pembaca statistik backtest dari data/backtest/.
    idx-foreign.js    Net asing IDX + perhitungan streak.
    (nanti) ml.js     Pembaca hasil prediksi model.

data/
  backtest/
    global.json         Statistik per nama sinyal (12 KB)
    index.json          Peta ticker -> daftar sinyal (100 KB)
    tickers/AALI.json   Statistik per ticker, ~10 KB per file, 293 file
  foreign/
    2026-09-18.json     Snapshot net asing harian, diisi cron

pages/
  api/
    chart.js          Tipis: terjemahkan HTTP, sisanya lib/
    quote.js          Fundamental satu ticker
    screener.js       Screening massal
    backtest-stats.js Menggantikan 2,5 MB literal di bundle browser
    foreign-flow.js   Top net buy/sell + streak
    news.js
    sectors-client.js
  index.js            -> dipecah, lihat di bawah

components/
  layout/             Shell, tab bar, header
  screener/           Tabel + filter screener
  detail/             Halaman detail satu saham
  signals/            Tab sinyal
  foreign/            Top foreign buy & sell
  chart/              PriceChart, RSIChart, RelativeChart (canvas)
  shared/             VerdictBadge, MetricCard, ScoreBreakdown, modal distribusi

scripts/
  extract-backtest-stats.mjs   Migrasi literal -> JSON (sekali jalan)
  probe-idx-foreign.mjs        Cek nama field IDX sebelum dipakai produksi
  verify-migration.mjs         Bukti refactor tidak menggeser angka

ml/                   (Tahap 5) training Python terpisah
  train.py
  features.py
  models/
```

## Unified signal engine

Ini bagian yang paling menentukan, jadi aturannya ditulis eksplisit.

Lima pilar masuk, satu verdict keluar:

| Pilar | Dari mana |
|---|---|
| fundamental | `invScore()` — PBV, PER, ROE, DER, RSI, drawdown |
| technical | `snapshot()` — RSI, MACD, Bollinger, MA, volume |
| swing | `generateSwingSignals()` |
| scalping | `generateScalpingSignals()` |
| flow | streak net asing dari IDX |

**Bobot berubah menurut horizon.** Ini yang bikin poin C (granularitas 1D/2D) dan poin A saling nyambung, bukan dua fitur terpisah:

| Horizon | fundamental | technical | scalping | swing | flow |
|---|---|---|---|---|---|
| 1d, 2d | 10% | 30% | 30% | 10% | 20% |
| 3d–14d | 25% | 25% | 10% | 25% | 15% |
| 30d, 60d | 45% | 20% | 0% | 25% | 10% |

Fundamental hampir tidak berarti untuk pergerakan besok. Sebaliknya, sinyal scalping tidak boleh ikut menentukan pandangan 60 hari. Angka-angka di atas adalah tebakan awal yang **harus dikalibrasi ulang** setelah backtest 1D/2D selesai (Tahap 3).

**Pilar yang datanya tidak ada tidak dihitung nol.** Bobotnya dinormalisasi ulang ke pilar yang tersedia, dan kekurangannya dilaporkan di `dataQuality.coverage`. Bedanya penting: saham tanpa data asing bukan berarti asing sedang menjual.

**Konflik mengubah label, bukan disembunyikan.**

| Situasi | Hasil |
|---|---|
| Fundamental bagus + harga overbought | `BELI (tunggu koreksi)` |
| Fundamental lemah + teknikal menarik | `BELI (trading only)` |
| Swing dan scalping berlawanan jauh | Keyakinan turun, yang dipakai yang sesuai horizon |
| Teknikal positif + asing net sell beruntun | Verdict turun satu tingkat |

**Data tipis tidak boleh keluar sebagai ajakan beli.** Kalau coverage < 50%, atau ada ≥ 2 konflik, atau sampel backtest < 30 kejadian, keyakinan jadi RENDAH dan `BELI` otomatis diturunkan jadi `PERHATIKAN (data terbatas)`.

Setiap verdict membawa `disclaimer` dan daftar `reasons` supaya UI tidak perlu mengarang penjelasan sendiri.

## Cache

Dulu empat nilai berbeda: chart 300 detik, news 300, quote 600, screener 1800. Akibatnya halaman list dan halaman detail bisa menampilkan status berbeda untuk saham yang sama pada waktu yang sama — bukan karena rumusnya beda, tapi karena datanya beda umur.

Sekarang semua data pasar memakai satu TTL (`CACHE.MARKET`) dan dibulatkan ke "bucket" waktu yang sama. Setiap response membawa `_meta.snapshotBucket`. Kalau dua panel di layar punya bucket berbeda, frontend tahu dan bisa memberi tahu user, bukan menampilkan dua angka yang bertentangan tanpa penjelasan.
