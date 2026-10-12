import axios from 'axios';
import type {
  AgentState,
  SignalReading,
  RegimeReading,
  Trade,
  PerformanceSnapshot,
  PriceTicker,
  BacktestResult,
  ApiResponse,
  HistoricalCandle,
  HistoricalIndicatorSnapshot,
  HistoricalSignalSnapshot,
  HistoricalAiDecision,
  HistoricalRiskEvent,
  DecisionRecord,
} from '../types';
import { normalizeTradeId, normalizeNullableString } from './utils';

export function sanitizeAiDecision(d: any): HistoricalAiDecision {
  if (!d || typeof d !== 'object') return d;
  return {
    ...d,
    id: typeof d.id === 'string' ? d.id : String(d.id || ''),
    symbol: typeof d.symbol === 'string' ? d.symbol : 'BTCUSDT',
    action: typeof d.action === 'string' ? d.action : 'HOLD',
    strategy: typeof d.strategy === 'string' ? d.strategy : 'capital_protection',
    reasoning: typeof d.reasoning === 'string' ? d.reasoning : String(d.reasoning || ''),
    marketPrice: typeof d.marketPrice === 'number' ? d.marketPrice : Number(d.marketPrice || 0),
    confidence: typeof d.confidence === 'number' ? d.confidence : Number(d.confidence || 0),
    fusedScore: typeof d.fusedScore === 'number' ? d.fusedScore : (d.fusedScore ? Number(d.fusedScore) : 0),
    regime: typeof d.regime === 'string' ? d.regime : 'ranging',
    executed: Boolean(d.executed),
    blockReason: normalizeNullableString(d.blockReason),
    tradeId: normalizeTradeId(d.tradeId),
    provider: normalizeNullableString(d.provider) || 'fallback_hold',
    providerAttempted: normalizeNullableString(d.providerAttempted) || undefined,
    providerFailureReason: normalizeNullableString(d.providerFailureReason),
    decisionType: (normalizeNullableString(d.decisionType) as any) || undefined,
    latencyMs: typeof d.latencyMs === 'number' ? d.latencyMs : undefined,
    challengeJson: typeof d.challengeJson === 'string' ? d.challengeJson : (d.challengeJson && typeof d.challengeJson === 'object' && d.challengeJson.type === 'null' ? null : d.challengeJson),
    riskJson: typeof d.riskJson === 'string' ? d.riskJson : (d.riskJson && typeof d.riskJson === 'object' && d.riskJson.type === 'null' ? null : d.riskJson),
    detailsJson: typeof d.detailsJson === 'string' ? d.detailsJson : (d.detailsJson && typeof d.detailsJson === 'object' && d.detailsJson.type === 'null' ? null : d.detailsJson),
  };
}

export function sanitizeRiskEvent(e: any): HistoricalRiskEvent {
  if (!e || typeof e !== 'object') return e;
  return {
    ...e,
    tradeId: normalizeTradeId(e.tradeId),
    blockReason: normalizeNullableString(e.blockReason),
    detailsJson: typeof e.detailsJson === 'string' ? e.detailsJson : (e.detailsJson && typeof e.detailsJson === 'object' && e.detailsJson.type === 'null' ? null : e.detailsJson),
  };
}

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';

