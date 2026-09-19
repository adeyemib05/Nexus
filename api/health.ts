import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet } from './db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const now = Date.now();

  // 1. Probe Bitget REST reachability
  let bitgetApiReachable = false;
  try {
    const bitgetRes = await fetch('https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT', {
      signal: AbortSignal.timeout(3000),
    });
    bitgetApiReachable = bitgetRes.ok;
  } catch {
    bitgetApiReachable = false;
  }

  // 2. Check Qwen API configuration
  const qwenKey = process.env.QWEN_API_KEY || '';
  const qwenConfigured = !!(qwenKey && !qwenKey.includes('YOUR') && qwenKey.length > 10);

  // 3. Check Gemini API configuration
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const geminiConfigured = !!(geminiKey && !geminiKey.includes('YOUR') && geminiKey.length > 10);

  // 4. Probe Turso DB connectivity
  let tursoConnected = false;
  try {
    const testState = await kvGet('agentState');
    tursoConnected = !!testState;
  } catch {
    tursoConnected = false;
  }

  return res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime ? process.uptime() : 0,
      timestamp: now,
      symbol: 'BTCUSDT',
      mode: 'simulation',
      services: {
        bitgetApi: bitgetApiReachable,
        bitgetWS: false, // Serverless stateless architecture
        qwen: qwenConfigured,
        gemini: geminiConfigured,
        turso: tursoConnected,
      },
    },
    timestamp: now,
  });
}
