import { v4 as uuidv4 } from 'uuid';
import type { BitgetRESTClient } from '../services/bitgetREST';
import type { NexusDB } from './database';
import type { Trade, StrategyDecision, TradeSide } from '../types';

export class ExecutionEngine {
  private portfolioValue: number;
  private initialValue: number;
  private lastPrice = 0;

  constructor(
    private bitgetREST: BitgetRESTClient,
    private db: NexusDB
  ) {
    this.portfolioValue = parseFloat(process.env.INITIAL_PORTFOLIO_USD || '10000');
    this.initialValue = this.portfolioValue;
  }

  async openPosition(decision: StrategyDecision, currentPrice: number, explanation: string): Promise<Trade | null> {
    if (decision.positionSizePct <= 0) return null;

    const side: TradeSide = decision.action === 'buy' ? 'long' : 'short';
    const positionUSD = this.portfolioValue * decision.positionSizePct;

    const stopLoss =
      side === 'long' ? currentPrice * (1 - decision.stopLossPct) : currentPrice * (1 + decision.stopLossPct);
    const takeProfit =
      side === 'long' ? currentPrice * (1 + decision.takeProfitPct) : currentPrice * (1 - decision.takeProfitPct);

    const trade: Trade = {
      id: uuidv4(),
      symbol: decision.symbol,
      side,
      strategy: decision.strategy,
      entryPrice: currentPrice,
      positionSizePct: decision.positionSizePct,
      positionSizeUSD: positionUSD,
      stopLoss,
      takeProfit,
      status: 'open',
      openedAt: Date.now(),
      explanation,
      regimeAtEntry: decision.regime.regime,
      regimeConfidence: decision.regime.confidence,
    };

    this.db.saveTrade(trade);

    try {
      await this.bitgetREST.placeSimOrder({
        symbol: decision.symbol,
        side: side === 'long' ? 'buy' : 'sell',
        size: positionUSD,
        price: currentPrice,
      });
    } catch {
      // Best-effort logging only — never block a trade record on this
    }

    console.log(`[EXEC] ✅ Opened ${side.toUpperCase()} ${decision.symbol} @ $${currentPrice.toFixed(2)}`);
    console.log(
      `       SL: $${stopLoss.toFixed(2)} | TP: $${takeProfit.toFixed(2)} | Size: $${positionUSD.toFixed(2)}`
    );

    return trade;
  }

