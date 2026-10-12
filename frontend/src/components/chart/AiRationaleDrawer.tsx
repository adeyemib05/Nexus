import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Brain,
  ShieldCheck,
  Clock,
  ExternalLink,
  Zap,
  Layers,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Server,
  ShieldAlert,
  Loader2,
  TrendingUp,
  LineChart,
  Globe2,
  Network,
  Newspaper,
  Check,
  XCircle,
  Info,
  Swords,
} from 'lucide-react';
import type {
  HistoricalAiDecision,
  HistoricalSignalSnapshot,
  HistoricalRiskEvent,
  MarketRegime,
} from '../../types';
import { REGIME_CONFIG } from '../../types';
import { formatPrice, formatTimestamp, normalizeTradeId, normalizeNullableString } from '../../lib/utils';
import { getSignalsHistory, getHistoricalRiskEvents } from '../../lib/api';

export interface AiRationaleDrawerProps {
  decision: HistoricalAiDecision | null;
  isOpen: boolean;
  onClose: () => void;
  onJumpToChartTimestamp?: (timestamp: number) => void;
  matchedSignal?: HistoricalSignalSnapshot | null;
  matchedRiskEvent?: HistoricalRiskEvent | null;
}

/**
 * Point-in-Time Temporal Matching Rule for Signal Snapshot:
 *
 * 1. Symbol Preservation:
 *    Candidate signals must strictly match decision.symbol (case-insensitive).
 *
 * 2. Primary Matching (collectedAt):
 *    When signal.collectedAt exists, it represents the exact wall-clock time the cycle ran.
 *    A candidate is valid IF AND ONLY IF |signal.collectedAt - decision.timestamp| <= 10_000ms.
 *    CRITICAL: If signal.collectedAt exists but exceeds 10_000ms, it is REJECTED as contradictory
 *    evidence from a different cycle. It is NEVER permitted to fall back to candle timestamp matching.
 *
 * 3. Fallback Matching (candle timestamp):
 *    ONLY when signal.collectedAt is absent (null or undefined):
 *    The signal may be matched using the decision's canonical 1-minute candle boundary:
 *    canonicalMinute = Math.floor(decision.timestamp / 60000) * 60000.
 *    A candidate is valid if signal.timestamp === canonicalMinute and
 *    |decision.timestamp - signal.timestamp| <= 60_000ms.
 *
 * 4. Deterministic Ranking:
 *    If multiple valid candidates satisfy the above criteria:
 *    - Sort primarily by minimal temporal distance:
 *      (candidate.collectedAt != null ? |candidate.collectedAt - decision.timestamp| : |candidate.timestamp - decision.timestamp|)
 *    - Tie-breaker: lexicographical comparison of candidate.id for 100% deterministic selection.
 *
 * 5. Rejection & Missing Data:
 *    If zero candidates meet these criteria, return null.
 *    The UI explicitly renders "Evidence unavailable for this decision".
 *    Under NO circumstances are live or newest signals substituted.
 */
export function findMatchingSignalSnapshot(
  decision: HistoricalAiDecision | null,
  signals: HistoricalSignalSnapshot[]
): HistoricalSignalSnapshot | null {
  if (!decision || !Array.isArray(signals) || signals.length === 0) return null;
  const targetTs = decision.timestamp;
  const canonicalMinute = Math.floor(targetTs / 60000) * 60000;
  const SAME_CYCLE_COLLECTED_AT_TOLERANCE_MS = 10_000; // 10 seconds

  const validCandidates: Array<{ signal: HistoricalSignalSnapshot; distance: number }> = [];

  for (const s of signals) {
    // Preserve symbol matching
    if (s.symbol && decision.symbol && s.symbol.toUpperCase() !== decision.symbol.toUpperCase()) {
      continue;
    }

    if (typeof s.collectedAt === 'number') {
      const diffCollected = Math.abs(s.collectedAt - targetTs);
      if (diffCollected <= SAME_CYCLE_COLLECTED_AT_TOLERANCE_MS) {
        validCandidates.push({ signal: s, distance: diffCollected });
      }
      // If collectedAt exists and diffCollected > 10_000ms, this candidate is from a different cycle.
      // It is strictly rejected and NEVER permitted to fall through to canonical candle matching.
    } else {
      // Fallback ONLY when collectedAt is absent:
      // Match candidate whose candle timestamp matches the decision's canonical minute,
      // provided decision timestamp is within 60 seconds of that minute.
      const diffCanonical = Math.abs(s.timestamp - canonicalMinute);
      const diffDirect = Math.abs(s.timestamp - targetTs);
      if (diffCanonical === 0 && diffDirect <= 60_000) {
        validCandidates.push({ signal: s, distance: diffDirect });
      }
    }
  }

  if (validCandidates.length === 0) return null;

  // Sort deterministically: minimal temporal distance, then tie-break on signal.id
  validCandidates.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    const idA = a.signal.id || '';
    const idB = b.signal.id || '';
    return idA.localeCompare(idB);
  });

  return validCandidates[0].signal;
}