const api = axios.create({
  baseURL: `${BASE}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const SSE_URL = () => `${BASE}/api/stream/events`;

export async function getHealth(): Promise<ApiResponse<{ status: string; version: string; uptime: number; timestamp: number; symbol: string; mode: string }>> {
  try {
    const res = await api.get('/health');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Health check failed', timestamp: Date.now() };
  }
}

export async function getAgentState(): Promise<ApiResponse<AgentState>> {
  try {
    const res = await api.get('/agent/state');
    if (res.data?.data?.lastAiDecision) {
      res.data.data.lastAiDecision = sanitizeAiDecision(res.data.data.lastAiDecision);
    }
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get agent state', timestamp: Date.now() };
  }
}

export async function getSignals(): Promise<ApiResponse<SignalReading[]>> {
  try {
    const res = await api.get('/signals');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get signals', timestamp: Date.now() };
  }
}

export async function getCurrentRegime(): Promise<ApiResponse<RegimeReading>> {
  try {
    const res = await api.get('/regime/current');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get current regime', timestamp: Date.now() };
  }
}

export async function getTrades(limit?: number): Promise<ApiResponse<Trade[]>> {
  try {
    const res = await api.get('/trades', { params: { limit } });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get trades', timestamp: Date.now() };
  }
}

export async function getOpenTrades(): Promise<ApiResponse<Trade[]>> {
  try {
    const res = await api.get('/trades/open');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get open trades', timestamp: Date.now() };
  }
}

export async function getTradeStats(): Promise<ApiResponse<any>> {
  try {
    const res = await api.get('/trades/stats');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get trade stats', timestamp: Date.now() };
  }
}

export async function getPerformance(): Promise<ApiResponse<PerformanceSnapshot>> {
  try {
    const res = await api.get('/performance');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get performance', timestamp: Date.now() };
  }
}

export async function getEquityCurve(points?: number): Promise<ApiResponse<Array<{ timestamp: number; value: number }>>> {
  try {
    const res = await api.get('/performance/equity-curve', { params: { points } });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get equity curve', timestamp: Date.now() };
  }
}

export async function getPerformanceHistory(limit?: number): Promise<ApiResponse<PerformanceSnapshot[]>> {
  try {
    const res = await api.get('/performance/history', { params: { limit } });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get performance history', timestamp: Date.now() };
  }
}

export async function getRegimeHistory(limit?: number): Promise<ApiResponse<RegimeReading[]>> {
  try {
    const res = await api.get('/regime/history', { params: { limit } });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get regime history', timestamp: Date.now() };
  }
}

export async function getTicker(): Promise<ApiResponse<PriceTicker>> {
  try {
    const res = await api.get('/ticker');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get ticker', timestamp: Date.now() };
  }
}

export async function startAgent(): Promise<ApiResponse<AgentState>> {
  try {
    const res = await api.post('/agent/start');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to start agent', timestamp: Date.now() };
  }
}

export async function pauseAgent(): Promise<ApiResponse<AgentState>> {
  try {
    const res = await api.post('/agent/pause');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to pause agent', timestamp: Date.now() };
  }
}

export async function triggerAgentCycle(): Promise<ApiResponse<any>> {
  try {
    const res = await api.get('/agent/cycle');
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to trigger agent cycle', timestamp: Date.now() };
  }
}

export async function runBacktest(params: { symbol: string; granularity: string; days: number }): Promise<ApiResponse<BacktestResult>> {
  try {
    const res = await api.post('/backtest/run', params);
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to run backtest', timestamp: Date.now() };
  }
}

export async function getBacktestResults(limit?: number): Promise<ApiResponse<BacktestResult[]>> {
  try {
    const res = await api.get('/backtest/results', { params: { limit } });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get backtest results', timestamp: Date.now() };
  }
}

export async function getHistoricalCandles(params?: {
  symbol?: string;
  timeframe?: string;
  limit?: number;
  from?: number;
  to?: number;
}): Promise<ApiResponse<HistoricalCandle[]>> {
  try {
    const res = await api.get('/market/candles', { params });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch historical candles', timestamp: Date.now() };
  }
}

export async function getHistoricalIndicators(params?: {
  symbol?: string;
  timeframe?: string;
  limit?: number;
  from?: number;
  to?: number;
}): Promise<ApiResponse<HistoricalIndicatorSnapshot[]>> {
  try {
    const res = await api.get('/market/indicators', { params });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch historical indicators', timestamp: Date.now() };
  }
}

export async function getSignalsHistory(params?: {
  symbol?: string;
  limit?: number;
  from?: number;
  to?: number;
}): Promise<ApiResponse<HistoricalSignalSnapshot[]>> {
  try {
    const res = await api.get('/signals/history', { params });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch signals history', timestamp: Date.now() };
  }
}

export async function getAiDecisionsHistory(params?: {
  symbol?: string;
  limit?: number;
  from?: number;
  to?: number;
}): Promise<ApiResponse<HistoricalAiDecision[]>> {
  try {
    const res = await api.get('/agent/history', { params });
    if (res.data?.data && Array.isArray(res.data.data)) {
      res.data.data = res.data.data.map(sanitizeAiDecision);
    }
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch AI decision history', timestamp: Date.now() };
  }
}

export async function getHistoricalRiskEvents(params?: {
  symbol?: string;
  limit?: number;
  from?: number;
  to?: number;
}): Promise<ApiResponse<HistoricalRiskEvent[]>> {
  try {
    const res = await api.get('/risk/history', { params });
    if (res.data?.data && Array.isArray(res.data.data)) {
      res.data.data = res.data.data.map(sanitizeRiskEvent);
    }
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch risk events history', timestamp: Date.now() };
  }
}

// Backward compatibility & convenience aliases
export const getRiskEventsHistory = getHistoricalRiskEvents;
export const getHistoricalAiDecisions = getAiDecisionsHistory;
export const getHistoricalSignals = getSignalsHistory;

export async function probeBitgetMcp(): Promise<any> {
  try {
    const res = await api.get('/mcp/probe');
    return res.data;
  } catch (error: any) {
    return { success: false, reachable: false, error: error.message || 'Bitget MCP probe failed' };
  }
}

export async function getDecisionRecord(id: string): Promise<ApiResponse<DecisionRecord>> {
  try {
    const res = await api.get('/decision', { params: { id } });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to retrieve decision record', timestamp: Date.now() };
  }
}

export async function getDecisionRecords(params?: {
  symbol?: string;
  limit?: number;
}): Promise<ApiResponse<DecisionRecord[]>> {
  try {
    const res = await api.get('/decision', { params });
    return res.data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to retrieve decision records', timestamp: Date.now() };
  }
}


