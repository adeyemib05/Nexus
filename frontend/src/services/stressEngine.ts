import { EquityData, StressScenario, ShockSeverity, StressResult } from '../types';
import { findClosestAnalogs } from './historicalAnalogs';

export function calculateStressTest(
  equity: EquityData,
  scenario: StressScenario,
  positionUsd: number,
  severity: ShockSeverity = 'severe'
): StressResult {
  // Severity multipliers
  const severityMultipliers: Record<ShockSeverity, number> = {
    mild: 0.6,
    severe: 1.0,
    black_swan: 1.75,
  };
  const mult = severityMultipliers[severity] || 1.0;

  // Beta-adjusted equity shock percentage
  const baseShockPct = Math.abs(scenario.marketShockPct) * mult;
  // Non-linear tail risk multiplier for high-beta assets
  const betaDrag = equity.beta > 1.5 ? 1 + (equity.beta - 1.5) * 0.35 : 1.0;
  const rawDrawdownPct = baseShockPct * equity.beta * betaDrag;

  // 7x24 Weekend Liquidity Penalty
  // Tokenized equities trading when native markets are closed suffer wider bid-ask spreads
  const weekendMultiplier = scenario.weekendSpreadMultiplier * (severity === 'black_swan' ? 1.4 : 1.0);
  const spreadBps = equity.weekendSpreadBps * weekendMultiplier;
  const weekendLiquidityPenaltyPct = (spreadBps / 100);
  
  // Total projected drawdown
  const projectedDrawdownPct = Math.min(
    78.0,
    Number((rawDrawdownPct + weekendLiquidityPenaltyPct).toFixed(2))
  );

  const projectedPrice = Number(
    (equity.price * (1 - projectedDrawdownPct / 100)).toFixed(2)
  );

  const projectedLossUsd = Math.round(positionUsd * (projectedDrawdownPct / 100));
  const estimatedSlippageUsd = Math.round(positionUsd * (weekendLiquidityPenaltyPct / 100));

  // Resilience Score (0 to 100)
  const vulnerabilityPoints = 
    projectedDrawdownPct * 1.3 + 
    equity.volatility30d * 0.35 + 
    (equity.beta - 1.0) * 8 +
    weekendLiquidityPenaltyPct * 5;

  const resilienceScore = Math.max(8, Math.min(95, Math.round(100 - vulnerabilityPoints)));

  // Determine Verdict
  let verdict: 'PASSED' | 'FRAGILE' | 'KILL_SWITCH' = 'FRAGILE';
  let verdictReason = '';

  if (resilienceScore >= 70) {
    verdict = 'PASSED';
    verdictReason = `Trade structure shows strong balance sheet resilience. Drawdown (${projectedDrawdownPct}%) remains within typical absorption limits.`;
  } else if (resilienceScore >= 42) {
    verdict = 'FRAGILE';
    verdictReason = `High beta (${equity.beta}x) and 7x24 weekend liquidity spreads expose this position to severe cascade drawdowns under ${scenario.name}. Hedging recommended.`;
  } else {
    verdict = 'KILL_SWITCH';
    verdictReason = `CRITICAL FRAGILITY: Projected loss of $${projectedLossUsd.toLocaleString()} (-${projectedDrawdownPct}%) exceeds safe recovery parameters. Deleveraging or aborting trade advised.`;
  }

  // 7-day Confidence Fan Chart (Cone of Uncertainty)
  const fanChart = [];
  const dailyVol = (equity.volatility30d / 100) / Math.sqrt(252);

  for (let day = 0; day <= 7; day++) {
    const timeFactor = Math.sqrt(Math.max(0.2, day));
    
    // Baseline path: slight mean-reversion drift
    const baselinePrice = Number(
      (equity.price * (1 + (day * 0.0015))).toFixed(2)
    );

    // 1-sigma shock path (lower band)
    const shockDrop = (projectedDrawdownPct * 0.6) * (day / 7);
    const lowerBand = Number(
      Math.max(5, equity.price * (1 - (shockDrop / 100) - (dailyVol * timeFactor * 0.5))).toFixed(2)
    );

    // +1-sigma bounce (upper band)
    const upperBand = Number(
      (equity.price * (1 + (dailyVol * timeFactor * 1.1))).toFixed(2)
    );

    // -3-sigma tail-risk path (worst-case black swan)
    const tailDrop = projectedDrawdownPct * Math.min(1.2, 0.4 + (day / 7) * 0.8);
    const tailRiskPrice = Number(
      Math.max(2, equity.price * (1 - tailDrop / 100)).toFixed(2)
    );

    fanChart.push({
      day,
      label: day === 0 ? 'Entry' : `Day ${day}`,
      baselinePrice,
      upperBand,
      lowerBand,
      tailRiskPrice,
    });
  }

  // Find closest historical analogs
  const analogs = findClosestAnalogs(equity, scenario, severity);

  return {
    symbol: equity.symbol,
    scenario,
    shockSeverity: severity,
    userPositionSize: positionUsd,
    projectedPrice,
    projectedLossUsd,
    projectedDrawdownPct,
    resilienceScore,
    verdict,
    verdictReason,
    weekendLiquidityPenaltyPct: Number(weekendLiquidityPenaltyPct.toFixed(2)),
    estimatedSlippageUsd,
    fanChart,
    analogs,
  };
}
