// Live Simulation Trading & Position Management Engine
// Executes simulated trades against live Bitget market prices and manages SL/TP/fees.

import type { Trade, RegimeReading, PerformanceSnapshot, StrategyType } from './types';

const INITIAL_CAPITAL = 10000;
const FEE_PCT = 0.001; // 0.1% per trade = 0.2% round-trip
const MAX_POSITION_PCT = 0.02; // 2% max portfolio risk per trade
const MAX_HOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

export function getDefaultHistoricalTrades(): Trade[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  return [
    {
      id: 'tr-015',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 66200,
      positionSizePct: 0.02,
      positionSizeUSD: 2248,
      stopLoss: 64800,
      takeProfit: 68500,
      status: 'open',
      openedAt: now - Math.floor(0.2 * day),
      explanation: 'Breakout above 20 EMA with positive funding rate and high on-chain spot inflow.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 74,
      source: 'seed_historical',
    },
    {
      id: 'tr-014',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'mean_reversion',
      entryPrice: 67400,
      positionSizePct: 0.015,
      positionSizeUSD: 1686,
      stopLoss: 68200,
      takeProfit: 65800,
      status: 'open',
      openedAt: now - Math.floor(0.8 * day),
      explanation: 'Overbought 4h RSI divergence rejected at upper Bollinger band resistance.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 68,
      source: 'seed_historical',
    },
    {
      id: 'tr-013',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: 66900,
      exitPrice: 67750,
      positionSizePct: 0.02,
      positionSizeUSD: 2200,
      stopLoss: 67750,
      takeProfit: 65200,
      status: 'closed',
      pnl: -170,
      pnlPct: -0.0127,
      openedAt: now - Math.floor(1.5 * day),
      closedAt: now - Math.floor(1.2 * day),
      explanation: 'Momentum breakdown failed on unexpected ETF inflow surge, hitting trailing stop.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 65,
      source: 'seed_historical',
    },
    {
      id: 'tr-012',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 64900,
      exitPrice: 66150,
      positionSizePct: 0.02,
      positionSizeUSD: 2200,
      stopLoss: 63800,
      takeProfit: 66150,
      status: 'closed',
      pnl: 250,
      pnlPct: 0.0192,
      openedAt: now - Math.floor(2.4 * day),
      closedAt: now - Math.floor(2.1 * day),
      explanation: 'Bullish engulfing candle off 50 SMA support triggered take-profit target.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 72,
      source: 'seed_historical',
    },
    {
      id: 'tr-011',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 65300,
      exitPrice: 66800,
      positionSizePct: 0.02,
      positionSizeUSD: 2150,
      stopLoss: 64100,
      takeProfit: 66800,
      status: 'closed',
      pnl: 310,
      pnlPct: 0.023,
      openedAt: now - Math.floor(3.6 * day),
      closedAt: now - Math.floor(3.1 * day),
      explanation: 'Momentum continuation following positive FOMC rate decision statement.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 78,
      source: 'seed_historical',
    },
    {
      id: 'tr-010',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'mean_reversion',
      entryPrice: 66800,
      exitPrice: 65900,
      positionSizePct: 0.015,
      positionSizeUSD: 1600,
      stopLoss: 67600,
      takeProfit: 65900,
      status: 'closed',
      pnl: 180,
      pnlPct: 0.0135,
      openedAt: now - Math.floor(4.5 * day),
      closedAt: now - Math.floor(4.2 * day),
      explanation: 'Exhaustion at weekly resistance band captured mean reversion cycle.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 62,
      source: 'seed_historical',
    },
    {
      id: 'tr-009',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 64200,
      exitPrice: 63500,
      positionSizePct: 0.02,
      positionSizeUSD: 2100,
      stopLoss: 63500,
      takeProfit: 65800,
      status: 'closed',
      pnl: -140,
      pnlPct: -0.0109,
      openedAt: now - Math.floor(5.8 * day),
      closedAt: now - Math.floor(5.5 * day),
      explanation: 'Fakeout breakout below swing low hit defensive stop loss.',
      regimeAtEntry: 'uncertain',
      regimeConfidence: 54,
      source: 'seed_historical',
    },
    {
      id: 'tr-008',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 63100,
      exitPrice: 64450,
      positionSizePct: 0.02,
      positionSizeUSD: 2050,
      stopLoss: 62100,
      takeProfit: 64450,
      status: 'closed',
      pnl: 270,
      pnlPct: 0.0214,
      openedAt: now - Math.floor(6.9 * day),
      closedAt: now - Math.floor(6.4 * day),
      explanation: 'Whale address net accumulation spike preceded strong directional expansion.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 75,
      source: 'seed_historical',
    },
    {
      id: 'tr-007',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: 64800,
      exitPrice: 65600,
      positionSizePct: 0.015,
      positionSizeUSD: 1550,
      stopLoss: 65600,
      takeProfit: 63200,
      status: 'closed',
      pnl: -110,
      pnlPct: -0.0123,
      openedAt: now - Math.floor(8.0 * day),
      closedAt: now - Math.floor(7.7 * day),
      explanation: 'Short squeezed by institutional buy wall, stopped out at predefined threshold.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 60,
      source: 'seed_historical',
    },
    {
      id: 'tr-006',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 62800,
      exitPrice: 64200,
      positionSizePct: 0.02,
      positionSizeUSD: 2000,
      stopLoss: 61800,
      takeProfit: 64200,
      status: 'closed',
      pnl: 280,
      pnlPct: 0.0223,
      openedAt: now - Math.floor(9.2 * day),
      closedAt: now - Math.floor(8.8 * day),
      explanation: 'Oversold RSI bounce coupled with aggressive taker buy volume.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 69,
      source: 'seed_historical',
    },
    {
      id: 'tr-005',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'mean_reversion',
      entryPrice: 63400,
      exitPrice: 64100,
      positionSizePct: 0.015,
      positionSizeUSD: 1500,
      stopLoss: 62700,
      takeProfit: 64100,
      status: 'closed',
      pnl: 140,
      pnlPct: 0.011,
      openedAt: now - Math.floor(10.5 * day),
      closedAt: now - Math.floor(10.1 * day),
      explanation: 'Channel boundary rebound inside established horizontal trading range.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 66,
      source: 'seed_historical',
    },
    {
      id: 'tr-004',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: 64200,
      exitPrice: 65100,
      positionSizePct: 0.015,
      positionSizeUSD: 1500,
      stopLoss: 65100,
      takeProfit: 62500,
      status: 'closed',
      pnl: -120,
      pnlPct: -0.014,
      openedAt: now - Math.floor(11.8 * day),
      closedAt: now - Math.floor(11.4 * day),
      explanation: 'Downside break invalidation on high volume reclaim of 50-period average.',
      regimeAtEntry: 'uncertain',
      regimeConfidence: 51,
      source: 'seed_historical',
    },
    {
      id: 'tr-003',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 61900,
      exitPrice: 63200,
      positionSizePct: 0.02,
      positionSizeUSD: 1950,
      stopLoss: 60900,
      takeProfit: 63200,
      status: 'closed',
      pnl: 260,
      pnlPct: 0.021,
      openedAt: now - Math.floor(12.9 * day),
      closedAt: now - Math.floor(12.4 * day),
      explanation: 'Re-accumulation phase verified by falling exchange reserve reserves.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 73,
      source: 'seed_historical',
    },
    {
      id: 'tr-002',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: 63800,
      exitPrice: 64650,
      positionSizePct: 0.015,
      positionSizeUSD: 1450,
      stopLoss: 64650,
      takeProfit: 62100,
      status: 'closed',
      pnl: -100,
      pnlPct: -0.0133,
      openedAt: now - Math.floor(13.8 * day),
      closedAt: now - Math.floor(13.5 * day),
      explanation: 'Macro liquidity headline caused immediate short squeeze into stop level.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 58,
      source: 'seed_historical',
    },
    {
      id: 'tr-001',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 62500,
      exitPrice: 63750,
      positionSizePct: 0.02,
      positionSizeUSD: 1900,
      stopLoss: 61500,
      takeProfit: 63750,
      status: 'closed',
      pnl: 250,
      pnlPct: 0.02,
      openedAt: now - Math.floor(14.9 * day),
      closedAt: now - Math.floor(14.4 * day),
      explanation: 'Genesis trade initiated upon bullish MACD cross confirmation.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 70,
      source: 'seed_historical',
    },
  ];
}

