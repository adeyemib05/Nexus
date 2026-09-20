import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getHistoricalIndicators } from '../db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase().trim();
    const timeframe = String(req.query.timeframe || '1m').toLowerCase().trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || 100), 10) || 100, 5), 200);
    const from = req.query.from ? parseInt(String(req.query.from), 10) : undefined;
    const to = req.query.to ? parseInt(String(req.query.to), 10) : undefined;

    const indicators = await getHistoricalIndicators(symbol, timeframe, limit, from, to);

    return res.status(200).json({
      success: true,
      data: indicators,
      count: indicators.length,
      symbol,
      timeframe,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[Market Indicators API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve indicators',
      timestamp: Date.now(),
    });
  }
}
