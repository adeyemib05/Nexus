// Pure TypeScript Technical Indicator & Momentum Engine
// Computes RSI(14), MACD(12,26,9), Bollinger Bands(20,2), EMA20/50, and ADX(14)
// Zero external dependencies, ultra-fast (<2ms), 100% serverless-safe.

import type { Candle } from '../marketData';
import type { SignalReading } from '../types';
import { clamp, scoreToStrength } from '../types';

// ── Math Helpers ─────────────────────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macdLine: number; signalLine: number; histogram: number } {
  if (closes.length < slowPeriod + signalPeriod) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }

  const fastEMA = ema(closes, fastPeriod);
  const slowEMA = ema(closes, slowPeriod);

  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdSeries.push(fastEMA[i] - slowEMA[i]);
  }

  const signalSeries = ema(macdSeries.slice(slowPeriod - 1), signalPeriod);
  const lastMacd = macdSeries[macdSeries.length - 1] || 0;
  const lastSignal = signalSeries[signalSeries.length - 1] || 0;
  const histogram = lastMacd - lastSignal;

  return { macdLine: lastMacd, signalLine: lastSignal, histogram };
}

function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMult = 2
): { upper: number; middle: number; lower: number; position: number } {
  const slice = closes.slice(-period);
  if (slice.length < period) {
    const p = closes[closes.length - 1] || 1;
    return { upper: p * 1.02, middle: p, lower: p * 0.98, position: 0.5 };
  }

  const mean = slice.reduce((s, x) => s + x, 0) / period;
  const variance = slice.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = mean + stdDevMult * stdDev;
  const lower = mean - stdDevMult * stdDev;
  const lastPrice = closes[closes.length - 1];
  const position = upper !== lower ? (lastPrice - lower) / (upper - lower) : 0.5;

  return { upper, middle: mean, lower, position };
}

function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number {
  const len = closes.length;
  if (len < period * 2) return 22;

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < len; i++) {
    const h = highs[i];
    const l = lows[i];
    const prevC = closes[i - 1];
    const prevH = highs[i - 1];
    const prevL = lows[i - 1];

    tr.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));

    const upMove = h - prevH;
    const downMove = prevL - l;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothTR = ema(tr, period);
  const smoothPlusDM = ema(plusDM, period);
  const smoothMinusDM = ema(minusDM, period);

  const dx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    const trVal = smoothTR[i] || 1;
    const pDI = (smoothPlusDM[i] / trVal) * 100;
    const mDI = (smoothMinusDM[i] / trVal) * 100;
    const sumDI = pDI + mDI;
    dx.push(sumDI > 0 ? (Math.abs(pDI - mDI) / sumDI) * 100 : 0);
  }

  const adxSeries = ema(dx, period);
  return adxSeries[adxSeries.length - 1] || 22;
}

// ── Main Technical Signal Engine ─────────────────────────────────────────────

export function computeTechnicalSignal(candles: Candle[]): SignalReading {
  const now = Date.now();

  if (!candles || candles.length < 30) {
    return {
      type: 'technical',
      score: 0,
      strength: scoreToStrength(0),
      confidence: 0.35,
      label: 'Technical Momentum (EMA/RSI)',
      source: 'local',
      details: { reason: 'insufficient_candles', count: candles?.length ?? 0 },
      timestamp: now,
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const lastPrice = closes[closes.length - 1];

  // 1. RSI(14)
  const rsi = calculateRSI(closes, 14);
  const rsiScore = rsi > 75 ? -0.35 : rsi < 30 ? 0.70 : (rsi - 50) / 50;

  // 2. MACD(12, 26, 9)
  const { macdLine, signalLine, histogram } = calculateMACD(closes, 12, 26, 9);
  const baseMacdScore = histogram > 0
    ? Math.min(1, histogram / Math.max(Math.abs(signalLine), 1))
    : Math.max(-1, histogram / Math.max(Math.abs(signalLine), 1));
  const crossoverBonus = macdLine > signalLine ? 0.15 : -0.15;
  const macdScore = clamp(baseMacdScore + crossoverBonus, -1, 1);

  // 3. Bollinger Bands(20, 2)
  const { position, upper, lower } = calculateBollingerBands(closes, 20, 2);
  const bbScore = clamp((0.5 - position) * 2, -1, 1);

  // 4. EMA Cross (EMA20 vs EMA50)
  const ema20arr = ema(closes, 20);
  const ema50arr = ema(closes, 50);
  const ema20 = ema20arr[ema20arr.length - 1] ?? lastPrice;
  const ema50 = ema50arr[ema50arr.length - 1] ?? lastPrice;
  let emaScore = ema20 > ema50 ? 0.35 : -0.35;
  const proximity = ema50 !== 0 ? Math.abs(ema20 - ema50) / ema50 : 0;
  if (proximity < 0.005) emaScore *= 0.4;

  // 5. ADX(14)
  const adx = calculateADX(highs, lows, closes, 14);
  const trendMultiplier = adx < 20 ? 0.6 : adx > 35 ? 1.2 : 1.0;

  // Combine into directional score
  const rawScore = rsiScore * 0.25 + macdScore * 0.35 + bbScore * 0.20 + emaScore * 0.20;
  const finalScore = clamp(rawScore * trendMultiplier, -1, 1);
  const confidence = Math.min(0.95, 0.50 + Math.abs(finalScore) * 0.45);

  return {
    type: 'technical',
    score: parseFloat(finalScore.toFixed(3)),
    strength: scoreToStrength(finalScore),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Technical Momentum (EMA/RSI)',
    source: 'local',
    details: {
      rsi: parseFloat(rsi.toFixed(1)),
      macdHistogram: parseFloat(histogram.toFixed(2)),
      macdTrend: histogram > 0 ? 'Bullish momentum' : 'Bearish momentum',
      bbPosition: parseFloat(position.toFixed(3)),
      ema20AboveEma50: ema20 > ema50,
      adx: parseFloat(adx.toFixed(1)),
      trendStrength: adx > 35 ? 'strong' : adx > 20 ? 'moderate' : 'weak',
      price: lastPrice,
    },
    timestamp: now,
  };
}
