import type { BitgetRESTClient } from '../services/bitgetREST';
import type { BitgetWebSocket } from '../services/bitgetWS';
import type { AgentHubClient } from '../services/agentHubClient';
import type { NexusDB } from './database';
import type { RiskManager } from './riskManager';
import type { StrategyRouter } from './strategyRouter';
import type { ExecutionEngine } from './executionEngine';
import type { NLExplainer } from './nlExplainer';
import { computeRegime } from '../signals/signalFusion';
import { generateMockTicker, generateMockCandles } from '../services/mockData';
import { average, clamp } from '../types/helpers';
import type { AgentStatus, AgentEvent, AgentState, Candle, PerformanceSnapshot, Trade } from '../types';

export class AgentCycle {
  private status: AgentStatus = 'idle';
  private cycleCount = 0;
  private lastCycleAt: number | null = null;
  private startedAt: number | null = null;
  private haltReason: string | null = null;
  private portfolioValue: number;
  private initialValue: number;
  private intervalId: NodeJS.Timeout | null = null;
  private eventListeners = new Set<(e: AgentEvent) => void>();
  private cachedCandles: Candle[] = [];
  private lastNewsSentiment = 0;

  constructor(
    private bitgetREST: BitgetRESTClient,
    private bitgetWS: BitgetWebSocket,
    private riskManager: RiskManager,
    private strategyRouter: StrategyRouter,
    private executionEngine: ExecutionEngine,
    private nlExplainer: NLExplainer,
    private hubClient: AgentHubClient,
    private db: NexusDB
  ) {
    this.portfolioValue = parseFloat(process.env.INITIAL_PORTFOLIO_USD || '10000');
    this.initialValue = this.portfolioValue;
  }

  start(): void {
    if (this.status === 'running') {
      console.warn('[AGENT] Already running');
      return;
    }
    this.status = 'running';
    this.startedAt = Date.now();
    const intervalMs = parseInt(process.env.AGENT_LOOP_INTERVAL_SECONDS || '60', 10) * 1000;
    this.intervalId = setInterval(() => this.runCycle(), intervalMs);
    this.runCycle();
    console.log(`🤖 NEXUS Agent started — ${intervalMs / 1000}s cycle interval`);
  }

  pause(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.status = 'paused';
    this.emit({ type: 'agent_halted', data: { reason: 'paused by user' }, timestamp: Date.now() });
    console.log('⏸  NEXUS Agent paused');
  }

