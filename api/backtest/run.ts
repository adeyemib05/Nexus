import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchHistoricalCandles, fetchCandles, type Candle } from '../lib/marketData';
import { computeTechnicalSignal } from '../lib/signals/technical';
import { average } from '../lib/types';
import type { TradeSide, StrategyType, MarketRegime } from '../lib/types';

interface SimulatedPosition {
  side: TradeSide;
  strategy: StrategyType;
  regime: MarketRegime;
  entryPrice: number;
  entryTimestamp: number;
  stopLoss: number;
  takeProfit: number;
  positionSizeUSD: number;
}

interface BacktestTrade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: TradeSide;
  strategy: StrategyType;
  regime: MarketRegime;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
}

const BACKTEST_REGIME_THRESHOLD = 0.12;
const WINDOW_SIZE = 50;
const MAX_HOLD_MS = 48 * 3600 * 1000;
const FEE_PCT = 0.001; // 0.1% per side

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
      timestamp: Date.now(),
    });
  }

  try {
    const body = req.body || {};
    const symbol = body.symbol || 'BTCUSDT';
    const granularity = body.granularity || '1H';
    const days = Math.min(parseInt(body.days, 10) || 30, 90);

    const endTime = Date.now();
    const startTime = endTime - days * 24 * 60 * 60 * 1000;

    let candles: Candle[] = await fetchHistoricalCandles(symbol, granularity, startTime, endTime);

    // If historical fetch returned fewer candles, fallback to recent 100 candles
    if (candles.length < WINDOW_SIZE + 10) {
      candles = await fetchCandles(symbol, granularity, 150);
    }

    if (candles.length < WINDOW_SIZE + 5) {
      return res.status(400).json({
        success: false,
        error: `Insufficient historical candle data for ${symbol} (${candles.length} candles). Please select a shorter period or different granularity.`,
        timestamp: Date.now(),
      });
    }

    // ── Simulation State ───────────────────────────────────────────────────────
    const initialCapital = 10000;
    let portfolioValue = initialCapital;
    let peakValue = initialCapital;
    let maxDrawdown = 0;
    let openPosition: SimulatedPosition | null = null;
    const closedTrades: BacktestTrade[] = [];
    const equityCurve: Array<{ timestamp: number; value: number }> = [];

    const regimeDistribution: Record<MarketRegime, number> = {
      bullish_trend: 0,
      bearish_trend: 0,
      ranging: 0,
      uncertain: 0,
    };

    // ── Sliding Window Simulation ──────────────────────────────────────────────
    for (let i = WINDOW_SIZE; i < candles.length; i++) {
      const window = candles.slice(i - WINDOW_SIZE, i);
      const currentCandle = candles[i];
      const currentPrice = currentCandle.close;

      // 1. Evaluate open position for SL / TP / timeout
      if (openPosition !== null) {
        const isLong = openPosition.side === 'long';
        const hitSL = isLong ? currentPrice <= openPosition.stopLoss : currentPrice >= openPosition.stopLoss;
        const hitTP = isLong ? currentPrice >= openPosition.takeProfit : currentPrice <= openPosition.takeProfit;
        const timedOut = currentCandle.timestamp - openPosition.entryTimestamp > MAX_HOLD_MS;

        if (hitSL || hitTP || timedOut) {
          const exitPrice = hitSL ? openPosition.stopLoss : hitTP ? openPosition.takeProfit : currentPrice;
          const grossPnlPct = isLong
            ? (exitPrice - openPosition.entryPrice) / openPosition.entryPrice
            : (openPosition.entryPrice - exitPrice) / openPosition.entryPrice;

          const feeUSD = openPosition.positionSizeUSD * FEE_PCT * 2;
          const pnlUSD = openPosition.positionSizeUSD * grossPnlPct - feeUSD;
          const pnlPct = pnlUSD / openPosition.positionSizeUSD;
          portfolioValue += pnlUSD;

          closedTrades.push({
            entryTimestamp: openPosition.entryTimestamp,
            exitTimestamp: currentCandle.timestamp,
            side: openPosition.side,
            strategy: openPosition.strategy,
            regime: openPosition.regime,
            entryPrice: openPosition.entryPrice,
            exitPrice,
            pnl: parseFloat(pnlUSD.toFixed(2)),
            pnlPct: parseFloat(pnlPct.toFixed(4)),
          });

          openPosition = null;

          if (portfolioValue > peakValue) peakValue = portfolioValue;
          const dd = (peakValue - portfolioValue) / peakValue;
          if (dd > maxDrawdown) maxDrawdown = dd;
        }
      }

      // 2. Evaluate strategy entry when flat
      if (openPosition === null) {
        const techSignal = computeTechnicalSignal(window);

        let regime: MarketRegime;
        if (techSignal.score > BACKTEST_REGIME_THRESHOLD) regime = 'bullish_trend';
        else if (techSignal.score < -BACKTEST_REGIME_THRESHOLD) regime = 'bearish_trend';
        else if (Math.abs(techSignal.score) > 0.05) regime = 'ranging';
        else regime = 'uncertain';

        regimeDistribution[regime]++;

        if (regime === 'bullish_trend') {
          const posSize = portfolioValue * 0.02;
          openPosition = {
            side: 'long',
            strategy: 'momentum_long',
            regime,
            entryPrice: currentPrice,
            entryTimestamp: currentCandle.timestamp,
            stopLoss: currentPrice * (1 - 0.025),
            takeProfit: currentPrice * (1 + 0.060),
            positionSizeUSD: posSize,
          };
        } else if (regime === 'bearish_trend') {
          const posSize = portfolioValue * 0.02;
          openPosition = {
            side: 'short',
            strategy: 'momentum_short',
            regime,
            entryPrice: currentPrice,
            entryTimestamp: currentCandle.timestamp,
            stopLoss: currentPrice * (1 + 0.025),
            takeProfit: currentPrice * (1 - 0.060),
            positionSizeUSD: posSize,
          };
        }
      }

      // Record equity curve every 5 candles
      if (i % 5 === 0) {
        const unrealized = openPosition
          ? ((currentPrice - openPosition.entryPrice) / openPosition.entryPrice) *
            openPosition.positionSizeUSD *
            (openPosition.side === 'long' ? 1 : -1)
          : 0;
        equityCurve.push({
          timestamp: currentCandle.timestamp,
          value: parseFloat((portfolioValue + unrealized).toFixed(2)),
        });
      }
    }

    // ── Final Metric Compilation ───────────────────────────────────────────────
    const totalReturn = portfolioValue - initialCapital;
    const totalReturnPct = totalReturn / initialCapital;

    const winningTrades = closedTrades.filter((t) => t.pnl > 0);
    const losingTrades = closedTrades.filter((t) => t.pnl < 0);
    const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;

    const grossWins = winningTrades.reduce((s, t) => s + t.pnl, 0);
    const grossLosses = Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0;

    let sharpeRatio = 0;
    const returns = closedTrades.map((t) => t.pnlPct);
    if (returns.length >= 2) {
      const meanReturn = average(returns);
      const stdReturn = Math.sqrt(average(returns.map((r) => Math.pow(r - meanReturn, 2))));
      if (stdReturn > 0) {
        sharpeRatio = (meanReturn / stdReturn) * Math.sqrt(365);
      }
    }

    const result = {
      id: `bt-${Date.now().toString(36)}`,
      symbol,
      granularity,
      periodDays: days,
      startDate: candles[0].timestamp,
      endDate: candles[candles.length - 1].timestamp,
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      totalReturnPct: parseFloat(totalReturnPct.toFixed(4)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      winRate: parseFloat(winRate.toFixed(4)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
      totalTrades: closedTrades.length,
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      trades: closedTrades.slice(-20), // return last 20 for log
      equityCurve: equityCurve.slice(-40),
      regimeDistribution,
      createdAt: Date.now(),
    };

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[Backtest API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Backtest simulation failed',
      timestamp: Date.now(),
    });
  }
}
