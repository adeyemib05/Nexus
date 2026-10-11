/**
 * NEXUS Deterministic Risk Cage
 *
 * Inviolable safety wrapper operating OUTSIDE LLM authority.
 * Even if an LLM outputs 100% confidence with excessive position sizing,
 * the Risk Cage deterministically enforces policy limits.
 *
 * Sourced parameters:
 * - maxPositionPct: 2% of portfolio per trade (conservative equity preservation)
 * - maxLeverage: 1x (spot cash trading, zero liquidation risk)
 * - maxDailyDrawdown: 5% portfolio circuit breaker
 * - cooldownSeconds: 900s (15 min re-entry guardrail)
 * - maxOpenPositions: 1 concurrent position (directional focus)
 * - maxTradeNotional: 50,000 USD maximum single-order ceiling
 * - maxPriceAgeMs: 60,000ms (1 minute stale data ceiling)
 */

import type { Trade } from './db';

export interface RiskPolicy {
  maxPositionPct: number;
  maxLeverage: number;
  maxDailyDrawdown: number;
  maxOpenPositions: number;
  cooldownSeconds: number;
  maxTradeNotional: number;
  allowedSymbols: string[];
  maxPriceAgeMs: number;
}

export const DEFAULT_RISK_POLICY: RiskPolicy = {
  maxPositionPct: 0.02,        // 2.0% maximum risk allocation per entry
  maxLeverage: 1.0,            // 1x spot leverage
  maxDailyDrawdown: 0.05,      // 5.0% maximum daily portfolio drawdown
  maxOpenPositions: 1,         // Single position focus
  cooldownSeconds: 900,        // 15-minute directional cooldown
  maxTradeNotional: 50000,     // $50,000 ceiling
  allowedSymbols: ['BTCUSDT'], // Whitelisted asset universe
  maxPriceAgeMs: 60000,        // 60-second telemetry staleness ceiling
};

export interface RiskCageInput {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  requestedSizePct?: number;
  currentPrice: number;
  marketTimestamp: number;
  portfolioValue: number;
  currentDrawdown: number;
  openTrades: Trade[];
  closedTrades: Trade[];
  now?: number;
  customPolicy?: Partial<RiskPolicy>;
}

export interface RiskCageVerdict {
  approved: boolean;
  finalSizePct: number;
  finalSizeUSD: number;
  blockReason: string | null;
  appliedLimits: {
    requestedSizePct: number;
    approvedSizePct: number;
    priceValid: boolean;
    staleDataPassed: boolean;
    symbolAllowed: boolean;
    drawdownPassed: boolean;
    positionLimitPassed: boolean;
    cooldownPassed: boolean;
  };
  policy: RiskPolicy;
}

export function evaluateRiskCage(input: RiskCageInput): RiskCageVerdict {
  const policy: RiskPolicy = { ...DEFAULT_RISK_POLICY, ...(input.customPolicy || {}) };
  const now = input.now ?? Date.now();
  const requestedSize = input.requestedSizePct ?? (input.confidence >= 80 ? 0.02 : input.confidence < 60 ? 0.01 : 0.015);

  const appliedLimits = {
    requestedSizePct: requestedSize,
    approvedSizePct: 0,
    priceValid: true,
    staleDataPassed: true,
    symbolAllowed: true,
    drawdownPassed: true,
    positionLimitPassed: true,
    cooldownPassed: true,
  };

  // 1. HOLD does not commit capital
  if (input.action === 'HOLD') {
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: null,
      appliedLimits,
      policy,
    };
  }

  // 2. Price Validity Check
  if (
    typeof input.currentPrice !== 'number' ||
    isNaN(input.currentPrice) ||
    !isFinite(input.currentPrice) ||
    input.currentPrice <= 0
  ) {
    appliedLimits.priceValid = false;
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: 'Risk Cage Blocked: Invalid market price (non-positive or NaN)',
      appliedLimits,
      policy,
    };
  }

  // 3. Stale Data Rejection
  if (input.marketTimestamp && Math.abs(now - input.marketTimestamp) > policy.maxPriceAgeMs) {
    appliedLimits.staleDataPassed = false;
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: `Risk Cage Blocked: Market telemetry stale (${Math.round((now - input.marketTimestamp) / 1000)}s > ${policy.maxPriceAgeMs / 1000}s limit)`,
      appliedLimits,
      policy,
    };
  }

  // 4. Whitelisted Asset Universe Check
  const normalizedSymbol = input.symbol.toUpperCase().trim();
  if (!policy.allowedSymbols.includes(normalizedSymbol)) {
    appliedLimits.symbolAllowed = false;
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: `Risk Cage Blocked: Symbol ${normalizedSymbol} not in whitelisted policy universe`,
      appliedLimits,
      policy,
    };
  }

  // 5. Portfolio Capital & Daily Drawdown Circuit Breaker
  if (input.portfolioValue <= 0) {
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: 'Risk Cage Blocked: Insufficient portfolio capital',
      appliedLimits,
      policy,
    };
  }

  if (input.currentDrawdown > policy.maxDailyDrawdown) {
    appliedLimits.drawdownPassed = false;
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: `Risk Cage Circuit Breaker: Daily drawdown ${(input.currentDrawdown * 100).toFixed(1)}% exceeds ${(policy.maxDailyDrawdown * 100).toFixed(1)}% limit`,
      appliedLimits,
      policy,
    };
  }

  // 6. Active Position Limits
  const liveOpenTrades = input.openTrades.filter((t) => t.source === 'live_simulated' && t.status === 'open');
  if (liveOpenTrades.length >= policy.maxOpenPositions) {
    appliedLimits.positionLimitPassed = false;
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: `Risk Cage Blocked: Maximum open positions limit (${policy.maxOpenPositions}) reached`,
      appliedLimits,
      policy,
    };
  }

  const hasOpenSameSide = liveOpenTrades.some((t) => (input.action === 'BUY' ? t.side === 'long' : t.side === 'short'));
  if (hasOpenSameSide) {
    appliedLimits.positionLimitPassed = false;
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: `Risk Cage Blocked: Live ${input.action === 'BUY' ? 'long' : 'short'} position already open`,
      appliedLimits,
      policy,
    };
  }

  // 7. Directional Cooldown Check
  const cooldownMs = policy.cooldownSeconds * 1000;
  const recentClosedSameSide = input.closedTrades.some(
    (t) =>
      t.source === 'live_simulated' &&
      t.status === 'closed' &&
      (input.action === 'BUY' ? t.side === 'long' : t.side === 'short') &&
      t.closedAt &&
      now - t.closedAt < cooldownMs
  );

  if (recentClosedSameSide) {
    appliedLimits.cooldownPassed = false;
    return {
      approved: false,
      finalSizePct: 0,
      finalSizeUSD: 0,
      blockReason: `Risk Cage Blocked: ${policy.cooldownSeconds / 60}-minute re-entry cooldown active for ${input.action === 'BUY' ? 'long' : 'short'}`,
      appliedLimits,
      policy,
    };
  }

  // 8. Deterministic Sizing Enforcement
  // Clamp requested size to maxPositionPct regardless of AI recommendation
  const approvedSizePct = Math.min(requestedSize, policy.maxPositionPct);
  appliedLimits.approvedSizePct = approvedSizePct;

  let finalSizeUSD = Math.round(input.portfolioValue * approvedSizePct);
  if (finalSizeUSD > policy.maxTradeNotional) {
    finalSizeUSD = policy.maxTradeNotional;
  }

  return {
    approved: true,
    finalSizePct: approvedSizePct,
    finalSizeUSD,
    blockReason: null,
    appliedLimits,
    policy,
  };
}
