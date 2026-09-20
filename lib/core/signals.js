// lib/core/signals.js
// Generator sinyal teknikal — dipindah apa adanya dari pages/index.js.
// Logikanya TIDAK diubah; yang berubah cuma tempatnya, supaya API route dan
// frontend memakai fungsi yang sama, bukan dua salinan yang lama-lama beda.
//
// Semua fungsi murni: terima OHLCV, kembalikan array sinyal. Tidak menyentuh
// React, tidak fetch, tidak baca global.

import {
  calcRSI, calcMACD, calcBollinger, calcMA, calcEMA, calcATR, calcStochastic,
  findNearestResistance, calcFibTargets, calcATRStopLoss,
} from './indicators.js';

function estimateHoldingDays(rsi, atrRatio, signalType) {
  if (signalType === 'SCALP') {
    // Scalping: 1-5 hari tergantung ATR (lebih volatile = lebih cepat gerak)
    if (atrRatio > 0.04) return { min: 1, max: 2, label: '1-2 hari' };
    if (atrRatio > 0.025) return { min: 2, max: 3, label: '2-3 hari' };
    return { min: 3, max: 5, label: '3-5 hari' };
  }
  // Swing: berdasarkan RSI (makin oversold = makin cepat bounce)
  if (rsi < 25) return { min: 3, max: 10, label: '3-10 hari' };
  if (rsi < 35) return { min: 7, max: 14, label: '7-14 hari' };
  if (rsi < 45) return { min: 10, max: 21, label: '10-21 hari' };
  return { min: 14, max: 30, label: '14-30 hari' };
}

function generateSwingSignals(data) {
  const { closes, highs, lows } = data;
  if (closes.length < 50) return [];

  const n     = closes.length;
  const price = closes[n - 1];
  const rsi   = calcRSI(closes);
  const macd  = calcMACD(closes);
  const bb    = calcBollinger(closes, 20);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);

  // ATR untuk ukuran target & stop loss yang realistis
  const atrArr  = calcATR(highs, lows, closes, 14);
  const atr     = atrArr[n - 1] || (price * 0.02); // fallback 2%
  const atrRatio = atr / price;

  const curBB = bb[n - 1];

  // Level teknikal untuk TP — pakai yang paling dekat & valid
  const bbUpper    = curBB?.upper   ? Math.round(curBB.upper)   : null;
  const bbMid      = curBB?.mid     ? Math.round(curBB.mid)     : null;
  const ema20v     = Math.round(ema20[n - 1]);
  const ema50v     = Math.round(ema50[n - 1]);
  const resistance = findNearestResistance(highs, price);
  const fibs       = calcFibTargets(closes, highs, lows);
  const high52     = Math.max(...highs);
  const holding    = estimateHoldingDays(rsi, atrRatio, 'SWING');

  // TP1: target konservatif (1.5× ATR atau level teknikal terdekat)
  // TP2: target agresif (2.5–3× ATR atau resistance/fib lebih jauh)
  function buildTargets(tpMultiplier1 = 1.5, tpMultiplier2 = 3.0) {
    const atrTP1 = Math.round(price + atr * tpMultiplier1);
    const atrTP2 = Math.round(price + atr * tpMultiplier2);
    // Pilih TP1: antara ATR-based atau level teknikal terdekat (ambil yang lebih masuk akal)
    const candidates1 = [bbMid, ema20v, atrTP1].filter(v => v && v > price * 1.005 && v < price * 1.35);
    const tp1 = candidates1.length > 0 ? Math.min(...candidates1) : atrTP1;
    const candidates2 = [bbUpper, resistance, fibs.ext1272, atrTP2].filter(v => v && v > tp1 * 1.01);
    const tp2 = candidates2.length > 0 ? Math.min(...candidates2) : atrTP2;
    const sl  = calcATRStopLoss(price, atr, 1.5);
    const pct1 = ((tp1 - price) / price * 100).toFixed(1);
    const pct2 = ((tp2 - price) / price * 100).toFixed(1);
    const rr   = ((tp1 - price) / Math.max(price - sl, 1)).toFixed(1);
    return { tp1, tp2, sl, pct1, pct2, rr };
  }

  const signals = [];

  // ── Sinyal 1: RSI Oversold + BB Lower ──
  if (rsi < 40 && curBB?.lower && price < curBB.lower * 1.05) {
    const { tp1, tp2, sl, pct1, pct2, rr } = buildTargets(1.5, 3.0);
    signals.push({
      type: 'SWING_BUY',
      signalName: 'RSI+BB Lower Bounce',
      reason: `RSI oversold (${rsi.toFixed(0)}) + harga di bawah BB Lower — setup bounce`,
      strength: 80,
      holdingDays: holding.label,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
      atr: Math.round(atr),
    });
  }

  // ── Sinyal 2: MACD Bullish Crossover ──
  if (macd.hist[n - 1] > 0 && macd.hist[n - 2] <= 0 && price > ema20[n - 1] * 0.97) {
    const { tp1, tp2, sl, pct1, pct2, rr } = buildTargets(2.0, 4.0);
    signals.push({
      type: 'SWING_BUY',
      signalName: 'MACD Crossover Bullish',
      reason: `MACD crossover bullish — histogram baru hijau, konfirmasi di atas EMA20`,
      strength: 75,
      holdingDays: holding.label,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
      atr: Math.round(atr),
    });
  }

  // ── Sinyal 3: Golden Cross EMA20/50 ──
  if (ema20[n - 1] > ema50[n - 1] && ema20[n - 2] <= ema50[n - 2]) {
    const hold3 = { label: '21-45 hari' };
    const tp1   = resistance || fibs.ext1272 || Math.round(price + atr * 3.5);
    const tp2   = fibs.ext1618 || Math.round(Math.min(high52, price + atr * 6));
    const sl    = calcATRStopLoss(price, atr, 2.0);
    const pct1  = ((tp1 - price) / price * 100).toFixed(1);
    const pct2  = ((tp2 - price) / price * 100).toFixed(1);
    const rr    = ((tp1 - price) / Math.max(price - sl, 1)).toFixed(1);
    signals.push({
      type: 'SWING_BUY',
      signalName: 'Golden Cross EMA20/50',
      reason: `Golden Cross EMA20/50 baru terjadi — trend reversal bullish kuat`,
      strength: 85,
      holdingDays: hold3.label,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
      atr: Math.round(atr),
    });
  }

  // ── Sinyal 4: RSI Recovery + Momentum ──
  if (rsi < 45 && rsi > 30 && closes[n - 1] > closes[n - 2] && closes[n - 2] > closes[n - 3]) {
    const { tp1, tp2, sl, pct1, pct2, rr } = buildTargets(1.2, 2.5);
    signals.push({
      type: 'SWING_BUY',
      signalName: 'RSI Recovery + 2 Candle Hijau',
      reason: `RSI recovery dari oversold (${rsi.toFixed(0)}) + 2 candle hijau berturut — momentum awal`,
      strength: 70,
      holdingDays: holding.label,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
      atr: Math.round(atr),
    });
  }

  return signals;
}

