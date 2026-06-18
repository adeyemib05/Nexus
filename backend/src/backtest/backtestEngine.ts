import { v4 as uuidv4 } from 'uuid';
import type { BitgetRESTClient } from '../services/bitgetREST';
import type { NexusDB } from '../agents/database';
import { StrategyRouter } from '../agents/strategyRouter';
import { computeTechnicalSignal } from '../signals/technicalSignal';
import { generateMockCandles, generateMockBacktestResult } from '../services/mockData';
import { average, clamp } from '../types/helpers';
import type {
  BacktestResult,
  BacktestTrade,
  Candle,
  RegimeReading,
  MarketRegime,
  StrategyType,
  TradeSide,
  SignalReading,
} from '../types';

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

export interface BacktestParams {
  symbol: string;
  granularity: string; // '1H' | '4H' | '1D'
  days: number; // 30 | 60 | 90
}

// Backtest mode uses the local technical signal only (no live Agent Hub calls
// are possible against historical data), so its score tends to be noisier
// than the full 5-signal fused score. We use a slightly more sensitive
// threshold (±0.12 vs the live ±0.20) so a 30-90 day backtest isn't
// dominated by "uncertain" classifications.
const BACKTEST_REGIME_THRESHOLD = 0.12;
const WINDOW_SIZE = 100;
const MAX_HOLD_MS = 48 * 3600 * 1000; // 48 hours

export class BacktestEngine {
  private strategyRouter = new StrategyRouter();

  constructor(
    private bitgetREST: BitgetRESTClient,
    private db: NexusDB
  ) {}

