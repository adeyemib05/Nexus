import axios from 'axios';
import type {
  AgentState,
  SignalReading,
  RegimeReading,
  Trade,
  PerformanceSnapshot,
  PriceTicker,
  BacktestResult,
  ApiResponse
} from '../types';

const BASE = import.meta.env.VITE_API_URL || '';

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
