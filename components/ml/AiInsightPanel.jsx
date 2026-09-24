// components/ml/AiInsightPanel.jsx
// Panel "Teknikal vs Prediksi AI" untuk halaman detail saham.
//
//   kiri  : sinyal teknikal (jenis, winrate, rata-rata hasil) + baris AI dengan format SAMA
//   kanan : pilih horizon (1, 2, 3, 5, 7, 14, 30, 60 hari bursa), tekan Prediksi, lihat
//           gambar hasil prediksi AI untuk horizon itu
//   bawah : seberapa bisa dipercaya (uji model, kalibrasi, rekam jejak) + cara baca
//
// Data:
//   /api/ml-insight?ticker=        kartu model, uji mundur (out-of-sample), riwayat prediksi,
//                                  untuk SEMUA horizon (dimuat sekali)
//   /api/ml-predict?ticker=&horizon=  probabilitas naik SEKARANG, dihitung hanya saat tombol
//                                  Prediksi ditekan, per horizon
//   props.closes / props.ts        harga dari halaman detail; kalau kurang dari 200 bar,
//                                  panel ambil harga 1 tahun sendiri
//
// Semua angka dihitung di ai-insight-logic.js (diuji terpisah). File ini hanya menggambar.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  HORIZON_LIST, HORIZON_BARS, HORIZON_LABEL, windowBars,
  tanggalID, pct, signed, horizonHari, verdictFor, bacaAngka,
  isoFromEpoch, pricesFromChartJson, alignSeries, buildPoints, trackRecord,
  calibrationLookup, reliability, alignment, pickTechRows,
  defaultHorizon, ringkasFitur, ringkasLolos, proyeksiHarga, ringkasBarisAI,
} from './ai-insight-logic';

const MIN_BAR_PROPS = 200;  // di bawah ini panel ambil harga 1 tahun sendiri (horizon panjang butuh riwayat)

const rp = (v) => `Rp ${Math.round(v).toLocaleString('id-ID')}`;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const wrColor = (wr) => (wr >= 55 ? 'var(--green)' : wr >= 45 ? 'var(--amber)' : 'var(--red)');
const TONE = { green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)', muted: 'var(--muted)' };
const TONE_BG = { green: 'var(--green-dim)', red: 'var(--red-dim)', amber: 'var(--amber-dim)', muted: 'rgba(255,255,255,.03)' };