function generateScalpingSignals(data) {
  const { closes, highs, lows } = data;
  if (closes.length < 20) return [];

  const n            = closes.length;
  const price        = closes[n - 1];
  const rsi          = calcRSI(closes, 9);
  const ema5         = calcEMA(closes, 5);
  const ema13        = calcEMA(closes, 13);
  const stoch        = calcStochastic(highs, lows, closes, 9);
  const atrArr       = calcATR(highs, lows, closes, 14);
  const atr          = atrArr[n - 1];
  const curStoch     = stoch[n - 1];
  const prevStoch    = stoch[n - 2];

  if (!atr || !curStoch || curStoch.k === null) return [];

  const atrRatio = atr / price;
  if (atrRatio <= 0.012) return [{ type: 'SCALP_NEUTRAL', reason: `Volatilitas terlalu rendah (ATR ${(atrRatio*100).toFixed(1)}%) — tunggu breakout`, strength: 0 }];

  // Scalping: TP berbasis 1× ATR (konservatif) dan 1.8× ATR (agresif)
  // SL ketat: 0.8× ATR (scalping butuh disiplin ketat)
  function scalpTargets(tp1Mult = 1.0, tp2Mult = 1.8, slMult = 0.8) {
    const tp1  = Math.round(price + atr * tp1Mult);
    const tp2  = Math.round(price + atr * tp2Mult);
    const sl   = Math.round(price - atr * slMult);
    // Cek apakah ada resistance terdekat yang lebih dekat dari TP1
    const res  = findNearestResistance(highs, price);
    const finalTP1 = (res && res < tp1 * 1.005) ? res : tp1;
    const pct1 = ((finalTP1 - price) / price * 100).toFixed(1);
    const pct2 = ((tp2 - price) / price * 100).toFixed(1);
    const rr   = ((finalTP1 - price) / Math.max(price - sl, 1)).toFixed(1);
    const hold = estimateHoldingDays(rsi, atrRatio, 'SCALP');
    return { tp1: finalTP1, tp2, sl, pct1, pct2, rr, holdLabel: hold.label };
  }

  const signals = [];

  // ── Sinyal 1: Stochastic Oversold Bounce ──
  if (curStoch.k < 25 && prevStoch?.k !== null && curStoch.k > prevStoch.k && ema5[n - 1] > ema13[n - 1] * 0.98) {
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = scalpTargets(1.0, 1.8, 0.8);
    signals.push({
      type: 'SCALP_BUY',
      signalName: 'Stochastic Oversold + Naik',
      reason: `Stochastic K=${curStoch.k.toFixed(0)} oversold + mulai naik, EMA5 di atas EMA13`,
      strength: 85,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
      atr: Math.round(atr),
    });
  }

  // ── Sinyal 2: RSI Fast Oversold + EMA Pullback ──
  if (rsi < 35 && price < ema5[n - 1] && ema5[n - 1] > ema13[n - 1] * 0.98) {
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = scalpTargets(0.8, 1.5, 0.7);
    signals.push({
      type: 'SCALP_BUY',
      signalName: 'RSI-9 Pullback ke EMA5',
      reason: `RSI-9 oversold (${rsi.toFixed(0)}) + pullback ke EMA5, trend EMA masih bullish`,
      strength: 78,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
      atr: Math.round(atr),
    });
  }

  // ── Sinyal 3: Deep Stochastic Oversold ──
  if (curStoch.k < 15 && curStoch.d && curStoch.d < 20) {
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = scalpTargets(1.2, 2.2, 0.9);
    signals.push({
      type: 'SCALP_BUY',
      signalName: 'Stochastic Deeply Oversold',
      reason: `Stochastic K=${curStoch.k.toFixed(0)} D=${curStoch.d.toFixed(0)} — deeply oversold, bounce agresif potential`,
      strength: 88,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
      atr: Math.round(atr),
    });
  }

  return signals;
}

