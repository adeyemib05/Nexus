import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet } from '../db';
import { getDefaultHistoricalTrades } from '../_lib/tradingEngine';
import { computeTradeStats } from '../_lib/performanceEngine';
import type { Trade } from '../_lib/types';

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
    if (trades.length === 0) {
      trades = getDefaultHistoricalTrades();
    }

    const stats = computeTradeStats(trades);

    return res.status(200).json({
      success: true,
      data: stats,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[Trades Stats API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to compute trade statistics',
      timestamp: Date.now(),
    });
  }
}