  async run(params: BacktestParams): Promise<BacktestResult> {
    console.log(`\n📊 Starting backtest: ${params.symbol} ${params.granularity} ${params.days}d`);

    // ── STEP 1 — Fetch historical candles ────────────────────────────────
    const endTime = Date.now();
    const startTime = endTime - params.days * 24 * 60 * 60 * 1000;
    let allCandles: Candle[];

    try {
      allCandles = await this.bitgetREST.getHistoricalCandles(params.symbol, params.granularity, startTime, endTime);
      console.log(`[BACKTEST] Fetched ${allCandles.length} candles`);
    } catch {
      console.log('[BACKTEST] ⚠️  API fetch failed, using mock candles for demo');
      allCandles = generateMockCandles(Math.min(params.days * 24, 1000), params.granularity);
    }

    if (allCandles.length < 50) {
      return this.generateDemoResult(params);
    }

    // ── STEP 2 — Determine window size ────────────────────────────────────
    if (allCandles.length < WINDOW_SIZE) {
      return this.generateDemoResult(params);
    }

    // ── STEP 3 — Initialize simulation state ──────────────────────────────
    const initialCapital = 10000;
    let portfolioValue = initialCapital;
    let peakValue = initialCapital;
    let maxDrawdown = 0;
    let openPosition: SimulatedPosition | null = null;
    const closedTrades: BacktestTrade[] = [];
    const equityCurve: Array<{ timestamp: number; value: number }> = [];
    const regimeCounts: Record<MarketRegime, number> = {
      bullish_trend: 0,
      bearish_trend: 0,
      ranging: 0,
      uncertain: 0,
    };

    // ── STEP 4 — Sliding window simulation ─────────────────────────────────
    for (let i = WINDOW_SIZE; i < allCandles.length; i++) {
      const window = allCandles.slice(i - WINDOW_SIZE, i);
      const currentCandle = allCandles[i];
      const currentPrice = currentCandle.close;

      if (i % 100 === 0) {
        console.log(`[BACKTEST] Progress: ${i}/${allCandles.length} candles processed`);
      }

      // A) Check existing position for SL / TP / timeout
      if (openPosition !== null) {
        const isLong = openPosition.side === 'long';
        const hitSL = isLong ? currentPrice <= openPosition.stopLoss : currentPrice >= openPosition.stopLoss;
        const hitTP = isLong ? currentPrice >= openPosition.takeProfit : currentPrice <= openPosition.takeProfit;
        const timedOut = currentCandle.timestamp - openPosition.entryTimestamp > MAX_HOLD_MS;

        if (hitSL || hitTP || timedOut) {
          const exitPrice = hitSL ? openPosition.stopLoss : hitTP ? openPosition.takeProfit : currentPrice;
          const pnlPct = isLong
            ? (exitPrice - openPosition.entryPrice) / openPosition.entryPrice
            : (openPosition.entryPrice - exitPrice) / openPosition.entryPrice;
          const pnlUSD = openPosition.positionSizeUSD * pnlPct;
          portfolioValue += pnlUSD;

          closedTrades.push({
            entryTimestamp: openPosition.entryTimestamp,
            exitTimestamp: currentCandle.timestamp,
            side: openPosition.side,
            strategy: openPosition.strategy,
            regime: openPosition.regime,
            entryPrice: openPosition.entryPrice,
            exitPrice,
            pnl: pnlUSD,
            pnlPct,
          });
          openPosition = null;

          if (portfolioValue > peakValue) peakValue = portfolioValue;
          const drawdown = (peakValue - portfolioValue) / peakValue;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
      }

      // B) Compute regime only when flat
      if (openPosition === null) {
        const techSignal: SignalReading = await computeTechnicalSignal(window);

        let regime: MarketRegime;
        if (techSignal.score > BACKTEST_REGIME_THRESHOLD) regime = 'bullish_trend';
        else if (techSignal.score < -BACKTEST_REGIME_THRESHOLD) regime = 'bearish_trend';
        else if (Math.abs(techSignal.score) > 0.05) regime = 'ranging';
        else regime = 'uncertain';

        regimeCounts[regime]++;

        const regimeReading: RegimeReading = {
          regime,
          confidence: Math.round(techSignal.confidence * 100),
          fusedScore: techSignal.score,
          signals: [techSignal],
          timestamp: currentCandle.timestamp,
          reasoning: `Backtest regime: ${regime} from technical signal (${techSignal.score.toFixed(3)})`,
        };

        const decision = this.strategyRouter.decide(regimeReading, currentPrice, []);

        // C) Open position on buy signal
        if (decision.action === 'buy') {
          const posSize = portfolioValue * decision.positionSizePct;
          const sl = currentPrice * (1 - decision.stopLossPct);
          const tp = currentPrice * (1 + decision.takeProfitPct);

          openPosition = {
            side: 'long',
            strategy: decision.strategy,
            regime,
            entryPrice: currentPrice,
            entryTimestamp: currentCandle.timestamp,
            stopLoss: sl,
            takeProfit: tp,
            positionSizeUSD: posSize,
          };
        }
      }

      // D) Record equity point every 10 iterations
      if (i % 10 === 0) {
        const unrealizedPnl = openPosition
          ? ((currentPrice - openPosition.entryPrice) / openPosition.entryPrice) * openPosition.positionSizeUSD
          : 0;
        equityCurve.push({ timestamp: currentCandle.timestamp, value: portfolioValue + unrealizedPnl });
      }
    }

    // ── STEP 5 — Close any open position at end ───────────────────────────
    if (openPosition !== null) {
      const lastCandle = allCandles[allCandles.length - 1];
      const exitPrice = lastCandle.close;
      const isLong = openPosition.side === 'long';
      const pnlPct = isLong
        ? (exitPrice - openPosition.entryPrice) / openPosition.entryPrice
        : (openPosition.entryPrice - exitPrice) / openPosition.entryPrice;
      const pnlUSD = openPosition.positionSizeUSD * pnlPct;
      portfolioValue += pnlUSD;

      closedTrades.push({
        entryTimestamp: openPosition.entryTimestamp,
        exitTimestamp: lastCandle.timestamp,
        side: openPosition.side,
        strategy: openPosition.strategy,
        regime: openPosition.regime,
        entryPrice: openPosition.entryPrice,
        exitPrice,
        pnl: pnlUSD,
        pnlPct,
      });

      if (portfolioValue > peakValue) peakValue = portfolioValue;
      const drawdown = (peakValue - portfolioValue) / peakValue;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    console.log(
      `[BACKTEST] Regime distribution — bullish:${regimeCounts.bullish_trend} bearish:${regimeCounts.bearish_trend} ranging:${regimeCounts.ranging} uncertain:${regimeCounts.uncertain}`
    );

    // ── STEP 6 — Compute metrics ───────────────────────────────────────────
    const totalReturn = portfolioValue - initialCapital;
    const totalReturnPct = totalReturn / initialCapital;

    const winningTrades = closedTrades.filter((t) => t.pnl > 0);
    const losingTrades = closedTrades.filter((t) => t.pnl < 0);
    const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;

    const grossWins = winningTrades.reduce((s, t) => s + t.pnl, 0);
    const grossLosses = Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0;

    let sharpe = 0;
    const returns = closedTrades.map((t) => t.pnlPct);
    if (returns.length >= 2) {
      const meanReturn = average(returns);
      const stdReturn = Math.sqrt(average(returns.map((r) => Math.pow(r - meanReturn, 2))));
      const tradingDaysPerYear = 365;
      const avgTradesPerDay = closedTrades.length / params.days;
      sharpe = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(tradingDaysPerYear * avgTradesPerDay) : 0;
      sharpe = clamp(sharpe, -10, 10);
    }

    // ── STEP 7 — Assemble and save result ──────────────────────────────────
    const result: BacktestResult = {
      id: uuidv4(),
      symbol: params.symbol,
      granularity: params.granularity,
      periodDays: params.days,
      startDate: allCandles[0].timestamp,
      endDate: allCandles[allCandles.length - 1].timestamp,
      totalReturn,
      totalReturnPct,
      sharpeRatio: parseFloat(sharpe.toFixed(3)),
      winRate: parseFloat(winRate.toFixed(4)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
      totalTrades: closedTrades.length,
      profitFactor: parseFloat(profitFactor.toFixed(3)),
      trades: closedTrades,
      equityCurve,
      createdAt: Date.now(),
    };

    this.db.saveBacktestResult(result);

    console.log('\n📊 Backtest Complete:');
    console.log(`  Return: ${(totalReturnPct * 100).toFixed(2)}%`);
    console.log(`  Sharpe: ${sharpe.toFixed(2)}`);
    console.log(`  Win Rate: ${(winRate * 100).toFixed(1)}%`);
    console.log(`  Max DD: ${(maxDrawdown * 100).toFixed(2)}%`);
    console.log(`  Trades: ${closedTrades.length}`);

    return result;
  }

  private generateDemoResult(params: BacktestParams): BacktestResult {
    console.log('[BACKTEST] Insufficient candle data — returning demo result');
    const demo = generateMockBacktestResult();
    const result: BacktestResult = {
      ...demo,
      id: uuidv4(),
      symbol: params.symbol,
      granularity: params.granularity,
      periodDays: params.days,
    };
    this.db.saveBacktestResult(result);
    return result;
  }
}
