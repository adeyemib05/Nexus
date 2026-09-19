import { StressResult, QwenAnalysisResponse } from '../types';

const BASE = import.meta.env.VITE_API_URL || '';

export async function fetchQwenCascadeReasoning(
  stressResult: StressResult,
  userThesis?: string,
  currentPrice?: number
): Promise<QwenAnalysisResponse> {
  const payload = {
    symbol: stressResult.symbol,
    scenario: stressResult.scenario,
    severity: stressResult.shockSeverity,
    positionUsd: stressResult.userPositionSize,
    userThesis: userThesis || 'Standard long position',
    currentPrice: currentPrice || stressResult.projectedPrice || 100,
  };

  try {
    const response = await fetch(`${BASE}/api/stress-test/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const json = await response.json();
      if (json.success && json.data?.aiReasoning) {
        return json.data.aiReasoning;
      }
    }
  } catch (err) {
    console.warn('Backend /api/stress-test/simulate offline, running client fallback synthesis:', err);
  }

  // Resilient fallback logic
  return generateClientFallbackReasoning(stressResult);
}

export function generateClientFallbackReasoning(stressResult: StressResult): QwenAnalysisResponse {
  const symbol = stressResult.symbol;
  const drawdown = stressResult.projectedDrawdownPct;
  const position = stressResult.userPositionSize;
  const scenario = stressResult.scenario;

  const hedgeAmount = Math.round(position * (drawdown > 15 ? 0.18 : 0.10));
  const dipPrice = Number((stressResult.projectedPrice * 0.96).toFixed(2));

  return {
    summary: `${symbol} exhibits elevated tail-risk sensitivity under ${scenario.name}, with projected -$${stressResult.projectedLossUsd.toLocaleString()} drawdown exacerbated by 7x24 weekend liquidity thinning.`,
    firstOrder: `Immediate multiple contraction: High beta forces an acute price re-rating, suppressing trading multiples toward ${symbol}'s 52-week historical trough.`,
    secondOrder: `Collateral contagion: Accelerated liquidations in correlated crypto and high-beta equities trigger stop-loss cascades across decentralized lending pools.`,
    thirdOrderWeekend: `The 7x24 Asymmetry Trap: When traditional US exchanges are closed, on-chain rToken orderbooks face wider bid-ask spreads (+${stressResult.weekendLiquidityPenaltyPct}%), penalizing market-order exits.`,
    defensiveHedge: {
      action: 'Defensive Delta Neutralizer',
      targetAsset: 'Inverse Tech (SOXS / rUSDC Yield)',
      allocationUsd: hedgeAmount,
      expectedProtectionPct: Math.min(85, Math.round(drawdown * 2.8)),
    },
    rebalanceAdvice: `Trim ${drawdown > 12 ? '20%' : '10%'} of open ${symbol} risk into tokenized short-term treasuries (rTBILL) until the VIX retreats below 22.`,
    opportunisticDipPrice: dipPrice,
  };
}
