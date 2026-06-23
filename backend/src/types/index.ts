export type SignalType = 'macro' | 'technical' | 'sentiment' | 'onchain' | 'news';
export type SignalStrength = 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
export type MarketRegime = 'bullish_trend' | 'bearish_trend' | 'ranging' | 'uncertain';
export type StrategyType = 'momentum_long' | 'momentum_short' | 'mean_reversion' | 'capital_protection';
export type TradeStatus = 'open' | 'closed' | 'cancelled' | 'failed';
export type TradeSide = 'long' | 'short';
export type AgentStatus = 'running' | 'paused' | 'halted' | 'error' | 'idle';

export interface SignalReading {
  type: SignalType;
  score: number;          // -1.0 to +1.0
  strength: SignalStrength;
  confidence: number;     // 0.0 to 1.0
  label: string;
  source: 'agent_hub' | 'local' | 'mock';
  details: Record<string, unknown>;
  timestamp: number;
}

export interface RegimeReading {
  regime: MarketRegime;
  confidence: number;     // 0–100
  fusedScore: number;     // -1.0 to +1.0
  signals: SignalReading[];
  timestamp: number;
  reasoning: string;
}

export interface StrategyDecision {
  strategy: StrategyType;
  action: 'buy' | 'sell' | 'hold' | 'flat' | 'close';
  symbol: string;
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  reasoning: string;
  regime: RegimeReading;
}

export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  strategy: StrategyType;
  entryPrice: number;
  exitPrice?: number;
  positionSizePct: number;
  positionSizeUSD: number;
  stopLoss: number;
  takeProfit: number;
  status: TradeStatus;
  pnl?: number;
  pnlPct?: number;
  openedAt: number;
  closedAt?: number;
  explanation: string;
  regimeAtEntry: MarketRegime;
  regimeConfidence: number;
  peakPrice?: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceTicker {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

export interface BacktestResult {
  id: string;
  symbol: string;
  granularity: string;
  periodDays: number;
  startDate: number;
  endDate: number;
  totalReturn: number;
  totalReturnPct: number;
  sharpeRatio: number;
  winRate: number;
  maxDrawdown: number;
  totalTrades: number;
  profitFactor: number;
  trades: BacktestTrade[];
  equityCurve: Array<{ timestamp: number; value: number }>;
  createdAt: number;
}

export interface BacktestTrade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: TradeSide;
  strategy: StrategyType;
  regime: MarketRegime;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  portfolioValue: number;
  totalPnl: number;
  totalPnlPct: number;
  sharpeRatio: number;
  winRate: number;
  maxDrawdown: number;
  totalTrades: number;
  openTrades: number;
}

export interface AgentState {
  status: AgentStatus;
  currentRegime: RegimeReading | null;
  lastCycleAt: number | null;
  cycleCount: number;
  portfolioValue: number;
  initialPortfolioValue: number;
  currentDrawdown: number;
  haltReason?: string;
  startedAt: number | null;
}

export interface AgentEvent {
  type: 'cycle_complete' | 'trade_opened' | 'trade_closed' | 
        'regime_updated' | 'agent_halted' | 'ticker_update';
  data: unknown;
  timestamp: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}
