/**
 * Automated Test Suite for Step 2 & Step 3:
 * Deterministic Risk Cage and Bounded Adversarial Challenge
 */

import { evaluateRiskCage, DEFAULT_RISK_POLICY } from '../api/_lib/riskCage';
import { evaluateAdversarialChallenge } from '../api/_lib/adversarialChallenge';
import type { Trade } from '../api/_lib/db';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('NEXUS STEP 2 & 3: RISK CAGE & ADVERSARIAL CHALLENGE TESTS');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── Test 1: Risk Cage Sizing Cap (LLM asks 40%, capped at 2%) ─────────────────
console.log('Test 1: Sizing Enforcement (LLM Over-allocation Capped)');

const now = 1728600000000;
const verdict1 = evaluateRiskCage({
  symbol: 'BTCUSDT',
  action: 'BUY',
  confidence: 95,
  requestedSizePct: 0.40, // 40% requested by rogue LLM
  currentPrice: 67420,
  marketTimestamp: now - 5000,
  portfolioValue: 10000,
  currentDrawdown: 0.01,
  openTrades: [],
  closedTrades: [],
  now,
});

assert(verdict1.approved === true, 'trade approved within safe market bounds');
assert(verdict1.finalSizePct === DEFAULT_RISK_POLICY.maxPositionPct, 'size capped exactly at 2% maxPositionPct');
assert(verdict1.finalSizeUSD === 200, 'size USD is 200, NOT 4,000');
assert(verdict1.appliedLimits.requestedSizePct === 0.40, 'requested size recorded for audit');
assert(verdict1.appliedLimits.approvedSizePct === 0.02, 'approved size recorded for audit');

// ── Test 2: Risk Cage Stale Data Rejection (> 60s) ─────────────────────────────
console.log('\nTest 2: Stale Market Telemetry Rejection');

const verdict2 = evaluateRiskCage({
  symbol: 'BTCUSDT',
  action: 'BUY',
  confidence: 85,
  currentPrice: 67420,
  marketTimestamp: now - 120000, // 120 seconds old (> 60s limit)
  portfolioValue: 10000,
  currentDrawdown: 0.01,
  openTrades: [],
  closedTrades: [],
  now,
});

assert(verdict2.approved === false, 'stale telemetry blocked');
assert(verdict2.appliedLimits.staleDataPassed === false, 'staleDataPassed is false');
assert(verdict2.blockReason?.includes('stale') === true, 'blockReason identifies stale data');

// ── Test 3: Risk Cage Invalid Price Rejection (Negative or NaN) ────────────────
console.log('\nTest 3: Invalid Price Protection');

const verdict3 = evaluateRiskCage({
  symbol: 'BTCUSDT',
  action: 'BUY',
  confidence: 85,
  currentPrice: -100, // Negative price
  marketTimestamp: now - 1000,
  portfolioValue: 10000,
  currentDrawdown: 0.01,
  openTrades: [],
  closedTrades: [],
  now,
});

assert(verdict3.approved === false, 'negative price blocked');
assert(verdict3.appliedLimits.priceValid === false, 'priceValid is false');

// ── Test 4: Daily Drawdown Circuit Breaker ─────────────────────────────────────
console.log('\nTest 4: Daily Drawdown Circuit Breaker');

const verdict4 = evaluateRiskCage({
  symbol: 'BTCUSDT',
  action: 'BUY',
  confidence: 90,
  currentPrice: 67420,
  marketTimestamp: now - 1000,
  portfolioValue: 9200,
  currentDrawdown: 0.08, // 8% drawdown (> 5% limit)
  openTrades: [],
  closedTrades: [],
  now,
});

assert(verdict4.approved === false, 'drawdown breach blocked');
assert(verdict4.appliedLimits.drawdownPassed === false, 'drawdownPassed is false');
assert(verdict4.blockReason?.includes('Circuit Breaker') === true, 'circuit breaker triggered');

// ── Test 5: Directional Re-Entry Cooldown (15m) ────────────────────────────────
console.log('\nTest 5: 15-Minute Re-Entry Cooldown Guardrail');

const recentClosedTrade: Trade = {
  id: 'tr-recent-1',
  symbol: 'BTCUSDT',
  side: 'long',
  strategy: 'momentum_long',
  entryPrice: 67000,
  status: 'closed',
  openedAt: now - 600000,
  closedAt: now - 300000, // Closed 5 minutes ago (< 15m cooldown)
  positionSizePct: 0.02,
  positionSizeUSD: 200,
  stopLoss: 65000,
  takeProfit: 71000,
  explanation: '',
  regimeAtEntry: 'bullish_trend',
  regimeConfidence: 80,
  source: 'live_simulated',
};

const verdict5 = evaluateRiskCage({
  symbol: 'BTCUSDT',
  action: 'BUY',
  confidence: 80,
  currentPrice: 67420,
  marketTimestamp: now - 1000,
  portfolioValue: 10000,
  currentDrawdown: 0.01,
  openTrades: [],
  closedTrades: [recentClosedTrade],
  now,
});

assert(verdict5.approved === false, 're-entry within cooldown blocked');
assert(verdict5.appliedLimits.cooldownPassed === false, 'cooldownPassed is false');
assert(verdict5.blockReason?.includes('cooldown active') === true, 'blockReason identifies cooldown');

// ── Test 6: Adversarial Challenge - Waived for HOLD ────────────────────────────
console.log('\nTest 6: Adversarial Challenge - Waived for HOLD');

const challengeHold = evaluateAdversarialChallenge({
  action: 'HOLD',
  confidence: 70,
  strategy: 'capital_protection',
  reasoning: 'Uncertain regime; holding cash.',
  currentPrice: 67420,
  regime: 'ranging',
  fusedScore: 0.05,
  engineScores: {},
});

assert(challengeHold.status === 'NOT_APPLICABLE', 'HOLD yields NOT_APPLICABLE status');
assert(challengeHold.evidence.length === 0, 'zero evidence contradictions for HOLD');

// ── Test 7: Adversarial Challenge - Divergence Detection on BUY ────────────────
console.log('\nTest 7: Adversarial Challenge - Divergence Detection on BUY');

const challengeBuy = evaluateAdversarialChallenge({
  action: 'BUY',
  confidence: 82,
  strategy: 'momentum_long',
  reasoning: 'Momentum expanding.',
  currentPrice: 67420,
  regime: 'bullish_trend',
  fusedScore: 0.55,
  engineScores: {
    technical: 0.70,
    volume: -0.30,   // Contradiction: volume contracting
    sentiment: -0.40, // Contradiction: sentiment bearish
  },
  details: {
    fundingRate: 0.02, // Contradiction: funding elevated
    rsi: 72,           // Contradiction: overbought
    ema20: 67100,
  },
});

assert(challengeBuy.status === 'CONTRADICTED', 'status is CONTRADICTED on multi-engine divergence');
assert(challengeBuy.evidence.length >= 2, 'identifies 2+ contradicting evidence points');
assert(challengeBuy.invalidation.includes('EMA20'), 'formulates EMA20 invalidation condition');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('ALL 7 RISK CAGE & ADVERSARIAL CHALLENGE TESTS PASSED! 🚀');
console.log('═══════════════════════════════════════════════════════════════');
