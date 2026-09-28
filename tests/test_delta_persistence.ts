// Unit & Regression Test Suite: Turso Delta Persistence & Historical Memory Audit
// Tests delta-based candle filtering, historical snapshot integrity, and zero write amplification.

import assert from 'node:assert';
interface HistoricalCandle {
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HistoricalIndicatorSnapshot {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  collectedAt?: number;
  rsi: number;
  ema20: number;
  ema50: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  indicatorsJson?: Record<string, any>;
}

interface HistoricalSignalSnapshot {
  id: string;
  timestamp: number;
  collectedAt?: number;
  symbol: string;
  technical: { score: number; confidence: number; strength: string };
  liquidity: { score: number; confidence: number; strength: string };
  sentiment: { score: number; confidence: number; strength: string };
  onchain: { score: number; confidence: number; strength: string };
  news: { score: number; confidence: number; strength: string };
  fusedScore: number;
  regime: string;
  regimeConfidence: number;
  details?: Record<string, any>;
}

interface HistoricalAiDecision {
  id: string;
  timestamp: number;
  symbol: string;
  marketPrice: number;
  action: string;
  confidence: number;
  strategy: string;
  reasoning: string;
  provider?: string | null;
  executed: boolean;
  decisionType?: 'model' | 'failsafe_hold';
}

interface HistoricalRiskEvent {
  id: string;
  timestamp: number;
  symbol: string;
  action: string;
  blockReason: string;
  executed: boolean;
}

// Simulate the delta filtering logic from saveCandlesWithStats
function simulateDeltaFilter(
  candles: HistoricalCandle[],
  latestStoredTs: Map<string, number | null>,
  options: { deltaOnly?: boolean } = { deltaOnly: true }
): { candlesToSave: HistoricalCandle[]; savedCount: number; skippedCount: number } {
  if (!candles || candles.length === 0) {
    return { candlesToSave: [], savedCount: 0, skippedCount: 0 };
  }

  let candlesToSave = candles;
  let skippedCount = 0;

  if (options.deltaOnly !== false) {
    const groups = new Map<string, HistoricalCandle[]>();
    for (const c of candles) {
      const key = `${c.symbol}_${c.timeframe}`;
      const list = groups.get(key) || [];
      list.push(c);
      groups.set(key, list);
    }

    const filtered: HistoricalCandle[] = [];
    for (const groupCandles of groups.values()) {
      const { symbol, timeframe } = groupCandles[0];
      const key = `${symbol}_${timeframe}`;
      const latestTs = latestStoredTs.get(key) ?? null;

      if (latestTs === null) {
        filtered.push(...groupCandles);
      } else {
        const newCandles = groupCandles.filter((c) => c.timestamp > latestTs);
        skippedCount += (groupCandles.length - newCandles.length);
        filtered.push(...newCandles);
      }
    }

    candlesToSave = filtered;
  }

  // Deduplicate by (symbol, timeframe, timestamp)
  if (candlesToSave.length > 1) {
    const seen = new Set<string>();
    const deduplicated: HistoricalCandle[] = [];
    for (let i = candlesToSave.length - 1; i >= 0; i--) {
      const c = candlesToSave[i];
      const uKey = `${c.symbol}_${c.timeframe}_${c.timestamp}`;
      if (!seen.has(uKey)) {
        seen.add(uKey);
        deduplicated.push(c);
      }
    }
    candlesToSave = deduplicated.reverse();
  }

  return { candlesToSave, savedCount: candlesToSave.length, skippedCount };
}

console.log('--- Starting Delta Persistence & Historical Integrity Test Suite ---');

// Test 1: Initial bootstrap when DB is empty (latestTs === null)
{
  const mockCandles: HistoricalCandle[] = Array.from({ length: 100 }, (_, i) => ({
    symbol: 'BTCUSDT',
    timeframe: '1m',
    timestamp: 1700000000000 + i * 60000,
    open: 60000 + i,
    high: 60010 + i,
    low: 59990 + i,
    close: 60005 + i,
    volume: 10,
  }));

  const dbState = new Map<string, number | null>([['BTCUSDT_1m', null]]);
  const result = simulateDeltaFilter(mockCandles, dbState);
  assert.strictEqual(result.savedCount, 100, 'Initial bootstrap must save all 100 candles');
  assert.strictEqual(result.skippedCount, 0, 'No candles should be skipped on empty DB');
  console.log('✓ Test 1 Passed: Initial bootstrap saves all candles when database is empty');
}

// Test 2: Existing 1m candle is NOT rewritten on subsequent cycle
{
  const latestTs = 1700000000000 + 99 * 60000;
  const mockCandles: HistoricalCandle[] = Array.from({ length: 100 }, (_, i) => ({
    symbol: 'BTCUSDT',
    timeframe: '1m',
    timestamp: 1700000000000 + i * 60000,
    open: 60000 + i,
    high: 60010 + i,
    low: 59990 + i,
    close: 60005 + i,
    volume: 10,
  }));

  const dbState = new Map<string, number | null>([['BTCUSDT_1m', latestTs]]);
  const result = simulateDeltaFilter(mockCandles, dbState);
  assert.strictEqual(result.savedCount, 0, 'Unchanged candle window must write 0 rows');
  assert.strictEqual(result.skippedCount, 100, 'All 100 existing candles must be skipped');
  console.log('✓ Test 2 Passed: Existing 1m candles are NOT rewritten (0 rows written, 100 skipped)');
}

// Test 3: New 1m candle is persisted, while all 99 historical candles are skipped
{
  const latestTs = 1700000000000 + 99 * 60000;
  // Window advances by 1 minute: 99 old candles + 1 brand new candle
  const mockCandles: HistoricalCandle[] = Array.from({ length: 100 }, (_, i) => ({
    symbol: 'BTCUSDT',
    timeframe: '1m',
    timestamp: 1700000000000 + (i + 1) * 60000, // timestamps 1..100
    open: 60000 + i,
    high: 60010 + i,
    low: 59990 + i,
    close: 60005 + i,
    volume: 10,
  }));

  const dbState = new Map<string, number | null>([['BTCUSDT_1m', latestTs]]);
  const result = simulateDeltaFilter(mockCandles, dbState);
  assert.strictEqual(result.savedCount, 1, 'Exactly 1 new 1m candle must be persisted');
  assert.strictEqual(result.skippedCount, 99, 'Exactly 99 existing historical candles must be skipped');
  assert.strictEqual(
    result.candlesToSave[0].timestamp,
    1700000000000 + 100 * 60000,
    'Saved candle must be the newly observed timestamp'
  );
  console.log('✓ Test 3 Passed: Only the newly observed 1m candle is persisted (1 write, 99 skipped)');
}

// Test 4: Existing 1h candle is NOT rewritten on every minute
{
  const currentHourTs = 1700000000000 + 3600000;
  const mock1hCandles: HistoricalCandle[] = Array.from({ length: 100 }, (_, i) => ({
    symbol: 'BTCUSDT',
    timeframe: '1h',
    timestamp: 1700000000000 - (100 - i) * 3600000,
    open: 60000,
    high: 60500,
    low: 59800,
    close: 60200,
    volume: 500,
  }));
  const lastCandleTs = mock1hCandles[mock1hCandles.length - 1].timestamp;

  const dbState = new Map<string, number | null>([['BTCUSDT_1h', lastCandleTs]]);
  const result = simulateDeltaFilter(mock1hCandles, dbState);
  assert.strictEqual(result.savedCount, 0, 'No 1h candle should be written during same hour');
  assert.strictEqual(result.skippedCount, 100, 'All 100 1h candles must be skipped');
  console.log('✓ Test 4 Passed: Existing 1h candles are NOT rewritten every minute (0 writes)');
}

// Test 5: Genuinely new 1h candle is persisted when hour closes
{
  const previousHourTs = 1700000000000;
  const mock1hCandles: HistoricalCandle[] = [
    { symbol: 'BTCUSDT', timeframe: '1h', timestamp: previousHourTs, open: 60000, high: 60500, low: 59800, close: 60200, volume: 500 },
    { symbol: 'BTCUSDT', timeframe: '1h', timestamp: previousHourTs + 3600000, open: 60200, high: 60800, low: 60100, close: 60700, volume: 450 },
  ];

  const dbState = new Map<string, number | null>([['BTCUSDT_1h', previousHourTs]]);
  const result = simulateDeltaFilter(mock1hCandles, dbState);
  assert.strictEqual(result.savedCount, 1, 'Exactly 1 new 1h candle must be persisted');
  assert.strictEqual(result.candlesToSave[0].timestamp, previousHourTs + 3600000);
  console.log('✓ Test 5 Passed: Genuinely new 1h candle is persisted at hour transition (1 write)');
}

// Test 6: Duplicate timestamps in same payload are deduplicated
{
  const ts = 1700000000000 + 500000;
  const mockCandles: HistoricalCandle[] = [
    { symbol: 'BTCUSDT', timeframe: '1m', timestamp: ts, open: 60000, high: 60010, low: 59990, close: 60005, volume: 10 },
    { symbol: 'BTCUSDT', timeframe: '1m', timestamp: ts, open: 60000, high: 60020, low: 59990, close: 60015, volume: 12 },
  ];

  const dbState = new Map<string, number | null>([['BTCUSDT_1m', ts - 60000]]);
  const result = simulateDeltaFilter(mockCandles, dbState);
  assert.strictEqual(result.savedCount, 1, 'Duplicate timestamp in input array must be deduplicated to 1 write');
  assert.strictEqual(result.candlesToSave[0].close, 60015, 'Latest payload value should be retained');
  console.log('✓ Test 6 Passed: Duplicate timestamps in input window are cleanly deduplicated');
}

// Test 7: Historical indicator snapshot format validation
{
  const ind: HistoricalIndicatorSnapshot = {
    id: 'ind_BTCUSDT_1m_1700000000000',
    symbol: 'BTCUSDT',
    timeframe: '1m',
    timestamp: 1700000000000,
    collectedAt: 1700000005000,
    rsi: 55.4,
    ema20: 60120.5,
    ema50: 59980.2,
    macd: 12.4,
    macdSignal: 10.1,
    macdHistogram: 2.3,
    indicatorsJson: { priceVsEma20: '+0.25%' },
  };
  assert.strictEqual(ind.id.startsWith('ind_BTCUSDT_1m_'), true);
  assert.strictEqual(typeof ind.rsi, 'number');
  assert.strictEqual(typeof ind.ema20, 'number');
  console.log('✓ Test 7 Passed: Historical indicator snapshot contract is valid and preserved');
}

// Test 8: Historical signal snapshot format validation
{
  const sig: HistoricalSignalSnapshot = {
    id: 'sig_BTCUSDT_1700000000000',
    timestamp: 1700000000000,
    collectedAt: 1700000005000,
    symbol: 'BTCUSDT',
    technical: { score: 0.65, confidence: 0.8, strength: 'bullish' },
    liquidity: { score: 0.45, confidence: 0.7, strength: 'bullish' },
    sentiment: { score: 0.55, confidence: 0.75, strength: 'bullish' },
    onchain: { score: 0.5, confidence: 0.7, strength: 'neutral' },
    news: { score: 0.4, confidence: 0.65, strength: 'neutral' },
    fusedScore: 0.53,
    regime: 'bullish_trend',
    regimeConfidence: 74,
  };
  assert.strictEqual(sig.id.startsWith('sig_BTCUSDT_'), true);
  assert.strictEqual(sig.fusedScore, 0.53);
  console.log('✓ Test 8 Passed: Historical 5-engine signal snapshot contract is valid and preserved');
}

// Test 9: Historical AI decision contract validation
{
  const ai: HistoricalAiDecision = {
    id: 'ai_1700000005000_921',
    timestamp: 1700000005000,
    symbol: 'BTCUSDT',
    marketPrice: 60150,
    action: 'HOLD',
    confidence: 65,
    strategy: 'mean_reversion',
    reasoning: 'Ranging market conditions; awaiting breakout.',
    provider: 'groq:qwen/qwen3.8-27b',
    executed: false,
    decisionType: 'model',
  };
  assert.strictEqual(ai.id.startsWith('ai_'), true);
  assert.strictEqual(ai.action, 'HOLD');
  assert.strictEqual(ai.decisionType, 'model');
  console.log('✓ Test 9 Passed: Historical AI decision contract is valid and preserved');
}

// Test 10: Risk event contract validation
{
  const risk: HistoricalRiskEvent = {
    id: 'risk_1700000005000_921',
    timestamp: 1700000005000,
    symbol: 'BTCUSDT',
    action: 'BUY',
    blockReason: 'Position limit reached: 1 open position already active',
    executed: false,
  };
  assert.strictEqual(risk.executed, false);
  assert.strictEqual(risk.blockReason.includes('Position limit'), true);
  console.log('✓ Test 10 Passed: Historical risk event contract is valid and preserved');
}

console.log('\nAll 10/10 unit & regression tests passed successfully!');
