import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  kvGet,
  getDefaultHistoricalTrades,
  computeDetailedPerformance,
  type Trade,
} from '../db';

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

  const now = Date.now();

  try {
    const isEquityCurve = req.url?.includes('equity-curve') || req.query.sub === 'equity-curve';
    if (isEquityCurve) {
      const source = (req.query.source as string) || 'live_simulated';
      if (source === 'seed_historical' || source === 'historical') {
        // Generate historical demo milestones spanning 14 days ($10,000 -> $11,240)
        const pointsCount = req.query.points ? Math.min(Number(req.query.points), 100) : 30;
        const dayMs = 14 * 24 * 60 * 60 * 1000;
        const startMs = now - dayMs;
        const curve: Array<{ timestamp: number; value: number }> = [];

        const milestones = [
          10000, 10080, 10240, 10210, 10390, 10540, 10480, 10620,
          10570, 10760, 10700, 10890, 10830, 11040, 10980, 11160, 11240,
        ];

        for (let i = 0; i < pointsCount; i++) {
          const t = startMs + (i / (pointsCount - 1)) * dayMs;
          const progress = i / (pointsCount - 1);
          const mIndex = progress * (milestones.length - 1);
          const low = Math.floor(mIndex);
          const high = Math.ceil(mIndex);
          const frac = mIndex - low;
          const val = milestones[low] * (1 - frac) + milestones[high] * frac;

          curve.push({
            timestamp: Math.floor(t),
            value: Math.round(val * 100) / 100,
          });
        }

        return res.status(200).json({
          success: true,
          data: curve,
          source: 'seed_historical',
          timestamp: now,
        });
      }

      // Default: live_simulated equity curve
      const storedCurve = await kvGet('liveEquityCurve');
      if (storedCurve && Array.isArray(storedCurve) && storedCurve.length > 0) {
        return res.status(200).json({
          success: true,
          data: storedCurve,
          source: 'live_simulated',
          timestamp: now,
        });
      }

      // If zero live trades have closed yet, return baseline point at starting capital ($10,000)
      const state = await kvGet('agentState');
      return res.status(200).json({
        success: true,
        data: [{ timestamp: state?.startedAt || now, value: 10000 }],
        source: 'live_simulated',
        timestamp: now,
      });
    }

    const isHistory = req.url?.includes('history') || req.query.sub === 'history';
    if (isHistory) {
      const perfHistory = (await kvGet('perfHistory')) || [];
      return res.status(200).json({
        success: true,
        data: perfHistory,
        timestamp: now,
      });
    }

    // Default: Return detailed performance (strictly live_simulated by default)
    const [storedTrades, state] = await Promise.all([
      kvGet('trades'),
      kvGet('agentState'),
    ]);

    let trades: Trade[] = storedTrades || [];
    if (trades.length === 0) {
      trades = getDefaultHistoricalTrades();
    }

    const currentPrice = state?.lastPrice || 0;
    const sourceParam = (req.query.source as string) || 'live_simulated';
    const sourceFilter: 'live_simulated' | 'seed_historical' | 'all' =
      sourceParam === 'seed_historical' || sourceParam === 'historical'
        ? 'seed_historical'
        : sourceParam === 'all'
        ? 'all'
        : 'live_simulated';

    const perf = computeDetailedPerformance(trades, currentPrice, sourceFilter);
    const historicalPerf = computeDetailedPerformance(trades, currentPrice, 'seed_historical');

    return res.status(200).json({
      success: true,
      data: {
        source: sourceFilter,
        timestamp: now,
        portfolioValue: perf.portfolioValue,
        totalPnl: perf.totalPnl,
        totalPnlPct: perf.totalPnlPct,
        sharpeRatio: perf.sharpeRatio,
        winRate: perf.winRate,
        maxDrawdown: perf.maxDrawdown,
        totalTrades: perf.totalTrades,
        openTrades: perf.openTradesCount,
        historicalSummary: {
          portfolioValue: historicalPerf.portfolioValue,
          totalPnl: historicalPerf.totalPnl,
          winRate: historicalPerf.winRate,
          totalTrades: historicalPerf.totalTrades,
        },
      },
      timestamp: now,
    });
  } catch (error: any) {
    console.error('[Performance API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to compute performance',
      timestamp: now,
    });
  }
}
