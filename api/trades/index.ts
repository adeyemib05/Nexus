import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet, kvSet } from '../db';
import { getDefaultHistoricalTrades, type Trade } from '../engine';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.',
      timestamp: Date.now(),
    });
  }

  try {
    let trades: Trade[] = (await kvGet('trades')) || [];

    // If no trades stored yet in Turso, initialize with the verified historical baseline
    if (trades.length === 0) {
      trades = getDefaultHistoricalTrades();
      await kvSet('trades', trades);
    }

    const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const statusParam = req.query.status as string | undefined;

    let filtered = trades;
    if (statusParam) {
      filtered = filtered.filter((t) => t.status === statusParam);
    }

    if (limitParam && limitParam > 0) {
      filtered = filtered.slice(0, limitParam);
    }

    return res.status(200).json({
      success: true,
      data: filtered,
      count: filtered.length,
      total: trades.length,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[Trades API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch trades',
      timestamp: Date.now(),
    });
  }
}
