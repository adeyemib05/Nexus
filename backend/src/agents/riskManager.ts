import type { StrategyDecision } from '../types';

export interface RiskEvaluation {
  approved: boolean;
  reason: string;
  modifiedDecision?: StrategyDecision;
}

export interface RiskStatus {
  isHalted: boolean;
  haltReason: string | null;
  currentDrawdown: number;
  dailyPnl: number;
  dailyTrades: number;
}

export class RiskManager {
  private initialValue: number;
  private maxDrawdown: number;
  private maxPosPct: number;
  private peakValue: number;
  private currentDrawdown: number;
  private isHalted: boolean;
  private haltReason: string | null;
  private dailyPnl: number;
  private dailyTrades: number;
  private lastResetDay: string;

  constructor() {
    this.initialValue = parseFloat(process.env.INITIAL_PORTFOLIO_USD || '10000');
    this.maxDrawdown = parseFloat(process.env.MAX_DRAWDOWN_LIMIT || '0.10');
    this.maxPosPct = parseFloat(process.env.MAX_POSITION_SIZE_PCT || '0.02');
    this.peakValue = this.initialValue;
    this.currentDrawdown = 0;
    this.isHalted = false;
    this.haltReason = null;
    this.dailyPnl = 0;
    this.dailyTrades = 0;
    this.lastResetDay = new Date().toISOString().split('T')[0];
  }

  private checkDailyReset(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDay) {
      this.dailyPnl = 0;
      this.dailyTrades = 0;
      this.lastResetDay = today;
    }
  }

  /**
   * Runs every risk check, in order, before a StrategyDecision is allowed to execute.
   * newsSentimentShift: the change in the news signal score since the last cycle.
   */
  evaluate(decision: StrategyDecision, currentValue: number, newsSentimentShift: number): RiskEvaluation {
    this.checkDailyReset();

    const safeValue = isNaN(currentValue) || currentValue <= 0 ? this.initialValue : currentValue;

    if (this.isHalted) {
      return { approved: false, reason: this.haltReason! };
    }

    this.currentDrawdown = (this.peakValue - safeValue) / this.peakValue;
    if (this.currentDrawdown > this.maxDrawdown) {
      this.isHalted = true;
      this.haltReason = `Max drawdown exceeded: ${(this.currentDrawdown * 100).toFixed(1)}% > ${(this.maxDrawdown * 100).toFixed(1)}% limit. Agent halted.`;
      return { approved: false, reason: this.haltReason };
    }

    if (decision.strategy === 'capital_protection') {
      return { approved: true, reason: 'Capital protection mode' };
    }

    if (this.dailyTrades >= 10) {
      return { approved: false, reason: 'Daily trade limit (10) reached' };
    }

    // News-spike guard now covers both new longs and new shorts — a sudden
    // sentiment swing is an entry risk regardless of direction.
    const isNewEntry = decision.action === 'buy' || decision.action === 'sell';
    if (Math.abs(newsSentimentShift) > 0.4 && isNewEntry) {
      const modified: StrategyDecision = {
        ...decision,
        positionSizePct: decision.positionSizePct * 0.5,
        reasoning: decision.reasoning + ' [⚠️ News spike — position halved]',
      };
      return { approved: true, reason: 'Approved with reduced size — news volatility', modifiedDecision: modified };
    }

    if (decision.positionSizePct > this.maxPosPct) {
      const modified: StrategyDecision = {
        ...decision,
        positionSizePct: this.maxPosPct,
        reasoning: decision.reasoning + ' [Position capped at max]',
      };
      return { approved: true, reason: 'Approved — position capped at max', modifiedDecision: modified };
    }

    return { approved: true, reason: 'All risk checks passed ✓' };
  }

  recordTrade(pnl: number): void {
    this.dailyPnl += pnl;
    this.dailyTrades++;
    if (this.dailyPnl < -(this.initialValue * 0.05)) {
      this.isHalted = true;
      this.haltReason = `Daily loss limit (5% = $${(this.initialValue * 0.05).toFixed(0)}) reached.`;
    }
  }

  updatePortfolioValue(value: number): void {
    const safeValue = isNaN(value) || value <= 0 ? this.initialValue : value;
    if (safeValue > this.peakValue) this.peakValue = safeValue;
    this.currentDrawdown = (this.peakValue - safeValue) / this.peakValue;
  }

  getStatus(): RiskStatus {
    return {
      isHalted: this.isHalted,
      haltReason: this.haltReason,
      currentDrawdown: this.currentDrawdown,
      dailyPnl: this.dailyPnl,
      dailyTrades: this.dailyTrades,
    };
  }

  reset(): void {
    this.isHalted = false;
    this.haltReason = null;
    this.dailyPnl = 0;
    this.dailyTrades = 0;
    this.peakValue = this.initialValue;
    this.currentDrawdown = 0;
  }

  isRunning(): boolean {
    return !this.isHalted;
  }
}
