import { v4 as uuidv4 } from 'uuid';
import type {
  PriceTicker, Candle, SignalReading, SignalType,
  Trade, PerformanceSnapshot, BacktestResult, BacktestTrade,
  MarketRegime, StrategyType, TradeSide
} from '../types';
import { scoreToStrength } from '../types/helpers';

const SIGNAL_DEFAULTS: Record<SignalType, { score: number; confidence: number; label: string; details: Record<string, unknown> }> = {
  macro: {
    score: 0.35, confidence: 0.65, label: 'Macro',
    details: { gdpGrowth: '2.8%', inflationRate: '3.1%', fedRate: '5.25%', trend: 'stable' }
  },
  technical: {
    score: 0.58, confidence: 0.82, label: 'Technical',
    details: { rsi: 61.4, macd: 'bullish_crossover', ma50: 65200, ma200: 52400, bollingerPosition: 'upper_half' }
  },
  sentiment: {
    score: 0.22, confidence: 0.70, label: 'Sentiment',
    details: { fearGreedIndex: 62, twitterSentiment: 0.34, redditMentions: 14200, longShortRatio: 1.18 }
  },
  onchain: {
    score: 0.41, confidence: 0.74, label: 'On-Chain',
    details: { exchangeNetflow: -1240, activeAddresses: 987000, whaleTransactions: 34, nvtRatio: 58.2 }
  },
  news: {
    score: 0.18, confidence: 0.60, label: 'News',
    details: { headlineCount: 12, positiveCount: 7, negativeCount: 3, majorEvent: 'ETF inflows continue' }
  },
};

export function generateMockTicker(symbol = 'BTCUSDT'): PriceTicker {
  const price = 67432 + (Math.random() - 0.5) * 500;
  const changePct24h = (Math.random() - 0.4) * 3;
  return {
    symbol,
    price,
    change24h: price * changePct24h / 100,
    changePct24h,
    high24h: price * (1 + Math.random() * 0.015),
    low24h: price * (1 - Math.random() * 0.015),
    volume24h: 18000 + Math.random() * 6000,
    timestamp: Date.now(),
  };
}

function granularityToMs(granularity: string): number {
  const map: Record<string, number> = {
    '1min': 60000, '5min': 300000, '15min': 900000,
    '30min': 1800000, '1H': 3600000, '4H': 14400000,
    '6H': 21600000, '12H': 43200000, '1D': 86400000, '1W': 604800000,
  };
  return map[granularity] ?? 3600000;
}

export function generateMockCandles(count: number, granularity: string): Candle[] {
  const intervalMs = granularityToMs(granularity);
  const now = Date.now();
  const candles: Candle[] = [];
  let price = 65000;

  for (let i = count - 1; i >= 0; i--) {
    const open = price;
    const drift = price * 0.001;
    const noise = price * 0.015 * (Math.random() * 2 - 1);
    const close = Math.max(1, open + drift + noise);
    const high = Math.max(open, close) * (1 + Math.random() * 0.004);
    const low = Math.min(open, close) * (1 - Math.random() * 0.004);
    const volume = 200 + Math.random() * 1800;

    candles.push({
      timestamp: now - i * intervalMs,
      open, high, low, close, volume,
    });
    price = close;
  }
  return candles;
}

export function generateMockSignal(type: SignalType): SignalReading {
  const defaults = SIGNAL_DEFAULTS[type];
  const jitter = (Math.random() - 0.5) * 0.1;
  const score = Math.max(-1, Math.min(1, defaults.score + jitter));
  return {
    type,
    score,
    strength: scoreToStrength(score),
    confidence: defaults.confidence + (Math.random() - 0.5) * 0.05,
    label: defaults.label,
    source: 'mock',
    details: defaults.details,
    timestamp: Date.now(),
  };
}

export function generateMockSignals(): SignalReading[] {
  const types: SignalType[] = ['macro', 'technical', 'sentiment', 'onchain', 'news'];
  return types.map(generateMockSignal);
}

