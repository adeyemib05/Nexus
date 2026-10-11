/**
 * Automated Test Suite for Step 1: Canonical Decision Record
 * Verifies that every autonomous trading decision is 100% reconstructable
 * across Market State, 5 Intelligence Engines, Fusion, Qwen Proposal,
 * Adversarial Challenge, Deterministic Risk, Execution, and Outcome.
 */

import {
  reconstructDecisionRecord,
  type DecisionRecord,
  type HistoricalAiDecision,
  type HistoricalSignalSnapshot,
  type HistoricalRiskEvent,
  type Trade,
} from '../api/_lib/db';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('NEXUS STEP 1: CANONICAL DECISION RECORD VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── Test 1: Full Executed BUY Decision with Closed Trade ───────────────────────
console.log('Test 1: Fully Executed BUY Decision with Closed Trade');

const buyDecision: HistoricalAiDecision = {
  id: 'ai_1728600000_101',
  timestamp: 1728600000000,
  symbol: 'BTCUSDT',
  marketPrice: 67420,
  action: 'BUY',
  confidence: 84,
  strategy: 'momentum_long',
  reasoning: 'Momentum expanding with RSI at 58.2 and EMA20 above EMA50.',
  provider: 'qwen-2.5-72b',
  fusedScore: 0.65,
  regime: 'bullish_trend',
  executed: true,
  blockReason: null,
  tradeId: 'tr-sim-101',
  challengeJson: JSON.stringify({
    status: 'CAUTION',
    counterThesis: 'Volume expansion lagging price impulse; funding elevated at 0.012%.',
    invalidation: 'Breakdown below EMA20 support at 67100.',
    evidence: ['Volume divergence', 'Funding rate elevated'],
  }),
  riskJson: JSON.stringify({
    approved: true,
    blockReason: null,
    appliedLimits: {
      maxPositionPct: 0.02,
      maxLeverage: 1,
      cooldownPassed: true,
      drawdownPassed: true,
    },
    finalSize: 200,
  }),
};

const signalSnapshot: HistoricalSignalSnapshot = {
  id: 'sig_1728600000',
  timestamp: 1728600000000,
  symbol: 'BTCUSDT',
  technicalScore: 0.72,
  technicalConfidence: 0.85,
  technicalStrength: 'strong_bullish',
  liquidityScore: 0.35,
  liquidityConfidence: 0.70,
  liquidityStrength: 'bullish',
  sentimentScore: 0.55,
  sentimentConfidence: 0.80,
  sentimentStrength: 'bullish',
  onchainScore: 0.40,
  onchainConfidence: 0.75,
  onchainStrength: 'bullish',
  newsScore: 0.60,
  newsConfidence: 0.72,
  newsStrength: 'bullish',
  fusedScore: 0.65,
  regime: 'bullish_trend',
  regimeConfidence: 81,
  detailsJson: JSON.stringify({
    technical: { rsi: 58.2, ema20: 67100, ema50: 66800 },
    liquidity: { volume24hUsd: 28450 },
    sentiment: { fundingRate: 0.012 },
  }),
};

const closedTrade: Trade = {
  id: 'tr-sim-101',
  symbol: 'BTCUSDT',
  side: 'long',
  strategy: 'momentum_long',
  entryPrice: 67420,
  exitPrice: 68150,
  positionSizePct: 0.02,
  positionSizeUSD: 200,
  stopLoss: 65734,
  takeProfit: 71465,
  status: 'closed',
  openedAt: 1728600000000,
  closedAt: 1728603600000,
  pnl: 114.20,
  pnlPct: 0.0108,
  explanation: 'Qwen Decision (84% conf, qwen-2.5-72b)',
  regimeAtEntry: 'bullish_trend',
  regimeConfidence: 81,
  source: 'live_simulated',
};

const record1 = reconstructDecisionRecord(buyDecision, signalSnapshot, null, closedTrade);

assert(record1.decisionId === 'ai_1728600000_101', 'decisionId matches');
assert(record1.symbol === 'BTCUSDT', 'symbol matches');
assert(record1.price === 67420, 'price is 67420');
assert(record1.regime === 'bullish_trend', 'regime is bullish_trend');
assert(record1.evidence.technical.score === 0.72, 'evidence technical score preserved');
assert(record1.evidence.sentiment.score === 0.55, 'evidence sentiment score preserved');
assert(record1.fusion.score === 0.65, 'fused score is 0.65');
assert(record1.ai.action === 'BUY', 'ai action is BUY');
assert(record1.ai.confidence === 84, 'ai confidence is 84');
assert(record1.challenge.status === 'CAUTION', 'challenge status is CAUTION');
assert(record1.challenge.counterThesis.includes('Volume expansion'), 'counter-thesis preserved');
assert(record1.risk.approved === true, 'risk approved is true');
assert(record1.risk.finalSize === 200, 'risk finalSize is 200 USD');
assert(record1.execution.executed === true, 'execution executed is true');
assert(record1.execution.tradeId === 'tr-sim-101', 'execution tradeId linked');
assert(record1.outcome.status === 'AVAILABLE', 'outcome status is AVAILABLE');
assert(record1.outcome.pnl === 114.20, 'outcome pnl is 114.20');
assert(record1.outcome.exitReason === 'Take-profit target satisfied', 'outcome exitReason valid');

// ── Test 2: Blocked Decision (Execution Blocked by Cooldown) ───────────────────
console.log('\nTest 2: Blocked Decision (Risk Gate Active)');

const blockedDecision: HistoricalAiDecision = {
  id: 'ai_1728600060_102',
  timestamp: 1728600060000,
  symbol: 'BTCUSDT',
  marketPrice: 67450,
  action: 'BUY',
  confidence: 76,
  strategy: 'momentum_long',
  reasoning: 'Attempting follow-on momentum entry.',
  provider: 'qwen-2.5-72b',
  fusedScore: 0.52,
  regime: 'bullish_trend',
  executed: false,
  blockReason: 'Execution blocked: 15-minute re-entry cooldown active for long',
  tradeId: null,
};

const riskEvent: HistoricalRiskEvent = {
  id: 'risk_1728600060_102',
  timestamp: 1728600060000,
  symbol: 'BTCUSDT',
  action: 'BUY',
  strategy: 'momentum_long',
  confidence: 76,
  blockReason: 'Execution blocked: 15-minute re-entry cooldown active for long',
  executed: false,
};

const record2 = reconstructDecisionRecord(blockedDecision, signalSnapshot, riskEvent, null);

assert(record2.ai.action === 'BUY', 'action is BUY');
assert(record2.risk.approved === false, 'risk.approved is false');
assert(record2.risk.blockReason?.includes('15-minute re-entry cooldown'), 'risk.blockReason captured');
assert(record2.execution.executed === false, 'execution.executed is false');
assert(record2.execution.tradeId === null, 'execution.tradeId is null');
assert(record2.outcome.status === 'NOT_APPLICABLE', 'outcome status is NOT_APPLICABLE');
assert(record2.outcome.pnl === null, 'outcome.pnl is null (zero lookahead fabrication)');
assert(record2.outcome.exitReason?.includes('15-minute re-entry cooldown'), 'outcome exitReason preserved');

// ── Test 3: Autonomous HOLD Decision ──────────────────────────────────────────
console.log('\nTest 3: Autonomous HOLD Decision (Capital Protection)');

const holdDecision: HistoricalAiDecision = {
  id: 'ai_1728600120_103',
  timestamp: 1728600120000,
  symbol: 'BTCUSDT',
  marketPrice: 67390,
  action: 'HOLD',
  confidence: 65,
  strategy: 'mean_reversion',
  reasoning: 'Signals conflicting between momentum and on-chain; waiting for clarity.',
  provider: 'qwen-2.5-72b',
  fusedScore: 0.05,
  regime: 'ranging',
  executed: false,
  blockReason: 'Autonomous HOLD: Signals conflicting',
  tradeId: null,
};

const record3 = reconstructDecisionRecord(holdDecision, signalSnapshot, null, null);

assert(record3.ai.action === 'HOLD', 'action is HOLD');
assert(record3.challenge.status === 'NOT_APPLICABLE', 'challenge is NOT_APPLICABLE for HOLD');
assert(record3.risk.approved === false, 'risk approved is false for HOLD');
assert(record3.risk.finalSize === 0, 'risk size is 0 USD for HOLD');
assert(record3.execution.executed === false, 'execution is false');
assert(record3.outcome.status === 'NOT_APPLICABLE', 'outcome is NOT_APPLICABLE');

// ── Test 4: Legacy Decision Fallback Synthesis (Zero Crashes) ──────────────────
console.log('\nTest 4: Legacy Record Fallback (No stored challengeJson or riskJson)');

const legacyDecision: HistoricalAiDecision = {
  id: 'ai_legacy_001',
  timestamp: 1728500000000,
  symbol: 'BTCUSDT',
  marketPrice: 66800,
  action: 'SELL',
  confidence: 79,
  strategy: 'momentum_short',
  reasoning: 'Bearish divergence on 1h candles.',
  provider: 'groq-llama-3.3-70b',
  fusedScore: -0.48,
  regime: 'bearish_trend',
  executed: false,
  blockReason: 'Execution blocked: Live short position already open',
  tradeId: null,
};

const record4 = reconstructDecisionRecord(legacyDecision, null, null, null);

assert(record4.decisionId === 'ai_legacy_001', 'legacy decisionId preserved');
assert(record4.price === 66800, 'legacy price preserved');
assert(record4.evidence.technical.score === null, 'gracefully handles missing signal snapshot');
assert(record4.challenge.status !== 'UNAVAILABLE', 'challenge synthesized deterministically');
assert(record4.risk.approved === false, 'risk approved correctly reflects execution state');
assert(record4.outcome.status === 'NOT_APPLICABLE', 'outcome status is NOT_APPLICABLE');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('ALL 4 DECISION RECORD RECONSTRUCTION TEST SUITES PASSED! 🚀');
console.log('═══════════════════════════════════════════════════════════════');
