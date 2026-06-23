import type { RegimeReading, StrategyDecision, Trade, StrategyType } from '../types';

export class StrategyRouter {
  /**
   * Translates a fused RegimeReading into a concrete StrategyDecision.
   * symbol defaults to BTCUSDT but can be overridden for multi-symbol use later.
   */
  decide(
    regime: RegimeReading,
    currentPrice: number,
    openPositions: Trade[],
    symbol = 'BTCUSDT'
  ): StrategyDecision {
    const hasOpenLong = openPositions.some((t) => t.side === 'long' && t.status === 'open');
    const MAX_POS = parseFloat(process.env.MAX_POSITION_SIZE_PCT || '0.02');
    const techSignal = regime.signals.find((s) => s.type === 'technical');

    let strategy: StrategyType;
    let action: StrategyDecision['action'];
    let positionSizePct = 0;
    let stopLossPct = 0;
    let takeProfitPct = 0;
    let reasoning = '';

    switch (regime.regime) {
      case 'bullish_trend': {
        strategy = 'momentum_long';
        action = hasOpenLong ? 'hold' : 'buy';

        if (regime.confidence < 50) positionSizePct = 0.01;
        else if (regime.confidence <= 70) positionSizePct = 0.015;
        else if (regime.confidence <= 85) positionSizePct = 0.02;
        else positionSizePct = Math.min(0.025, MAX_POS);

        stopLossPct = 0.025;
        takeProfitPct = 0.06;
        reasoning =
          `Bullish trend confirmed (${regime.confidence}% confidence, ` +
          `fused score +${regime.fusedScore.toFixed(3)}). ` +
          `${techSignal?.strength || 'N/A'} technical signal. ` +
          `Momentum long entry.`;
        break;
      }

      case 'bearish_trend': {
        strategy = 'momentum_short';
        action = hasOpenLong ? 'close' : 'flat';
        positionSizePct = 0;
        stopLossPct = 0.02;
        takeProfitPct = 0.05;
        reasoning =
          `Bearish trend (${regime.confidence}%). ` +
          `${hasOpenLong ? 'Closing long position.' : 'Staying flat — no new short in sim mode.'}`;
        break;
      }

      case 'ranging': {
        strategy = 'mean_reversion';
        const bbPos = Number(techSignal?.details?.bbPosition ?? 0.5);
        const adx = Number(techSignal?.details?.adx ?? 20);
        // ADX this high while classified "ranging" usually means a real trend
        // is underway and the classifier just hasn't caught up yet — buying a
        // dip here is the classic "falling knife" mistake. Skip the entry.
        const strongTrendGuard = adx > 35;

        if (strongTrendGuard) {
          action = hasOpenLong ? 'close' : 'flat';
        } else if (bbPos < 0.25) {
          action = 'buy';
        } else if (bbPos > 0.75) {
          action = hasOpenLong ? 'close' : 'flat';
        } else {
          action = 'hold';
        }

        positionSizePct = action === 'buy' ? 0.01 : 0;
        stopLossPct = 0.015;
        takeProfitPct = 0.03;

        if (strongTrendGuard) {
          reasoning =
            `Ranging regime (${regime.confidence}%), but ADX ${adx.toFixed(1)} indicates a strong underlying trend. ` +
            `Skipping mean-reversion entry to avoid buying into a real move misread as a range.`;
        } else {
          reasoning =
            `Ranging market (${regime.confidence}%). ` +
            `BB position: ${bbPos.toFixed(2)}. ADX: ${adx.toFixed(1)} (range-consistent). ` +
            `${
              action === 'buy'
                ? 'Near lower band — mean reversion buy.'
                : action === 'close'
                  ? 'Near upper band — closing long.'
                  : 'Waiting for cleaner entry within range.'
            }`;
        }
        break;
      }

      case 'uncertain':
      default: {
        strategy = 'capital_protection';
        action = openPositions.length > 0 ? 'close' : 'flat';
        positionSizePct = 0;
        stopLossPct = 0;
        takeProfitPct = 0;
        reasoning =
          `Mixed signals — insufficient conviction ` +
          `(fused score: ${regime.fusedScore.toFixed(3)}, ${regime.confidence}% confidence). ` +
          `Capital protection mode.`;
        break;
      }
    }

    // Final safety net — never exceed the configured max position size
    positionSizePct = Math.min(positionSizePct, MAX_POS);

    return {
      strategy,
      action,
      symbol,
      positionSizePct,
      stopLossPct,
      takeProfitPct,
      reasoning,
      regime,
    };
  }
}