  private async runCycle(): Promise<void> {
    if (this.status !== 'running') return;
    const cycleStart = Date.now();
    this.cycleCount++;
    const symbol = process.env.AGENT_SYMBOL || 'BTCUSDT';

    console.log(`\n━━ Cycle #${this.cycleCount} — ${new Date().toISOString()} ━━`);

    try {
      // STEP 1 — PRICE
      let ticker = this.bitgetWS.getLastTicker();
      if (!ticker) {
        try {
          ticker = await this.bitgetREST.getTicker(symbol);
        } catch {
          ticker = generateMockTicker(symbol);
        }
      }
      const currentPrice = ticker!.price;
      this.executionEngine.setLastPrice(currentPrice);
      console.log(`[CYCLE] ${symbol}: $${currentPrice.toLocaleString()}`);
      this.emit({ type: 'ticker_update', data: ticker, timestamp: Date.now() });

      // STEP 2 — CANDLES (refresh every 5 cycles)
    if (this.cycleCount % 5 === 1 || this.cachedCandles.length === 0) {
        try {
          const fresh = await this.bitgetREST.getCandles(symbol, '5min', 200);
          this.cachedCandles = fresh;
          console.log(`[CYCLE] Candles refreshed: ${fresh.length} candles, latest close $${fresh[fresh.length - 1]?.close}`);
        } catch (err: any) {
          console.warn(`[CYCLE] Candle refresh FAILED: ${err.message}`);
          if (this.cachedCandles.length === 0) this.cachedCandles = generateMockCandles(200, '5min');
        }
      }

      // STEP 3 — REGIME
      const regime = await computeRegime(this.cachedCandles, this.bitgetREST, this.hubClient, symbol);
      console.log(`[CYCLE] Regime: ${regime.regime} (${regime.confidence}%) | Score: ${regime.fusedScore.toFixed(3)}`);
      console.log('[CYCLE] Breakdown: ' + regime.signals.map((s) => `${s.type}:${s.score.toFixed(4)}`).join(' | '));
      this.db.saveRegime(regime);
      this.emit({ type: 'regime_updated', data: regime, timestamp: Date.now() });

      // STEP 4 — CHECK EXISTING POSITIONS
      const liveTechnical = regime.signals.find((s) => s.type === 'technical');
      await this.executionEngine.checkAndClosePositions(currentPrice, liveTechnical?.details);

      // STEP 5 — UPDATE PORTFOLIO
      const allTrades = this.db.getTrades(500);
      this.portfolioValue = this.executionEngine.updatePortfolioValue(allTrades);
      this.riskManager.updatePortfolioValue(this.portfolioValue);
      console.log(`[CYCLE] Portfolio: $${this.portfolioValue.toFixed(2)}`);

      // STEP 6 — STRATEGY DECISION
      const openTrades = this.db.getOpenTrades();
      const decision = this.strategyRouter.decide(regime, currentPrice, openTrades);
      console.log(`[CYCLE] Strategy: ${decision.strategy} → ${decision.action}`);

      // STEP 7 — RISK EVALUATION
      const currentNewsSentiment = regime.signals.find((s) => s.type === 'news')?.score || 0;
      const sentimentShift = Math.abs(currentNewsSentiment - this.lastNewsSentiment);
      this.lastNewsSentiment = currentNewsSentiment;

      const riskResult = this.riskManager.evaluate(decision, this.portfolioValue, sentimentShift);

      if (!riskResult.approved) {
        console.log(`[RISK] 🚫 BLOCKED: ${riskResult.reason}`);
        if (riskResult.reason.includes('halted') || riskResult.reason.includes('limit')) {
          this.status = 'halted';
          this.haltReason = riskResult.reason;
        }
        // Skip execution but still fall through to step 9/10 below
      } else {
        console.log(`[RISK] ✅ ${riskResult.reason}`);
        const actualDecision = riskResult.modifiedDecision || decision;

        // STEP 8 — EXECUTE
        const recentClosed = this.db.getTrades(3).find((t) => t.status === 'closed' && t.closedAt);
        const cooldownMs = 3 * 60 * 1000; // 3 minutes
        const inCooldown = recentClosed?.closedAt ? Date.now() - recentClosed.closedAt < cooldownMs : false;

          if ((actualDecision.action === 'buy' || actualDecision.action === 'sell') && openTrades.length === 0 && !inCooldown) {
          const explanation = await this.nlExplainer.explain(actualDecision, currentPrice, riskResult);
          const trade = await this.executionEngine.openPosition(actualDecision, currentPrice, explanation);
          if (trade) this.emit({ type: 'trade_opened', data: trade, timestamp: Date.now() });
        }

        if (
          actualDecision.action === 'close' ||
          (actualDecision.strategy === 'capital_protection' && openTrades.length > 0)
        ) {
          await this.executionEngine.closeAllPositions(currentPrice, actualDecision.reasoning);
          this.emit({ type: 'trade_closed', data: { reason: 'strategy_signal' }, timestamp: Date.now() });
        }
      }

      // STEP 9 — PERFORMANCE SNAPSHOT (every 10 cycles)
      if (this.cycleCount % 2 === 0) {
        const closedTrades = allTrades.filter((t) => t.status === 'closed');
        const snapshot = this.computeSnapshot(closedTrades, openTrades.length);
        this.db.savePerformanceSnapshot(snapshot);
        this.db.saveEquityPoint(Date.now(), this.portfolioValue);
      }

      // STEP 10 — CYCLE COMPLETE
      const cycleDuration = Date.now() - cycleStart;
      this.lastCycleAt = Date.now();
      console.log(`[CYCLE] ✓ Complete in ${cycleDuration}ms`);
      this.emit({ type: 'cycle_complete', data: this.getState(), timestamp: Date.now() });
    } catch (error: any) {
      console.log(`[CYCLE] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      // DO NOT halt the agent on a cycle error — just log and continue next cycle
    }
  }

  private computeSnapshot(closedTrades: Trade[], openCount: number): PerformanceSnapshot {
    const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const totalPnlPct = this.initialValue > 0 ? totalPnl / this.initialValue : 0;

    const winningTrades = closedTrades.filter((t) => (t.pnl || 0) > 0);
    const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;

    const returns = closedTrades.map((t) => t.pnlPct || 0);
    let sharpeRatio = 0;
    if (returns.length >= 2) {
      const meanReturn = average(returns);
      const stdReturn = Math.sqrt(average(returns.map((r) => Math.pow(r - meanReturn, 2))));
      sharpeRatio = stdReturn > 0 ? clamp((meanReturn / stdReturn) * Math.sqrt(365), -10, 10) : 0;
    }

    let peak = this.initialValue;
    let running = this.initialValue;
    let maxDrawdown = 0;
    for (const t of closedTrades.slice().reverse()) {
      running += t.pnl || 0;
      if (running > peak) peak = running;
      const dd = (peak - running) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return {
      timestamp: Date.now(),
      portfolioValue: this.portfolioValue,
      totalPnl,
      totalPnlPct,
      sharpeRatio: parseFloat(sharpeRatio.toFixed(3)),
      winRate: parseFloat(winRate.toFixed(4)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
      totalTrades: closedTrades.length,
      openTrades: openCount,
    };
  }

  getState(): AgentState {
    return {
      status: this.status,
      currentRegime: this.db.getRegimeHistory(1)[0] || null,
      lastCycleAt: this.lastCycleAt,
      cycleCount: this.cycleCount,
      portfolioValue: this.portfolioValue,
      initialPortfolioValue: this.initialValue,
      currentDrawdown: this.riskManager.getStatus().currentDrawdown,
      startedAt: this.startedAt,
      haltReason: this.haltReason || undefined,
    };
  }

  subscribe(listener: (e: AgentEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emit(event: AgentEvent): void {
    this.eventListeners.forEach((l) => {
      try {
        l(event);
      } catch {
        // A faulty listener should never break the agent loop
      }
    });
  }
}