// ─────────────────────────────────────────────────────────────────────────────
// Gambar hasil prediksi AI
// ─────────────────────────────────────────────────────────────────────────────
export function AiChart({ width, height = 320, dates, closes, points, from, proyeksi, hover, onHover, muted }) {
  const last = closes.length - 1;
  const n = last - from + 1;
  if (!(width > 120) || n < 2) return null;

  const narrow = width < 480;
  const padL = 50, padR = 10, padT = 14, padB = 22;
  const projW = narrow ? 78 : 108;                    // ruang tetap di kanan untuk garis proyeksi + labelnya
  const innerW = Math.max(40, width - padL - padR - projW);
  const step = innerW / (n - 1);
  const X = (i) => padL + (i - from) * step;
  const xProj = padL + innerW + projW - 4;             // ujung kanan garis proyeksi

  const rib = 18;                                      // strip hasil tebakan, di bawah garis harga
  const gap = 10;
  const hPrice = height - padT - padB - rib - gap;
  const yTop0 = padT;
  const yRib0 = padT + hPrice + gap;
  const yRibMid = yRib0 + rib / 2;

  // skala harga: ikut sertakan titik proyeksi supaya garisnya tidak terpotong
  let lo = Infinity, hi = -Infinity;
  for (let i = from; i <= last; i++) { lo = Math.min(lo, closes[i]); hi = Math.max(hi, closes[i]); }
  const hargaProyeksi = proyeksi ? closes[last] * (1 + proyeksi.persen / 100) : null;
  if (isNum(hargaProyeksi)) { lo = Math.min(lo, hargaProyeksi); hi = Math.max(hi, hargaProyeksi); }
  const pad = (hi - lo) * 0.16 || hi * 0.02;
  lo -= pad; hi += pad;
  const YP = (v) => yTop0 + hPrice - ((v - lo) / (hi - lo)) * hPrice;

  // garis harga (riwayat asli — SELALU abu-abu/putih, tidak pernah ikut diwarnai)
  let pricePath = '';
  for (let i = from; i <= last; i++) pricePath += `${i === from ? 'M' : 'L'}${X(i).toFixed(1)},${YP(closes[i]).toFixed(1)}`;

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

  const yLast = YP(closes[last]);
  const warna = proyeksi?.arah === 'naik' ? 'var(--green)' : proyeksi?.arah === 'turun' ? 'var(--red)' : 'var(--amber)';
  const yProj = isNum(hargaProyeksi) ? YP(hargaProyeksi) : yLast;

  const aria = proyeksi
    ? `Grafik harga ${n} hari terakhir, disambung garis putus-putus ${proyeksi.arah === 'naik' ? 'hijau naik' : proyeksi.arah === 'turun' ? 'merah turun' : 'kuning datar'} yang menunjukkan proyeksi AI.`
    : `Grafik harga ${n} hari terakhir. Tekan tombol Prediksi untuk menambahkan proyeksi AI.`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={aria}
      style={{ display: 'block', touchAction: 'pan-y', opacity: muted ? 0.6 : 1 }}
      onPointerMove={handleMove} onPointerDown={handleMove} onPointerLeave={() => onHover?.(null)}>

      {/* panel */}
      <rect x={padL - 2} y={yTop0} width={innerW + projW + 4} height={hPrice} rx={8} fill="var(--bg2)" />

      {/* batas antara "sudah terjadi" dan "proyeksi" */}
      <line x1={X(last)} x2={X(last)} y1={yTop0} y2={yTop0 + hPrice} stroke="var(--border2)" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />

      {/* label harga */}
      {[hi - pad, (hi + lo) / 2, lo + pad].map((v, k) => (
        <text key={k} x={padL - 8} y={YP(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)"
          fontFamily="'DM Mono',monospace">{Math.round(v).toLocaleString('id-ID')}</text>
      ))}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={padL - 2} x2={padL + innerW + projW + 2} y1={yTop0 + hPrice * f} y2={yTop0 + hPrice * f}
          stroke="var(--border)" strokeWidth="1" opacity="0.5" />
      ))}

      {/* harga: SELALU abu-abu/putih — ini yang sudah benar-benar terjadi */}
      <path d={pricePath} fill="none" stroke="var(--text2)" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx={X(last)} cy={yLast} r={3.2} fill="var(--text)" />

      {/* proyeksi: garis putus-putus berwarna, disambung LANGSUNG dari titik harga terakhir */}
      {proyeksi ? (
        <g>
          <line x1={X(last)} y1={yLast} x2={xProj} y2={yProj} stroke={warna} strokeWidth="2.4"
            strokeDasharray="7 5" strokeLinecap="round" opacity={proyeksi.pakaiData ? 1 : 0.55} />
          <circle cx={xProj} cy={yProj} r={4.2} fill={warna} opacity={proyeksi.pakaiData ? 1 : 0.55} />
          <text x={xProj} y={Math.max(yTop0 + 11, Math.min(yTop0 + hPrice - 34, yProj - 20))} textAnchor="end" fontSize="11" fontWeight="700"
            fill={warna} fontFamily="'DM Sans',sans-serif">
            {proyeksi.arah === 'naik' ? '▲ naik' : proyeksi.arah === 'turun' ? '▼ turun' : '▬ datar'}
          </text>
          <text x={xProj} y={Math.max(yTop0 + 11, Math.min(yTop0 + hPrice - 34, yProj - 20)) + 14} textAnchor="end" fontSize="13" fontWeight="800"
            fill={warna} fontFamily="'DM Mono',monospace">
            {proyeksi.pakaiData ? `${signed(proyeksi.persen, 1)}%` : '?'}
          </text>
        </g>
      ) : (
        <text x={padL + innerW / 2 + projW / 2} y={yTop0 + hPrice / 2} textAnchor="middle" fontSize="11" fill="var(--muted)"
          fontFamily="'DM Sans',sans-serif">tekan Prediksi untuk lihat proyeksi →</text>
      )}

      {/* strip hasil tebakan (riwayat): satu segitiga per hari, warna = benar / meleset / belum ketahuan */}
      <text x={padL - 6} y={yRibMid + 3} textAnchor="end" fontSize="10" fill="var(--muted)"
        fontFamily="'DM Mono',monospace">riwayat</text>
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
      {!points.slice(from, last + 1).some(Boolean) && (
        <text x={padL + innerW / 2} y={yRibMid + 3} textAnchor="middle" fontSize="9.5" fill="var(--muted)"
          fontFamily="'DM Sans',sans-serif">belum ada riwayat tebakan AI untuk saham ini</text>
      )}

      {/* sumbu tanggal */}
      {ticks.map((i, k) => (
        <text key={k} x={X(i)} y={height - 6} fontSize="10" fill="var(--muted)" fontFamily="'DM Mono',monospace"
          textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}>
          {tanggalID(dates[i], { tahun: false })}
        </text>
      ))}
      {proyeksi && (
        <text x={xProj} y={height - 6} fontSize="10" fill="var(--muted)" fontFamily="'DM Mono',monospace" textAnchor="end">
          +{proyeksi.horizonHari}h
        </text>
      )}

      {/* garis bidik saat disentuh/di-hover (cuma di bagian riwayat) */}
      {hoverX != null && (
        <g pointerEvents="none">
          <line x1={hoverX} x2={hoverX} y1={yTop0} y2={yRib0 + rib} stroke="var(--text2)" strokeWidth="1" opacity="0.7" />
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
function hoverText(i, dates, closes, points, hz) {
  const t = tanggalID(dates[i]);
  const pt = points[i];
  if (!pt) return `${t} · ${rp(closes[i])} · tidak ada tebakan AI di tanggal ini`;
  const sumber = pt.src === 'harian' ? 'prediksi harian' : 'uji mundur';
  const arah = pt.lean === 'naik' ? 'menebak naik' : pt.lean === 'turun' ? 'menebak turun' : 'netral';
  let hasil;
  if (pt.outcome === 'pending') hasil = `hasil ${HORIZON_LABEL[hz]} ke depan belum ketahuan`;
  else if (pt.outcome === 'none') hasil = 'tepat 50%, tidak dinilai';
  else hasil = `${HORIZON_LABEL[hz]} kemudian ${pt.ret >= 0 ? 'naik' : 'turun'} ${signed(pt.ret * 100, 2)}% → tebakan ${pt.outcome === 'hit' ? 'benar' : 'meleset'}`;
  return `${t} · ${rp(closes[i])} · AI ${Math.round(pt.p * 100)}% (${sumber}) ${arah} · ${hasil}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tampilan murni: semua data sudah disiapkan, tidak ada fetch di sini.
// ─────────────────────────────────────────────────────────────────────────────
export function AiInsightView({
  ticker, techRows, hz, setHz, chartWidth, chartRef,
  status, error, onRetry,
  harga, hargaStatus, insight, preds, onPredict,
  hover, setHover,
}) {
  const h = HORIZON_BARS[hz];
  const win = windowBars(h);
  const hzData = insight?.horizons?.[hz] || null;
  const kartu = hzData?.kartu || null;
  const rel = useMemo(() => reliability(kartu), [kartu]);
  const muted = rel.status === 'gagal';
  const lolosRingkas = useMemo(() => ringkasLolos(insight?.horizons), [insight]);

  // Hasil tombol Prediksi untuk horizon yang sedang dipilih
  const pred = preds?.[hz] || null;
  const pNow = pred && pred.status === 'ok' && isNum(pred.p) ? pred.p : null;
  const asOf = pred && pred.status === 'ok' ? pred.asOf : null;

  // deret + titik + rekam jejak untuk horizon terpilih
  const { points, from, record, avgNaik, avgTurun } = useMemo(() => {
    if (!harga) return { points: [], from: 0, record: null, avgNaik: null, avgTurun: null };
    const ai = alignSeries(harga.dates, hzData?.uji_mundur || null, hzData?.harian || []);
    const pts = buildPoints(harga.closes, ai, h);
    const start = Math.max(0, harga.closes.length - win);
    const vis = pts.slice(start);
    const rec = trackRecord(vis, harga.closes, h);
    const rataRata = (lean) => {
      const arr = vis.filter((p) => p && p.lean === lean && (p.outcome === 'hit' || p.outcome === 'miss') && isNum(p.ret));
      return arr.length ? (arr.reduce((s, p) => s + p.ret, 0) / arr.length) * 100 : null;
    };
    return { points: pts, from: start, record: rec, avgNaik: rataRata('naik'), avgTurun: rataRata('turun') };
  }, [harga, hzData, h, win]);

  const verdict = verdictFor(pNow);
  const teknik = useMemo(() => pickTechRows(techRows, 4), [techRows]);
  const align = useMemo(() => alignment(techRows, pNow), [techRows, pNow]);
  const kal = useMemo(() => calibrationLookup(kartu?.kalibrasi, pNow), [kartu, pNow]);

  const aiRow = useMemo(() => ringkasBarisAI(pNow, record, avgNaik, avgTurun), [pNow, record, avgNaik, avgTurun]);
  const fiturTeks = pred && pred.fitur ? ringkasFitur(pred.fitur) : '';

  // Garis proyeksi di chart (lihat proyeksiHarga di ai-insight-logic.js untuk penjelasan angkanya)
  const proyeksi = useMemo(() => proyeksiHarga(pNow, record, avgNaik, avgTurun, h), [pNow, record, avgNaik, avgTurun, h]);

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
              ? `${record.naikN} hari dari ${win} hari terakhir · ${HORIZON_LABEL[hz]} ke depan`
              : record && record.n > 0 ? 'terlalu sedikit tebakan naik untuk dihitung' : 'belum ada rekam jejak'}
            note={muted
              ? 'Model belum lolos uji, anggap ini referensi saja.'
              : (record && record.naikN >= 5 && record.kecil ? 'Sampel masih kecil, jangan dijadikan patokan.' : null)} />

          <div className="aip-align" style={{ borderLeftColor: TONE[align.tone], background: TONE_BG[align.tone] }}>
            <b style={{ color: TONE[align.tone] }}>{align.title}</b>
            <div>{align.text}</div>
          </div>
        </div>

        {/* ── kanan: pilih horizon, tekan Prediksi, lihat gambar ─────── */}
        <div className="aip-card">
          <div className="aip-h">Prediksi AI</div>
          <div className="aip-verdict" style={{ color: pNow != null ? verdict.color : 'var(--muted)' }}>
            {pNow != null
              ? <>{verdict.label}<span className="aip-big"> {pct(pNow, 0)}%</span></>
              : 'Belum diprediksi'}
          </div>

          <div className="aip-hz" role="group" aria-label="Pilih horizon prediksi">
            <span className="aip-hz-l">Horizon (hari bursa)</span>
            {HORIZON_LIST.map((k) => {
              const pk = preds?.[k];
              const ada = pk && pk.status === 'ok' && isNum(pk.p);
              return (
                <button key={k} className={`chart-opt-btn ${hz === k ? 'on' : ''}`} onClick={() => setHz(k)}
                  title={ada ? `Prediksi ${HORIZON_LABEL[k]}: ${Math.round(pk.p * 100)}% naik` : `Pilih ${HORIZON_LABEL[k]}`}>
                  {HORIZON_BARS[k]}{ada ? ` · ${Math.round(pk.p * 100)}%` : ''}
                </button>
              );
            })}
          </div>

          <div className="aip-actions">
            <button className="aip-btn" onClick={onPredict} disabled={pred?.status === 'loading'}>
              {pred?.status === 'loading' ? 'Menghitung…'
                : pNow != null ? `Hitung ulang ${HORIZON_LABEL[hz]}` : `Prediksi ${HORIZON_LABEL[hz]}`}
            </button>
            {pNow == null && pred?.status !== 'loading' && pred?.status !== 'error' && (
              <span className="aip-hint">Peluang harga naik {HORIZON_LABEL[hz]} ke depan dihitung saat tombol ditekan.</span>
            )}
          </div>

          {pred?.status === 'error' && <div className="aip-warn">{pred.error}</div>}

          {pNow != null && (
            <div className="aip-read">
              {bacaAngka(pNow, hz)}
              <div className="aip-mute" style={{ marginTop: 4 }}>
                Dihitung dari penutupan {tanggalID(asOf)}
                {pred.barBerjalanDibuang ? ' (bar hari ini belum selesai, jadi tidak dipakai)' : ''}.
                {fiturTeks && <> Yang dilihat model: {fiturTeks}</>}
              </div>
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
                proyeksi={proyeksi} hover={hover} onHover={setHover} muted={muted} />
            )}
            {!harga && (
              <div className="aip-empty" style={{ padding: '3rem 0' }}>
                {hargaStatus === 'error' ? 'Harga tidak bisa dimuat untuk menggambar chart.' : 'Memuat grafik…'}
              </div>
            )}
          </div>

          <div className="aip-hover" aria-live="polite">
            {harga && hover != null
              ? hoverText(hover, harga.dates, harga.closes, points, hz)
              : (
                <span>
                  Garis putih = harga yang sudah terjadi. Garis putus-putus{' '}
                  <span style={{ color: 'var(--green)' }}>hijau</span>/<span style={{ color: 'var(--red)' }}>merah</span> di ujung kanan = proyeksi AI.
                  Baris segitiga di bawahnya = tebakan AI di hari-hari lalu:{' '}
                  <span style={{ color: 'var(--green)' }}>hijau benar</span> ·{' '}
                  <span style={{ color: 'var(--red)' }}>merah meleset</span> ·{' '}
                  <span style={{ color: 'var(--muted)' }}>abu belum ketahuan</span> · besar = AI yakin. Arahkan kursor ke garis putih untuk detail tiap hari.
                </span>
              )}
          </div>
        </div>
      </div>

      {/* ── bawah: seberapa bisa dipercaya ────────────────────────────── */}
      <div className="aip-card aip-trust">
        <div className="aip-trust-head">
          <div className="aip-h" style={{ marginBottom: 0 }}>Seberapa bisa dipercaya? ({HORIZON_LABEL[hz]})</div>
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
                {pNow == null ? 'Tekan Prediksi dulu untuk membandingkan.' : 'Belum ada data uji di kisaran angka ini.'}
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

        {h >= 14 && (
          <div className="aip-note-soft">
            Horizon panjang: harga {h} hari ke depan dipakai berulang oleh hari-hari yang berdekatan, jadi hasil uji
            tumpang tindih dan angka akurasinya kurang pasti dibanding horizon pendek.
          </div>
        )}
        {lolosRingkas.total > 1 && (
          <div className="aip-note-soft">
            Lolos uji: {lolosRingkas.lolos} dari {lolosRingkas.total} horizon
            {lolosRingkas.lolos ? ` (${lolosRingkas.daftar.map((k) => HORIZON_BARS[k]).join(', ')} hari)` : ''}.
            Karena beberapa horizon diuji sekaligus, satu horizon yang lolos sendirian bisa jadi kebetulan;
            lebih meyakinkan kalau horizon yang berdekatan ikut lolos.
          </div>
        )}

        <details className="aip-how" open>
          <summary>Cara membaca gambar ini</summary>
          <ul>
            <li><b>Garis putih</b> adalah harga yang sudah benar-benar terjadi. Berhenti di titik bulat putih —
              itu harga penutupan terakhir yang dipakai model.</li>
            <li><b>Garis putus-putus hijau/merah</b> di ujung kanan adalah proyeksi AI untuk {HORIZON_LABEL[hz]}
              ke depan: hijau kalau AI menebak naik, merah kalau menebak turun. Angka di ujungnya (misal "+2.3%")
              adalah rata-rata hasil sebenarnya di masa lalu setiap kali AI menebak arah yang sama untuk saham ini —
              bukan janji, tapi pola historis. Kalau riwayatnya masih terlalu sedikit, cuma arahnya yang ditampilkan
              (tanpa angka), lebih pudar warnanya.</li>
            <li><b>Baris segitiga "riwayat"</b> di bawah garis harga menunjukkan tebakan AI di hari-hari lalu
              (▲ naik, ▼ turun). Hijau berarti tebakannya benar, merah berarti meleset, abu berarti hasilnya
              belum ketahuan. Segitiga besar = AI yakin (60% ke atas atau 35% ke bawah). Arahkan kursor ke garis
              putih untuk lihat detail satu hari, termasuk apakah itu dari uji mundur (data lama, diuji ulang) atau
              prediksi harian yang dicatat sebelum hasilnya ada (lebih bisa dipercaya).</li>
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
const predCache = new Map();      // `${ticker}|${horizon}` -> { at, data }

export default function AiInsightPanel({ ticker, techRows, closes, ts }) {
  const [hz, setHz] = useState(() => defaultHorizon(techRows));
  const [hover, setHover] = useState(null);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [retry, setRetry] = useState(0);
  const [hargaFetch, setHargaFetch] = useState({ status: 'idle', data: null });
  const [preds, setPreds] = useState(() => {
    const o = {};
    for (const k of HORIZON_LIST) {
      const c = predCache.get(`${ticker}|${k}`);
      if (c && Date.now() - c.at < TTL) o[k] = c.data;
    }
    return o;
  });
  const [chartWidth, setChartWidth] = useState(0);
  const chartRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // 1. kartu model + riwayat uji mundur untuk semua horizon
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

  // 2. harga: pakai dari halaman detail kalau cukup panjang, kalau tidak ambil 1 tahun
  const hargaProps = useMemo(() => {
    if (!Array.isArray(closes) || !Array.isArray(ts) || closes.length < MIN_BAR_PROPS || ts.length !== closes.length) return null;
    return { dates: ts.map(isoFromEpoch), closes };
  }, [closes, ts]);

  useEffect(() => {
    if (hargaProps || !ticker) return undefined;
    const ctl = new AbortController();
    setHargaFetch({ status: 'loading', data: null });
    fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=1y`, { signal: ctl.signal })
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

  // 3. tombol Prediksi: hitung peluang naik SEKARANG untuk horizon yang sedang dipilih
  const onPredict = useCallback(async () => {
    const k = hz;
    setPreds((p) => ({ ...p, [k]: { status: 'loading' } }));
    let hasil;
    try {
      const r = await fetch(`/api/ml-predict?ticker=${encodeURIComponent(ticker)}&horizon=${k}`);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !isNum(j.p)) throw new Error(j?.error || `HTTP ${r.status}`);
      hasil = { status: 'ok', p: j.p, asOf: j.asOf, barBerjalanDibuang: !!j.barBerjalanDibuang, fitur: j.fitur || null };
      predCache.set(`${ticker}|${k}`, { at: Date.now(), data: hasil });
    } catch (e) {
      hasil = { status: 'error', error: e.message };
    }
    if (alive.current) setPreds((p) => ({ ...p, [k]: hasil }));
  }, [ticker, hz]);

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
      preds={preds} onPredict={onPredict}
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
.aip-hz{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:.5rem 0 .6rem}
.aip-hz-l{font-size:.68rem;color:var(--muted);margin-right:.3rem}
.aip-actions{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:.6rem}
.aip-btn{background:var(--blue);color:#06101f;border:none;border-radius:8px;padding:.5rem 1rem;font-weight:700;font-size:.8rem;cursor:pointer;font-family:inherit}
.aip-btn:hover{filter:brightness(1.1)}
.aip-btn:disabled{opacity:.6;cursor:default}
.aip-hint{font-size:.72rem;color:var(--muted)}
.aip-note-soft{margin-top:.8rem;font-size:.72rem;color:var(--muted);line-height:1.55}
.aip-foot{margin-top:.8rem;font-size:.66rem;color:var(--muted);line-height:1.5}
`;