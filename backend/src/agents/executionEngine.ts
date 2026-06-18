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
      // Sim order log only — no real funds ever move
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

  async checkAndClosePositions(currentPrice: number): Promise<void> {
    const openTrades = this.db.getOpenTrades();

    for (const trade of openTrades) {
      const hitSL = trade.side === 'long' ? currentPrice <= trade.stopLoss : currentPrice >= trade.stopLoss;
      const hitTP = trade.side === 'long' ? currentPrice >= trade.takeProfit : currentPrice <= trade.takeProfit;
      const timedOut = Date.now() - trade.openedAt > 48 * 3600 * 1000;

      if (hitSL || hitTP || timedOut) {
        const exitPrice = hitSL ? trade.stopLoss : hitTP ? trade.takeProfit : currentPrice;
        const reason = hitSL ? 'stop_loss' : hitTP ? 'take_profit' : 'timeout_48h';

        const pnlUSD =
          trade.side === 'long'
            ? ((exitPrice - trade.entryPrice) / trade.entryPrice) * trade.positionSizeUSD
            : ((trade.entryPrice - exitPrice) / trade.entryPrice) * trade.positionSizeUSD;
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
          `       PnL: ${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)} (${(pnlPct * 100).toFixed(2)}%) [${reason}]`
        );
      }
    }
  }

  async closeAllPositions(currentPrice: number, reason: string): Promise<void> {
    console.log(`[EXEC] 🛑 Closing all positions: ${reason}`);
    const openTrades = this.db.getOpenTrades();

    for (const trade of openTrades) {
      const pnlUSD =
        trade.side === 'long'
          ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * trade.positionSizeUSD
          : ((trade.entryPrice - currentPrice) / trade.entryPrice) * trade.positionSizeUSD;
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