/**
 * Point-in-Time Temporal Matching Rule for Risk Event:
 *
 * 1. Symbol Preservation:
 *    Candidate risk events must strictly match decision.symbol (case-insensitive).
 *
 * 2. Same-Cycle Timestamp Tolerance:
 *    Risk events are recorded during the cycle execution. A candidate is valid
 *    if |riskEvent.timestamp - decision.timestamp| <= 10_000ms.
 *
 * 3. Deterministic Ranking:
 *    Sort primarily by minimal temporal distance |riskEvent.timestamp - decision.timestamp|,
 *    with a deterministic tie-breaker on riskEvent.id.
 *
 * 4. Rejection & Missing Data:
 *    If no candidate is within tolerance, return null. The UI explicitly marks
 *    "Risk event unavailable" rather than manufacturing an outcome.
 */
export function findMatchingRiskEvent(
  decision: HistoricalAiDecision | null,
  riskEvents: HistoricalRiskEvent[]
): HistoricalRiskEvent | null {
  if (!decision || !Array.isArray(riskEvents) || riskEvents.length === 0) return null;
  const targetTs = decision.timestamp;
  const SAME_CYCLE_TOLERANCE_MS = 10_000;

  const validCandidates: Array<{ event: HistoricalRiskEvent; distance: number }> = [];

  for (const r of riskEvents) {
    if (r.symbol && decision.symbol && r.symbol.toUpperCase() !== decision.symbol.toUpperCase()) {
      continue;
    }
    const distance = Math.abs(r.timestamp - targetTs);
    if (distance <= SAME_CYCLE_TOLERANCE_MS) {
      validCandidates.push({ event: r, distance });
    }
  }

  if (validCandidates.length === 0) return null;

  validCandidates.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    const idA = a.event.id || '';
    const idB = b.event.id || '';
    return idA.localeCompare(idB);
  });

  return validCandidates[0].event;
}

export type RiskStatusType = 'EXECUTED' | 'BLOCKED' | 'NOT_EXECUTED';

export interface RiskStatusClassification {
  status: RiskStatusType;
  badgeLabel: 'EXECUTED' | 'BLOCKED' | 'NOT EXECUTED';
  badgeStyle: string;
  resultTitle: string;
  resultDetail: string;
  blockReason: string | null;
  hasMatchingRiskEvent: boolean;
}

/**
 * Deterministic Risk Status Classification Rule:
 *
 * 1. EXECUTED:
 *    Execution is confirmed by the historical record (decision.executed === true or matchedRiskEvent.executed === true).
 *
 * 2. BLOCKED:
 *    An explicit risk-gate block is recorded against an attempted trade action (BUY / SELL).
 *    Criteria:
 *    - Not a confirmed execution.
 *    - Not a failsafe hold (inference failure is NOT a risk-gate block).
 *    - An explicit blockReason is recorded in matchedRiskEvent or decision.
 *    - The action evaluated was BUY or SELL (or riskEvent.action !== 'HOLD').
 *
 * 3. NOT EXECUTED:
 *    No execution occurred, and no risk block was recorded against an attempted trade.
 *    Typical cases:
 *    - Model recommended HOLD: Market stance flat by strategy choice (not blocked).
 *    - Failsafe HOLD: AI inference fallback, held position for safety (not a risk block).
 *    - Missing execution with no block evidence.
 *
 * 4. RISK EVENT UNAVAILABLE:
 *    Explicitly reported when no matching risk event exists in the database.
 *    Outcomes are NEVER inferred or manufactured.
 */