function calcSignals(closes, highs, lows, vols) {
  const n = closes.length;
  if (n < 30) return [];
  const signals = [];
  const rsiV = calcRSI(closes);
  const macdD = calcMACD(closes);
  const bb = calcBollinger(closes);
  const ma20 = calcMA(closes, 20);
  const ma50 = calcMA(closes, 50);
  const price = closes[n - 1];
  const bbLast = bb[n - 1];
  const macdCur = macdD.hist[n - 1], macdPrev = macdD.hist[n - 2];
  const volAvg = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volCur = vols[n - 1];

  if (rsiV < 30) signals.push({ type: 'BUY', source: 'RSI', label: `RSI Oversold (${rsiV.toFixed(1)})`, strength: 'KUAT' });
  else if (rsiV > 70) signals.push({ type: 'SELL', source: 'RSI', label: `RSI Overbought (${rsiV.toFixed(1)})`, strength: 'KUAT' });

  if (macdCur > 0 && macdPrev <= 0) signals.push({ type: 'BUY', source: 'MACD', label: 'MACD Golden Cross', strength: 'SEDANG' });
  if (macdCur < 0 && macdPrev >= 0) signals.push({ type: 'SELL', source: 'MACD', label: 'MACD Death Cross', strength: 'SEDANG' });

  if (bbLast?.lower && price <= bbLast.lower) signals.push({ type: 'BUY', source: 'BB', label: 'Harga di Lower BB', strength: 'SEDANG' });
  if (bbLast?.upper && price >= bbLast.upper) signals.push({ type: 'SELL', source: 'BB', label: 'Harga di Upper BB', strength: 'SEDANG' });

  if (ma20[n - 1] && ma50[n - 1]) {
    if (ma20[n - 1] > ma50[n - 1] && ma20[n - 2] <= ma50[n - 2]) signals.push({ type: 'BUY', source: 'MA', label: 'MA20 Cross MA50 (Golden)', strength: 'KUAT' });
    if (ma20[n - 1] < ma50[n - 1] && ma20[n - 2] >= ma50[n - 2]) signals.push({ type: 'SELL', source: 'MA', label: 'MA20 Cross MA50 (Death)', strength: 'KUAT' });
  }

  if (volAvg > 0 && volCur > volAvg * 1.8 && closes[n - 1] > closes[n - 2]) {
    signals.push({ type: 'BUY', source: 'VOL', label: `Volume Surge +${((volCur / volAvg - 1) * 100).toFixed(0)}%`, strength: 'SEDANG' });
  }

  return signals;
}

