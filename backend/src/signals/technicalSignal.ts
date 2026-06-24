import { RSI, MACD, BollingerBands, EMA, ADX } from 'technicalindicators';
import type { Candle, SignalReading } from '../types';
import { clamp, scoreToStrength } from '../types/helpers';

/**
 * Computes a technical analysis signal entirely from local OHLCV candle data.
 * Combines RSI, MACD, Bollinger Bands, EMA Cross, and ADX into a single
 * directional score. Never throws — always returns a valid SignalReading.
 */
export async function computeTechnicalSignal(candles: Candle[]): Promise<SignalReading> {
  if (!candles || candles.length < 50) {
    return {
      type: 'technical',
      score: 0,
      strength: scoreToStrength(0),
      confidence: 0.3,
      label: 'Technical Analysis',
      source: 'mock',
      details: { reason: 'insufficient_candles', count: candles?.length ?? 0 },
      timestamp: Date.now(),
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const lastPrice = closes[closes.length - 1];

  // ── INDICATOR 1 — RSI(14) ────────────────────────────────────────────
  let rsi = 50;
  try {
    const rsiResult = RSI.calculate({ values: closes, period: 14 });
    const last = rsiResult[rsiResult.length - 1];
    rsi = last !== undefined && !isNaN(last) && isFinite(last) ? last : 50;
  } catch {
    rsi = 50;
  }
  const rsiScore = rsi > 75 ? -0.3 : rsi < 30 ? 0.7 : (rsi - 50) / 50;

  // ── INDICATOR 2 — MACD(12, 26, 9) ────────────────────────────────────
  let macdLine = 0;
  let signalLine = 0;
  let histogram = 0;
  try {
    const macdResult = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const last = macdResult[macdResult.length - 1];
    if (last) {
      macdLine = typeof last.MACD === 'number' && isFinite(last.MACD) ? last.MACD : 0;
      signalLine = typeof last.signal === 'number' && isFinite(last.signal) ? last.signal : 0;
      histogram = typeof last.histogram === 'number' && isFinite(last.histogram) ? last.histogram : 0;
    }
  } catch {
    macdLine = 0;
    signalLine = 0;
    histogram = 0;
  }

  const baseMacdScore =
    histogram > 0
      ? Math.min(1, histogram / Math.abs(signalLine || 1))
      : Math.max(-1, histogram / Math.abs(signalLine || 1));
  const crossoverBonus = macdLine > signalLine ? 0.15 : -0.15;
  const macdScore = clamp(baseMacdScore + crossoverBonus, -1, 1);

  // ── INDICATOR 3 — Bollinger Bands(20, 2) ─────────────────────────────
  let bbScore = 0;
  let position = 0.5;
  try {
    const bbResult = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
    const last = bbResult[bbResult.length - 1];
    if (last && isFinite(last.upper) && isFinite(last.lower) && isFinite(last.middle) && last.upper !== last.lower) {
      position = (lastPrice - last.lower) / (last.upper - last.lower);
      bbScore = clamp((0.5 - position) * 2, -1, 1);
    }
  } catch {
    bbScore = 0;
  }

  // ── INDICATOR 4 — EMA Cross (EMA20 vs EMA50) ─────────────────────────
  let ema20 = lastPrice;
  let ema50 = lastPrice;
  try {
    const ema20arr = EMA.calculate({ values: closes, period: 20 });
    const ema50arr = EMA.calculate({ values: closes, period: 50 });
    ema20 = ema20arr[ema20arr.length - 1] ?? lastPrice;
    ema50 = ema50arr[ema50arr.length - 1] ?? lastPrice;
  } catch {
    ema20 = lastPrice;
    ema50 = lastPrice;
  }
  let emaScore = ema20 > ema50 ? 0.3 : -0.3;
  const proximity = ema50 !== 0 ? Math.abs(ema20 - ema50) / ema50 : 0;
  if (proximity < 0.005) emaScore *= 0.4;

  // ── INDICATOR 5 — ADX(14) — trend strength ───────────────────────────
  let adx = 20;
  try {
    const adxResult = ADX.calculate({ close: closes, high: highs, low: lows, period: 14 });
    const last = adxResult[adxResult.length - 1];
    const lastAdx = last?.adx;
    adx = lastAdx !== undefined && !isNaN(lastAdx) && isFinite(lastAdx) ? lastAdx : 20;
  } catch {
    adx = 20;
  }
  const trendMultiplier = adx < 20 ? 0.5 : adx > 40 ? 1.2 : 1.0;

  // ── COMBINE ───────────────────────────────────────────────────────────
  const rawScore = rsiScore * 0.25 + macdScore * 0.35 + bbScore * 0.2 + emaScore * 0.2;
  const finalScore = clamp(rawScore * trendMultiplier, -1, 1);
  const confidence = Math.min(0.95, 0.5 + Math.abs(finalScore) * 0.45);

  // Details kept flat and human-readable on purpose — these render directly
  // in tooltips and the Intelligence page, so no nested objects here.
  return {
    type: 'technical',
    score: finalScore,
    strength: scoreToStrength(finalScore),
    confidence,
    label: 'Technical Analysis',
    source: 'local',
    details: {
      rsi: parseFloat(rsi.toFixed(1)),
      macdTrend: histogram > 0 ? 'Bullish momentum' : 'Bearish momentum',
      macdHistogram: parseFloat(histogram.toFixed(2)),
      bbPosition: parseFloat(position.toFixed(3)),
      emaSignal: ema20 > ema50 ? 'bullish' : 'bearish',
      adx: parseFloat(adx.toFixed(1)),
      trendStrength: adx > 40 ? 'strong' : adx > 20 ? 'moderate' : 'weak',
      price: parseFloat(lastPrice.toFixed(2)),
    },
    timestamp: Date.now(),
  };
}
