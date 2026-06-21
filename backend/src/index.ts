import dotenv from 'dotenv';
// dotenv.config() must be at the very top
dotenv.config();

import agentRouter from './routes/agent';
import signalsRouter from './routes/signals';
import regimeRouter from './routes/regime';
import tradesRouter from './routes/trades';
import performanceRouter from './routes/performance';
import backtestRouter from './routes/backtest';
import streamRouter from './routes/stream';

import { BitgetWebSocket } from './services/bitgetWS';
import { AgentHubClient } from './services/agentHubClient';
import { RiskManager } from './agents/riskManager';
import { StrategyRouter } from './agents/strategyRouter';
import { ExecutionEngine } from './agents/executionEngine';
import { NLExplainer } from './agents/nlExplainer';
import { AgentCycle } from './agents/agentCycle';
import { db } from './agents/database';
import { initState } from './state';

import express from 'express';
import cors from 'cors';
import { BitgetRESTClient } from './services/bitgetREST';
import { generateMockTicker } from './services/mockData';

const app = express();
const PORT = process.env.PORT || 3001;
const AGENT_MODE = process.env.AGENT_MODE || 'simulation';
const AGENT_SYMBOL = process.env.AGENT_SYMBOL || 'BTCUSDT';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:5173';

app.use(cors({
  origin: ALLOWED_ORIGINS.split(','),
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// GET /api/health
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: Date.now(),
      symbol: AGENT_SYMBOL,
      mode: AGENT_MODE,services: {
  bitgetWS: _bitgetWS?.isConnected() || false,
  qwen: !!(process.env.QWEN_API_KEY && !process.env.QWEN_API_KEY.includes('YOUR')),
  gemini: !!(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('YOUR')),
  bitgetApi: !!(process.env.BITGET_API_KEY && !process.env.BITGET_API_KEY.includes('YOUR')),
},
agent: _agent?.getState()
    },
    timestamp: Date.now()
  });
});

app.get('/api/ticker', async (_req, res) => {
  try {
    let ticker = _bitgetWS?.getLastTicker() || null;
    if (!ticker) {
      try {
        ticker = await _bitgetREST.getTicker(AGENT_SYMBOL);
      } catch {
        ticker = {
          symbol: AGENT_SYMBOL, price: 0, change24h: 0, changePct24h: 0,
          high24h: 0, low24h: 0, volume24h: 0, timestamp: Date.now(),
        };
      }
    }
    res.json({ success: true, data: ticker, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

// Routes mounted in Phase 7

const _bitgetREST = BitgetRESTClient.create();
const _bitgetWS = new BitgetWebSocket(AGENT_SYMBOL);
const _hubClient = new AgentHubClient();
const _riskMgr = new RiskManager();
const _router = new StrategyRouter();
const _execution = new ExecutionEngine(_bitgetREST, db);
const _explainer = new NLExplainer();
const _agent = new AgentCycle(_bitgetREST, _bitgetWS, _riskMgr, _router, _execution, _explainer, _hubClient, db);

initState(_agent, db, _bitgetREST, _bitgetWS);

_bitgetWS.connect();
setTimeout(() => _agent.start(), 3000);

app.use('/api/agent', agentRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/regime', regimeRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/backtest', backtestRouter);
app.use('/api/stream', streamRouter);

app.listen(PORT, () => {
  console.log(`🚀 NEXUS Backend — port ${PORT}`);
  console.log(`📊 Mode: ${AGENT_MODE} | Symbol: ${AGENT_SYMBOL}`);
  console.log(`🌐 CORS: ${ALLOWED_ORIGINS}`);

  // ── Connectivity test (runs 1s after server starts) ───────────────────
  setTimeout(async () => {
    console.log('\n── Service Layer Connectivity Test ──');

    // 1. Mock ticker
    const mock = generateMockTicker(AGENT_SYMBOL);
    console.log(`[MOCK] ${AGENT_SYMBOL} price: $${mock.price.toFixed(2)}`);

    // 2. Live Bitget ticker (gracefully degrades)
    try {
      const client = BitgetRESTClient.create();
      const ticker = await client.getTicker(AGENT_SYMBOL);
      console.log(`[LIVE] ${AGENT_SYMBOL} price: $${ticker.price.toFixed(2)} (Bitget API)`);
    } catch (err: any) {
      if (err.message?.includes('missing') || err.message?.includes('credentials')) {
        console.log('[LIVE] Using mock (no API key configured)');
      } else {
        console.log(`[LIVE] Using mock — ${err.message}`);
      }
    }

    console.log('✅ Service layer ready\n');
  }, 1000);
});
setTimeout(async () => {
  try {
    const { BitgetRESTClient } = await import('./services/bitgetREST');
    const { AgentHubClient } = await import('./services/agentHubClient');
    const { generateMockCandles } = await import('./services/mockData');
    const { computeRegime } = await import('./signals/signalFusion');

    const restClient = BitgetRESTClient.create();
    const hubClient = new AgentHubClient();
    const mockCandles = generateMockCandles(200, '1H');
    const regime = await computeRegime(mockCandles, restClient, hubClient, 'BTCUSDT');

    console.log('\n🔬 Signal Test:');
    regime.signals.forEach((s) => {
      console.log(`  ${s.label.padEnd(20)} score:${s.score.toFixed(3)} conf:${(s.confidence * 100).toFixed(0)}% src:${s.source}`);
    });
    console.log(`  ► Regime: ${regime.regime} (${regime.confidence}%)`);
    console.log(`  ► ${regime.reasoning}\n`);
  } catch (err: any) {
    console.error('[SIGNAL TEST] Failed:', err.message);
  }
}, 3000);
setTimeout(async () => {
  try {
    const { BitgetRESTClient } = await import('./services/bitgetREST');
    const { db } = await import('./agents/database');
    const { BacktestEngine } = await import('./backtest/backtestEngine');

    const restClient = BitgetRESTClient.create();
    const engine = new BacktestEngine(restClient, db);
    const result = await engine.run({ symbol: 'BTCUSDT', granularity: '1H', days: 7 });

    console.log(`[BACKTEST TEST] ${result.totalTrades} trades, Sharpe: ${result.sharpeRatio}`);
  } catch (err: any) {
    console.error('[BACKTEST TEST] Failed:', err.message);
  }
}, 6000);