export function checkAndClosePositions(
  trades: Trade[],
  currentPrice: number
): { updatedTrades: Trade[]; closedTrades: Trade[] } {
  const now = Date.now();
  const closedTrades: Trade[] = [];

  const updatedTrades = trades.map((trade) => {
    if (trade.status !== 'open') return trade;

    const isLong = trade.side === 'long';
    const hitSL = isLong ? currentPrice <= trade.stopLoss : currentPrice >= trade.stopLoss;
    const hitTP = isLong ? currentPrice >= trade.takeProfit : currentPrice <= trade.takeProfit;
    const timedOut = now - trade.openedAt >= MAX_HOLD_MS;

    if (hitSL || hitTP || timedOut) {
      const exitPrice = hitSL ? trade.stopLoss : hitTP ? trade.takeProfit : currentPrice;
      const grossPnlPct = isLong
        ? (exitPrice - trade.entryPrice) / trade.entryPrice
        : (trade.entryPrice - exitPrice) / trade.entryPrice;

      const feeUSD = trade.positionSizeUSD * FEE_PCT * 2;
      const netPnlUSD = trade.positionSizeUSD * grossPnlPct - feeUSD;
      const netPnlPct = netPnlUSD / trade.positionSizeUSD;

      const closed: Trade = {
        ...trade,
        status: 'closed',
        exitPrice,
        pnl: parseFloat(netPnlUSD.toFixed(2)),
        pnlPct: parseFloat(netPnlPct.toFixed(4)),
        closedAt: now,
      };

      closedTrades.push(closed);
      return closed;
    }

    // Trailing stop update on momentum_long
    if (trade.strategy === 'momentum_long' && isLong) {
      const priorPeak = trade.peakPrice ?? trade.entryPrice;
      const newPeak = Math.max(priorPeak, currentPrice);
      const gainPct = (newPeak - trade.entryPrice) / trade.entryPrice;

      if (gainPct >= 0.015) {
        const trailingSL = newPeak * (1 - 0.010);
        if (trailingSL > trade.stopLoss) {
          return {
            ...trade,
            peakPrice: newPeak,
            stopLoss: parseFloat(trailingSL.toFixed(2)),
          };
        }
      }
    }

    return trade;
  });

  return { updatedTrades, closedTrades };
}

