import { Shield, Brain, CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import type { AgentState, RegimeReading } from '../../types';
import { REGIME_CONFIG } from '../../types';

interface AiDecisionHeroProps {
  agentState: AgentState | null;
  currentRegime: RegimeReading | null;
}

export default function AiDecisionHero({ agentState, currentRegime }: AiDecisionHeroProps) {
  const decision = agentState?.lastAiDecision;

  // Extract decision fields with deterministic fallbacks if cycle hasn't fired yet
  const action = (decision?.action || 'hold').toUpperCase();
  const confidence = decision
    ? Math.round(decision.confidence <= 1 ? decision.confidence * 100 : decision.confidence)
    : currentRegime?.confidence ?? 80;

  const strategy = decision?.strategy
    ? decision.strategy.replace(/_/g, ' ')
    : currentRegime?.regime
    ? REGIME_CONFIG[currentRegime.regime]?.strategy || 'Capital Protection'
    : 'Capital Protection';

  const provider = decision?.provider || 'Qwen 3.8 Max';
  const reasoning =
    decision?.reasoning ||
    currentRegime?.reasoning ||
    'Autonomous agent is monitoring 5-signal intelligence feeds. Maintaining capital protection until high-conviction setup emerges.';

  const isExecuted = decision ? decision.executed : false;
  const blockReason = decision?.blockReason || null;

  // Semantic styles for Action Pill
  const actionStyles =
    action === 'BUY'
      ? {
          badge: 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/40',
          dot: 'bg-nexus-bull',
          border: 'border-nexus-bull/30',
        }
      : action === 'SELL'
      ? {
          badge: 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/40',
          dot: 'bg-nexus-bear',
          border: 'border-nexus-bear/30',
        }
      : {
          badge: 'bg-nexus-caution/15 text-nexus-caution border-nexus-caution/40',
          dot: 'bg-nexus-caution',
          border: 'border-nexus-caution/30',
        };

  return (
    <div className="glass-card-elevated p-5 md:p-6 space-y-5">
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-nexus-accent/10 text-nexus-accent border border-nexus-accent/30 tracking-wider uppercase">
            <Brain size={12} className="text-nexus-accent" />
            Track 2 · Autonomous Agent
          </span>
          <span className="text-xs font-mono text-nexus-textMuted">
            Cycle #{agentState?.cycleCount || 1}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-nexus-textMuted">Provider:</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium text-nexus-textPrimary bg-white/[0.04] border border-white/[0.08]">
            {provider}
          </span>
        </div>
      </div>

      {/* Main Centerpiece Row */}
      <div className="grid lg:grid-cols-12 gap-5 items-center">
        {/* Left: Action + Confidence + Strategy (5 cols) */}
        <div className="lg:col-span-4 flex flex-col justify-center space-y-3">
          <span className="stat-label text-nexus-textMuted">CURRENT AI DECISION</span>
          <div className="flex items-center gap-4">
            <div
              className={`px-4 py-2.5 rounded-xl border text-2xl md:text-3xl font-display font-extrabold tracking-wider uppercase shadow-subtle ${actionStyles.badge}`}
            >
              {action}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-mono font-bold text-nexus-textPrimary">{confidence}%</span>
                <span className="text-[11px] font-mono text-nexus-textMuted uppercase">Confidence</span>
              </div>
              <div className="text-xs font-body font-medium text-nexus-textSecondary capitalize mt-0.5">
                {strategy}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Qwen Reasoning Quote (8 cols) */}
        <div className="lg:col-span-8">
          <div className="p-3.5 rounded-xl bg-nexus-void/70 border border-white/[0.06] border-l-2 border-l-nexus-accent">
            <div className="flex items-center gap-2 mb-1">
              <span className="stat-label text-nexus-accent">AI RATIONALE</span>
              <span className="text-[10px] font-mono text-nexus-textMuted">· Systematic Hypothesis</span>
            </div>
            <p className="text-xs md:text-sm text-nexus-textPrimary leading-relaxed font-body">
              &ldquo;{reasoning}&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* Sequential Execution Pipeline */}
      <div className="pt-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <span className="stat-label">DETERMINISTIC EXECUTION PIPELINE</span>
          <span className="text-[10px] font-mono text-nexus-textMuted">
            Deterministic Risk Gate holds final execution authority
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Stage 1: Ingest */}
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-nexus-accent flex-shrink-0" />
              <div>
                <div className="text-[11px] font-mono font-semibold text-nexus-textPrimary">1. Ingest</div>
                <div className="text-[10px] text-nexus-textMuted">5 Signals Synced</div>
              </div>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-nexus-accent/10 text-nexus-accent">
              ONLINE
            </span>
          </div>

          {/* Stage 2: AI Decision */}
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-nexus-accent flex-shrink-0" />
              <div>
                <div className="text-[11px] font-mono font-semibold text-nexus-textPrimary">2. AI Decision</div>
                <div className="text-[10px] text-nexus-textMuted">{action} Selected</div>
              </div>
            </div>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${actionStyles.badge}`}>
              {action}
            </span>
          </div>

          {/* Stage 3: Risk Gate */}
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {blockReason ? (
                <AlertTriangle size={14} className="text-nexus-bear flex-shrink-0" />
              ) : (
                <ShieldCheck size={14} className="text-nexus-bull flex-shrink-0" />
              )}
              <div>
                <div className="text-[11px] font-mono font-semibold text-nexus-textPrimary">3. Risk Gate</div>
                <div className="text-[10px] text-nexus-textMuted truncate max-w-[110px]" title={blockReason || 'All limits cleared'}>
                  {blockReason ? 'Action Blocked' : 'Limits Verified'}
                </div>
              </div>
            </div>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                blockReason
                  ? 'bg-nexus-bear/10 text-nexus-bear border border-nexus-bear/20'
                  : 'bg-nexus-bull/10 text-nexus-bull border border-nexus-bull/20'
              }`}
            >
              {blockReason ? 'BLOCKED' : 'CLEARED'}
            </span>
          </div>

          {/* Stage 4: Execution */}
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isExecuted ? (
                <CheckCircle2 size={14} className="text-nexus-bull flex-shrink-0" />
              ) : action === 'HOLD' ? (
                <Shield size={14} className="text-nexus-caution flex-shrink-0" />
              ) : (
                <XCircle size={14} className="text-nexus-bear flex-shrink-0" />
              )}
              <div>
                <div className="text-[11px] font-mono font-semibold text-nexus-textPrimary">4. Execution</div>
                <div className="text-[10px] text-nexus-textMuted">
                  {isExecuted
                    ? 'Sim Order Filled'
                    : action === 'HOLD'
                    ? 'Capital Preserved'
                    : 'No Trade Executed'}
                </div>
              </div>
            </div>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                isExecuted
                  ? 'bg-nexus-bull/10 text-nexus-bull border border-nexus-bull/20'
                  : action === 'HOLD'
                  ? 'bg-nexus-caution/10 text-nexus-caution border border-nexus-caution/20'
                  : 'bg-white/5 text-nexus-textMuted border border-white/10'
              }`}
            >
              {isExecuted ? 'EXECUTED' : action === 'HOLD' ? 'PRESERVED' : 'HALTED'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
