import type { BitgetRESTClient } from '../services/bitgetREST';
import type { AgentHubClient } from '../services/agentHubClient';
import type { Candle, RegimeReading, SignalReading, SignalType, MarketRegime } from '../types';
import { clamp, safeDivide } from '../types/helpers';
import { computeTechnicalSignal } from './technicalSignal';
import { computeAgentHubSignals } from './agentHubSignals';

// Must sum to 1.0
const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  technical: 0.3,
  macro: 0.25,
  sentiment: 0.2,
  onchain: 0.15,
  news: 0.1,
};

/**
 * Full pipeline: fetch local technical signal + Agent Hub signals, then fuse.
 */
export async function computeRegime(
  candles: Candle[],
  bitgetREST: BitgetRESTClient,
  hubClient: AgentHubClient,
  symbol: string
): Promise<RegimeReading> {
  const localTech = await computeTechnicalSignal(candles);
  const allSignals = await computeAgentHubSignals(hubClient, symbol, localTech);
  return fuseSignals(allSignals);
}

/**
 * The brain. Fuses N signal readings (gracefully handles 3-5 signals;
 * missing signal types simply have their weight redistributed across the
 * signals that are present) into a single RegimeReading.
 */
export function fuseSignals(signals: SignalReading[]): RegimeReading {
  if (signals.length === 0) {
    return {
      regime: 'uncertain',
      confidence: 30,
      fusedScore: 0,
      signals: [],
      timestamp: Date.now(),
      reasoning: 'No signals available — defaulting to uncertain regime.',
    };
  }

  // ── Step 1 & 2 — confidence-weighted fused score ────────────────────
  let numerator = 0;
  let denominator = 0;
  for (const s of signals) {
    const weight = SIGNAL_WEIGHTS[s.type] ?? 0;
    const adjustedScore = s.score * s.confidence;
    numerator += adjustedScore * weight;
    denominator += s.confidence * weight;
  }
  const fusedScore = clamp(safeDivide(numerator, denominator, 0), -1, 1);

  // ── Step 3 — overall confidence (0-1 range) ─────────────────────────
  const overallConf = signals.reduce((sum, s) => sum + s.confidence * (SIGNAL_WEIGHTS[s.type] ?? 0), 0);

  // ── Step 4 — regime classification ──────────────────────────────────
  let regime: MarketRegime;
  if (fusedScore > 0.2) {
    regime = 'bullish_trend';
  } else if (fusedScore < -0.2) {
    regime = 'bearish_trend';
  } else {
    const agreementCount = signals.filter(
      (s) => (s.score > 0 && fusedScore > 0) || (s.score < 0 && fusedScore < 0) || Math.abs(s.score) < 0.1
    ).length;

    regime = agreementCount >= 3 && Math.abs(fusedScore) >= 0.05 ? 'ranging' : 'uncertain';
  }

  // ── Step 5 — confidence percentage ──────────────────────────────────
  const base = overallConf * 100;
  const agreementBonusCount = signals.filter(
    (s) => (s.score > 0 && fusedScore > 0) || (s.score < 0 && fusedScore < 0)
  ).length;
  const bonus = agreementBonusCount >= 5 ? 15 : agreementBonusCount >= 4 ? 8 : 0;
  const strengthBonus = Math.abs(fusedScore) * 20;
  const finalConf = Math.min(97, Math.round(base + bonus + strengthBonus));

  // ── Step 6 — reasoning string ─────────────────────────────────────────
  const strongest = signals.reduce(
    (max, s) => (Math.abs(s.score * s.confidence) > Math.abs(max.score * max.confidence) ? s : max),
    signals[0]
  );

  const agreeing = signals.filter(
    (s) => (s.score > 0 && fusedScore > 0) || (s.score < 0 && fusedScore < 0)
  );

  const regimeLabel = regime
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const reasoning =
    `${regimeLabel} regime (${finalConf}% confidence). ` +
    `${strongest.label} is the dominant signal (${strongest.score.toFixed(2)}). ` +
    `${agreeing.length}/${signals.length} signals in agreement. ` +
    `Fused score: ${fusedScore > 0 ? '+' : ''}${fusedScore.toFixed(3)}.`;

  return {
    regime,
    confidence: finalConf,
    fusedScore,
    signals,
    timestamp: Date.now(),
    reasoning,
  };
}
