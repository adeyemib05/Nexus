import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet, kvSet, type TradeSide, type StrategyType, type MarketRegime } from '../db';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function fetchBitgetCandles(symbol: string, granularity: string, limit = 150): Promise<Candle[]> {
  try {
    const url = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const rows: any[] = json?.data || [];
    return rows.map((r) => ({
      timestamp: parseInt(r[0], 10),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5] || r[6] || '0'),
    })).sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.warn('[Backtest] Candle fetch warning:', err);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const now = Date.now();

  // If GET request, return stored backtest results history
  if (req.method === 'GET') {
    try {
      const results = (await kvGet('backtestResults')) || [];
      return res.status(200).json({
        success: true,
        data: results,
        timestamp: now,
      });
    } catch (err: any) {
      return res.status(200).json({ success: true, data: [], timestamp: now });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET or POST.',
      timestamp: now,
    });
  }

  try {
    const body = req.body || {};
    const symbol = body.symbol || 'BTCUSDT';
    const granularity = body.granularity || '1h';
    const days = Math.min(parseInt(body.days, 10) || 30, 90);

    let candles: Candle[] = await fetchBitgetCandles(symbol, granularity, 200);

    if (candles.length < WINDOW_SIZE + 5) {
      return res.status(400).json({
        success: false,
        error: `Insufficient historical candle data for ${symbol} (${candles.length} candles).`,
        timestamp: now,
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
      const currentTimestamp = currentCandle.timestamp;

      // Compute technical indicators over sliding window
      const closes = window.map((c) => c.close);
      const ema20Arr = calculateEMA(closes, 20);
      const ema50Arr = calculateEMA(closes, 50);
      const ema20 = ema20Arr[ema20Arr.length - 1];
      const ema50 = ema50Arr[ema50Arr.length - 1];
      const rsi = calculateRSI(closes, 14);

      let techScore = 0;
      if (ema20 > ema50) techScore += 0.4;
      else techScore -= 0.4;

      if (rsi > 55) techScore += 0.3;
      else if (rsi < 45) techScore -= 0.3;

      let currentRegime: MarketRegime = 'ranging';
      if (techScore > BACKTEST_REGIME_THRESHOLD) currentRegime = 'bullish_trend';
      else if (techScore < -BACKTEST_REGIME_THRESHOLD) currentRegime = 'bearish_trend';
      else currentRegime = 'ranging';

      regimeDistribution[currentRegime]++;

      // Manage open position
      if (openPosition) {
        const isLong = openPosition.side === 'long';
        const hitSL = isLong
          ? currentCandle.low <= openPosition.stopLoss
          : currentCandle.high >= openPosition.stopLoss;
        const hitTP = isLong
          ? currentCandle.high >= openPosition.takeProfit
          : currentCandle.low <= openPosition.takeProfit;
        const timedOut = currentTimestamp - openPosition.entryTimestamp >= MAX_HOLD_MS;

        if (hitSL || hitTP || timedOut) {
          const exitPrice = hitSL
            ? openPosition.stopLoss
            : hitTP
            ? openPosition.takeProfit
            : currentPrice;

          const grossReturn = isLong
            ? (exitPrice - openPosition.entryPrice) / openPosition.entryPrice
            : (openPosition.entryPrice - exitPrice) / openPosition.entryPrice;

          const feeDeduction = openPosition.positionSizeUSD * FEE_PCT * 2;
          const netPnlUSD = openPosition.positionSizeUSD * grossReturn - feeDeduction;
          const netPnlPct = netPnlUSD / openPosition.positionSizeUSD;

          portfolioValue += netPnlUSD;
          if (portfolioValue > peakValue) peakValue = portfolioValue;
          const dd = (peakValue - portfolioValue) / peakValue;
          if (dd > maxDrawdown) maxDrawdown = dd;

          closedTrades.push({
            entryTimestamp: openPosition.entryTimestamp,
            exitTimestamp: currentTimestamp,
            side: openPosition.side,
            strategy: openPosition.strategy,
            regime: openPosition.regime,
            entryPrice: openPosition.entryPrice,
            exitPrice,
            pnl: parseFloat(netPnlUSD.toFixed(2)),
            pnlPct: parseFloat(netPnlPct.toFixed(4)),
          });

          openPosition = null;
        }
      }

      // Enter new position if flat
      if (!openPosition) {
        const posSizeUSD = portfolioValue * 0.02; // 2% risk sizing

        if (currentRegime === 'bullish_trend') {
          openPosition = {
            side: 'long',
            strategy: 'momentum_long',
            regime: 'bullish_trend',
            entryPrice,
            entryTimestamp: currentTimestamp,
            stopLoss: currentPrice * 0.975,
            takeProfit: currentPrice * 1.050,
            positionSizeUSD: posSizeUSD,
          };
        } else if (currentRegime === 'bearish_trend') {
          openPosition = {
            side: 'short',
            strategy: 'momentum_short',
            regime: 'bearish_trend',
            entryPrice,
            entryTimestamp: currentTimestamp,
            stopLoss: currentPrice * 1.025,
            takeProfit: currentPrice * 0.950,
            positionSizeUSD: posSizeUSD,
          };
        }
      }

      equityCurve.push({
        timestamp: currentTimestamp,
        value: parseFloat(portfolioValue.toFixed(2)),
      });
    }

    // Performance statistics
    const winningTrades = closedTrades.filter((t) => t.pnl > 0);
    const losingTrades = closedTrades.filter((t) => t.pnl < 0);
    const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;
    const totalPnl = portfolioValue - initialCapital;
    const totalPnlPct = totalPnl / initialCapital;

    const grossWin = winningTrades.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;

    // Daily Sharpe Ratio from equity curve returns
    const dailyReturns: number[] = [];
    const sampleStep = Math.max(1, Math.floor(equityCurve.length / Math.min(days, 60)));
    for (let i = sampleStep; i < equityCurve.length; i += sampleStep) {
      const prev = equityCurve[i - sampleStep].value;
      const curr = equityCurve[i].value;
      if (prev > 0) dailyReturns.push((curr - prev) / prev);
    }

    let sharpeRatio: number | null = null;
    if (dailyReturns.length >= 5) {
      const meanReturn = average(dailyReturns);
      const variance = average(dailyReturns.map((r) => Math.pow(r - meanReturn, 2)));
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) {
        sharpeRatio = parseFloat(((meanReturn / stdDev) * Math.sqrt(365)).toFixed(2));
      }
    }

    const result = {
      id: `bt-${Date.now()}`,
      symbol,
      granularity,
      days,
      initialCapital,
      finalCapital: parseFloat(portfolioValue.toFixed(2)),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      totalPnlPct: parseFloat(totalPnlPct.toFixed(4)),
      winRate: parseFloat(winRate.toFixed(4)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
      sharpeRatio,
      totalTrades: closedTrades.length,
      winningTradesCount: winningTrades.length,
      losingTradesCount: losingTrades.length,
      regimeDistribution,
      trades: closedTrades.slice(-20),
      equityCurve: equityCurve.filter((_, idx) => idx % Math.max(1, Math.floor(equityCurve.length / 50)) === 0),
      timestamp: now,
    };

    // Store in Turso
    try {
      const pastResults = (await kvGet('backtestResults')) || [];
      await kvSet('backtestResults', [result, ...pastResults.slice(0, 9)]);
    } catch (saveErr) {
      console.warn('[Backtest API] Result cache notice:', saveErr);
    }

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: now,
    });
  } catch (err: any) {
    console.error('[Backtest API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Backtest execution failed',
      timestamp: now,
    });
  }
}