  /**
   * Checks every open position against trailing stop logic (momentum_long only),
   * fixed SL/TP (everything else), and the 48h timeout — then closes anything
   * that's hit, with realistic trading fees deducted from PnL.
   */
  async checkAndClosePositions(currentPrice: number): Promise<void> {
    const openTrades = this.db.getOpenTrades();

    const TRAIL_ACTIVATION_PCT = parseFloat(process.env.TRAILING_STOP_ACTIVATION_PCT || '0.015');
    const TRAIL_DISTANCE_PCT = parseFloat(process.env.TRAILING_STOP_DISTANCE_PCT || '0.01');
    const TP_EXTENSION_PCT = parseFloat(process.env.TAKE_PROFIT_EXTENSION_PCT || '0.02');
    // Bitget spot taker fee is ~0.1% per side; 0.001 here means 0.2% round-trip
    const FEE_PCT = parseFloat(process.env.TRADING_FEE_PCT || '0.001');

    for (const trade of openTrades) {
      let effectiveStopLoss = trade.stopLoss;
      let effectiveTakeProfit = trade.takeProfit;
      let trailingActive = false;

      // Trailing stop + take-profit extension — momentum_long only. Mean-reversion
      // trades target the range midpoint and exit there by design; trailing
      // doesn't fit that logic.
      if (trade.strategy === 'momentum_long') {
        const priorPeak = trade.peakPrice ?? trade.entryPrice;
        const newPeak =
          trade.side === 'long' ? Math.max(priorPeak, currentPrice) : Math.min(priorPeak, currentPrice);

        const gainFromEntry =
          trade.side === 'long'
            ? (newPeak - trade.entryPrice) / trade.entryPrice
            : (trade.entryPrice - newPeak) / trade.entryPrice;

        trailingActive = gainFromEntry >= TRAIL_ACTIVATION_PCT;

        const dbUpdates: Partial<Trade> = {};
        if (newPeak !== priorPeak) dbUpdates.peakPrice = newPeak;

        if (trailingActive) {
          const candidateStop =
            trade.side === 'long' ? newPeak * (1 - TRAIL_DISTANCE_PCT) : newPeak * (1 + TRAIL_DISTANCE_PCT);
          const stopImproves =
            trade.side === 'long' ? candidateStop > effectiveStopLoss : candidateStop < effectiveStopLoss;

          if (stopImproves) {
            console.log(
              `[EXEC] 🔒 Trailing stop raised for ${trade.symbol}: $${effectiveStopLoss.toFixed(2)} → $${candidateStop.toFixed(2)} (peak $${newPeak.toFixed(2)})`
            );
            effectiveStopLoss = candidateStop;
            dbUpdates.stopLoss = candidateStop;
          }

          // Let the ceiling extend too — otherwise the fixed take-profit caps
          // upside even while the trailing stop is successfully protecting gains.
          const candidateTP =
            trade.side === 'long' ? newPeak * (1 + TP_EXTENSION_PCT) : newPeak * (1 - TP_EXTENSION_PCT);
          const tpImproves =
            trade.side === 'long' ? candidateTP > effectiveTakeProfit : candidateTP < effectiveTakeProfit;

          if (tpImproves) {
            console.log(
              `[EXEC] 🎯 Take-profit extended for ${trade.symbol}: $${effectiveTakeProfit.toFixed(2)} → $${candidateTP.toFixed(2)}`
            );
            effectiveTakeProfit = candidateTP;
            dbUpdates.takeProfit = candidateTP;
          }
        }

        if (Object.keys(dbUpdates).length > 0) {
          this.db.updateTrade(trade.id, dbUpdates);
        }
      }

      const hitSL = trade.side === 'long' ? currentPrice <= effectiveStopLoss : currentPrice >= effectiveStopLoss;
      const hitTP = trade.side === 'long' ? currentPrice >= effectiveTakeProfit : currentPrice <= effectiveTakeProfit;
      const timedOut = Date.now() - trade.openedAt > 48 * 3600 * 1000;

      if (hitSL || hitTP || timedOut) {
        const exitPrice = hitSL ? effectiveStopLoss : hitTP ? effectiveTakeProfit : currentPrice;
        const reason = hitSL ? (trailingActive ? 'trailing_stop' : 'stop_loss') : hitTP ? 'take_profit' : 'timeout_48h';

        const grossPnlUSD =
          trade.side === 'long'
            ? ((exitPrice - trade.entryPrice) / trade.entryPrice) * trade.positionSizeUSD
            : ((trade.entryPrice - exitPrice) / trade.entryPrice) * trade.positionSizeUSD;
        const feeUSD = trade.positionSizeUSD * FEE_PCT * 2; // entry + exit
        const pnlUSD = grossPnlUSD - feeUSD;
        const pnlPct = pnlUSD / trade.positionSizeUSD;

        this.db.updateTrade(trade.id, {
          status: 'closed',
          exitPrice,
          pnl: parseFloat(pnlUSD.toFixed(4)),
          pnlPct: parseFloat(pnlPct.toFixed(6)),
          closedAt: Date.now(),
        });

        console.log(`[EXEC] 🔴 Closed ${trade.side.toUpperCase()} @ $${exitPrice.toFixed(2)}`);
        console.log(
          `       PnL: ${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)} (${(pnlPct * 100).toFixed(2)}%) [${reason}, fees: $${feeUSD.toFixed(2)}]`
        );
      }
    }
  }

  async closeAllPositions(currentPrice: number, reason: string): Promise<void> {
    console.log(`[EXEC] 🛑 Closing all positions: ${reason}`);
    const openTrades = this.db.getOpenTrades();
    const FEE_PCT = parseFloat(process.env.TRADING_FEE_PCT || '0.001');

    for (const trade of openTrades) {
      const grossPnlUSD =
        trade.side === 'long'
          ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * trade.positionSizeUSD
          : ((trade.entryPrice - currentPrice) / trade.entryPrice) * trade.positionSizeUSD;
      const feeUSD = trade.positionSizeUSD * FEE_PCT * 2;
      const pnlUSD = grossPnlUSD - feeUSD;
      const pnlPct = pnlUSD / trade.positionSizeUSD;

      this.db.updateTrade(trade.id, {
        status: 'closed',
        exitPrice: currentPrice,
        pnl: parseFloat(pnlUSD.toFixed(4)),
        pnlPct: parseFloat(pnlPct.toFixed(6)),
        closedAt: Date.now(),
      });
    }
  }

  updatePortfolioValue(trades: Trade[]): number {
    const closedPnl = trades.filter((t) => t.status === 'closed').reduce((s, t) => s + (t.pnl || 0), 0);
    const openTrades = this.db.getOpenTrades();
    const openUnrealized = openTrades.reduce((s, t) => {
      if (!this.lastPrice || this.lastPrice <= 0) return s;
      return s + ((this.lastPrice - t.entryPrice) / t.entryPrice) * t.positionSizeUSD;
    }, 0);
    this.portfolioValue = this.initialValue + closedPnl + openUnrealized;
    return Math.max(0, this.portfolioValue);
  }

  setLastPrice(price: number): void {
    this.lastPrice = price;
  }

  getPortfolioValue(): number {
    return this.portfolioValue;
  }
}