export function generateMockTrade(index: number): Trade {
  const sides: TradeSide[] = ['long', 'short'];
  const strategies: StrategyType[] = ['momentum_long', 'momentum_short', 'mean_reversion', 'capital_protection'];
  const regimes: MarketRegime[] = ['bullish_trend', 'bearish_trend', 'ranging', 'uncertain'];

  const side = sides[index % 2];
  const strategy = strategies[index % 4];
  const regime = regimes[index % 4];
  const entryPrice = 65000 + Math.random() * 3000;
  const isOpen = index % 5 === 0;
  const pnlRaw = (Math.random() - 0.35) * 300;
  const positionSizeUSD = 200;

  return {
    id: uuidv4(),
    symbol: 'BTCUSDT',
    side,
    strategy,
    entryPrice,
    exitPrice: isOpen ? undefined : entryPrice + (side === 'long' ? 1 : -1) * Math.random() * 200,
    positionSizePct: 0.02,
    positionSizeUSD,
    stopLoss: side === 'long' ? entryPrice * 0.985 : entryPrice * 1.015,
    takeProfit: side === 'long' ? entryPrice * 1.025 : entryPrice * 0.975,
    status: isOpen ? 'open' : 'closed',
    pnl: isOpen ? undefined : pnlRaw,
    pnlPct: isOpen ? undefined : pnlRaw / positionSizeUSD,
    openedAt: Date.now() - (index + 1) * 3600000,
    closedAt: isOpen ? undefined : Date.now() - index * 1800000,
    explanation: `${side === 'long' ? 'Bullish' : 'Bearish'} signal detected via ${strategy.replace(/_/g, ' ')} strategy. ` +
      `Market regime classified as ${regime.replace(/_/g, ' ')} with 78% confidence. ` +
      `Entry at $${entryPrice.toFixed(2)} with 2% position size.`,
    regimeAtEntry: regime,
    regimeConfidence: 0.65 + Math.random() * 0.2,
  };
}

export function generateMockPerformance(): PerformanceSnapshot {
  return {
    timestamp: Date.now(),
    portfolioValue: 10847,
    totalPnl: 847,
    totalPnlPct: 0.0847,
    sharpeRatio: 1.74,
    winRate: 0.63,
    maxDrawdown: 0.038,
    totalTrades: 21,
    openTrades: 1,
  };
}

export function generateMockEquityCurve(points: number): Array<{ timestamp: number; value: number }> {
  const now = Date.now();
  const hourMs = 3600000;
  const curve: Array<{ timestamp: number; value: number }> = [];
  let value = 10000;

  for (let i = points - 1; i >= 0; i--) {
    const drift = value * 0.0003;
    const noise = value * 0.008 * (Math.random() * 2 - 1);
    value = Math.max(8000, value + drift + noise);
    curve.push({ timestamp: now - i * hourMs, value });
  }
  return curve;
}

export function generateMockBacktestResult(): BacktestResult {
  const now = Date.now();
  const dayMs = 86400000;
  const trades: BacktestTrade[] = Array.from({ length: 47 }, (_, i) => {
    const side: TradeSide = i % 2 === 0 ? 'long' : 'short';
    const strategy: StrategyType = (['momentum_long', 'momentum_short', 'mean_reversion', 'capital_protection'] as StrategyType[])[i % 4];
    const regime: MarketRegime = (['bullish_trend', 'bearish_trend', 'ranging', 'uncertain'] as MarketRegime[])[i % 4];
    const entryPrice = 60000 + Math.random() * 8000;
    const pnl = (Math.random() - 0.33) * 400;
    return {
      entryTimestamp: now - (48 - i) * 6 * 3600000,
      exitTimestamp: now - (47 - i) * 6 * 3600000,
      side, strategy, regime,
      entryPrice,
      exitPrice: entryPrice + (side === 'long' ? 1 : -1) * pnl / 0.02,
      pnl,
      pnlPct: pnl / (entryPrice * 0.02),
    };
  });

  const equityCurve = generateMockEquityCurve(90);

  return {
    id: uuidv4(),
    symbol: 'BTCUSDT',
    granularity: '1H',
    periodDays: 30,
    startDate: now - 30 * dayMs,
    endDate: now,
    totalReturn: 1840,
    totalReturnPct: 0.184,
    sharpeRatio: 1.91,
    winRate: 0.67,
    maxDrawdown: 0.058,
    totalTrades: 47,
    profitFactor: 2.3,
    trades,
    equityCurve,
    createdAt: now,
  };
}
