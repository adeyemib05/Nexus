import dotenv from 'dotenv';
// dotenv.config() must be at the very top
dotenv.config();

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
      mode: AGENT_MODE
    },
    timestamp: Date.now()
  });
});

// Routes mounted in Phase 7

// Services initialized in Phase 6

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
