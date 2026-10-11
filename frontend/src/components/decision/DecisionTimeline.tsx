import { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Filter,
  RefreshCw,
  Activity,
  Search,
  Eye,
  ChevronDown,
  ChevronUp,
  Radio,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import type {
  HistoricalAiDecision,
  HistoricalSignalSnapshot,
  HistoricalRiskEvent,
  Trade,
} from '../../types';
import { formatPrice, formatPct, formatTimestamp, normalizeTradeId } from '../../lib/utils';
import {
  findMatchingSignalSnapshot,
  findMatchingRiskEvent,
  classifyRiskStatus,
  type RiskStatusClassification,
} from '../chart/AiRationaleDrawer';
import {
  getAiDecisionsHistory,
  getSignalsHistory,
  getHistoricalRiskEvents,
} from '../../lib/api';

export type TimelineFilter = 'ALL' | 'BUY' | 'SELL' | 'HOLD' | 'EXECUTED' | 'BLOCKED';

export type OutcomeStatus = 'AVAILABLE' | 'PENDING' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

export interface DecisionOutcome {
  status: OutcomeStatus;
  label: string;
  badgeStyle: string;
  detail: string;
  pnl?: number | null;
  pnlPct?: number | null;
}

/**
 * Explicit Point-in-Time Outcome Determination Rule:
 *
 * 1. NOT_APPLICABLE (No Trade Submitted):
 *    When the decision was not executed (model HOLD, failsafe fallback, or blocked).
 *    Preserves the specific reason (Model HOLD / Failsafe Fallback / Risk Gate Blocked)
 *    without inferring position state or PnL.
 *
 * 2. AVAILABLE (Closed Trade):
 *    When executed === true and the linked trade exists in `trades` with status === 'closed'.
 *    Realized PnL is reported directly from the historical trade record.
 *
 * 3. PENDING (Open Position):
 *    When executed === true and the linked trade exists with status === 'open'.
 *
 * 4. UNAVAILABLE:
 *    When executed === true but no matching trade record is present in history.
 *    PnL is NEVER manufactured from market prices.
 */
export function determineDecisionOutcome(
  decision: HistoricalAiDecision,
  matchedRisk: RiskStatusClassification,
  trades: Trade[]
): DecisionOutcome {
  if (!decision.executed && matchedRisk.status !== 'EXECUTED') {
    // Preserve specific unexecuted reason without inferring flat position state or PnL
    if (matchedRisk.status === 'BLOCKED') {
      return {
        status: 'NOT_APPLICABLE',
        label: 'No Trade Submitted',
        badgeStyle: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
        detail: 'Risk Gate Blocked — No trade submitted. Position state unverified.',
      };
    }

    const isFailsafe =
      decision.decisionType === 'failsafe_hold' ||
      decision.provider === 'fallback_hold' ||
      (decision.reasoning || '').toLowerCase().includes('failsafe') ||
      (decision.reasoning || '').toLowerCase().includes('safe hold');

    if (isFailsafe) {
      return {
        status: 'NOT_APPLICABLE',
        label: 'No Trade Submitted',
        badgeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
        detail: 'Failsafe Fallback — No trade submitted. Position state unverified.',
      };
    }

    return {
      status: 'NOT_APPLICABLE',
      label: 'No Trade Submitted',
      badgeStyle: 'bg-white/[0.04] text-nexus-textMuted border-white/[0.08]',
      detail: 'Model HOLD — No trade submitted. Position state unverified.',
    };
  }

  const cleanTradeId = normalizeTradeId(decision.tradeId);
  if (cleanTradeId) {
    const linkedTrade = trades.find((t) => t.id === cleanTradeId);
    if (linkedTrade) {
      if (linkedTrade.status === 'closed') {
        const pnl = linkedTrade.pnl ?? null;
        const pnlPct = linkedTrade.pnlPct ?? null;
        const isProfit = (pnl || 0) >= 0;
        return {
          status: 'AVAILABLE',
          label: pnl !== null ? `${isProfit ? '+' : ''}${formatPrice(pnl)} (${formatPct((pnlPct || 0) * 100)})` : 'Closed Trade',
          badgeStyle: isProfit
            ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
            : 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30',
          detail: `Trade ${cleanTradeId} closed with ${isProfit ? 'profit' : 'drawdown'}.`,
          pnl,
          pnlPct,
        };
      } else if (linkedTrade.status === 'open') {
        return {
          status: 'PENDING',
          label: 'Outcome Pending (Open Position)',
          badgeStyle: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          detail: `Trade ${cleanTradeId} is currently active in the market.`,
        };
      }
    }
  }

  if (decision.executed) {
    return {
      status: 'PENDING',
      label: 'Execution Awaiting Trade Record',
      badgeStyle: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      detail: 'Execution recorded; awaiting trade ledger attribution.',
    };
  }

  return {
    status: 'UNAVAILABLE',
    label: 'Outcome Unavailable',
    badgeStyle: 'bg-white/[0.03] text-nexus-textMuted/60 border-white/[0.06]',
    detail: 'No verifiable post-decision outcome data exists in historical record.',
  };
}

export interface DecisionTimelineProps {
  initialDecisions?: HistoricalAiDecision[];
  trades?: Trade[];
  selectedDecisionId?: string | null;
  onSelectDecision?: (decision: HistoricalAiDecision) => void;
  onSyncChart?: (timestamp: number) => void;
  className?: string;
}

export default function DecisionTimeline({
  initialDecisions,
  trades = [],
  selectedDecisionId,
  onSelectDecision,
  onSyncChart,
  className = '',
}: DecisionTimelineProps) {
  const [decisions, setDecisions] = useState<HistoricalAiDecision[]>(initialDecisions || []);
  const [signals, setSignals] = useState<HistoricalSignalSnapshot[]>([]);
  const [riskEvents, setRiskEvents] = useState<HistoricalRiskEvent[]>([]);
  const [filter, setFilter] = useState<TimelineFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Synchronize when initialDecisions updates from parent
  useEffect(() => {
    if (initialDecisions && initialDecisions.length > 0) {
      setDecisions(initialDecisions);
    }
  }, [initialDecisions]);

  // Fetch complete point-in-time context for timeline
  const fetchTimelineData = async () => {
    setIsLoading(true);
    try {
      const [decRes, sigRes, riskRes] = await Promise.all([
        getAiDecisionsHistory({ limit: 50 }),
        getSignalsHistory({ limit: 50 }),
        getHistoricalRiskEvents({ limit: 50 }),
      ]);

      if (decRes.success && decRes.data) {
        setDecisions(decRes.data);
      }
      if (sigRes.success && sigRes.data) {
        setSignals(sigRes.data);
      }
      if (riskRes.success && riskRes.data) {
        setRiskEvents(riskRes.data);
      }
    } catch (err) {
      console.warn('[DecisionTimeline] Error fetching timeline historical data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTimelineData();
  }, []);

  // Filtered decisions list
  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      // 1. Text Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesAction = d.action.toLowerCase().includes(query);
        const matchesReasoning = (d.reasoning || '').toLowerCase().includes(query);
        const matchesStrategy = (d.strategy || '').toLowerCase().includes(query);
        const matchesProvider = (d.provider || '').toLowerCase().includes(query);
        if (!matchesAction && !matchesReasoning && !matchesStrategy && !matchesProvider) {
          return false;
        }
      }

      // 2. Tab Filter
      if (filter === 'ALL') return true;
      if (filter === 'BUY') return d.action === 'BUY';
      if (filter === 'SELL') return d.action === 'SELL';
      if (filter === 'HOLD') return d.action === 'HOLD';
      if (filter === 'EXECUTED') return d.executed === true;
      if (filter === 'BLOCKED') {
        const matchedRisk = findMatchingRiskEvent(d, riskEvents);
        const riskClass = classifyRiskStatus(d, matchedRisk);
        return riskClass.status === 'BLOCKED';
      }

      return true;
    });
  }, [decisions, filter, searchQuery, riskEvents]);

  // Compute filter counts
  const filterCounts = useMemo(() => {
    let buy = 0;
    let sell = 0;
    let hold = 0;
    let executed = 0;
    let blocked = 0;

    decisions.forEach((d) => {
      if (d.action === 'BUY') buy++;
      if (d.action === 'SELL') sell++;
      if (d.action === 'HOLD') hold++;
      if (d.executed) executed++;

      const matchedRisk = findMatchingRiskEvent(d, riskEvents);
      const riskClass = classifyRiskStatus(d, matchedRisk);
      if (riskClass.status === 'BLOCKED') blocked++;
    });

    return {
      ALL: decisions.length,
      BUY: buy,
      SELL: sell,
      HOLD: hold,
      EXECUTED: executed,
      BLOCKED: blocked,
    };
  }, [decisions, riskEvents]);

  return (
    <div className={`glass-card p-4 space-y-4 ${className}`}>
      {/* 1. Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-nexus-accent/15 border border-nexus-accent/30 text-nexus-accent">
            <Clock size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-xs text-nexus-textPrimary tracking-tight">
                Autonomous Decision Timeline
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/[0.04] border border-white/[0.08] text-nexus-textMuted">
                Market Memory
              </span>
            </div>
            <p className="text-[10px] font-mono text-nexus-textMuted">
              Market State → Intelligence Vector → AI Reasoning → Risk Authority Gate → Outcome
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nexus-textMuted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rationale..."
              className="pl-7 pr-2.5 py-1 w-32 sm:w-40 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[11px] font-mono text-nexus-textPrimary placeholder:text-nexus-textMuted/50 focus:outline-none focus:border-nexus-accent/40 transition-colors"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchTimelineData}
            disabled={isLoading}
            title="Refresh Historical Decisions"
            className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-nexus-textMuted hover:text-nexus-textPrimary transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-nexus-accent' : ''} />
          </button>
        </div>
      </div>

      {/* 2. Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
        <span className="text-[10px] text-nexus-textMuted uppercase flex items-center gap-1 mr-1">
          <Filter size={10} /> Filter:
        </span>
        {(['ALL', 'BUY', 'SELL', 'HOLD', 'EXECUTED', 'BLOCKED'] as TimelineFilter[]).map((f) => {
          const isActive = filter === f;
          const count = filterCounts[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded border text-[11px] transition-all flex items-center gap-1 cursor-pointer ${
                isActive
                  ? 'bg-nexus-accent/15 text-nexus-accent border-nexus-accent/40 font-semibold shadow-sm'
                  : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] hover:bg-white/[0.04]'
              }`}
            >
              <span>{f}</span>
              <span className={`text-[10px] ${isActive ? 'text-nexus-accent' : 'text-nexus-textMuted/60'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Chronological Vertical Timeline Feed */}
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {filteredDecisions.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-white/[0.01] border border-white/[0.04] space-y-2">
            <Activity size={24} className="mx-auto text-nexus-textMuted/40" />
            <div className="text-xs font-mono text-nexus-textSecondary">
              No historical decisions found matching filter
            </div>
            <p className="text-[11px] font-body text-nexus-textMuted max-w-sm mx-auto">
              Autonomous cycles continuously stream into memory. Adjust filters or trigger a refresh.
            </p>
          </div>
        ) : (
          <div className="relative pl-6 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-[2px] before:bg-white/[0.08]">
            {filteredDecisions.map((decision) => {
              const matchedSignal = findMatchingSignalSnapshot(decision, signals);
              const matchedRisk = findMatchingRiskEvent(decision, riskEvents);
              const riskClassification = classifyRiskStatus(decision, matchedRisk);
              const outcome = determineDecisionOutcome(decision, riskClassification, trades);
              const isSelected = selectedDecisionId === decision.id;
              const isExpanded = expandedId === decision.id;
              const isFailsafe = decision.decisionType === 'failsafe_hold' || decision.provider === 'fallback_hold';
              const isBuy = decision.action === 'BUY';
              const isSell = decision.action === 'SELL';
              const isHold = decision.action === 'HOLD';
              const isExecuted = decision.executed || riskClassification.status === 'EXECUTED';
              const isBlocked = riskClassification.status === 'BLOCKED';

              // Node dot styling along the timeline spine
              let nodeColor = 'bg-slate-400';
              if (isExecuted) {
                nodeColor = isBuy
                  ? 'bg-nexus-bull shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : isSell
                  ? 'bg-nexus-bear shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                  : 'bg-nexus-accent shadow-[0_0_8px_rgba(0,240,255,0.5)]';
              } else if (isBlocked) {
                nodeColor = 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]';
              } else if (isFailsafe) {
                nodeColor = 'bg-amber-400';
              }

              const confPct = Math.round(decision.confidence <= 1 ? decision.confidence * 100 : decision.confidence);

              return (
                <div
                  key={decision.id}
                  className={`relative mb-3 rounded-xl border transition-all text-xs font-mono ${
                    isSelected
                      ? 'bg-nexus-elevated border-nexus-accent/60 shadow-[0_0_15px_rgba(0,240,255,0.12)]'
                      : isHold && !isFailsafe
                      ? 'bg-[#090B0E]/80 border-white/[0.05] hover:border-white/[0.12] hover:bg-white/[0.02]'
                      : 'bg-nexus-elevated/70 border-white/[0.08] hover:border-white/[0.16]'
                  }`}
                >
                  {/* Spine Node Dot */}
                  <span
                    className={`absolute -left-[29px] top-4 w-3.5 h-3.5 rounded-full border-2 border-[#090B0E] ${nodeColor} ${
                      isSelected ? 'ring-2 ring-nexus-accent' : ''
                    }`}
                  />

                  {/* Top Bar: Primary Summary (Always Scannable) */}
                  <div
                    onClick={() => {
                      if (onSelectDecision) onSelectDecision(decision);
                      if (onSyncChart) onSyncChart(decision.timestamp);
                    }}
                    className="p-3.5 cursor-pointer flex flex-wrap items-center justify-between gap-2.5"
                  >
                    {/* Left: Timestamp + Action + Strategy */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Action Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border uppercase ${
                          isExecuted
                            ? isBuy
                              ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                              : isSell
                              ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                              : 'bg-nexus-accent/15 text-nexus-accent border-nexus-accent/30'
                            : isBlocked
                            ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                            : isFailsafe
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                        }`}
                      >
                        {decision.action}
                      </span>

                      {/* Conviction */}
                      <span className="text-[11px] text-nexus-textPrimary font-semibold">
                        {confPct}% conf
                      </span>

                      {/* Strategy */}
                      <span className="text-[11px] text-nexus-textMuted capitalize">
                        {decision.strategy.replace(/_/g, ' ')}
                      </span>

                      {/* Active Chip */}
                      {isSelected && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 animate-pulse">
                          ★ Active on Chart
                        </span>
                      )}
                    </div>

                    {/* Right: Timestamp + Risk Gate Classification + Outcome */}
                    <div className="flex flex-wrap items-center gap-2 text-right">
                      {/* Risk Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${riskClassification.badgeStyle}`}
                      >
                        {riskClassification.badgeLabel}
                      </span>

                      {/* Outcome Badge */}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${outcome.badgeStyle}`}>
                        {outcome.label}
                      </span>

                      {/* Time */}
                      <span className="text-[10px] text-nexus-textMuted flex items-center gap-1">
                        <Clock size={10} />
                        {formatTimestamp(decision.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Concise Reasoning Strip */}
                  {decision.reasoning && (
                    <div className="px-3.5 pb-2 text-[11px] text-nexus-textMuted/90 font-mono leading-relaxed line-clamp-2">
                      &ldquo;
                      {(decision.reasoning || '').includes('[unsourced figure removed]') ? (
                        <>
                          {(decision.reasoning || '').split('[unsourced figure removed]').map((seg, i, a) => (
                            <span key={i}>
                              {seg}
                              {i < a.length - 1 && (
                                <span className="text-nexus-caution font-bold bg-nexus-caution/20 px-1 py-0.5 rounded text-[9px] mx-0.5">
                                  [redacted]
                                </span>
                              )}
                            </span>
                          ))}
                        </>
                      ) : (
                        decision.reasoning
                      )}
                      &rdquo;
                    </div>
                  )}

                  {/* 5-Layer Sequence Flow Breakdown (Expandable Details) */}
                  <div className="px-3.5 pb-3 pt-1 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-nexus-textMuted">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 text-nexus-textSecondary">
                        <span>Price:</span>
                        <span className="font-semibold text-nexus-textPrimary font-mono">
                          {formatPrice(decision.marketPrice || decision.price || 0)}
                        </span>
                      </span>

                      <span>•</span>

                      <span className="flex items-center gap-1 text-nexus-textSecondary">
                        <span>Fused Score:</span>
                        <span
                          className={`font-semibold ${
                            (decision.fusedScore || 0) > 0
                              ? 'text-nexus-bull'
                              : (decision.fusedScore || 0) < 0
                              ? 'text-nexus-bear'
                              : 'text-nexus-textMuted'
                          }`}
                        >
                          {(decision.fusedScore || 0) > 0 ? `+${(decision.fusedScore || 0).toFixed(3)}` : (decision.fusedScore || 0).toFixed(3)}
                        </span>
                      </span>

                      <span>•</span>

                      <span className="flex items-center gap-1 text-nexus-textSecondary">
                        <span>Model:</span>
                        <span className="text-nexus-textPrimary truncate max-w-[130px]">
                          {decision.provider || 'unknown'}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Toggle Flow Layers */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : decision.id);
                        }}
                        className="px-2 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.06] text-nexus-textMuted hover:text-nexus-textPrimary transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>Lifecycle Details</span>
                        {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>

                      {/* Inspect Rationale Action */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectDecision) onSelectDecision(decision);
                          if (onSyncChart) onSyncChart(decision.timestamp);
                        }}
                        title="Open Deep Rationale Drawer & Center Chart"
                        className="px-2.5 py-0.5 rounded bg-nexus-accent/10 hover:bg-nexus-accent/20 border border-nexus-accent/30 text-nexus-accent font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye size={11} />
                        Inspect Rationale
                      </button>
                    </div>
                  </div>

                  {/* Expanded 5-Layer Lifecycle Panel */}
                  {isExpanded && (
                    <div className="p-3.5 bg-black/40 border-t border-white/[0.06] space-y-3 rounded-b-xl text-[11px]">
                      {/* Layer 1: Market Observation */}
                      <div className="flex items-start gap-2">
                        <div className="w-20 shrink-0 text-nexus-textMuted uppercase font-bold text-[10px]">
                          1. Market:
                        </div>
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-[10px] text-nexus-textMuted block">Symbol</span>
                            <span className="font-semibold text-nexus-textPrimary">{decision.symbol}</span>
                          </div>
                          <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-[10px] text-nexus-textMuted block">Price</span>
                            <span className="font-semibold text-nexus-textPrimary">
                              {formatPrice(decision.marketPrice || decision.price || 0)}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-[10px] text-nexus-textMuted block">Regime</span>
                            <span className="font-semibold text-nexus-accent capitalize">
                              {decision.regime || 'Ranging'}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-[10px] text-nexus-textMuted block">Exact Timestamp</span>
                            <span className="font-mono text-nexus-textMuted">{decision.timestamp}</span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 2: 5-Engine Intelligence */}
                      <div className="flex items-start gap-2">
                        <div className="w-20 shrink-0 text-nexus-textMuted uppercase font-bold text-[10px]">
                          2. Intelligence:
                        </div>
                        <div className="flex-1 space-y-1.5">
                          {matchedSignal ? (
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px]">
                              <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
                                <span className="text-nexus-textMuted block">Technical</span>
                                <span className="font-semibold text-nexus-textPrimary">
                                  {matchedSignal.technical?.score !== undefined ? `${matchedSignal.technical.score > 0 ? '+' : ''}${matchedSignal.technical.score.toFixed(2)}` : 'N/A'}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
                                <span className="text-nexus-textMuted block">Liquidity</span>
                                <span className="font-semibold text-nexus-textPrimary">
                                  {matchedSignal.liquidity?.score !== undefined ? `${matchedSignal.liquidity.score > 0 ? '+' : ''}${matchedSignal.liquidity.score.toFixed(2)}` : 'N/A'}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
                                <span className="text-nexus-textMuted block">Sentiment</span>
                                <span className="font-semibold text-nexus-textPrimary">
                                  {matchedSignal.sentiment?.score !== undefined ? `${matchedSignal.sentiment.score > 0 ? '+' : ''}${matchedSignal.sentiment.score.toFixed(2)}` : 'N/A'}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
                                <span className="text-nexus-textMuted block">On-Chain</span>
                                <span className="font-semibold text-nexus-textPrimary">
                                  {matchedSignal.onchain?.score !== undefined ? `${matchedSignal.onchain.score > 0 ? '+' : ''}${matchedSignal.onchain.score.toFixed(2)}` : 'N/A'}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
                                <span className="text-nexus-textMuted block">News</span>
                                <span className="font-semibold text-nexus-textPrimary">
                                  {matchedSignal.news?.score !== undefined ? `${matchedSignal.news.score > 0 ? '+' : ''}${matchedSignal.news.score.toFixed(2)}` : 'N/A'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-2 rounded bg-white/[0.01] border border-white/[0.04] text-nexus-textMuted/70 italic flex items-center gap-1.5 text-[10px]">
                              <Radio size={11} />
                              <span>Signal snapshot unavailable for this decision cycle</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Layer 3: AI Model Telemetry */}
                      <div className="flex items-start gap-2">
                        <div className="w-20 shrink-0 text-nexus-textMuted uppercase font-bold text-[10px]">
                          3. AI Model:
                        </div>
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-[10px] text-nexus-textMuted block">Provider / Identity</span>
                            <span className="font-semibold text-nexus-textPrimary break-all">
                              {decision.provider || 'unknown'}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-[10px] text-nexus-textMuted block">Inference Latency</span>
                            <span className="font-semibold text-nexus-textPrimary">
                              {decision.latencyMs ? `${decision.latencyMs}ms` : 'Recorded'}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-[10px] text-nexus-textMuted block">Decision Type</span>
                            <span className="font-semibold text-nexus-textPrimary capitalize">
                              {decision.decisionType ? decision.decisionType.replace(/_/g, ' ') : 'Model'}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-[10px] text-nexus-textMuted block">Truth Provenance</span>
                            <span className="font-semibold text-nexus-textPrimary flex items-center gap-1">
                              {(decision.reasoning || '').includes('[unsourced figure removed]') ? (
                                <>
                                  <ShieldAlert size={12} className="text-nexus-caution" />
                                  <span className="text-nexus-caution">Sanitized</span>
                                </>
                              ) : (
                                <>
                                  <ShieldCheck size={12} className="text-nexus-bull" />
                                  <span className="text-nexus-bull">Verified</span>
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 4: Risk Gate */}
                      <div className="flex items-start gap-2">
                        <div className="w-20 shrink-0 text-nexus-textMuted uppercase font-bold text-[10px]">
                          4. Risk Gate:
                        </div>
                        <div className="flex-1 p-2 rounded bg-white/[0.02] border border-white/[0.04] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-nexus-textPrimary">
                              {riskClassification.resultTitle}
                            </span>
                            <span className="text-[10px] text-nexus-textMuted">
                              {matchedRisk ? 'Verified Risk Event' : 'Autonomous Gate State'}
                            </span>
                          </div>
                          <p className="text-[10px] text-nexus-textMuted leading-relaxed">
                            {riskClassification.resultDetail}
                          </p>
                        </div>
                      </div>

                      {/* Layer 5: Execution & Outcome */}
                      <div className="flex items-start gap-2">
                        <div className="w-20 shrink-0 text-nexus-textMuted uppercase font-bold text-[10px]">
                          5. Outcome:
                        </div>
                        <div className="flex-1 p-2 rounded bg-white/[0.02] border border-white/[0.04] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-nexus-textPrimary">
                              {outcome.label}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${outcome.badgeStyle}`}>
                              {outcome.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-nexus-textMuted leading-relaxed">
                            {outcome.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
