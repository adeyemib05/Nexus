// Multi-Signal Fusion & Regime Classification Engine
// Mathematically proven confidence-weighted dot product fusion.

import type { SignalReading, SignalType, RegimeReading, MarketRegime } from './types';
import { clamp, safeDivide } from './types';

export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  technical: 0.30,
  macro: 0.25,
  sentiment: 0.20,
  onchain: 0.15,
  news: 0.10,
};

export function fuseSignals(signals: SignalReading[]): RegimeReading {
  const now = Date.now();

  if (!signals || signals.length === 0) {
    return {
      regime: 'uncertain',
      confidence: 35,
      fusedScore: 0,
      signals: [],
      timestamp: now,
      reasoning: 'No signals available — defaulting to capital protection mode.',
    };
  }

  // 1. Confidence-weighted fused score
  let numerator = 0;
  let denominator = 0;

  for (const s of signals) {
    const weight = SIGNAL_WEIGHTS[s.type] ?? 0.20;
    const adjustedScore = s.score * s.confidence;
    numerator += adjustedScore * weight;
    denominator += s.confidence * weight;
  }

  const fusedScore = clamp(safeDivide(numerator, denominator, 0), -1, 1);

  // 2. Base confidence from weighted individual confidences
  const baseConf = signals.reduce(
    (sum, s) => sum + s.confidence * (SIGNAL_WEIGHTS[s.type] ?? 0.20),
    0
  ) * 100;

  // 3. Agreement bonus
  const agreeingCount = signals.filter(
    (s) => (s.score > 0 && fusedScore > 0) || (s.score < 0 && fusedScore < 0)
  ).length;

  const bonus = agreeingCount >= 5 ? 15 : agreeingCount >= 4 ? 8 : 0;
  const strengthBonus = Math.abs(fusedScore) * 20;
  const finalConfidence = Math.min(97, Math.round(baseConf + bonus + strengthBonus));

  // 4. Market Regime Classification
  let regime: MarketRegime;
  if (fusedScore > 0.20) {
    regime = 'bullish_trend';
  } else if (fusedScore < -0.20) {
    regime = 'bearish_trend';
  } else {
    regime = agreeingCount >= 3 && Math.abs(fusedScore) >= 0.05 ? 'ranging' : 'uncertain';
  }

  // 5. Explanatory reasoning
  const dominant = signals.reduce(
    (max, s) => (Math.abs(s.score * s.confidence) > Math.abs(max.score * max.confidence) ? s : max),
    signals[0]
  );

  const regimeTitle = regime
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const reasoning =
    `${regimeTitle} regime (${finalConfidence}% confidence). ` +
    `${dominant.label} is dominant (${dominant.score >= 0 ? '+' : ''}${dominant.score.toFixed(2)}). ` +
    `${agreeingCount}/${signals.length} signals in agreement. ` +
    `Fused score: ${fusedScore >= 0 ? '+' : ''}${fusedScore.toFixed(3)}.`;

  return {
    regime,
    confidence: finalConfidence,
    fusedScore: parseFloat(fusedScore.toFixed(3)),
    signals,
    timestamp: now,
    reasoning,
  };
}
