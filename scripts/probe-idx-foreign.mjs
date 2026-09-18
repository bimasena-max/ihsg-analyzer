// scripts/probe-idx-foreign.mjs
// Cek nama field asing yang SEBENARNYA dikembalikan IDX hari ini, sebelum
// kode produksi mengandalkannya. Nama field di situs IDX pernah berubah.
//
//   node scripts/probe-idx-foreign.mjs [YYYY-MM-DD]

const date = (process.argv[2] || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
const url = `https://www.idx.co.id/primary/TradingSummary/GetStockSummary?length=20&start=0&date=${date}`;

const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/',
  },
});

console.log('HTTP', res.status, res.headers.get('content-type'));
const text = await res.text();

let json;
try { json = JSON.parse(text); }
catch { console.log('Bukan JSON. 400 karakter pertama:\n', text.slice(0, 400)); process.exit(1); }

const rows = json?.data || json?.Data || json?.results || [];
console.log('Jumlah baris:', rows.length);
if (!rows.length) { console.log('Kosong — kemungkinan hari libur bursa, atau endpoint berubah.'); process.exit(1); }

console.log('\nSemua nama field di baris pertama:');
for (const [k, v] of Object.entries(rows[0])) console.log(`  ${k.padEnd(28)} = ${JSON.stringify(v)}`);

const kandidat = Object.keys(rows[0]).filter((k) => /foreign|asing/i.test(k));
console.log('\nField yang mengandung "foreign":', kandidat.length ? kandidat : '(tidak ada — data asing mungkin di endpoint lain)');
