// components/ml/AiInsightPanel.jsx
// Panel "Teknikal vs Prediksi AI" untuk halaman detail saham.
//
//   kiri  : sinyal teknikal (jenis, winrate, rata-rata hasil) + baris AI dengan format SAMA
//   kanan : gambar hasil prediksi AI (harga + tebakan AI + hasilnya) untuk 1 / 2 hari ke depan
//   bawah : seberapa bisa dipercaya (uji model, kalibrasi, rekam jejak di saham ini) + cara baca
//
// Data:
//   /api/ml-insight?ticker=  kartu model, uji mundur (out-of-sample), riwayat prediksi harian
//   props.mlLive             angka AI "sekarang" dari baris screener (0-100), kalau dibuka dari leaderboard
//   props.closes / props.ts  harga dari halaman detail; kalau kurang dari 70 bar, panel ambil 6 bulan sendiri
//
// Semua angka dihitung di ai-insight-logic.js (diuji terpisah). File ini hanya menggambar.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ML_BULLISH, ML_BEARISH, HORIZON_BARS, HORIZON_LABEL,
  tanggalID, pct, signed, horizonHari, callFor, verdictFor, bacaAngka,
  isoFromEpoch, pricesFromChartJson, alignSeries, buildPoints, trackRecord,
  calibrationLookup, reliability, alignment, pickTechRows,
} from './ai-insight-logic';

const WINDOW = 90;          // jumlah bar harga yang digambar
const MIN_BAR_PROPS = 70;   // di bawah ini panel ambil harga 6 bulan sendiri

const rp = (v) => `Rp ${Math.round(v).toLocaleString('id-ID')}`;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const wrColor = (wr) => (wr >= 55 ? 'var(--green)' : wr >= 45 ? 'var(--amber)' : 'var(--red)');
const TONE = { green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)', muted: 'var(--muted)' };
const TONE_BG = { green: 'var(--green-dim)', red: 'var(--red-dim)', amber: 'var(--amber-dim)', muted: 'rgba(255,255,255,.03)' };

