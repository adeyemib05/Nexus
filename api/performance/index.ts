import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet } from '../db';
import { getDefaultHistoricalTrades, computeDetailedPerformance, type Trade } from '../engine';

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
    const [storedTrades, state] = await Promise.all([
      kvGet('trades'),
      kvGet('agentState'),
    ]);

    let trades: Trade[] = storedTrades || [];
    if (trades.length === 0) {
      trades = getDefaultHistoricalTrades();
    }

    const currentPrice = state?.lastPrice || 81500;
    const perf = computeDetailedPerformance(trades, currentPrice);

    return res.status(200).json({
      success: true,
      data: {
        timestamp: Date.now(),
        portfolioValue: perf.portfolioValue,
        totalPnl: perf.totalPnl,
        totalPnlPct: perf.totalPnlPct,
        sharpeRatio: perf.sharpeRatio,
        winRate: perf.winRate,
        maxDrawdown: perf.maxDrawdown,
        totalTrades: trades.length,
        openTrades: perf.openTradesCount,
      },
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('[Performance API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to compute performance',
      timestamp: Date.now(),
    });
  }
}
