// Shared Types and Math Helpers for NEXUS Serverless Engine

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
  source?: 'live_simulated' | 'seed_historical';
  cycleId?: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  portfolioValue: number;
  totalPnl: number;
  totalPnlPct: number;
  sharpeRatio: number;
  winRate: number;
  maxDrawdown: number;
}

// ── Math Helpers ─────────────────────────────────────────────────────────────

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function safeDivide(num: number, denom: number, fallback = 0): number {
  if (denom === 0 || !isFinite(denom) || isNaN(denom)) return fallback;
  const result = num / denom;
  return isFinite(result) && !isNaN(result) ? result : fallback;
}

export function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function scoreToStrength(score: number): SignalStrength {
  if (score >= 0.5) return 'strong_bullish';
  if (score >= 0.15) return 'bullish';
  if (score <= -0.5) return 'strong_bearish';
  if (score <= -0.15) return 'bearish';
  return 'neutral';
}