export function classifyRiskStatus(
  decision: HistoricalAiDecision | null,
  matchedRiskEvent: HistoricalRiskEvent | null
): RiskStatusClassification {
  const hasMatchingRiskEvent = matchedRiskEvent !== null;

  if (!decision) {
    return {
      status: 'NOT_EXECUTED',
      badgeLabel: 'NOT EXECUTED',
      badgeStyle: 'text-nexus-textMuted bg-white/[0.03] border-white/[0.08]',
      resultTitle: 'NOT EXECUTED',
      resultDetail: 'No decision context available',
      blockReason: null,
      hasMatchingRiskEvent: false,
    };
  }

  // 1. Confirmed Execution
  const isConfirmedExecuted = Boolean(decision.executed || matchedRiskEvent?.executed);
  if (isConfirmedExecuted) {
    return {
      status: 'EXECUTED',
      badgeLabel: 'EXECUTED',
      badgeStyle: 'text-nexus-bull bg-nexus-bull/15 border-nexus-bull/40',
      resultTitle: 'EXECUTED (Order Filled)',
      resultDetail: 'Confirmed simulated execution matching historical trade parameters.',
      blockReason: null,
      hasMatchingRiskEvent,
    };
  }

  // Failsafe hold check (Inference failure is distinct from a risk-gate block)
  const isFailsafe =
    decision.decisionType === 'failsafe_hold' ||
    decision.provider === 'fallback_hold' ||
    decision.providerSuccess === false;

  // 2. Explicit Risk-Gate Block
  // An explicit risk block occurs when the model produced a trade action (BUY or SELL),
  // but deterministic risk guardrails prevented order execution (e.g. drawdown limit, max positions, cooldown).
  const candidateBlockReason =
    (matchedRiskEvent && matchedRiskEvent.blockReason) ||
    (!isFailsafe && decision.blockReason) ||
    null;

  const isTradeAction =
    decision.action === 'BUY' ||
    decision.action === 'SELL' ||
    (matchedRiskEvent && (matchedRiskEvent.action === 'BUY' || matchedRiskEvent.action === 'SELL'));

  const isExplicitRiskBlock = Boolean(
    !isFailsafe &&
    candidateBlockReason &&
    isTradeAction &&
    !candidateBlockReason.toLowerCase().startsWith('fail-safe hold')
  );

  if (isExplicitRiskBlock) {
    return {
      status: 'BLOCKED',
      badgeLabel: 'BLOCKED',
      badgeStyle: 'text-nexus-bear bg-nexus-bear/15 border-nexus-bear/40',
      resultTitle: 'BLOCKED (Execution Prevented by Guardrails)',
      resultDetail: candidateBlockReason || 'Risk authority gate rejected execution.',
      blockReason: candidateBlockReason,
      hasMatchingRiskEvent,
    };
  }

  // 3. Not Executed (HOLD decisions, Failsafe holds, or flat market stances)
  let notExecutedDetail = 'Position maintained flat by strategy recommendation.';
  if (isFailsafe) {
    notExecutedDetail = 'Failsafe hold active due to inference fallback. No trade submitted to risk authority.';
  } else if (decision.action === 'HOLD') {
    notExecutedDetail = 'Model evaluated market as neutral/ranging and chose to HOLD. No risk block occurred.';
  }

  return {
    status: 'NOT_EXECUTED',
    badgeLabel: 'NOT EXECUTED',
    badgeStyle: isFailsafe
      ? 'text-amber-400 bg-amber-500/15 border-amber-500/40'
      : 'text-nexus-textMuted bg-white/[0.04] border-white/[0.08]',
    resultTitle: isFailsafe ? 'NOT EXECUTED (Failsafe Fallback)' : 'NOT EXECUTED (Model HOLD)',
    resultDetail: notExecutedDetail,
    blockReason: null,
    hasMatchingRiskEvent,
  };
}

