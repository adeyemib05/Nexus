import { Activity, ShieldCheck, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import type { AgentState, Trade } from '../../types';
import { formatPrice, formatPct, formatTimestamp } from '../../lib/utils';
import { useRelativeTime } from '../../hooks/useRelativeTime';

interface RecentAiActivityProps {
  agentState: AgentState | null;
  trades: Trade[];
  currentPrice?: number;
}

export default function RecentAiActivity({ agentState, trades, currentPrice }: RecentAiActivityProps) {
  const lastDecision = agentState?.lastAiDecision;
  const lastCycleTime = useRelativeTime(agentState?.lastCycleAt || Date.now());

  const currentAction = (lastDecision?.action || 'hold').toUpperCase();
  const currentConfidence = lastDecision
    ? Math.round(lastDecision.confidence <= 1 ? lastDecision.confidence * 100 : lastDecision.confidence)
    : 80;
  const currentStrategy = lastDecision?.strategy
    ? lastDecision.strategy.replace(/_/g, ' ')
    : 'Capital Protection';

  return (
    <div className="glass-card p-4 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-nexus-accent" />
          <h3 className="font-display font-semibold text-xs text-nexus-textPrimary tracking-tight">
            Recent AI Activity & Executions
          </h3>
        </div>
        <span className="text-[10px] font-mono text-nexus-textMuted">
          Cycle #{agentState?.cycleCount || 1}
        </span>
      </div>

      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
        {/* Latest Active AI Evaluation Row (Always Present) */}
        <div className="p-3 rounded-lg bg-nexus-elevated border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-nexus-textMuted">
            <span className="flex items-center gap-1.5 text-nexus-accent font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-pulse" />
              LATEST CYCLE EVALUATION
            </span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {lastCycleTime}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold uppercase border ${
                  currentAction === 'BUY'
                    ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                    : currentAction === 'SELL'
                    ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                    : 'bg-nexus-caution/15 text-nexus-caution border-nexus-caution/30'
                }`}
              >
                {currentAction}
              </span>
              <div>
                <div className="text-xs font-medium text-nexus-textPrimary capitalize">{currentStrategy}</div>
                <div className="text-[10px] font-mono text-nexus-textMuted">{currentConfidence}% conviction</div>
              </div>
            </div>

            <div className="text-right">
              {lastDecision?.executed ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-nexus-bull/10 text-nexus-bull border border-nexus-bull/20">
                  <CheckCircle2 size={11} /> EXECUTED
                </span>
              ) : lastDecision?.blockReason ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-nexus-bear/10 text-nexus-bear border border-nexus-bear/20" title={lastDecision.blockReason}>
                  <AlertTriangle size={11} /> BLOCKED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-nexus-caution/10 text-nexus-caution border border-nexus-caution/20">
                  <ShieldCheck size={11} /> PRESERVED
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Trade Executions Feed */}
        {trades.length === 0 ? (
          <div className="p-4 rounded-xl bg-white/[0.01] border border-white/[0.04] text-center space-y-1.5">
            <div className="text-xs font-mono text-nexus-textSecondary">
              Continuous Market Evaluation Active
            </div>
            <p className="text-[11px] text-nexus-textMuted font-body leading-relaxed max-w-sm mx-auto">
              NEXUS is actively computing 5-signal fusion vectors. No high-risk or low-conviction orders will be placed while holding capital protection.
            </p>
          </div>
        ) : (
          trades.slice(0, 5).map((trade) => {
            const isOpen = trade.status === 'open';
            const unrealizedPct =
              isOpen && currentPrice
                ? trade.side === 'long'
                  ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
                  : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100
                : null;

            return (
              <div
                key={trade.id}
                className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                        trade.side === 'long'
                          ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                          : 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                      }`}
                    >
                      {trade.side === 'long' ? (
                        <span className="flex items-center gap-0.5">
                          <ArrowUpRight size={10} /> BUY LONG
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5">
                          <ArrowDownRight size={10} /> SELL SHORT
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-mono text-nexus-textPrimary">{trade.symbol}</span>
                    <span className="text-[10px] font-body text-nexus-textMuted capitalize">
                      {trade.strategy.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-nexus-textMuted">
                    {formatTimestamp(trade.openedAt)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono pt-1">
                  <span className="text-nexus-textSecondary">
                    Entry: {formatPrice(trade.entryPrice)}
                  </span>

                  {isOpen && unrealizedPct !== null && (
                    <span className={unrealizedPct >= 0 ? 'text-nexus-bull font-bold' : 'text-nexus-bear font-bold'}>
                      {formatPct(unrealizedPct)} (unrealized)
                    </span>
                  )}

                  {!isOpen && trade.status === 'closed' && (
                    <span className={(trade.pnl || 0) >= 0 ? 'text-nexus-bull font-bold' : 'text-nexus-bear font-bold'}>
                      {formatPrice(Math.abs(trade.pnl || 0))} ({formatPct(trade.pnlPct ? trade.pnlPct * 100 : 0)})
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