export function evaluateAndExecute(
  trades: Trade[],
  regime: RegimeReading,
  currentPrice: number,
  portfolioValue: number,
  cycleCount: number
): { updatedTrades: Trade[]; newTrade: Trade | null } {
  const openTrades = trades.filter((t) => t.status === 'open');
  const hasOpenLong = openTrades.some((t) => t.side === 'long');
  const hasOpenShort = openTrades.some((t) => t.side === 'short');

  let newTrade: Trade | null = null;
  const now = Date.now();

  // Position sizing based on confidence
  let sizePct = 0.015;
  if (regime.confidence >= 80) sizePct = MAX_POSITION_PCT;
  else if (regime.confidence < 60) sizePct = 0.010;

  const positionSizeUSD = Math.round(portfolioValue * sizePct);

  if (regime.regime === 'bullish_trend' && !hasOpenLong) {
    const sl = parseFloat((currentPrice * (1 - 0.025)).toFixed(2));
    const tp = parseFloat((currentPrice * (1 + 0.060)).toFixed(2));

    newTrade = {
      id: `tr-sim-${Date.now().toString(36)}`,
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: currentPrice,
      positionSizePct: sizePct,
      positionSizeUSD,
      stopLoss: sl,
      takeProfit: tp,
      status: 'open',
      openedAt: now,
      explanation: `Live cycle execution: Fused score +${regime.fusedScore.toFixed(3)} with ${regime.confidence}% conviction. Entering momentum long.`,
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: regime.confidence,
      source: 'live_simulated',
      cycleId: cycleCount,
    };
  } else if (regime.regime === 'bearish_trend' && !hasOpenShort) {
    const sl = parseFloat((currentPrice * (1 + 0.025)).toFixed(2));
    const tp = parseFloat((currentPrice * (1 - 0.060)).toFixed(2));

    newTrade = {
      id: `tr-sim-${Date.now().toString(36)}`,
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: currentPrice,
      positionSizePct: sizePct,
      positionSizeUSD,
      stopLoss: sl,
      takeProfit: tp,
      status: 'open',
      openedAt: now,
      explanation: `Live cycle execution: Fused score ${regime.fusedScore.toFixed(3)} indicates trend reversal. Entering defensive short.`,
      regimeAtEntry: 'bearish_trend',
      regimeConfidence: regime.confidence,
      source: 'live_simulated',
      cycleId: cycleCount,
    };
  }

  const updatedTrades = newTrade ? [newTrade, ...trades] : trades;
  return { updatedTrades, newTrade };
}
