// components/verdict/VerdictCard.jsx
// Satu verdict menonjol per saham. Semua yang lain disembunyikan sampai diminta.
//
// Keputusan desain yang disengaja:
//   - Warna cuma dipakai untuk ARTI (naik / turun / tunggu). Tidak ada warna
//     dekoratif. Di layar penuh angka, warna yang tidak berarti = kebisingan.
//   - Tiap pilar digambar sebagai meter dengan tanda netral di tengah, bukan
//     angka telanjang. Yang ingin dilihat sekilas adalah "condong ke mana",
//     bukan "berapa persis".
//   - Konflik ditampilkan, tidak disembunyikan. Justru konflik yang paling
//     berguna: "bagus tapi lagi mahal" lebih informatif daripada skor tunggal.
//   - Angka pakai tabular figures supaya kolom sejajar saat berubah.

const NADA = {
  BELI:       'naik',
  PERHATIKAN: 'tunggu',
  TAHAN:      'tunggu',
  HINDARI:    'turun',
};

const NAMA_PILAR = {
  fundamental: 'Fundamental',
  technical:   'Teknikal',
  swing:       'Swing',
  scalping:    'Scalping',
  flow:        'Aliran asing',
};

function Meter({ nilai, bobot }) {
  const pos = Math.max(0, Math.min(100, nilai));
  const nada = pos >= 60 ? 'naik' : pos <= 40 ? 'turun' : 'netral';
  return (
    <div className="meter" role="img" aria-label={`${Math.round(pos)} dari 100`}>
      <div className="rel" />
      <div className={`isi ${nada}`} style={{ left: `${Math.min(pos, 50)}%`, width: `${Math.abs(pos - 50)}%` }} />
      <div className="titik" style={{ left: `${pos}%` }} />
      {bobot != null && <span className="bobot">{Math.round(bobot * 100)}%</span>}
      <style jsx>{`
        .meter { position: relative; height: 22px; flex: 1; min-width: 90px; }
        .rel { position: absolute; top: 10px; left: 0; right: 0; height: 2px; background: var(--line); }
        .isi { position: absolute; top: 9px; height: 4px; border-radius: 2px; }
        .isi.naik { background: var(--naik); }
        .isi.turun { background: var(--turun); }
        .isi.netral { background: var(--mute); }
        .titik {
          position: absolute; top: 5px; width: 3px; height: 12px;
          background: var(--teks); transform: translateX(-1.5px);
        }
        .bobot {
          position: absolute; right: 0; top: -2px;
          font: 400 11px/1 var(--mono); color: var(--mute);
        }
      `}</style>
    </div>
  );
}

