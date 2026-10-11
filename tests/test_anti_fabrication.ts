/**
 * Comprehensive Test Suite: NEXUS Anti-Fabrication & Truth Provenance Engine
 * Run with tsx or ts-node: npx tsx tests/test_anti_fabrication.ts
 */

import { validateAndRedactReasoning, REDACTION_TOKEN, type TelemetryContext } from '../api/_lib/antiFabrication';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('NEXUS PROVENANCE TEST: ANTI-FABRICATION ENGINE');
console.log('═══════════════════════════════════════════════════════════════\n');

const mockTelemetry: TelemetryContext = {
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
    fundingRate: 0.0001, // 0.01% = 1 bp
    fearGreedIndex: 65,
  },
  onchain: {
    score: 0.10,
    networkFeeRate: 18,
    tvlMomentum24h: 1.2,
    tvlUsd: 50_000_000,
  },
  macro: {
    score: 0.20,
    volume24hUsd: 1_200_000_000, // $1.2B 24h volume
  },
  regime: {
    fusedScore: 0.385,
    confidence: 82,
    regime: 'BULL_MOMENTUM',
  },
  knownHeadlines: ['MicroStrategy acquires 12000 BTC in treasury reserve strategy'],
};

// ── TEST 1: Accurate Telemetry Survives Unaltered ────────────────────────────
console.log('Test 1: Verified Telemetry (Should have 0 redactions)');
const accurateText = 'BTC is trading at $67,420 with an RSI of 54.2 and 82% confidence. Stop loss set at 1.5% below entry with funding at 0.01%.';
const res1 = validateAndRedactReasoning(accurateText, mockTelemetry);
console.log('Original:  ', res1.originalText);
console.log('Sanitized: ', res1.sanitizedText);
assert(res1.isClean === true, 'Test 1 isClean must be true');
assert(res1.redactedCount === 0, 'Test 1 redactedCount must be 0');
assert(res1.provenanceScore === 100, 'Test 1 provenanceScore must be 100');
assert(res1.sanitizedText === accurateText, 'Test 1 text must match original exactly');
console.log('');

// ── TEST 2: Hallucinated Price & RSI Are Caught & Redacted ───────────────────
console.log('Test 2: Gross Hallucination (Invented price $45,000 and 89% RSI)');
const hallucinatedText = 'Severe weakness detected: BTC will collapse to $45,000 as RSI hits 89% while confidence is 82%.';
const res2 = validateAndRedactReasoning(hallucinatedText, mockTelemetry);
console.log('Original:  ', res2.originalText);
console.log('Sanitized: ', res2.sanitizedText);
assert(res2.isClean === false, 'Test 2 isClean must be false');
assert(res2.redactedCount === 2, `Test 2 should redact exactly 2 figures, got ${res2.redactedCount}`);
assert(res2.sanitizedText.includes(REDACTION_TOKEN), 'Test 2 text must contain REDACTION_TOKEN');
assert(res2.sanitizedText.includes('82%'), 'Test 2 must retain valid 82% confidence');
assert(!res2.sanitizedText.includes('$45,000'), 'Test 2 must NOT contain $45,000');
assert(!res2.sanitizedText.includes('89%'), 'Test 2 must NOT contain 89%');
console.log('');

// ── TEST 3: Structural, Sponsor, & Calendar Tokens Preserved ────────────────
console.log('Test 3: Sponsor & Structural Tokens (Qwen 3.8, 2026, 2021 highs, 24h, 3 signals)');
const structuralText = 'In October 2026, breaking 2021 highs, Qwen 3.8 Max evaluated 3 signals across 24h market feeds.';
const res3 = validateAndRedactReasoning(structuralText, mockTelemetry);
console.log('Original:  ', res3.originalText);
console.log('Sanitized: ', res3.sanitizedText);
assert(res3.isClean === true, 'Test 3 isClean must be true');
assert(res3.redactedCount === 0, 'Test 3 must not redact structural or calendar tokens');
console.log('');