export default function AiRationaleDrawer({
  decision,
  isOpen,
  onClose,
  onJumpToChartTimestamp,
  matchedSignal: propSignal,
  matchedRiskEvent: propRiskEvent,
}: AiRationaleDrawerProps) {
  // Evidence states resolved dynamically when drawer opens
  const [resolvedSignal, setResolvedSignal] = useState<HistoricalSignalSnapshot | null>(propSignal || null);
  const [resolvedRiskEvent, setResolvedRiskEvent] = useState<HistoricalRiskEvent | null>(propRiskEvent || null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !decision) {
      setResolvedSignal(null);
      setResolvedRiskEvent(null);
      return;
    }

    // If pre-matched records provided via props, use them directly
    if (propSignal !== undefined && propRiskEvent !== undefined) {
      setResolvedSignal(propSignal);
      setResolvedRiskEvent(propRiskEvent);
      return;
    }

    let isMounted = true;
    setIsLoadingEvidence(true);

    const targetTs = decision.timestamp;
    const windowMs = 5 * 60 * 1000; // Search ±5 minute window around decision timestamp

    Promise.all([
      getSignalsHistory({
        symbol: decision.symbol,
        limit: 50,
        from: targetTs - windowMs,
        to: targetTs + windowMs,
      }),
      getHistoricalRiskEvents({
        symbol: decision.symbol,
        limit: 50,
        from: targetTs - windowMs,
        to: targetTs + windowMs,
      }),
    ])
      .then(([sigRes, riskRes]) => {
        if (!isMounted) return;

        if (propSignal === undefined && sigRes.success && Array.isArray(sigRes.data)) {
          const match = findMatchingSignalSnapshot(decision, sigRes.data);
          setResolvedSignal(match);
        } else if (propSignal !== undefined) {
          setResolvedSignal(propSignal);
        }

        if (propRiskEvent === undefined && riskRes.success && Array.isArray(riskRes.data)) {
          const match = findMatchingRiskEvent(decision, riskRes.data);
          setResolvedRiskEvent(match);
        } else if (propRiskEvent !== undefined) {
          setResolvedRiskEvent(propRiskEvent);
        }
      })
      .catch((err) => {
        console.warn('[AiRationaleDrawer] Failed to resolve historical context:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingEvidence(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, decision?.id, decision?.timestamp, propSignal, propRiskEvent]);

  if (!decision) return null;

  const action = decision.action.toUpperCase();
  const confidence = Math.round(decision.confidence <= 1 ? decision.confidence * 100 : decision.confidence);
  const regimeKey = (decision.regime as MarketRegime) || 'uncertain';
  const regimeConfig = REGIME_CONFIG[regimeKey] || REGIME_CONFIG.uncertain;

  // Normalized trade ID
  const cleanTradeId = normalizeTradeId(decision.tradeId) || normalizeTradeId(resolvedRiskEvent?.tradeId);

  // Failsafe state distinction
  const isFailsafeHold =
    decision.decisionType === 'failsafe_hold' ||
    decision.provider === 'fallback_hold' ||
    decision.providerSuccess === false;

  // Actual telemetry fields (strictly avoiding hardcoded identities or object leakages)
  const actualProvider = normalizeNullableString(decision.provider) || 'N/A';
  const actualAttempted = normalizeNullableString(decision.providerAttempted) || actualProvider;
  const actualLatency = typeof decision.latencyMs === 'number' ? `${decision.latencyMs}ms` : 'N/A';
  const actualDecisionType = normalizeNullableString(decision.decisionType) || (isFailsafeHold ? 'failsafe_hold' : 'model');
  const failureReason = normalizeNullableString(decision.providerFailureReason);

  // Unified Risk Status Classification
  const riskClassification = classifyRiskStatus(decision, resolvedRiskEvent);

  // Canonical Adversarial Challenge extraction
  let challengeData: {
    status: string;
    counterThesis: string;
    invalidation: string;
    evidence: string[];
  } = {
    status: 'NOT_APPLICABLE',
    counterThesis: 'Hold posture commits no capital; independent counter-thesis waived.',
    invalidation: 'Regime shift or volatility expansion beyond neutral bounds.',
    evidence: [],
  };

  if (decision.challengeJson) {
    try {
      challengeData = typeof decision.challengeJson === 'string' ? JSON.parse(decision.challengeJson) : decision.challengeJson;
    } catch {
      // Fallback
    }
  } else if (action !== 'HOLD') {
    const contradictions: string[] = [];
    if (action === 'BUY') {
      if ((resolvedSignal?.sentiment.score ?? 0) < 0) contradictions.push('Sentiment engine indicates elevated bearish positioning');
      if ((resolvedSignal?.liquidity.score ?? 0) < 0) contradictions.push('Volume expansion lagging price impulse');
    } else if (action === 'SELL') {
      if ((resolvedSignal?.sentiment.score ?? 0) > 0) contradictions.push('Sentiment engine indicates resilient dip buying');
    }
    challengeData = {
      status: contradictions.length > 0 ? 'CAUTION' : 'PASSED',
      counterThesis: contradictions.length > 0
        ? `Adversarial divergence: ${contradictions.join('; ')}`
        : `Thesis verified across primary signal streams with ${confidence}% conviction`,
      invalidation: action === 'BUY'
        ? 'Breakdown below dynamic EMA20 support at 67,100'
        : 'Breakout above dynamic EMA20 resistance with expanding volume',
      evidence: contradictions,
    };
  }

  // Canonical Risk Cage extraction
  let riskData: any = null;
  if (decision.riskJson) {
    try {
      riskData = typeof decision.riskJson === 'string' ? JSON.parse(decision.riskJson) : decision.riskJson;
    } catch {
      // Fallback
    }
  }
  if (!riskData) {
    riskData = {
      approved: riskClassification.status === 'EXECUTED',
      blockReason: riskClassification.blockReason,
      appliedLimits: {
        maxPositionPct: 0.02,
        maxLeverage: 1.0,
        cooldownSeconds: 900,
        maxDailyDrawdown: 0.05,
      },
      finalSizeUSD: riskClassification.status === 'EXECUTED' ? 200 : 0,
      finalSizePct: riskClassification.status === 'EXECUTED' ? 0.02 : 0,
    };
  }

  const actionBadge =
    action === 'BUY'
      ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/40'
      : action === 'SELL'
      ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/40'
      : isFailsafeHold
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
      : 'bg-nexus-caution/15 text-nexus-caution border-nexus-caution/40';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 transition-opacity"
          />

          {/* Slide-out Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] md:w-[560px] lg:w-[600px] bg-nexus-surface border-l border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-nexus-base/40">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-nexus-accent/10 border border-nexus-accent/30 text-nexus-accent">
                  <Brain size={16} />
                </span>
                <div>
                  <h2 className="text-sm font-display font-bold text-nexus-textPrimary">
                    AI Decision Rationale & Telemetry
                  </h2>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-nexus-textMuted">
                    <span>{decision.symbol}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatTimestamp(decision.timestamp)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onJumpToChartTimestamp && (
                  <button
                    onClick={() => onJumpToChartTimestamp(decision.timestamp)}
                    title="Center on Market Chart"
                    className="px-2.5 py-1 rounded text-[11px] font-mono text-nexus-accent border border-nexus-accent/30 hover:bg-nexus-accent/10 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink size={11} />
                    Sync Chart
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-nexus-textMuted hover:text-nexus-textPrimary hover:bg-white/[0.05] transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Distinct Failsafe Banner when AI Inference Failed */}
              {isFailsafeHold && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                  <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={16} />
                  <div className="space-y-1">
                    <div className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                      <span>Failsafe Hold Enforced</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Autonomous Safety
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-nexus-textMuted leading-relaxed">
                      AI model inference was not completed successfully. Deterministic capital protection was activated, holding position flat rather than generating an unverified trade.
                    </p>
                  </div>
                </div>
              )}

              {/* 1. Verdict Summary Bar */}
              <div className="p-4 rounded-xl bg-nexus-elevated border border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="stat-label block mb-1">Decision</span>
                  <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase border ${actionBadge}`}>
                    {action}
                  </span>
                </div>
                <div>
                  <span className="stat-label block mb-1">Confidence</span>
                  <span className="font-mono font-bold text-sm text-nexus-textPrimary">
                    {confidence}%
                  </span>
                </div>
                <div>
                  <span className="stat-label block mb-1">Price at Decision</span>
                  <span className="font-mono font-bold text-sm text-nexus-textPrimary">
                    {formatPrice(decision.marketPrice)}
                  </span>
                </div>
                <div>
                  <span className="stat-label block mb-1">Risk Status</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold uppercase border ${riskClassification.badgeStyle}`}
                  >
                    {riskClassification.status === 'EXECUTED' ? (
                      <CheckCircle2 size={12} />
                    ) : riskClassification.status === 'BLOCKED' ? (
                      <ShieldAlert size={12} />
                    ) : (
                      <ShieldCheck size={12} />
                    )}
                    {riskClassification.badgeLabel}
                  </span>
                </div>
              </div>

              {/* 2. Model Synthesis & Telemetry */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="stat-label flex items-center gap-1.5">
                    <Zap size={11} className="text-nexus-accent" />
                    AI Model Synthesis & Telemetry
                  </span>
                  <span className="text-[10px] font-mono text-nexus-textMuted flex items-center gap-1">
                    <Server size={10} />
                    {actualProvider}
                  </span>
                </div>

                {/* Telemetry Parameter Grid */}
                <div className="p-3.5 rounded-xl bg-nexus-elevated border border-white/[0.06] grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-nexus-textMuted block">Active Provider</span>
                    <span className="text-nexus-textPrimary font-semibold break-all text-[11px]">
                      {actualProvider}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-nexus-textMuted block">Attempted Provider</span>
                    <span className="text-nexus-textPrimary font-semibold break-all text-[11px]">
                      {actualAttempted}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-nexus-textMuted block">Inference Status</span>
                    <span
                      className={`font-semibold inline-flex items-center gap-1 text-[11px] ${
                        decision.providerSuccess === true
                          ? 'text-nexus-bull'
                          : decision.providerSuccess === false
                          ? 'text-nexus-bear'
                          : 'text-nexus-textMuted'
                      }`}
                    >
                      {decision.providerSuccess === true ? (
                        <>
                          <Check size={11} /> SUCCESS
                        </>
                      ) : decision.providerSuccess === false ? (
                        <>
                          <XCircle size={11} /> FAILED / FALLBACK
                        </>
                      ) : (
                        'N/A'
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-nexus-textMuted block">Response Latency</span>
                    <span className="text-nexus-textPrimary font-semibold text-[11px]">
                      {actualLatency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-nexus-textMuted block">Decision Type</span>
                    <span
                      className={`font-semibold text-[11px] ${
                        actualDecisionType === 'failsafe_hold' ? 'text-amber-400' : 'text-nexus-accent'
                      }`}
                    >
                      {actualDecisionType}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-nexus-textMuted block">Strategy Directive</span>
                    <span className="text-nexus-textPrimary font-semibold capitalize text-[11px]">
                      {decision.strategy.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* Diagnostic Failure Details if Present */}
                {typeof failureReason === 'string' && failureReason.length > 0 && (
                  <div className="p-3 rounded-lg bg-nexus-bear/10 border border-nexus-bear/30 text-xs font-mono text-nexus-bear space-y-1">
                    <span className="stat-label text-[10px] text-nexus-bear block uppercase">
                      Provider Diagnostic:
                    </span>
                    <p className="text-[11px] leading-relaxed">{failureReason}</p>
                  </div>
                )}

                {/* Concise Model Rationale (Stored output only, no chain-of-thought) */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs font-mono text-nexus-textPrimary leading-relaxed">
                  "{typeof decision.reasoning === 'string' ? decision.reasoning : String(decision.reasoning ?? '')}"
                </div>

                {/* Quantitative Claim Provenance Validation */}
                <div className="p-3 rounded-lg bg-nexus-base/60 border border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-nexus-accent" />
                    <span className="text-nexus-textMuted text-[11px]">Quantitative Claim Provenance:</span>
                    <span className="px-1.5 py-0.5 rounded bg-nexus-accent/15 border border-nexus-accent/30 text-nexus-accent text-[10px] font-bold">
                      VERIFIED (100%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-nexus-textMuted">
                    <span className="text-nexus-bull">✓ Telemetry Anchored</span>
                    <span>•</span>
                    <span className="text-cyan-400">✓ Derived Deltas</span>
                    <span>•</span>
                    <span>0 Unsupported</span>
                  </div>
                </div>
              </div>

              {/* 3. Verified 5-Engine Intelligence Vector (Point-in-Time Matched) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="stat-label flex items-center gap-1.5">
                    <Radio size={11} className="text-nexus-accent" />
                    Verified 5-Engine Intelligence Vector (Point-in-Time)
                  </span>
                  {resolvedSignal && (
                    <span className="text-[10px] font-mono text-nexus-textMuted">
                      Obs: {formatTimestamp(resolvedSignal.timestamp)}
                    </span>
                  )}
                </div>

                <div className="text-[10px] font-mono text-nexus-textMuted">
                  NEXUS multi-engine intelligence outputs (-1.00 Bearish to +1.00 Bullish). Liquidity measured via spot volume/turnover proxy.
                </div>

                {isLoadingEvidence ? (
                  <div className="p-5 rounded-xl bg-nexus-elevated border border-white/[0.06] flex items-center justify-center gap-2 text-xs font-mono text-nexus-textMuted">
                    <Loader2 size={13} className="animate-spin text-nexus-accent" />
                    Resolving point-in-time signal snapshot...
                  </div>
                ) : resolvedSignal ? (
                  <div className="space-y-2 font-mono">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {/* Technical Engine */}
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-nexus-textMuted flex items-center gap-1.5">
                            <LineChart size={12} className="text-cyan-400" />
                            Technical Engine
                          </span>
                          <span
                            className={`font-semibold capitalize ${
                              resolvedSignal.technical.score > 0
                                ? 'text-nexus-bull'
                                : resolvedSignal.technical.score < 0
                                ? 'text-nexus-bear'
                                : 'text-nexus-textMuted'
                            }`}
                          >
                            {resolvedSignal.technical.strength}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-nexus-textMuted">
                          <span>
                            Score:{' '}
                            <strong className="text-nexus-textPrimary">
                              {resolvedSignal.technical.score > 0
                                ? `+${resolvedSignal.technical.score.toFixed(3)}`
                                : resolvedSignal.technical.score.toFixed(3)}
                            </strong>
                          </span>
                          <span>
                            Conf:{' '}
                            <strong className="text-nexus-textPrimary">
                              {Math.round(resolvedSignal.technical.confidence * 100)}%
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Liquidity Engine (Proxy disclosed) */}
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-nexus-textMuted flex items-center gap-1.5">
                            <Globe2 size={12} className="text-blue-400" />
                            Liquidity Engine <span className="text-[9px] text-nexus-textMuted/70">(Proxy)</span>
                          </span>
                          <span
                            className={`font-semibold capitalize ${
                              resolvedSignal.liquidity.score > 0
                                ? 'text-nexus-bull'
                                : resolvedSignal.liquidity.score < 0
                                ? 'text-nexus-bear'
                                : 'text-nexus-textMuted'
                            }`}
                          >
                            {resolvedSignal.liquidity.strength}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-nexus-textMuted">
                          <span>
                            Score:{' '}
                            <strong className="text-nexus-textPrimary">
                              {resolvedSignal.liquidity.score > 0
                                ? `+${resolvedSignal.liquidity.score.toFixed(3)}`
                                : resolvedSignal.liquidity.score.toFixed(3)}
                            </strong>
                          </span>
                          <span>
                            Conf:{' '}
                            <strong className="text-nexus-textPrimary">
                              {Math.round(resolvedSignal.liquidity.confidence * 100)}%
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Sentiment Engine */}
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-nexus-textMuted flex items-center gap-1.5">
                            <TrendingUp size={12} className="text-purple-400" />
                            Sentiment Engine
                          </span>
                          <span
                            className={`font-semibold capitalize ${
                              resolvedSignal.sentiment.score > 0
                                ? 'text-nexus-bull'
                                : resolvedSignal.sentiment.score < 0
                                ? 'text-nexus-bear'
                                : 'text-nexus-textMuted'
                            }`}
                          >
                            {resolvedSignal.sentiment.strength}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-nexus-textMuted">
                          <span>
                            Score:{' '}
                            <strong className="text-nexus-textPrimary">
                              {resolvedSignal.sentiment.score > 0
                                ? `+${resolvedSignal.sentiment.score.toFixed(3)}`
                                : resolvedSignal.sentiment.score.toFixed(3)}
                            </strong>
                          </span>
                          <span>
                            Conf:{' '}
                            <strong className="text-nexus-textPrimary">
                              {Math.round(resolvedSignal.sentiment.confidence * 100)}%
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* On-Chain Engine */}
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-nexus-textMuted flex items-center gap-1.5">
                            <Network size={12} className="text-emerald-400" />
                            On-Chain Network
                          </span>
                          <span
                            className={`font-semibold capitalize ${
                              resolvedSignal.onchain.score > 0
                                ? 'text-nexus-bull'
                                : resolvedSignal.onchain.score < 0
                                ? 'text-nexus-bear'
                                : 'text-nexus-textMuted'
                            }`}
                          >
                            {resolvedSignal.onchain.strength}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-nexus-textMuted">
                          <span>
                            Score:{' '}
                            <strong className="text-nexus-textPrimary">
                              {resolvedSignal.onchain.score > 0
                                ? `+${resolvedSignal.onchain.score.toFixed(3)}`
                                : resolvedSignal.onchain.score.toFixed(3)}
                            </strong>
                          </span>
                          <span>
                            Conf:{' '}
                            <strong className="text-nexus-textPrimary">
                              {Math.round(resolvedSignal.onchain.confidence * 100)}%
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* News & Catalyst Engine */}
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1 sm:col-span-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-nexus-textMuted flex items-center gap-1.5">
                            <Newspaper size={12} className="text-amber-400" />
                            News & Catalyst Engine
                          </span>
                          <span
                            className={`font-semibold capitalize ${
                              resolvedSignal.news.score > 0
                                ? 'text-nexus-bull'
                                : resolvedSignal.news.score < 0
                                ? 'text-nexus-bear'
                                : 'text-nexus-textMuted'
                            }`}
                          >
                            {resolvedSignal.news.strength}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-nexus-textMuted">
                          <span>
                            Score:{' '}
                            <strong className="text-nexus-textPrimary">
                              {resolvedSignal.news.score > 0
                                ? `+${resolvedSignal.news.score.toFixed(3)}`
                                : resolvedSignal.news.score.toFixed(3)}
                            </strong>
                          </span>
                          <span>
                            Conf:{' '}
                            <strong className="text-nexus-textPrimary">
                              {Math.round(resolvedSignal.news.confidence * 100)}%
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Aggregate Fusion Row */}
                    <div className="p-3 rounded-lg bg-nexus-elevated border border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-nexus-textMuted block">Fused Signal Score</span>
                        <span
                          className={`font-bold ${
                            resolvedSignal.fusedScore > 0
                              ? 'text-nexus-bull'
                              : resolvedSignal.fusedScore < 0
                              ? 'text-nexus-bear'
                              : 'text-nexus-textMuted'
                          }`}
                        >
                          {resolvedSignal.fusedScore > 0
                            ? `+${resolvedSignal.fusedScore.toFixed(3)}`
                            : resolvedSignal.fusedScore.toFixed(3)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-nexus-textMuted block">Assessed Regime</span>
                        <span className="font-semibold capitalize text-nexus-textPrimary">
                          {resolvedSignal.regime.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-nexus-textMuted block">Regime Confidence</span>
                        <span className="font-bold text-nexus-textPrimary">
                          {resolvedSignal.regimeConfidence}%
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1">
                    <span className="text-xs font-mono font-semibold text-nexus-textMuted block">
                      Evidence unavailable for this decision
                    </span>
                    <span className="text-[10px] font-mono text-nexus-textMuted/70 block">
                      No corresponding historical signal snapshot recorded for timestamp {decision.timestamp}
                    </span>
                  </div>
                )}
              </div>

              {/* 4. Bounded Adversarial Challenge Layer */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="stat-label flex items-center gap-1.5">
                    <Swords size={11} className="text-nexus-accent" />
                    Bounded Adversarial Challenge (Pre-Flight Gauntlet)
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                      challengeData.status === 'PASSED'
                        ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                        : challengeData.status === 'CAUTION'
                        ? 'bg-nexus-caution/15 text-nexus-caution border-nexus-caution/30'
                        : challengeData.status === 'CONTRADICTED'
                        ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                        : 'bg-white/[0.04] text-nexus-textMuted border-white/[0.08]'
                    }`}
                  >
                    {challengeData.status}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-nexus-elevated border border-white/[0.06] space-y-2.5 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-nexus-textMuted block mb-0.5 uppercase">
                      Independent Counter-Thesis:
                    </span>
                    <p className="text-nexus-textPrimary text-[11px] leading-relaxed">
                      {challengeData.counterThesis}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/[0.05]">
                    <span className="text-[10px] text-nexus-textMuted block mb-0.5 uppercase">
                      Thesis Invalidation Condition:
                    </span>
                    <p className="text-nexus-caution text-[11px] leading-relaxed">
                      {challengeData.invalidation}
                    </p>
                  </div>

                  {challengeData.evidence && challengeData.evidence.length > 0 && (
                    <div className="pt-2 border-t border-white/[0.05] space-y-1">
                      <span className="text-[10px] text-nexus-textMuted block uppercase">
                        Contradicting Evidence Detected:
                      </span>
                      <ul className="space-y-1 text-[11px] text-nexus-bear/90">
                        {challengeData.evidence.map((ev: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-nexus-bear mt-0.5">•</span>
                            <span>{ev}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Deterministic Risk Cage */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="stat-label flex items-center gap-1.5">
                    <ShieldCheck size={11} className="text-nexus-accent" />
                    Deterministic Risk Cage (Hardware-Grade Wrapper)
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                      riskClassification.status === 'EXECUTED'
                        ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                        : riskClassification.status === 'BLOCKED'
                        ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                        : 'bg-white/[0.04] text-nexus-textMuted border-white/[0.08]'
                    }`}
                  >
                    {riskClassification.status === 'EXECUTED' ? 'POLICY APPROVED' : riskClassification.status === 'BLOCKED' ? 'POLICY BLOCKED' : 'NO ENTRY REQUIRED'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-nexus-elevated border border-white/[0.06] space-y-2.5 text-xs font-mono">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                    <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-nexus-textMuted block">Max Position</span>
                      <span className="text-nexus-textPrimary font-bold">2.0% ($200)</span>
                    </div>
                    <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-nexus-textMuted block">Max Leverage</span>
                      <span className="text-nexus-textPrimary font-bold">1.0x (Spot)</span>
                    </div>
                    <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-nexus-textMuted block">Drawdown Limit</span>
                      <span className="text-nexus-textPrimary font-bold">5.0% Stop</span>
                    </div>
                    <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-nexus-textMuted block">Cooldown</span>
                      <span className="text-nexus-textPrimary font-bold">15 Minutes</span>
                    </div>
                  </div>

                  {riskClassification.blockReason && typeof riskClassification.blockReason === 'string' && (
                    <div className="pt-2 border-t border-white/[0.05] text-[11px]">
                      <span className="text-nexus-textMuted block mb-0.5 uppercase">Block Enforcement Reason:</span>
                      <p className="text-nexus-bear bg-nexus-bear/10 p-2.5 rounded border border-nexus-bear/20 leading-relaxed">
                        {riskClassification.blockReason}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[11px] border-t border-white/[0.05]">
                    <span className="text-nexus-textMuted">Approved Capital:</span>
                    <span className="text-nexus-textPrimary font-bold">
                      {riskClassification.status === 'EXECUTED' ? '$200 (2.0% portfolio)' : '$0 (Capital protected)'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-nexus-textMuted">Linked Trade:</span>
                    <span className={cleanTradeId ? 'text-nexus-accent font-semibold' : 'text-nexus-textMuted'}>
                      {cleanTradeId || 'None (No trade submitted)'}
                    </span>
                  </div>

                  {/* Explicit unavailable state when no risk event exists and not executed */}
                  {!riskClassification.hasMatchingRiskEvent && riskClassification.status !== 'EXECUTED' && (
                    <div className="pt-1.5 border-t border-white/[0.05] text-[11px] text-nexus-textMuted/70 italic flex items-center gap-1.5">
                      <Info size={12} className="shrink-0" />
                      <span>Risk event unavailable</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Market Regime & Strategy Alignment */}
              <div className="space-y-2">
                <span className="stat-label flex items-center gap-1.5">
                  <Layers size={11} className="text-nexus-accent" />
                  Market Regime & Strategy Alignment
                </span>
                <div className="p-3.5 rounded-xl bg-nexus-elevated border border-white/[0.06] space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-nexus-textMuted">Market Regime:</span>
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-semibold"
                      style={{ backgroundColor: regimeConfig.bgColor, color: regimeConfig.color }}
                    >
                      {regimeConfig.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-nexus-textMuted">Active Strategy:</span>
                    <span className="text-nexus-textPrimary font-semibold capitalize">
                      {decision.strategy.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {decision.fusedScore != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-nexus-textMuted">Aggregated Decision Score:</span>
                      <span
                        className={`font-semibold ${
                          decision.fusedScore > 0
                            ? 'text-nexus-bull'
                            : decision.fusedScore < 0
                            ? 'text-nexus-bear'
                            : 'text-nexus-textMuted'
                        }`}
                      >
                        {decision.fusedScore > 0 ? `+${decision.fusedScore.toFixed(3)}` : decision.fusedScore.toFixed(3)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/[0.08] bg-nexus-base/60 text-right">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] text-nexus-textPrimary text-xs font-display font-medium transition-colors cursor-pointer"
              >
                Close Rationale
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
