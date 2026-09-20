// components/ReturnDistributionModal.jsx
// Data diambil langsung dari TICKER_SIGNAL_STATS (index.js) via props
// Format: bh: { '3d': {wr, avg, n, p10, p25, p50, p75, p90}, ... }
import { useState } from 'react';

const HORIZON_OPTIONS = [
  { key: '1d',  label: '1 Hari' },
  { key: '2d',  label: '2 Hari' },
  { key: '3d',  label: '3 Hari' },
  { key: '5d',  label: '5 Hari' },
  { key: '7d',  label: '7 Hari' },
  { key: '14d', label: '14 Hari' },
  { key: '30d', label: '30 Hari' },
  { key: '60d', label: '60 Hari' },
];

// signalKey  = nama sinyal (string)
// ticker     = kode saham, opsional
// backtestData = object {bh: {'3d':{wr,avg,n,p10,p25,p50,p75,p90},...}, wr, avg, n, best}
//               dari TICKER_SIGNAL_STATS[ticker][signalKey]  (per-ticker)
//               atau null/undefined untuk fallback ke global
// globalBH   = global bh data dari BACKTEST_STATS[signalKey]?.byHorizon (hanya wr/avg, no percentile)
// onClose    = callback tutup modal
export function ReturnDistributionModal({ signalKey, ticker, backtestData, globalBH, onClose }) {
  const bh = backtestData?.bh || null;
  const isPerTicker = !!(bh && ticker);

  // Tentukan sumber horizons yang akan digunakan
  const allHorizons = bh || globalBH || null;

  const [activeH, setActiveH] = useState(() => {
    if (!allHorizons) return '7d';
    for (const h of HORIZON_OPTIONS) {
      if (allHorizons[h.key]) return h.key;
    }
    return '7d';
  });

  if (!allHorizons) return null;

  const d = allHorizons[activeH];
  if (!d) return null;

  const fmt = (v) => v == null ? 'N/A' : (v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`);
  const fmtWr = (v) => v == null ? 'N/A' : `${v.toFixed(1)}%`;

  const hasPercentile = d.p10 != null && d.p50 != null && d.p90 != null;
  const avg = d.avg ?? 0;
  const median = d.p50 ?? d.median ?? null;
  const count = d.n ?? d.count ?? 0;
  const wr = d.wr ?? null;

  const gap = median != null ? Math.abs(avg - median) : 0;
  const isOutlierWarning = gap > 5 && avg > (median ?? 0);

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:9999,
        display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',
        backdropFilter:'blur(4px)',
      }}
    >
      <div style={{
        background:'#0f0f17',border:'1px solid #ffffff1a',borderRadius:16,
        width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',
        boxShadow:'0 0 60px #00000080',
      }}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'1.2rem 1.2rem .8rem'}}>
          <div>
            <div style={{fontSize:'.7rem',color:'#ffffff55',fontWeight:700,letterSpacing:'.1em',marginBottom:4}}>
              DISTRIBUSI RETURN
            </div>
            <div style={{fontSize:'1.05rem',fontWeight:800,color:'#fff'}}>{signalKey}</div>
            <div style={{marginTop:6,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              {isPerTicker ? (
                <span style={{
                  fontSize:'.68rem',fontWeight:700,padding:'2px 8px',borderRadius:20,
                  background:'#00e5a022',border:'1px solid #00e5a055',color:'#00e5a0'
                }}>
                  📌 Data spesifik {ticker} — {count.toLocaleString()} trade
                </span>
              ) : (
                <span style={{
                  fontSize:'.68rem',fontWeight:700,padding:'2px 8px',borderRadius:20,
                  background:'#fbbf2422',border:'1px solid #fbbf2455',color:'#fbbf24'
                }}>
                  🌐 Data semua saham{ticker ? ` (tidak ada data spesifik ${ticker})` : ''} — {count.toLocaleString()} trade
                </span>
              )}
              {backtestData?.best && (
                <span style={{
                  fontSize:'.68rem',fontWeight:700,padding:'2px 8px',borderRadius:20,
                  background:'#6366f122',border:'1px solid #6366f155',color:'#a5b4fc'
                }}>
                  ⭐ Best: {backtestData.best}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{background:'none',border:'none',color:'#ffffff55',fontSize:'1.2rem',cursor:'pointer',padding:'4px 8px',marginTop:'-4px'}}
          >✕</button>
        </div>

        {/* Horizon tabs */}
        <div style={{display:'flex',gap:6,padding:'0 1.2rem .8rem',flexWrap:'wrap'}}>
          {HORIZON_OPTIONS.map(h => {
            const hasData = !!allHorizons[h.key];
            return (
              <button
                key={h.key}
                disabled={!hasData}
                onClick={() => setActiveH(h.key)}
                style={{
                  padding:'5px 14px',borderRadius:20,border:'1px solid',fontSize:'.78rem',fontWeight:700,cursor:hasData?'pointer':'not-allowed',
                  background: activeH===h.key ? '#6366f1' : 'transparent',
                  borderColor: activeH===h.key ? '#6366f1' : '#ffffff22',
                  color: activeH===h.key ? '#fff' : hasData ? '#ffffff88' : '#ffffff22',
                }}
              >{h.label}</button>
            );
          })}
        </div>

        {/* Stats row */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,padding:'0 1.2rem .8rem'}}>
          {[
            { label:'WIN RATE',    val: fmtWr(wr),     color: wr != null ? (wr >= 50 ? '#00e5a0' : '#ff4d6a') : '#ffffff88' },
            { label:'AVG RETURN',  val: fmt(avg),       color: avg >= 0 ? '#00e5a0' : '#ff4d6a' },
            { label:'TOTAL TRADE', val: count.toLocaleString(), color:'#ffffff' },
          ].map(s => (
            <div key={s.label} style={{background:'#ffffff08',borderRadius:10,padding:'.7rem',textAlign:'center'}}>
              <div style={{fontSize:'.62rem',color:'#ffffff55',fontWeight:700,marginBottom:4}}>{s.label}</div>
              <div style={{fontSize:'1rem',fontWeight:800,color:s.color}}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Outlier warning */}
        {isOutlierWarning && (
          <div style={{margin:'0 1.2rem .8rem',padding:'.6rem .9rem',borderRadius:8,background:'#fbbf2415',border:'1px solid #fbbf2440',fontSize:'.75rem',color:'#fbbf24'}}>
            ⚠️ <strong>Outlier alert:</strong> avg ({fmt(avg)}) jauh di atas median ({fmt(median)}) — return besar tapi hanya dari beberapa trade saja.
          </div>
        )}

        {/* Percentile visualisasi — bar chart skenario */}
        {hasPercentile ? (
          <div style={{padding:'0 1.2rem 1rem'}}>
            <div style={{fontSize:'.7rem',color:'#ffffff55',marginBottom:14}}>
              Dari semua histori trade sinyal ini, beginilah hasilnya kalau diurutkan dari yang paling buruk ke yang paling bagus:
            </div>

            {(() => {
              const scenarios = [
                { label: 'Skenario Terburuk',   sub: '1 dari 10 trade seburuk ini (atau lebih buruk)', val: d.p10 },
                { label: 'Skenario Kurang Bagus', sub: '1 dari 4 trade seburuk ini (atau lebih buruk)', val: d.p25 },
                { label: 'Skenario Biasanya',    sub: 'Hasil paling umum / tengah-tengah',               val: d.p50 ?? d.median },
                { label: 'Skenario Bagus',       sub: '1 dari 4 trade sebagus ini (atau lebih bagus)',  val: d.p75 },
                { label: 'Skenario Terbaik',     sub: '1 dari 10 trade sebagus ini (atau lebih bagus)', val: d.p90 },
              ];
              const maxAbs = Math.max(5, ...scenarios.map(s => Math.abs(s.val ?? 0)));
              const isMedianRow = (i) => i === 2;
              return (
                <div style={{display:'flex',flexDirection:'column',gap:9}}>
                  {scenarios.map((s, i) => {
                    const v = s.val ?? 0;
                    const widthPct = Math.min(100, (Math.abs(v) / maxAbs) * 100);
                    const isPos = v >= 0;
                    const barColor = isPos ? '#00e5a0' : '#ff4d6a';
                    return (
                      <div key={s.label} style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:128,flexShrink:0,textAlign:'right'}}>
                          <div style={{fontSize:'.72rem',fontWeight:isMedianRow(i)?800:600,color:isMedianRow(i)?'#fff':'#ffffff99'}}>
                            {s.label}
                          </div>
                          <div style={{fontSize:'.6rem',color:'#ffffff44',marginTop:1,lineHeight:1.3}}>
                            {s.sub}
                          </div>
                        </div>
                        <div style={{flex:1,position:'relative',height:22,background:'#ffffff08',borderRadius:5}}>
                          {/* garis tengah = titik 0% */}
                          <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'#ffffff2a'}} />
                          {/* bar — tumbuh dari tengah ke kiri (rugi) atau ke kanan (untung) */}
                          <div style={{
                            position:'absolute',top:2,bottom:2,
                            ...(isPos
                              ? { left:'50%', width:`${widthPct/2}%` }
                              : { right:'50%', width:`${widthPct/2}%` }),
                            background: barColor,
                            opacity: isMedianRow(i) ? 1 : 0.65,
                            borderRadius:4,
                          }} />
                        </div>
                        <div style={{width:60,flexShrink:0,textAlign:'right',fontFamily:'DM Mono,monospace',fontSize:'.78rem',fontWeight:800,color:barColor}}>
                          {fmt(v)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingLeft:138,paddingRight:60}}>
              <span style={{fontSize:'.6rem',color:'#ff4d6a88'}}>← Rugi</span>
              <span style={{fontSize:'.6rem',color:'#00e5a088'}}>Untung →</span>
            </div>

            {/* Legend avg vs biasanya */}
            <div style={{marginTop:14,padding:'.6rem .8rem',borderRadius:8,background:'#ffffff06',fontSize:'.7rem',color:'#ffffff77',lineHeight:1.6}}>
              💡 <strong style={{color:'#fff'}}>Rata-rata</strong> ({fmt(avg)}) beda dengan <strong style={{color:'#fff'}}>Skenario Biasanya</strong> ({fmt(median)}) di atas.
              Rata-rata bisa "tertarik" lebih tinggi/rendah kalau ada segelintir trade dengan untung atau rugi yang sangat besar — jadi <strong style={{color:'#fff'}}>Skenario Biasanya</strong> sering lebih menggambarkan apa yang benar-benar akan kamu alami.
            </div>
          </div>
        ) : (
          <div style={{padding:'0 1.2rem 1rem'}}>
            <div style={{padding:'.8rem',borderRadius:8,background:'#ffffff06',border:'1px solid #ffffff0f',fontSize:'.75rem',color:'#ffffff44',textAlign:'center'}}>
              Data percentile tidak tersedia untuk sinyal ini
            </div>
          </div>
        )}

        {/* Win rate by horizon mini table */}
        <div style={{margin:'0 1.2rem 1.2rem',padding:'.8rem',borderRadius:10,background:'#ffffff06',border:'1px solid #ffffff0f'}}>
          <div style={{fontSize:'.65rem',color:'#ffffff44',fontWeight:700,marginBottom:8}}>WIN RATE & AVG RETURN PER HORIZON</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {HORIZON_OPTIONS.map(h => {
              const hd = allHorizons[h.key];
              if (!hd) return null;
              const hWr = hd.wr ?? null;
              const hAvg = hd.avg ?? null;
              const isActive = h.key === activeH;
              return (
                <div
                  key={h.key}
                  onClick={() => setActiveH(h.key)}
                  style={{
                    flex:'1 1 60px',minWidth:54,textAlign:'center',padding:'.5rem .3rem',borderRadius:8,cursor:'pointer',
                    background: isActive ? '#6366f115' : 'transparent',
                    border: `1px solid ${isActive ? '#6366f155' : '#ffffff0f'}`,
                  }}
                >
                  <div style={{fontSize:'.6rem',color:'#ffffff44',marginBottom:3}}>{h.label}</div>
                  {hWr != null && (
                    <div style={{fontSize:'.7rem',fontWeight:700,color: hWr >= 50 ? '#00e5a0' : '#ff4d6a'}}>
                      {hWr.toFixed(0)}%
                    </div>
                  )}
                  {hAvg != null && (
                    <div style={{fontSize:'.65rem',color: hAvg >= 0 ? '#00e5a088' : '#ff4d6a88'}}>
                      {hAvg >= 0 ? '+' : ''}{hAvg.toFixed(1)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DistributionTriggerBtn({ signalKey, ticker, backtestData, onClick }) {
  // backtestData = TICKER_SIGNAL_STATS[ticker]?.[signalKey]  (per-ticker, bisa null)
  const hasTickerData = !!(backtestData?.bh);
  const hasAnyData = hasTickerData || !!signalKey; // global fallback always possible if signalKey exists
  if (!hasAnyData) return null;
  return (
    <button
      onClick={onClick}
      title={hasTickerData ? `Lihat distribusi return ${ticker}` : 'Lihat distribusi return (semua saham)'}
      style={{
        background: hasTickerData ? '#00e5a015' : '#ffffff08',
        border: `1px solid ${hasTickerData ? '#00e5a040' : '#ffffff1a'}`,
        color: hasTickerData ? '#00e5a0' : '#ffffff55',
        borderRadius:6, padding:'2px 8px', fontSize:'.68rem', fontWeight:700,
        cursor:'pointer', whiteSpace:'nowrap',
      }}
    >
      {hasTickerData ? '📊 Distribusi' : '📊 Distribusi*'}
    </button>
  );
}