// ── TEST 4: Scaled Metric Tokens (No Orphaned "m" Leaks) ─────────────────────
console.log('Test 4: Scaled Metrics ($120m unsupported vs $1.2B supported)');
const scaleText = 'Market under shock from $120m liquidation while 24h volume holds at $1.2b.';
const res4 = validateAndRedactReasoning(scaleText, mockTelemetry);
console.log('Original:  ', res4.originalText);
console.log('Sanitized: ', res4.sanitizedText);
assert(res4.redactedCount === 1, `Test 4 must redact exactly 1 metric ($120m), got ${res4.redactedCount}`);
assert(!res4.sanitizedText.includes('$120m'), 'Test 4 must redact $120m');
assert(!res4.sanitizedText.includes(`${REDACTION_TOKEN}m`), 'Test 4 must NOT leak orphaned "m" after token');
assert(res4.sanitizedText.includes('$1.2b'), 'Test 4 must keep supported $1.2b volume');
console.log('');

// ── TEST 5: Bare Multi-Digit Integers & Ticker Suffixes ──────────────────────
console.log('Test 5: Bare Multi-Digit Integers (45000 unsupported vs 67420 supported)');
const bareIntegerText = 'Target price is 67420 USDT but bear thesis predicts 45000.';
const res5 = validateAndRedactReasoning(bareIntegerText, mockTelemetry);
console.log('Original:  ', res5.originalText);
console.log('Sanitized: ', res5.sanitizedText);
assert(res5.redactedCount === 1, `Test 5 must redact bare 45000, got ${res5.redactedCount}`);
assert(res5.sanitizedText.includes('67420 USDT'), 'Test 5 must retain valid 67420 USDT');
assert(!res5.sanitizedText.includes('45000'), 'Test 5 must redact 45000');
console.log('');

// ── TEST 6: Basis Points Validation ──────────────────────────────────────────
console.log('Test 6: Basis Points (1 bps supported by 0.0001 funding rate vs 15 bps fabricated)');
const bpsText = 'Live funding is 1 bps, but anomalous spike to 15 bps claimed.';
const res6 = validateAndRedactReasoning(bpsText, mockTelemetry);
console.log('Original:  ', res6.originalText);
console.log('Sanitized: ', res6.sanitizedText);
assert(res6.redactedCount === 1, `Test 6 must redact 15 bps, got ${res6.redactedCount}`);
assert(res6.sanitizedText.includes('1 bps'), 'Test 6 must retain 1 bps');
assert(!res6.sanitizedText.includes('15 bps'), 'Test 6 must redact 15 bps');
console.log('');

// ── TEST 7: Explicit Contextual Telemetry (Position & Scenario Shocks) ───────
console.log('Test 7: Contextual Telemetry ($25,000 position and -12% shock passed in additionalNumbers)');
const stressContext: TelemetryContext = {
  ...mockTelemetry,
  additionalNumbers: [25000, 12],
};
const stressText = 'Allocating across your $25,000 position under a -12% shock scenario.';
const res7 = validateAndRedactReasoning(stressText, stressContext);
console.log('Original:  ', res7.originalText);
console.log('Sanitized: ', res7.sanitizedText);
assert(res7.isClean === true, 'Test 7 isClean must be true for explicit context numbers');
assert(res7.redactedCount === 0, 'Test 7 must not redact explicit context numbers');
assert(res7.sanitizedText.includes('$25,000'), 'Test 7 must retain $25,000');
assert(res7.sanitizedText.includes('12%'), 'Test 7 must retain 12% shock');
console.log('');

// ── TEST 8: Headline Citation Validation ────────────────────────────────────
console.log('Test 8: Headline Citations (12000 BTC cited from live headline)');
const headlineText = 'Catalyst alert: MicroStrategy purchased 12000 BTC in reserve expansion.';
const res8 = validateAndRedactReasoning(headlineText, mockTelemetry);
console.log('Original:  ', res8.originalText);
console.log('Sanitized: ', res8.sanitizedText);
assert(res8.isClean === true, 'Test 8 headline number must be supported');
assert(res8.sanitizedText.includes('12000 BTC'), 'Test 8 must retain 12000 BTC');
console.log('');

// ── TEST 9: Boundary & Edge-Case Safety ──────────────────────────────────────
console.log('Test 9: Null, Empty, and Non-string Inputs');
const resEmpty = validateAndRedactReasoning('', mockTelemetry);
assert(resEmpty.isClean === true, 'Empty string is clean');
const resNone = validateAndRedactReasoning(undefined as any, mockTelemetry);
assert(resNone.isClean === true, 'Undefined string is clean');
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('ALL 9 ANTI-FABRICATION VERIFICATION SUITES PASSED! 🚀');
console.log('═══════════════════════════════════════════════════════════════');
