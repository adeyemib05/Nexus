import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const now = Date.now();
  const ticker = {
    symbol: 'BTCUSDT',
    price: 67180.5,
    change24h: 1420.5,
    changePct24h: 0.0216,
    high24h: 68050.0,
    low24h: 65420.0,
    volume24h: 28450.8,
    timestamp: now,
  };

  return res.status(200).json({
    success: true,
    data: ticker,
    timestamp: now,
  });
}