function detectAccumulation(data) {
  const { closes, volumes } = data;
  if (closes.length < 50 || volumes.length < 50) return [];

  const n          = closes.length;
  const price      = closes[n - 1];
  const avgVol20   = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const avgVol50   = volumes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const recentVol  = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const priceChange = ((closes[n - 1] - closes[n - 20]) / closes[n - 20]) * 100;

  if (avgVol20 === 0) return [];

  // Untuk akumulasi, target lebih ke medium-term: 2× ATR (TP1) dan 4× ATR (TP2)
  // SL: 2× ATR karena ini bukan scalping — beri ruang gerak
  // Gunakan closes saja karena tidak punya highs/lows di sini
  const dailyVolatility = (() => {
    const returns = [];
    for (let i = Math.max(1, n - 20); i < n; i++) {
      if (closes[i-1] > 0) returns.push(Math.abs((closes[i] - closes[i-1]) / closes[i-1]));
    }
    return returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  })();
  const estATR = price * dailyVolatility * 1.5; // estimasi ATR dari volatilitas harian

  function accumTargets(tp1Mult = 2.5, tp2Mult = 5.0, slMult = 2.0) {
    const tp1  = Math.round(price + estATR * tp1Mult);
    const tp2  = Math.round(price + estATR * tp2Mult);
    const sl   = Math.round(price - estATR * slMult);
    const pct1 = ((tp1 - price) / price * 100).toFixed(1);
    const pct2 = ((tp2 - price) / price * 100).toFixed(1);
    const rr   = ((tp1 - price) / Math.max(price - sl, 1)).toFixed(1);
    // Holding days akumulasi lebih panjang — tergantung seberapa kuat volumenya
    const volRatio   = recentVol / avgVol20;
    const holdMin    = Math.round(14 / Math.max(volRatio, 1));
    const holdMax    = holdMin * 2;
    const holdLabel  = `${holdMin}–${holdMax} hari`;
    return { tp1, tp2, sl, pct1, pct2, rr, holdLabel };
  }

  const signals = [];

  if (recentVol > avgVol20 * 1.5 && Math.abs(priceChange) < 5) {
    const volRatio = Math.round(recentVol / avgVol20 * 10) / 10;
    const strength = Math.min(95, (recentVol / avgVol20) * 40);
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = accumTargets(2.5, 5.0, 2.0);
    signals.push({
      type: 'ACCUMULATION',
      signalName: 'Volume Spike Sideways',
      reason: `Volume spike ${volRatio}× rata-rata — harga masih sideways. Smart money masuk diam-diam.`,
      strength,
      volRatio,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
    });
  }

  if (avgVol20 > avgVol50 * 1.3 && priceChange > 0 && priceChange < 15) {
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = accumTargets(3.5, 7.0, 2.5);
    signals.push({
      type: 'ACCUMULATION',
      signalName: 'Volume Avg Naik Terkontrol',
      reason: `Volume rata-rata 20hr > rata-rata 50hr, harga naik terkontrol — kandidat breakout kuat`,
      strength: 80,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
    });
  }

  if (recentVol < avgVol20 * 0.6 && priceChange < -10) {
    const { tp1, tp2, sl, pct1, pct2, rr, holdLabel } = accumTargets(4.0, 8.0, 3.0);
    signals.push({
      type: 'ACCUMULATION',
      signalName: 'Volume Exhaustion Bottom',
      reason: `Volume mengering setelah penurunan ${priceChange.toFixed(1)}% — potensi exhaustion bottom`,
      strength: 72,
      holdingDays: holdLabel,
      profitTarget: `${pct1}%–${pct2}%`,
      targetPrice: tp1,
      tp1, tp2, sl,
      riskReward: rr,
    });
  }

  return signals;
}

