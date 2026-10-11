import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  validateAndRedactReasoning,
  type TelemetryContext,
  REDACTION_TOKEN,
} from '../provenance/antiFabrication';

/**
 * Observable Integrity Verification Endpoint (/api/checks)
 *
 * Demonstrates real-time anti-hallucination verification to hackathon judges.
 * Feeds an untrusted model response containing fabricated figures through
 * the live NEXUS Anti-Fabrication Engine and outputs the side-by-side
 * before-and-after audit diff.
 *
 * Supports:
 * - GET /api/checks (evaluates poisoned sample fixture)
 * - GET /api/checks?text=... (evaluates custom query text)
 * - POST /api/checks with { text: "...", context: { ... } } (interactive verification)
 */

const FIXTURE_TELEMETRY: TelemetryContext = {
  symbol: 'BTCUSDT',
  currentPrice: 67420.50,
  technical: {
    score: 0.42,
    rsi: 54.2,
    ema20: 67100,
    ema50: 66800,
    priceVsEma20: 0.0048,
    macd: 12.4,
  },
  sentiment: {
    score: 0.15,
    fundingRate: 0.0001, // 0.01%
    fearGreedIndex: 65,
  },
  onchain: {
    score: 0.10,
    networkFeeRate: 18,
    tvlMomentum24h: 1.2,
  },
  regime: {
    fusedScore: 0.385,
    confidence: 82,
    regime: 'BULL_MOMENTUM',
  },
};

const POISONED_SAMPLE_PROSE =
  'BTC is consolidating at $67,420 with 82% model confidence. However, RSI spiked to 89% and price is projected to collapse to $45,000 on $120m whale liquidation, breaking the 1.5% stop loss.';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Support POST body or GET query text
  const bodyText = typeof req.body?.text === 'string' && req.body.text.trim().length > 0 ? req.body.text : null;
  const queryText = typeof req.query?.text === 'string' && req.query.text.trim().length > 0 ? req.query.text : null;
  const inputText = bodyText || queryText || POISONED_SAMPLE_PROSE;

  const customContext = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
  const effectiveTelemetry: TelemetryContext = {
    ...FIXTURE_TELEMETRY,
    ...customContext,
  };

  const validation = validateAndRedactReasoning(inputText, effectiveTelemetry);

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json({
    ok: true,
    engine: 'NEXUS Anti-Fabrication & Truth Provenance Engine v1.0',
    disclaimer:
      'Observable integrity audit fixture. Compares input text against ground-truth Bitget market telemetry to detect and redact fabricated figures in real time.',
    telemetryContext: {
      symbol: effectiveTelemetry.symbol,
      groundTruthPrice: `$${effectiveTelemetry.currentPrice?.toLocaleString()}`,
      groundTruthRsi: effectiveTelemetry.technical?.rsi,
      groundTruthFunding: `${((effectiveTelemetry.sentiment?.fundingRate || 0) * 100).toFixed(2)}%`,
      groundTruthConfidence: `${effectiveTelemetry.regime?.confidence}%`,
      regime: effectiveTelemetry.regime?.regime,
    },
    sampleEvaluation: {
      submittedInput: inputText,
      sanitizedOutput: validation.sanitizedText,
      redactionToken: REDACTION_TOKEN,
      isClean: validation.isClean,
      redactedCount: validation.redactedCount,
      provenanceScore: `${validation.provenanceScore}%`,
      rejections: validation.rejections,
    },
    auditStatus: validation.redactedCount > 0 ? 'FABRICATIONS_INTERCEPTED_AND_SANITIZED' : 'CLEAN_VERIFIED_TELEMETRY',
  });
}
