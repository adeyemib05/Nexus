import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet } from '../db';

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
    const signal = typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'
      ? (AbortSignal as any).timeout(3000)
      : undefined;
    const bitgetRes = await fetch('https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT', { signal });
    bitgetApiReachable = bitgetRes.ok;
  } catch {
    bitgetApiReachable = false;
  }

  // 2. Check Qwen API configuration & reachability
  const qwenKey = process.env.QWEN_API_KEY || '';
  const qwenBase = process.env.QWEN_BASE_URL || 'https://hackathon.bitgetops.com/v1';
  const qwenConfigured = !!(qwenKey && !qwenKey.includes('YOUR') && qwenKey.length > 10);
  let qwenState: 'configured' | 'healthy' | 'rate_limited' | 'unreachable' | 'not_configured' = qwenConfigured ? 'configured' : 'not_configured';

  if (qwenConfigured) {
    try {
      const probeSignal = typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'
        ? (AbortSignal as any).timeout(2500)
        : undefined;
      const qwenRes = await fetch(`${qwenBase}/models`, {
        headers: { Authorization: `Bearer ${qwenKey}` },
        signal: probeSignal,
      });
      if (qwenRes.ok) {
        qwenState = 'healthy';
      } else if (qwenRes.status === 429) {
        qwenState = 'rate_limited';
      } else {
        qwenState = 'unreachable';
      }
    } catch {
      qwenState = 'unreachable';
    }
  }

  // 3. Check Groq API configuration & reachability
  const groqKey = process.env.GROQ_API_KEY || '';
  const groqConfigured = !!(groqKey && !groqKey.includes('YOUR') && groqKey.length > 10);
  let groqState: 'configured' | 'healthy' | 'rate_limited' | 'unreachable' | 'not_configured' = groqConfigured ? 'configured' : 'not_configured';

  if (groqConfigured) {
    try {
      const probeSignal = typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'
        ? (AbortSignal as any).timeout(2000)
        : undefined;
      const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${groqKey}` },
        signal: probeSignal,
      });
      if (groqRes.ok) {
        groqState = 'healthy';
      } else if (groqRes.status === 429) {
        groqState = 'rate_limited';
      } else {
        groqState = 'unreachable';
      }
    } catch {
      groqState = 'unreachable';
    }
  }

  // 4. Check Gemini API configuration
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const geminiConfigured = !!(geminiKey && !geminiKey.includes('YOUR') && geminiKey.length > 10);

  // 5. Probe Turso DB connectivity
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
        qwen: qwenState === 'healthy',
        qwenState,
        groq: groqState === 'healthy',
        groqState,
        gemini: geminiConfigured,
        turso: tursoConnected,
      },
    },
    timestamp: now,
  });
}
