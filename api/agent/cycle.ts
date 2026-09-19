import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet, kvSet } from '../db';
import { fetchTicker, fetchCandles } from '../../lib/marketData';
import { computeTechnicalSignal } from '../../lib/signals/technical';
import { computeSentimentSignal } from '../../lib/signals/sentiment';
import { computeOnchainSignal } from '../../lib/signals/onchain';
import { computeMacroSignal } from '../../lib/signals/macro';
import { computeNewsSignal } from '../../lib/signals/news';
import { fuseSignals } from '../../lib/signalFusion';
import {
  getDefaultHistoricalTrades,
  checkAndClosePositions,
  evaluateAndExecute,
} from '../../lib/tradingEngine';
import { computeDetailedPerformance } from '../../lib/performanceEngine';
import type { Trade } from '../../lib/types';

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
    const now = Date.now();
    const existingState = await kvGet('agentState');

    // 1. Idempotency Gate: if last cycle was < 45 seconds ago, skip immediately
    if (existingState?.lastCycleAt && now - existingState.lastCycleAt < 45000) {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'Idempotency gate: cycle ran less than 45 seconds ago',
        lastCycleAt: existingState.lastCycleAt,
        cycleCount: existingState.cycleCount,
      });
    }

    const previousCount = existingState?.cycleCount ?? 920;
    const nextCycleCount = previousCount + 1;

    // 2. Load and initialize trade ledger
    let storedTrades: Trade[] = (await kvGet('trades')) || [];
    if (storedTrades.length === 0) {
      storedTrades = getDefaultHistoricalTrades();
    }

    // 3. Fetch live market data from Bitget
    const [ticker, candles] = await Promise.all([
      fetchTicker('BTCUSDT'),
      fetchCandles('BTCUSDT', '1h', 100),
    ]);

    const currentPrice = ticker?.price || existingState?.lastPrice || 81500;

    // 4. Run all 5 live signal engines in parallel
    const [technical, sentiment, onchain, macro, news] = await Promise.all([
      computeTechnicalSignal(candles),
      computeSentimentSignal('BTCUSDT'),
      computeOnchainSignal(),
      computeMacroSignal(ticker),
      computeNewsSignal(),
    ]);

    const signals = [technical, macro, sentiment, onchain, news];

    // 5. Signal Fusion & Regime Classification
    const regime = fuseSignals(signals);

    // 6. Check open positions against live BTC price (SL/TP/Timeout)
    const { updatedTrades: afterClose, closedTrades } = checkAndClosePositions(storedTrades, currentPrice);

    // 7. Strategy Evaluation & Simulated Order Execution
    const currentPortfolioValue = existingState?.portfolioValue || 11240;
    const { updatedTrades: finalTrades, newTrade } = evaluateAndExecute(
      afterClose,
      regime,
      currentPrice,
      currentPortfolioValue,
      nextCycleCount
    );

    // 8. Reconcile performance metrics
    const perf = computeDetailedPerformance(finalTrades, currentPrice);

    // 9. Update regime history in Turso (retain last 50 snapshots)
    const storedRegimeHistory = (await kvGet('regimeHistory')) || [];
    const updatedRegimeHistory = [
      {
        cycleId: nextCycleCount,
        regime: regime.regime,
        confidence: regime.confidence,
        fusedScore: regime.fusedScore,
        signals,
        timestamp: now,
        price: currentPrice,
      },
      ...storedRegimeHistory,
    ].slice(0, 50);

    // 10. Update equity curve in Turso
    const storedEquityCurve = (await kvGet('equityCurve')) || [];
    const updatedEquityCurve = [
      ...storedEquityCurve,
      { timestamp: now, value: perf.portfolioValue },
    ].slice(-100);

    // 11. Compile full agent state
    const updatedState = {
      status: 'running',
      cycleCount: nextCycleCount,
      portfolioValue: perf.portfolioValue,
      initialPortfolioValue: 10000,
      currentDrawdown: perf.currentDrawdown,
      lastCycleAt: now,
      lastPrice: currentPrice,
      startedAt: existingState?.startedAt ?? (now - 14 * 24 * 60 * 60 * 1000),
      currentRegime: regime,
      performance: {
        portfolioValue: perf.portfolioValue,
        totalPnl: perf.totalPnl,
        totalPnlPct: perf.totalPnlPct,
        sharpeRatio: perf.sharpeRatio,
        winRate: perf.winRate,
        maxDrawdown: perf.maxDrawdown,
      },
    };

    // 12. Persist updated telemetry to Turso SQLite
    await Promise.all([
      kvSet('agentState', updatedState),
      kvSet('trades', finalTrades),
      kvSet('regimeHistory', updatedRegimeHistory),
      kvSet('equityCurve', updatedEquityCurve),
    ]);

    // 13. Return rich execution summary
    return res.status(200).json({
      success: true,
      cycleCount: nextCycleCount,
      price: currentPrice,
      regime: regime.regime,
      confidence: regime.confidence,
      fusedScore: regime.fusedScore,
      signals: signals.map((s) => ({
        type: s.type,
        score: s.score,
        strength: s.strength,
        confidence: s.confidence,
      })),
      tradesCount: finalTrades.length,
      newTrade: newTrade ? { id: newTrade.id, side: newTrade.side, strategy: newTrade.strategy } : null,
      closedTradesCount: closedTrades.length,
      portfolioValue: perf.portfolioValue,
      timestamp: now,
    });
  } catch (error: any) {
    console.error('[NEXUS Agent Cycle] Execution error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Agent cycle execution failed',
      timestamp: Date.now(),
    });
  }
}