export default function VerdictCard({ ticker, verdict, harga, perubahan }) {
  if (!verdict) return null;

  const nada = NADA[verdict.action] || 'tunggu';
  const { pillars, weights, conflicts, reasons, dataQuality, confidence, score } = verdict;

  const pilarTampil = Object.entries(pillars)
    .filter(([k, v]) => v && weights[k] > 0)
    .sort((a, b) => weights[b[0]] - weights[a[0]]);

  return (
    <article className={`kartu ${nada}`}>
      <header>
        <div className="kode">
          <h2>{ticker}</h2>
          {harga != null && (
            <p className="harga">
              {harga.toLocaleString('id-ID')}
              {perubahan != null && (
                <span className={perubahan >= 0 ? 'naik' : 'turun'}>
                  {perubahan >= 0 ? '+' : ''}{perubahan.toFixed(2)}%
                </span>
              )}
            </p>
          )}
        </div>
        <p className="horizon">Horizon {verdict.horizon}</p>
      </header>

      <div className="putusan">
        <strong>{verdict.label}</strong>
        <div className="ukur">
          <span className="skor">{score ?? '—'}</span>
          <span className="dari">dari 100</span>
        </div>
      </div>

      <p className={`yakin y-${confidence.toLowerCase()}`}>
        Tingkat keyakinan {confidence.toLowerCase()}
        {dataQuality.coverage < 1 && ` · ${Math.round(dataQuality.coverage * 100)}% data tersedia`}
      </p>

      {conflicts.length > 0 && (
        <ul className="konflik">
          {conflicts.map((c) => <li key={c.id}>{c.pesan}</li>)}
        </ul>
      )}

      <details>
        <summary>Rincian per pilar</summary>
        <div className="pilar">
          {pilarTampil.map(([k, v]) => (
            <div className="baris" key={k}>
              <span className="nama">{NAMA_PILAR[k]}</span>
              <Meter nilai={v.score} bobot={weights[k]} />
              <span className="angka">{Math.round(v.score)}</span>
            </div>
          ))}
        </div>
        <ul className="alasan">
          {reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        {dataQuality.missing.length > 0 && (
          <p className="hilang">
            Belum ada data: {dataQuality.missing.map((m) => NAMA_PILAR[m] || m).join(', ')}.
            Bobotnya dibagi ulang ke pilar lain, bukan dihitung nol.
          </p>
        )}
      </details>

      <p className="sangkalan">{verdict.disclaimer}</p>

      <style jsx>{`
        .kartu {
          background: var(--panel);
          border: 1px solid var(--line);
          border-left: 3px solid var(--mute);
          border-radius: 4px;
          padding: 18px 16px 14px;
        }
        .kartu.naik  { border-left-color: var(--naik); }
        .kartu.turun { border-left-color: var(--turun); }
        .kartu.tunggu{ border-left-color: var(--tunggu); }

        header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
        h2 { margin: 0; font: 600 20px/1.1 var(--sans); letter-spacing: 0.02em; }
        .harga { margin: 4px 0 0; font: 400 15px/1 var(--mono); color: var(--teks); }
        .harga span { margin-left: 8px; font-size: 13px; }
        .harga .naik { color: var(--naik); }
        .harga .turun { color: var(--turun); }
        .horizon { margin: 0; font: 400 12px/1 var(--mono); color: var(--mute); }

        .putusan {
          display: flex; justify-content: space-between; align-items: flex-end;
          gap: 12px; margin: 18px 0 6px;
        }
        .putusan strong {
          font: 600 clamp(22px, 7vw, 30px)/1.05 var(--sans);
          letter-spacing: -0.01em; text-wrap: balance;
        }
        .kartu.naik .putusan strong  { color: var(--naik); }
        .kartu.turun .putusan strong { color: var(--turun); }
        .kartu.tunggu .putusan strong{ color: var(--tunggu); }
        .ukur { text-align: right; white-space: nowrap; }
        .skor { font: 500 22px/1 var(--mono); }
        .dari { display: block; font: 400 11px/1.4 var(--sans); color: var(--mute); }

        .yakin { margin: 0; font: 400 13px/1.4 var(--sans); color: var(--mute); }
        .y-tinggi { color: var(--naik); }
        .y-rendah { color: var(--tunggu); }

        .konflik { margin: 14px 0 0; padding: 0 0 0 12px; list-style: none; border-left: 2px solid var(--tunggu); }
        .konflik li { margin: 0 0 8px; font: 400 13px/1.5 var(--sans); color: var(--teks); max-width: 62ch; }
        .konflik li:last-child { margin-bottom: 0; }

        details { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 12px; }
        summary {
          cursor: pointer; font: 500 13px/1 var(--sans); color: var(--mute);
          padding: 6px 0; list-style-position: inside;
        }
        summary:focus-visible { outline: 2px solid var(--teks); outline-offset: 3px; }

        .pilar { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
        .baris { display: flex; align-items: center; gap: 12px; }
        .nama { flex: 0 0 96px; font: 400 13px/1 var(--sans); color: var(--mute); }
        .angka { flex: 0 0 26px; text-align: right; font: 400 13px/1 var(--mono); }

        .alasan { margin: 16px 0 0; padding-left: 16px; }
        .alasan li { font: 400 13px/1.6 var(--sans); color: var(--mute); max-width: 62ch; }

        .hilang { font: 400 12px/1.5 var(--sans); color: var(--mute); max-width: 62ch; }

        .sangkalan {
          margin: 14px 0 0; padding-top: 10px; border-top: 1px solid var(--line);
          font: 400 11px/1.5 var(--sans); color: var(--mute); max-width: 68ch;
        }

        @media (max-width: 380px) {
          .nama { flex-basis: 74px; font-size: 12px; }
        }
      `}</style>
    </article>
  );
}