// ─────────────────────────────────────────────────────────────────────────────
// Gambar hasil prediksi AI
// ─────────────────────────────────────────────────────────────────────────────
export function AiChart({ width, height = 320, dates, closes, points, from, hz, pNow, pBoth, hover, onHover, muted }) {
  const last = closes.length - 1;
  const n = last - from + 1;
  if (!(width > 120) || n < 2) return null;

  const narrow = width < 480;                        // HP: kotak prediksi dibuang, angkanya sudah ada di tombol 1/2 hari
  const padL = 50, padR = 8, padT = 10, padB = 22;
  const futW = narrow ? 0 : 96;                      // ruang tetap di kanan untuk kotak prediksi
  const innerW = Math.max(40, width - padL - padR - futW);
  const step = innerW / (n - 1);
  const X = (i) => padL + (i - from) * step;
  const xFut = padL + innerW + 10;                   // awal zona prediksi

  const innerH = height - padT - padB;
  const rib = 16;                                    // strip hasil tebakan di antara dua panel
  const gap = 8;
  const hTop = Math.round((innerH - rib - gap * 2) * 0.58);
  const hBot = innerH - rib - gap * 2 - hTop;
  const yTop0 = padT;
  const yRib0 = padT + hTop + gap;
  const yRibMid = yRib0 + rib / 2;
  const yBot0 = yRib0 + rib + gap;

  // skala harga
  let lo = Infinity, hi = -Infinity;
  for (let i = from; i <= last; i++) { lo = Math.min(lo, closes[i]); hi = Math.max(hi, closes[i]); }
  const pad = (hi - lo) * 0.14 || hi * 0.02;
  lo -= pad; hi += pad;
  const YP = (v) => yTop0 + hTop - ((v - lo) / (hi - lo)) * hTop;

  // skala probabilitas: selalu memuat 35%-65% supaya garis acuan 35/50/60 selalu terlihat
  let pmin = 0.5, pmax = 0.5;
  for (let i = from; i <= last; i++) {
    const pt = points[i];
    if (pt) { pmin = Math.min(pmin, pt.p); pmax = Math.max(pmax, pt.p); }
  }
  if (isNum(pNow)) { pmin = Math.min(pmin, pNow); pmax = Math.max(pmax, pNow); }
  const plo = Math.max(0, Math.min(0.35, pmin - 0.03));
  const phi = Math.min(1, Math.max(0.65, pmax + 0.03));
  const YQ = (p) => yBot0 + hBot - ((p - plo) / (phi - plo)) * hBot;

  // garis harga
  let pricePath = '';
  for (let i = from; i <= last; i++) pricePath += `${i === from ? 'M' : 'L'}${X(i).toFixed(1)},${YP(closes[i]).toFixed(1)}`;

  // garis probabilitas AI: satu "run" per sumber, disambung ke titik sebelumnya kalau bar-nya berurutan
  const runs = [];
  let cur = null;
  for (let i = from; i <= last; i++) {
    const pt = points[i];
    if (!pt) { cur = null; continue; }
    const xy = [X(i), YQ(pt.p)];
    if (cur && cur.src === pt.src) cur.pts.push(xy);
    else {
      const prev = points[i - 1];
      cur = { src: pt.src, pts: prev && i - 1 >= from ? [[X(i - 1), YQ(prev.p)], xy] : [xy] };
      runs.push(cur);
    }
  }

  // tick tanggal
  const ticks = [];
  const nTick = narrow ? 2 : 4;
  for (let k = 0; k <= nTick; k++) ticks.push(from + Math.round((k * (n - 1)) / nTick));

  const hoverX = hover != null && hover >= from && hover <= last ? X(hover) : null;

  const handleMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * width;
    const i = Math.round((x - padL) / step) + from;
    onHover?.(i < from || i > last ? null : i);
  };

  const pill = (yc, hzKey, p) => {
    const tone = { naik: 'green', turun: 'red', netral: 'amber', none: 'muted' }[callFor(p)];
    const arrow = p == null ? '' : p > 0.5 ? '▲ ' : p < 0.5 ? '▼ ' : '';
    const active = hzKey === hz;
    return (
      <g key={hzKey}>
        <rect x={xFut} y={yc - 11} width={futW - 8} height={22} rx={11}
          fill={TONE_BG[tone]} stroke={TONE[tone]} strokeWidth={active ? 1.8 : 1}
          strokeDasharray={p == null ? '3 3' : undefined} opacity={active ? 1 : 0.7} />
        <text x={xFut + (futW - 8) / 2} y={yc + 4} textAnchor="middle" fontSize="10.5" fontWeight="700"
          fill={TONE[tone]} fontFamily="'DM Mono',monospace">
          {HORIZON_LABEL[hzKey]} {p == null ? '—' : `${arrow}${Math.round(p * 100)}%`}
        </text>
      </g>
    );
  };

  const yLast = YP(closes[last]);
  const yPill1 = Math.min(Math.max(yLast - 15, yTop0 + 34), yTop0 + hTop - 40);
  const yPill2 = yPill1 + 28;

  const aria = `Grafik harga ${n} hari terakhir dengan tebakan arah AI. Hijau berarti tebakan benar, merah berarti meleset.`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={aria}
      style={{ display: 'block', touchAction: 'pan-y', opacity: muted ? 0.55 : 1 }}
      onPointerMove={handleMove} onPointerDown={handleMove} onPointerLeave={() => onHover?.(null)}>

      {/* panel */}
      <rect x={padL - 2} y={yTop0} width={innerW + 4} height={hTop} rx={8} fill="var(--bg2)" />
      <rect x={padL - 2} y={yBot0} width={innerW + 4} height={hBot} rx={8} fill="var(--bg2)" />

      {/* zona prediksi */}
      {!narrow && (
        <g>
          <rect x={xFut - 6} y={yTop0} width={futW} height={hTop} rx={8} fill="var(--blue-dim)" opacity="0.55" />
          <text x={xFut + (futW - 8) / 2} y={yTop0 + 15} textAnchor="middle" fontSize="10" fill="var(--muted)"
            fontFamily="'DM Sans',sans-serif">prediksi AI</text>
          {pill(yPill1, '1d', pBoth?.['1d'] ?? null)}
          {pill(yPill2, '2d', pBoth?.['2d'] ?? null)}
        </g>
      )}

      {/* label harga */}
      {[hi - pad, (hi + lo) / 2, lo + pad].map((v, k) => (
        <text key={k} x={padL - 8} y={YP(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)"
          fontFamily="'DM Mono',monospace">{Math.round(v).toLocaleString('id-ID')}</text>
      ))}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={padL - 2} x2={padL + innerW + 2} y1={yTop0 + hTop * f} y2={yTop0 + hTop * f}
          stroke="var(--border)" strokeWidth="1" opacity="0.6" />
      ))}

      {/* harga */}
      <path d={pricePath} fill="none" stroke="var(--text2)" strokeWidth="1.6" strokeLinejoin="round" />

      {/* garis acuan probabilitas */}
      {[[ML_BULLISH, 'var(--green)', '4 4', '60%'], [0.5, 'var(--border2)', undefined, '50%'], [ML_BEARISH, 'var(--red)', '4 4', '35%']].map(([v, c, dash, t]) => (
        <g key={t}>
          <line x1={padL - 2} x2={padL + innerW + 2} y1={YQ(v)} y2={YQ(v)} stroke={c} strokeWidth="1"
            strokeDasharray={dash} opacity={dash ? 0.65 : 1} />
          <text x={padL - 8} y={YQ(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)"
            fontFamily="'DM Mono',monospace">{t}</text>
        </g>
      ))}
      <text x={padL + 6} y={yBot0 + 12} fontSize="10" fill="var(--muted)" fontFamily="'DM Sans',sans-serif">
        peluang naik menurut AI
      </text>
      {!points.slice(from, last + 1).some(Boolean) && !isNum(pNow) && (
        <text x={padL + innerW / 2} y={yBot0 + hBot / 2 + 12} textAnchor="middle" fontSize="11" fill="var(--muted)"
          fontFamily="'DM Sans',sans-serif">belum ada riwayat prediksi AI untuk saham ini</text>
      )}

      {/* garis + titik probabilitas */}
      {runs.map((r, k) => r.pts.length > 1 && (
        <polyline key={k} points={r.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
          fill="none" stroke={r.src === 'harian' ? 'var(--purple)' : 'var(--blue)'}
          strokeWidth={r.src === 'harian' ? 2 : 1.5} opacity={r.src === 'harian' ? 1 : 0.8} strokeLinejoin="round" />
      ))}
      {points.slice(from, last + 1).map((pt, k) => pt && (
        <circle key={k} cx={X(from + k)} cy={YQ(pt.p)} r={pt.src === 'harian' ? 2.4 : 1.7}
          fill={pt.src === 'harian' ? 'var(--purple)' : 'var(--blue)'} />
      ))}
      {isNum(pNow) && (
        <g>
          <circle cx={X(last)} cy={YQ(pNow)} r={5} fill="none" stroke="var(--text)" strokeWidth="1.6" />
          <text x={X(last) - 9} y={YQ(pNow) - 8} textAnchor="end" fontSize="10.5" fontWeight="700" fill="var(--text)"
            fontFamily="'DM Mono',monospace">sekarang {Math.round(pNow * 100)}%</text>
        </g>
      )}

      {/* strip hasil tebakan: satu segitiga per hari, warna = benar / meleset / belum ketahuan */}
      <text x={padL - 6} y={yRibMid + 3} textAnchor="end" fontSize="10" fill="var(--muted)"
        fontFamily="'DM Mono',monospace">tebakan</text>
      {points.slice(from, last + 1).map((pt, k) => {
        if (!pt || pt.lean == null) return null;
        const i = from + k;
        const x = X(i), y = yRibMid;
        const rMax = Math.min(4.6, Math.max(1.8, step * 0.6));
        const r = pt.call === 'naik' || pt.call === 'turun' ? rMax : rMax * 0.72;
        const d = pt.lean === 'naik'
          ? `M${x.toFixed(1)},${(y - r).toFixed(1)} L${(x - r).toFixed(1)},${(y + r * 0.85).toFixed(1)} L${(x + r).toFixed(1)},${(y + r * 0.85).toFixed(1)} Z`
          : `M${x.toFixed(1)},${(y + r).toFixed(1)} L${(x - r).toFixed(1)},${(y - r * 0.85).toFixed(1)} L${(x + r).toFixed(1)},${(y - r * 0.85).toFixed(1)} Z`;
        const c = pt.outcome === 'hit' ? 'var(--green)' : pt.outcome === 'miss' ? 'var(--red)' : 'none';
        return (
          <path key={i} d={d} fill={c} stroke={pt.outcome === 'pending' ? 'var(--muted)' : c}
            strokeWidth={pt.outcome === 'pending' ? 1.1 : 0.4} />
        );
      })}

      {/* titik harga terakhir */}
      <circle cx={X(last)} cy={yLast} r={3.2} fill="var(--text)" />

      {/* sumbu tanggal */}
      {ticks.map((i, k) => (
        <text key={k} x={X(i)} y={height - 6} fontSize="10" fill="var(--muted)" fontFamily="'DM Mono',monospace"
          textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}>
          {tanggalID(dates[i], { tahun: false })}
        </text>
      ))}

      {/* garis bidik saat disentuh/di-hover */}
      {hoverX != null && (
        <g pointerEvents="none">
          <line x1={hoverX} x2={hoverX} y1={yTop0} y2={yBot0 + hBot} stroke="var(--text2)" strokeWidth="1" opacity="0.7" />
          <circle cx={hoverX} cy={YP(closes[hover])} r={3.6} fill="var(--bg)" stroke="var(--text)" strokeWidth="1.6" />
        </g>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Potongan kecil
// ─────────────────────────────────────────────────────────────────────────────
function Stat({ label, value, color }) {
  return (
    <span className="aip-stat">
      <span className="aip-stat-l">{label}</span>
      <b style={{ color: color || 'var(--text)' }}>{value}</b>
    </span>
  );
}

function Row({ badge, badgeColor, arrow, arrowColor, title, wr, avg, meta, note }) {
  return (
    <div className="aip-row">
      <div className="aip-row-top">
        <span className="aip-badge" style={{ color: badgeColor, borderColor: badgeColor }}>{badge}</span>
        <span className="aip-row-title"><span style={{ color: arrowColor }}>{arrow}</span> {title}</span>
      </div>
      <div className="aip-row-stats">
        {isNum(wr) ? <Stat label="Winrate" value={`${wr}%`} color={wrColor(wr)} /> : <Stat label="Winrate" value="—" color="var(--muted)" />}
        {isNum(avg)
          ? <Stat label={avg >= 0 ? 'Rata-rata naik' : 'Rata-rata turun'} value={`${signed(avg, 2)}%`} color={avg >= 0 ? 'var(--green)' : 'var(--red)'} />
          : <Stat label="Rata-rata" value="—" color="var(--muted)" />}
      </div>
      <div className="aip-meta">{meta}</div>
      {note && <div className="aip-note">{note}</div>}
    </div>
  );
}

// Teks hover di bawah chart
function hoverText(i, dates, closes, points, h) {
  const t = tanggalID(dates[i]);
  const pt = points[i];
  if (!pt) return `${t} · ${rp(closes[i])} · tidak ada tebakan AI di tanggal ini`;
  const sumber = pt.src === 'harian' ? 'prediksi harian' : 'uji mundur';
  const arah = pt.lean === 'naik' ? 'menebak naik' : pt.lean === 'turun' ? 'menebak turun' : 'netral';
  let hasil;
  if (pt.outcome === 'pending') hasil = `hasil ${HORIZON_LABEL[h === 2 ? '2d' : '1d']} ke depan belum ketahuan`;
  else if (pt.outcome === 'none') hasil = 'tepat 50%, tidak dinilai';
  else hasil = `${HORIZON_LABEL[h === 2 ? '2d' : '1d']} kemudian ${pt.ret >= 0 ? 'naik' : 'turun'} ${signed(pt.ret * 100, 2)}% → tebakan ${pt.outcome === 'hit' ? 'benar' : 'meleset'}`;
  return `${t} · ${rp(closes[i])} · AI ${Math.round(pt.p * 100)}% (${sumber}) ${arah} · ${hasil}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tampilan murni: semua data sudah disiapkan, tidak ada fetch di sini.
// ─────────────────────────────────────────────────────────────────────────────
export function AiInsightView({
  ticker, techRows, hz, setHz, chartWidth, chartRef,
  status, error, onRetry,
  harga, hargaStatus, insight, live, liveStatus, liveNote, onHitung, canHitung,
  hover, setHover,
}) {
  const h = HORIZON_BARS[hz];
  const hzData = insight?.horizons?.[hz] || null;
  const kartu = hzData?.kartu || null;
  const rel = useMemo(() => reliability(kartu), [kartu]);
  const muted = rel.status === 'gagal';

  const lastDate = harga?.dates?.[harga.dates.length - 1] || null;
  const nowFrom = (key) => {
    const l = live?.[key];
    if (isNum(l)) return l;
    const t = insight?.horizons?.[key]?.terbaru;
    return t && lastDate && t.d === lastDate ? t.p : null;
  };
  const pBoth = { '1d': nowFrom('1d'), '2d': nowFrom('2d') };
  const pNow = pBoth[hz];

  // deret + titik + rekam jejak
  const { points, from, record, avgNaik } = useMemo(() => {
    if (!harga) return { points: [], from: 0, record: null, avgNaik: null };
    const ai = alignSeries(harga.dates, hzData?.uji_mundur || null, hzData?.harian || []);
    const pts = buildPoints(harga.closes, ai, h);
    const start = Math.max(0, harga.closes.length - WINDOW);
    const vis = pts.slice(start);
    const rec = trackRecord(vis, harga.closes, h);
    const naik = vis.filter((p) => p && p.lean === 'naik' && (p.outcome === 'hit' || p.outcome === 'miss') && isNum(p.ret));
    const avg = naik.length ? (naik.reduce((s, p) => s + p.ret, 0) / naik.length) * 100 : null;
    return { points: pts, from: start, record: rec, avgNaik: avg };
  }, [harga, hzData, h]);

  const verdict = verdictFor(pNow);
  const teknik = useMemo(() => pickTechRows(techRows, 4), [techRows]);
  const align = useMemo(() => alignment(techRows, pNow), [techRows, pNow]);
  const kal = useMemo(() => calibrationLookup(kartu?.kalibrasi, pNow), [kartu, pNow]);

  const aiWR = record && record.naikN >= 5 ? Math.round((record.naikHits / record.naikN) * 1000) / 10 : null;
  const aiAvg = record && record.naikN >= 5 ? avgNaik : null;

  return (
    <div className="aip-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {status === 'error' && (
        <div className="aip-card aip-err">
          Data AI belum bisa dimuat ({error}). <button className="chart-opt-btn" onClick={onRetry}>Coba lagi</button>
        </div>
      )}

      <div className="aip">
        {/* ── kiri: teks ─────────────────────────────────────────────── */}
        <div className="aip-card">
          <div className="aip-h">Sinyal hari ini dan rekam jejaknya</div>
          <div className="aip-sub">
            Winrate = berapa persen kejadian sinyal ini berakhir naik di masa lalu. Rata-rata = hasil rata-ratanya.
          </div>

          {teknik.length === 0 && (
            <div className="aip-empty">Tidak ada sinyal teknikal aktif untuk {ticker} hari ini.</div>
          )}
          {teknik.map((r, i) => (
            <Row key={`${r.name}-${i}`}
              badge={r.kind} badgeColor={r.kind === 'Akumulasi' ? 'var(--purple)' : 'var(--blue)'}
              arrow={r.dir === 'BUY' ? '▲' : '▼'} arrowColor={r.dir === 'BUY' ? 'var(--green)' : 'var(--red)'}
              title={r.name} wr={r.wr} avg={r.avgRet}
              meta={isNum(r.wr)
                ? `${r.n ?? '?'} kejadian · ${horizonHari(r.horizon)}${r.specific ? ' · khusus saham ini' : ' · semua saham'}`
                : 'belum ada data backtest'} />
          ))}

          <Row badge="AI" badgeColor="var(--purple)"
            arrow={pNow != null && pNow < 0.5 ? '▼' : '▲'} arrowColor="var(--purple)"
            title={`Saat AI menebak naik (di atas 50%)`}
            wr={aiWR} avg={aiAvg}
            meta={record && record.naikN >= 5
              ? `${record.naikN} hari dari ${WINDOW} hari terakhir · ${HORIZON_LABEL[hz]} ke depan`
              : record && record.n > 0 ? 'terlalu sedikit tebakan naik untuk dihitung' : 'belum ada rekam jejak'}
            note={muted
              ? 'Model belum lolos uji, anggap ini referensi saja.'
              : (record && record.naikN >= 5 && record.kecil ? 'Sampel masih kecil, jangan dijadikan patokan.' : null)} />

          <div className="aip-align" style={{ borderLeftColor: TONE[align.tone], background: TONE_BG[align.tone] }}>
            <b style={{ color: TONE[align.tone] }}>{align.title}</b>
            <div>{align.text}</div>
          </div>
        </div>

        {/* ── kanan: gambar ──────────────────────────────────────────── */}
        <div className="aip-card">
          <div className="aip-head">
            <div>
              <div className="aip-h">Prediksi AI</div>
              <div className="aip-verdict" style={{ color: verdict.color }}>
                {verdict.label}{pNow != null && <span className="aip-big"> {pct(pNow, 0)}%</span>}
              </div>
            </div>
            <div className="aip-seg" role="group" aria-label="Horizon prediksi">
              {['1d', '2d'].map((k) => (
                <button key={k} className={`chart-opt-btn ${hz === k ? 'on' : ''}`} onClick={() => setHz(k)}>
                  {HORIZON_LABEL[k]}{pBoth[k] != null ? ` · ${Math.round(pBoth[k] * 100)}%` : ''}
                </button>
              ))}
            </div>
          </div>

          {pNow != null && <div className="aip-read">{bacaAngka(pNow, hz)}</div>}
          {pNow == null && (
            <div className="aip-read">
              {liveStatus === 'loading' ? 'Menghitung prediksi AI…'
                : liveNote || 'Belum ada angka AI hari ini untuk saham ini.'}
              {canHitung && liveStatus !== 'loading' && (
                <> <button className="chart-opt-btn" onClick={onHitung}>Hitung sekarang</button></>
              )}
            </div>
          )}

          {muted && (
            <div className="aip-warn">
              Model {HORIZON_LABEL[hz]} belum mengalahkan tebakan “selalu naik” di uji walk-forward.
              Anggap gambar ini sebagai referensi, bukan dasar keputusan.
            </div>
          )}

          <div ref={chartRef} className="aip-chart">
            {harga && chartWidth > 0 && (
              <AiChart width={chartWidth} dates={harga.dates} closes={harga.closes} points={points} from={from}
                hz={hz} pNow={pNow} pBoth={pBoth} hover={hover} onHover={setHover} muted={muted} />
            )}
            {!harga && (
              <div className="aip-empty" style={{ padding: '3rem 0' }}>
                {hargaStatus === 'error' ? 'Harga tidak bisa dimuat untuk menggambar chart.' : 'Memuat grafik…'}
              </div>
            )}
          </div>

          <div className="aip-hover" aria-live="polite">
            {harga && hover != null
              ? hoverText(hover, harga.dates, harga.closes, points, h)
              : (
                <span>
                  Baris “tebakan” = arah tebakan AI tiap hari (▲ naik, ▼ turun):{' '}
                  <span style={{ color: 'var(--green)' }}>hijau benar</span> ·{' '}
                  <span style={{ color: 'var(--red)' }}>merah meleset</span> ·{' '}
                  <span style={{ color: 'var(--muted)' }}>abu belum ketahuan</span> · besar = AI yakin.
                  {' '}<span style={{ color: 'var(--blue)' }}>Garis biru</span> uji mundur,{' '}
                  <span style={{ color: 'var(--purple)' }}>ungu</span> prediksi harian.
                </span>
              )}
          </div>

          {harga && record && record.n === 0 && (
            <div className="aip-note" style={{ marginTop: 6 }}>
              Riwayat tebakan AI untuk saham ini belum ada, jadi belum ada segitiga di grafik. Terisi otomatis
              setelah model dilatih ulang (tiap Senin, atau saat workflow dijalankan manual) dan tiap hari bursa.
            </div>
          )}
        </div>
      </div>

      {/* ── bawah: seberapa bisa dipercaya ────────────────────────────── */}
      <div className="aip-card aip-trust">
        <div className="aip-trust-head">
          <div className="aip-h" style={{ marginBottom: 0 }}>Seberapa bisa dipercaya?</div>
          <span className="aip-chip" style={{
            color: rel.status === 'lolos' ? 'var(--green)' : rel.status === 'gagal' ? 'var(--red)' : 'var(--amber)',
            borderColor: rel.status === 'lolos' ? 'var(--green)' : rel.status === 'gagal' ? 'var(--red)' : 'var(--amber)',
          }}>
            {rel.status === 'lolos' ? 'Lolos uji' : rel.status === 'gagal' ? 'Belum lolos uji' : 'Belum ada data uji'}
          </span>
        </div>

        <div className="aip-trust-grid">
          <div>
            <div className="aip-t">1. Uji model (semua saham)</div>
            {rel.status === 'tak-ada' ? (
              <div className="aip-p">
                Belum ada hasil uji untuk model {HORIZON_LABEL[hz]}. Tanpa itu, angka AI sebaiknya tidak dijadikan dasar keputusan.
                Hasil uji muncul setelah workflow “ML harian” selesai melatih model.
              </div>
            ) : (
              <div className="aip-p">
                Diuji pada data yang tidak pernah dilihat model, AI benar <b>{pct(rel.akurasi)}%</b>.
                Kalau cuma menebak “naik” terus: <b>{pct(rel.baseline)}%</b>.
                {isNum(rel.selisih) && (
                  <> Selisihnya <b style={{ color: rel.selisih >= 1 ? 'var(--green)' : 'var(--amber)' }}>{signed(rel.selisih, 1)} poin</b>
                    {rel.selisih < 1 ? ', praktis sama dengan tebak-tebakan.' : '.'}</>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="aip-t">2. Kalau AI bilang segini</div>
            {kal ? (
              <div className="aip-p">
                Saat AI bilang sekitar <b>{pct(kal.prediksi, 0)}%</b>, kenyataannya naik <b>{pct(kal.kenyataan, 0)}%</b>
                {kal.n ? ` (dari ${Number(kal.n).toLocaleString('id-ID')} kasus uji)` : ''}. Makin dekat dua angka ini, makin jujur angka AI-nya.
              </div>
            ) : (
              <div className="aip-p aip-mute">
                {pNow == null ? 'Perlu angka AI hari ini untuk membandingkan.' : 'Belum ada data uji di kisaran angka ini.'}
              </div>
            )}
          </div>

          <div>
            <div className="aip-t">3. Rekam jejak di {ticker}</div>
            {record && record.n > 0 && record.n < 5 ? (
              <div className="aip-p aip-mute">
                Baru {record.n} hari yang hasilnya sudah ada (benar {record.hits}). Terlalu sedikit untuk disimpulkan,
                akan terisi seiring hari bursa berjalan.
              </div>
            ) : record && record.n > 0 ? (
              <div className="aip-p">
                Dari {record.n} hari terakhir yang hasilnya sudah ada, tebakan arah AI benar <b>{pct(record.acc, 0)}%</b>.
                Kalau cuma menebak “naik” terus: <b>{pct(record.upShare, 0)}%</b>.
                {record.strongN >= 5 && (
                  <> Saat AI yakin (60%+ atau 35%−): benar {record.strongHits} dari {record.strongN}.</>
                )}
                {record.kecil && <span style={{ color: 'var(--amber)' }}> Sampel baru {record.n}, jangan dijadikan patokan.</span>}
              </div>
            ) : (
              <div className="aip-p aip-mute">Belum ada rekam jejak untuk saham ini.</div>
            )}
          </div>
        </div>

        <details className="aip-how" open>
          <summary>Cara membaca gambar ini</summary>
          <ul>
            <li><b>Garis atas</b> adalah harga. Baris segitiga tepat di bawahnya = tebakan arah AI pada hari itu
              (▲ naik, ▼ turun). Hijau berarti tebakannya benar, merah berarti meleset, abu berarti hasilnya belum ketahuan.
              Segitiga besar = AI yakin (60% ke atas atau 35% ke bawah).</li>
            <li><b>Garis bawah</b> adalah peluang naik menurut AI. Di atas 50% berarti AI menebak naik; 60% ke atas dianggap condong naik,
              35% ke bawah condong turun. Di antaranya AI belum yakin.</li>
            <li><b>Kotak di kanan</b> adalah tebakan AI untuk 1 dan 2 hari ke depan. Itu peluang, bukan target harga.</li>
            <li><b>Garis biru</b> = uji mundur: AI menebak ulang hari-hari lalu memakai data yang tidak dilihatnya saat belajar.
              <b> Garis ungu</b> = prediksi harian yang dicatat sebelum hasilnya ada, jadi yang paling jujur.</li>
          </ul>
        </details>

        <div className="aip-foot">
          {kartu ? (
            <>Model {kartu.algoritma || 'ML'}{kartu.dilatih ? `, dilatih ${tanggalID(String(kartu.dilatih).slice(0, 10))}` : ''}
              {kartu.uji_dari && kartu.uji_sampai ? `, diuji ${tanggalID(kartu.uji_dari)} sampai ${tanggalID(kartu.uji_sampai)}` : ''}. </>
          ) : null}
          Probabilitas statistik dari data historis, bukan ramalan dan bukan saran finansial.
          {insight?.peringatan?.length > 0 && <span> Sebagian berkas model tidak terbaca.</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pembungkus yang mengambil data
// ─────────────────────────────────────────────────────────────────────────────
const TTL = 10 * 60 * 1000;
const insightCache = new Map();   // ticker -> { at, data }
const liveCache = new Map();      // ticker -> { at, p1d, p2d }

export default function AiInsightPanel({ ticker, techRows, mlLive, closes, ts }) {
  const [hz, setHz] = useState('1d');
  const [hover, setHover] = useState(null);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [retry, setRetry] = useState(0);
  const [hargaFetch, setHargaFetch] = useState({ status: 'idle', data: null });
  const [liveState, setLiveState] = useState({ status: 'idle', p1d: null, p2d: null, note: null });
  const [chartWidth, setChartWidth] = useState(0);
  const chartRef = useRef(null);

  // 1. kartu model + riwayat prediksi
  useEffect(() => {
    if (!ticker) return undefined;
    const hit = insightCache.get(ticker);
    if (hit && Date.now() - hit.at < TTL && retry === 0) { setState({ status: 'ok', data: hit.data, error: null }); return undefined; }
    const ctl = new AbortController();
    setState((s) => ({ status: 'loading', data: s.data, error: null }));
    fetch(`/api/ml-insight?ticker=${encodeURIComponent(ticker)}`, { signal: ctl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j) throw new Error(j?.error || `HTTP ${r.status}`);
        insightCache.set(ticker, { at: Date.now(), data: j });
        setState({ status: 'ok', data: j, error: null });
      })
      .catch((e) => { if (e.name !== 'AbortError') setState({ status: 'error', data: null, error: e.message }); });
    return () => ctl.abort();
  }, [ticker, retry]);

  // 2. harga: pakai dari halaman detail kalau cukup panjang, kalau tidak ambil 6 bulan
  const hargaProps = useMemo(() => {
    if (!Array.isArray(closes) || !Array.isArray(ts) || closes.length < MIN_BAR_PROPS || ts.length !== closes.length) return null;
    return { dates: ts.map(isoFromEpoch), closes };
  }, [closes, ts]);

  useEffect(() => {
    if (hargaProps || !ticker) return undefined;
    const ctl = new AbortController();
    setHargaFetch({ status: 'loading', data: null });
    fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=6mo`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => {
        const p = pricesFromChartJson(j);
        setHargaFetch(p ? { status: 'ok', data: p } : { status: 'error', data: null });
      })
      .catch((e) => { if (e.name !== 'AbortError') setHargaFetch({ status: 'error', data: null }); });
    return () => ctl.abort();
  }, [ticker, hargaProps]);
  const harga = hargaProps || hargaFetch.data;
  const hargaStatus = hargaProps ? 'ok' : hargaFetch.status;

  // 3. angka AI "sekarang": dari baris screener kalau ada, kalau tidak dari cache / tombol
  const live = useMemo(() => {
    if (mlLive && (isNum(mlLive.p1d) || isNum(mlLive.p2d))) {
      return { '1d': isNum(mlLive.p1d) ? mlLive.p1d / 100 : null, '2d': isNum(mlLive.p2d) ? mlLive.p2d / 100 : null };
    }
    const c = liveCache.get(ticker);
    if (c && Date.now() - c.at < TTL) return { '1d': c.p1d, '2d': c.p2d };
    if (isNum(liveState.p1d) || isNum(liveState.p2d)) return { '1d': liveState.p1d, '2d': liveState.p2d };
    return null;
  }, [mlLive, ticker, liveState]);

  const onHitung = useCallback(async () => {
    setLiveState({ status: 'loading', p1d: null, p2d: null, note: null });
    try {
      const r = await fetch('/api/screener', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: [ticker] }),
      });
      const j = await r.json();
      const row = j?.results?.[0];
      if (!r.ok || !row) throw new Error('saham ini tidak lolos penyaringan atau datanya kurang');
      const p1d = isNum(row.MLScore1d) ? row.MLScore1d / 100 : null;
      const p2d = isNum(row.MLScore2d) ? row.MLScore2d / 100 : null;
      if (p1d == null && p2d == null) {
        setLiveState({ status: 'none', p1d: null, p2d: null, note: row.MLNote || 'Model ML belum tersedia di server.' });
        return;
      }
      liveCache.set(ticker, { at: Date.now(), p1d, p2d });
      setLiveState({ status: 'ok', p1d, p2d, note: null });
    } catch (e) {
      setLiveState({ status: 'error', p1d: null, p2d: null, note: `Belum bisa dihitung: ${e.message}.` });
    }
  }, [ticker]);

  // 4. lebar chart mengikuti kontainer
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return undefined;
    const measure = () => setChartWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [harga]);

  return (
    <AiInsightView
      ticker={ticker} techRows={techRows} hz={hz} setHz={setHz}
      chartWidth={chartWidth} chartRef={chartRef}
      status={state.status === 'error' ? 'error' : 'ok'} error={state.error} onRetry={() => setRetry((n) => n + 1)}
      harga={harga} hargaStatus={hargaStatus} insight={state.data}
      live={live} liveStatus={liveState.status}
      liveNote={mlLive && !live ? (mlLive.note || 'Model ML belum tersedia di server.') : liveState.note}
      onHitung={onHitung} canHitung={!mlLive}
      hover={hover} setHover={setHover}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS (prefiks aip- supaya tidak bentrok dengan class global di pages/index.js)
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
.aip-wrap{margin-bottom:1rem}
.aip{display:grid;grid-template-columns:minmax(300px,0.85fr) minmax(0,1.6fr);gap:1rem;align-items:start}
@media (max-width:900px){.aip{grid-template-columns:1fr}}
.aip-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:1rem 1.1rem;min-width:0}
.aip-err{margin-bottom:1rem;color:var(--red);font-size:.8rem;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
.aip-h{font-family:'Syne',sans-serif;font-size:.85rem;font-weight:700;margin-bottom:.35rem}
.aip-sub{font-size:.7rem;color:var(--muted);line-height:1.5;margin-bottom:.8rem}
.aip-empty{font-size:.78rem;color:var(--muted);padding:.4rem 0 .8rem}
.aip-row{padding:.6rem 0;border-top:1px solid var(--border)}
.aip-row-top{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem}
.aip-badge{font-size:.62rem;font-weight:700;border:1px solid;border-radius:20px;padding:1px 8px}
.aip-row-title{font-size:.8rem;color:var(--text);font-weight:600}
.aip-row-stats{display:flex;gap:.9rem;flex-wrap:wrap;align-items:baseline;font-size:.78rem}
.aip-stat{display:inline-flex;gap:.35rem;align-items:baseline}
.aip-stat-l{color:var(--muted);font-size:.7rem}
.aip-stat b{font-family:'DM Mono',monospace;font-size:.82rem}
.aip-meta{color:var(--muted);font-size:.68rem;margin-top:.25rem}
.aip-note{font-size:.68rem;color:var(--amber);margin-top:.25rem}
.aip-align{margin-top:.8rem;padding:.65rem .8rem;border-left:3px solid;border-radius:0 8px 8px 0;font-size:.76rem;line-height:1.55;color:var(--text2)}
.aip-align b{display:block;font-size:.8rem;margin-bottom:2px}
.aip-head{display:flex;justify-content:space-between;align-items:flex-start;gap:.8rem;flex-wrap:wrap;margin-bottom:.4rem}
.aip-verdict{font-family:'Syne',sans-serif;font-size:1.15rem;font-weight:800}
.aip-big{font-family:'DM Mono',monospace}
.aip-seg{display:flex;gap:4px}
.aip-read{font-size:.76rem;color:var(--text2);line-height:1.55;margin-bottom:.6rem}
.aip-warn{font-size:.74rem;color:var(--red);background:var(--red-dim);border:1px solid rgba(255,77,106,.3);border-radius:8px;padding:.5rem .7rem;margin-bottom:.6rem;line-height:1.5}
.aip-chart{width:100%;min-height:40px}
.aip-hover{font-size:.7rem;color:var(--text2);min-height:2.4em;margin-top:.5rem;line-height:1.5}
.aip-trust{margin-top:1rem}
.aip-trust-head{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.8rem}
.aip-chip{font-size:.68rem;font-weight:700;border:1px solid;border-radius:20px;padding:2px 10px}
.aip-trust-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
@media (max-width:900px){.aip-trust-grid{grid-template-columns:1fr}}
.aip-t{font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:.3rem}
.aip-p{font-size:.76rem;color:var(--text2);line-height:1.6}
.aip-p b{color:var(--text)}
.aip-mute{color:var(--muted)}
.aip-how{margin-top:1rem;border-top:1px solid var(--border);padding-top:.7rem;font-size:.75rem;color:var(--text2)}
.aip-how summary{cursor:pointer;font-weight:700;font-size:.75rem;margin-bottom:.4rem}
.aip-how ul{padding-left:1.1rem;line-height:1.65}
.aip-how li{margin-bottom:.25rem}
.aip-foot{margin-top:.8rem;font-size:.66rem;color:var(--muted);line-height:1.5}
`;
