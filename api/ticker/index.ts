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

  // Try reading the live state from Turso to guarantee parity with agent state
  const state = await kvGet('agentState');
  let price = state?.lastPrice || 81470;
  let changePct24h = 0.0216;
  let high24h = price * 1.02;
  let low24h = price * 0.98;
  let volume24h = 28450.8;

  // Attempt fresh Bitget ticker fetch
  try {
    const bitgetRes = await fetch('https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT', {
      headers: { 'Content-Type': 'application/json' },
    });
    if (bitgetRes.ok) {
      const json = await bitgetRes.json();
      const item = json?.data?.[0];
      if (item) {
        if (item.lastPr) price = parseFloat(item.lastPr);
        if (item.change24h) changePct24h = parseFloat(item.change24h);
        if (item.high24h) high24h = parseFloat(item.high24h);
        if (item.low24h) low24h = parseFloat(item.low24h);
        if (item.baseVolume) volume24h = parseFloat(item.baseVolume);
      }
    }
  } catch (err) {
    console.warn('[Ticker API] Bitget live fetch fallback:', err);
  }

  const ticker = {
    symbol: 'BTCUSDT',
    price,
    change24h: price * changePct24h,
    changePct24h,
    high24h,
    low24h,
    volume24h,
    timestamp: now,
  };

  return res.status(200).json({
    success: true,
    data: ticker,
    timestamp: now,
  });
}