function calculateLiquidityScore(data, marketCap) {
  const { volumes, closes } = data;
  if (!volumes || volumes.length === 0) return { score: 0, dollarVolume: 0, mcapB: 0, issues: ['No volume data'], tradeable: false };
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const price = closes[closes.length - 1];
  const dollarVolume = avgVolume * price;
  const mcapB = (marketCap || 0) / 1e9;

  let score = 0;
  const issues = [];

  if (dollarVolume > 5e9) score += 30;
  else if (dollarVolume > 1e9) score += 20;
  else if (dollarVolume > 500e6) score += 10;
  else issues.push('Volume rendah');

  if (mcapB > 10) score += 30;
  else if (mcapB > 5) score += 20;
  else if (mcapB > 1) score += 10;
  else issues.push('Market cap kecil');

  const volStdDev = Math.sqrt(
    volumes.slice(-20).reduce((sum, v) => sum + Math.pow(v - avgVolume, 2), 0) / 20
  );
  const cv = avgVolume > 0 ? volStdDev / avgVolume : 1;
  if (cv < 0.5) score += 20;
  else if (cv < 1) score += 10;
  else issues.push('Volume tidak konsisten');

  const liquidity = Math.min(20, (dollarVolume / 1e9) * 5);
  score += liquidity;

  return {
    score: Math.min(100, Math.round(score)),
    dollarVolume,
    mcapB,
    issues,
    tradeable: score >= 40,
  };
}

function calcSMC(closes, highs, lows, opens) {
  const n = closes.length;
  if (n < 10) return { obs: [], fvgs: [], bos: null, choch: null, bias: 'NEUTRAL' };

  const obs = [];
  for (let i = 1; i < n - 2; i++) {
    const move = Math.abs(closes[i + 1] - closes[i]) / closes[i] * 100;
    if (move > 1.5) {
      const bullish = closes[i + 1] > closes[i];
      obs.push({
        index: i,
        type: bullish ? 'BULLISH_OB' : 'BEARISH_OB',
        high: highs[i], low: lows[i],
        price: (highs[i] + lows[i]) / 2,
        strength: Math.min(100, move * 20),
      });
    }
  }

  const fvgs = [];
  for (let i = 1; i < n - 1; i++) {
    const bullFVG = lows[i + 1] > highs[i - 1];
    const bearFVG = highs[i + 1] < lows[i - 1];
    if (bullFVG && (lows[i + 1] - highs[i - 1]) / closes[i] * 100 > 0.5) {
      fvgs.push({ index: i, type: 'BULLISH_FVG', top: lows[i + 1], bottom: highs[i - 1] });
    }
    if (bearFVG && (lows[i - 1] - highs[i + 1]) / closes[i] * 100 > 0.5) {
      fvgs.push({ index: i, type: 'BEARISH_FVG', top: lows[i - 1], bottom: highs[i + 1] });
    }
  }

  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const prevHigh = Math.max(...highs.slice(-40, -20));
  const prevLow = Math.min(...lows.slice(-40, -20));
  const curPrice = closes[n - 1];

  let bos = null, choch = null;
  if (curPrice > prevHigh) bos = { type: 'BULLISH_BOS', level: prevHigh, label: 'BOS ↑' };
  if (curPrice < prevLow) bos = { type: 'BEARISH_BOS', level: prevLow, label: 'BOS ↓' };

  const midHigh = Math.max(...highs.slice(-10));
  const midLow = Math.min(...lows.slice(-10));
  if (midHigh < recentHigh * 0.98 && midLow < prevLow * 1.02) choch = { type: 'BEARISH_CHOCH', label: 'CHoCH ↓' };
  if (midLow > recentLow * 1.02 && midHigh > prevHigh * 0.98) choch = { type: 'BULLISH_CHOCH', label: 'CHoCH ↑' };

  const ma20 = calcMA(closes, 20);
  const ma50 = calcMA(closes, 50);
  const lastMA20 = ma20[n - 1];
  const lastMA50 = ma50[n - 1];
  let bias = 'NEUTRAL';
  if (lastMA20 && lastMA50) {
    if (curPrice > lastMA20 && lastMA20 > lastMA50) bias = 'BULLISH';
    else if (curPrice < lastMA20 && lastMA20 < lastMA50) bias = 'BEARISH';
  }

  return {
    obs: obs.slice(-5),
    fvgs: fvgs.slice(-4),
    bos, choch, bias,
    recentHigh, recentLow,
    keyLevels: [
      { price: recentHigh, label: 'Resistance', type: 'res' },
      { price: recentLow, label: 'Support', type: 'sup' },
    ],
  };
}

export {
  estimateHoldingDays,
  generateSwingSignals,
  generateScalpingSignals,
  calcSignals,
  detectAccumulation,
  calculateLiquidityScore,
  calcSMC,
};
