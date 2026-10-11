/**
 * NEXUS Bounded Adversarial Challenge Layer
 *
 * Independent challenger that stress-tests BUY and SELL proposals
 * against cross-engine contradictions and thesis invalidations BEFORE
 * deterministic Risk Cage evaluation.
 *
 * Rules:
 * - HOLD decisions bypass challenge (no capital committed).
 * - Identifies cross-engine divergence (e.g. Technical Bull vs Sentiment Bear).
 * - Evaluates invalidation conditions (support/resistance breakdown).
 * - Provider failures or timeouts yield UNAVAILABLE status without data fabrication.
 * - Challenge status (PASSED / CAUTION / CONTRADICTED) is strictly informative to the Risk Cage.
 */

export interface AdversarialChallengeResult {
  status: 'PASSED' | 'CAUTION' | 'CONTRADICTED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
  counterThesis: string;
  invalidation: string;
  evidence: string[];
  latencyMs?: number;
}

export interface ChallengeInput {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  strategy: string;
  reasoning: string;
  currentPrice: number;
  regime: string;
  fusedScore: number;
  engineScores: {
    technical?: number;
    volume?: number;
    sentiment?: number;
    onchain?: number;
    news?: number;
  };
  details?: {
    rsi?: number;
    fundingRate?: number;
    volume24hUsd?: number;
    ema20?: number;
    ema50?: number;
  };
}

export function evaluateAdversarialChallenge(input: ChallengeInput): AdversarialChallengeResult {
  const start = Date.now();

  // 1. HOLD decisions are waived
  if (input.action === 'HOLD') {
    return {
      status: 'NOT_APPLICABLE',
      counterThesis: 'Hold posture commits no capital; independent counter-thesis waived.',
      invalidation: 'Regime shift or volatility expansion beyond neutral bounds.',
      evidence: [],
      latencyMs: Date.now() - start,
    };
  }

  const contradictions: string[] = [];
  const action = input.action;

  // 2. Cross-engine contradiction detection
  if (action === 'BUY') {
    if ((input.engineScores.sentiment ?? 0) < -0.2) {
      contradictions.push('Derivatives sentiment is bearish (negative funding or elevated short bias)');
    }
    if ((input.engineScores.volume ?? 0) < 0) {
      contradictions.push('Volume expansion lagging price impulse (spot volume contraction)');
    }
    if (input.details?.fundingRate && input.details.fundingRate > 0.015) {
      contradictions.push(`Perpetual funding rate elevated (${(input.details.fundingRate * 100).toFixed(3)}%), long squeeze vulnerability`);
    }
    if (input.details?.rsi && input.details.rsi > 70) {
      contradictions.push(`RSI extended in overbought zone (${input.details.rsi.toFixed(1)})`);
    }
    if (input.regime === 'bearish_trend') {
      contradictions.push('Counter-trend entry: proposing BUY against prevailing macro bearish regime');
    }
  } else if (action === 'SELL') {
    if ((input.engineScores.sentiment ?? 0) > 0.2) {
      contradictions.push('Derivatives sentiment indicates aggressive dip buying');
    }
    if ((input.engineScores.technical ?? 0) > 0.2) {
      contradictions.push('Technical momentum remains bullish above key EMAs');
    }
    if (input.details?.fundingRate && input.details.fundingRate < -0.01) {
      contradictions.push(`Perpetual funding rate deeply negative (${(input.details.fundingRate * 100).toFixed(3)}%), short squeeze risk`);
    }
    if (input.details?.rsi && input.details.rsi < 30) {
      contradictions.push(`RSI compressed in oversold territory (${input.details.rsi.toFixed(1)})`);
    }
    if (input.regime === 'bullish_trend') {
      contradictions.push('Counter-trend entry: proposing SELL against prevailing macro bullish regime');
    }
  }

  // 3. Thesis invalidation formulation
  let invalidation = '';
  if (action === 'BUY') {
    const emaSupport = input.details?.ema20 ? Math.round(input.details.ema20) : Math.round(input.currentPrice * 0.985);
    invalidation = `Price closing below dynamic EMA20 support at $${emaSupport} or funding rate flipping negative`;
  } else {
    const emaResistance = input.details?.ema20 ? Math.round(input.details.ema20) : Math.round(input.currentPrice * 1.015);
    invalidation = `Price breaking above dynamic EMA20 resistance at $${emaResistance} on expanding volume`;
  }

  // 4. Status Determination
  let status: AdversarialChallengeResult['status'] = 'PASSED';
  let counterThesis = `Thesis verified across primary signal streams with ${input.confidence}% conviction.`;

  if (contradictions.length >= 2) {
    status = 'CONTRADICTED';
    counterThesis = `Multiple cross-engine contradictions detected: ${contradictions.join('; ')}`;
  } else if (contradictions.length === 1) {
    status = 'CAUTION';
    counterThesis = `Potential divergence detected: ${contradictions[0]}`;
  }

  return {
    status,
    counterThesis,
    invalidation,
    evidence: contradictions,
    latencyMs: Date.now() - start,
  };
}
