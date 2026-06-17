import dotenv from 'dotenv';
// dotenv.config() must be at the very top
dotenv.config();

import express from 'express';
import cors from 'cors';

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
app.get('/api/health', (req, res) => {
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
});
