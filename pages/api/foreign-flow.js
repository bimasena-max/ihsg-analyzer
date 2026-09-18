// pages/api/foreign-flow.js
// Top net foreign buy/sell + streak. HANYA MEMBACA — tidak pernah menulis.
//
// Endpoint ini dulu punya mode `?mode=snapshot` yang mencoba fs.writeFileSync
// langsung dari sini. Itu SALAH: Vercel serverless function filesystem-nya
// read-only di luar /tmp, dan /tmp sendiri tidak persisten antar invocation —
// kodenya jalan tanpa error tapi tidak pernah benar-benar menyimpan apa pun.
// Bug ini ketahuan sebelum sempat dipasang, jadi tidak ada histori yang
// hilang, tapi kalau lu pernah lihat versi paket sebelumnya dengan mode itu
// di vercel.json — itu yang dihapus di sini.
//
// Pengumpulan snapshot sekarang HANYA lewat scripts/collect-foreign-snapshot.mjs,
// dijalankan dari GitHub Actions (filesystem penuh + persisten dalam satu job),
// hasilnya di-commit ke data/foreign/*.json, lalu ikut ter-deploy saat kamu
// menjalankan `vercel --prod` berikutnya — sama persis alurnya dengan
// data/backtest/*.json.

import fs from 'fs';
import path from 'path';
import { rankForeignFlow } from '../../lib/data/idx-foreign.js';
import { applyCache } from '../../lib/core/cache.js';

const DIR = path.join(process.cwd(), 'data', 'foreign');

function loadHistory() {
  if (!fs.existsSync(DIR)) return {};
  const byTicker = {};
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
    const day = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    for (const row of day.rows || []) {
      (byTicker[row.ticker] ||= []).push({ date: day.date, netForeign: row.netForeign });
    }
  }
  return byTicker;
}

export default function handler(req, res) {
  const { mode = 'streak', universe, limit = '20' } = req.query;

  if (mode === 'snapshot') {
    // Tidak dilayani di sini secara sengaja — lihat komentar di atas.
    return res.status(410).json({
      error: 'Pengambilan snapshot tidak lagi dilakukan lewat API live (filesystem Vercel read-only). '
           + 'Jalankan node scripts/collect-foreign-snapshot.mjs dari GitHub Actions.',
      kind: 'MOVED',
    });
  }

  try {
    const history = loadHistory();
    const hariTerkumpul = Math.max(0, ...Object.values(history).map((h) => h.length));

    const hasil = rankForeignFlow(history, {
      universe: universe ? universe.split(',').map((s) => s.trim().toUpperCase()) : null,
      mode,
      limit: Math.min(100, parseInt(limit, 10) || 20),
    });

    const meta = applyCache(res, 'FOREIGN');
    return res.status(200).json({
      ...hasil,
      hariTerkumpul,
      peringatan: hariTerkumpul < 10
        ? `Histori baru ${hariTerkumpul} hari bursa. Streak belum bisa diandalkan sampai minimal 10 hari.`
        : null,
      _meta: meta,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, kind: 'UNKNOWN' });
  }
}
