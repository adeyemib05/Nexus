import React, { useState } from 'react';
import { Shield, RefreshCw, Target, ArrowUpRight, Sparkles, CheckCircle2, Lock } from 'lucide-react';
import { StressResult } from '../../types';

interface ActionPlaybookProps {
  result: StressResult;
  onOpenShareModal: () => void;
}

export const ActionPlaybook: React.FC<ActionPlaybookProps> = ({
  result,
  onOpenShareModal,
}) => {
  const { qwenReasoning, symbol, userPositionSize } = result;

  const [stagedActions, setStagedActions] = useState<{
    hedge: boolean;
    rebalance: boolean;
    dip: boolean;
  }>({
    hedge: false,
    rebalance: false,
    dip: false,
  });

  const hedge = qwenReasoning?.defensiveHedge || {
    action: 'Defensive Delta Neutralizer',
    targetAsset: 'Inverse Tech (SOXS / rUSDC)',
    allocationUsd: Math.round(userPositionSize * 0.12),
    expectedProtectionPct: 75,
  };

  const rebalance = qwenReasoning?.rebalanceAdvice || `Trim 15% of open ${symbol} risk into tokenized short-term treasuries (rTBILL) until the VIX drops below 22.`;
  const dipPrice = qwenReasoning?.opportunisticDipPrice || Number((result.projectedPrice * 0.97).toFixed(2));

  return (
    <div className="bg-[#0C1220] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2 font-display">
              <Shield className="w-4 h-4 text-nexus-accent" /> AI-Generated Defensive Playbook
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[10px] font-mono border border-purple-500/30">
              <Sparkles className="w-2.5 h-2.5" />
              AI PROPOSAL · HUMAN APPROVAL
            </span>
          </div>
          <p className="text-xs text-nexus-textSecondary mt-0.5">
            AI-proposed hedging, rebalancing, and limit triggers. Quantitative scenario guidance for human trader evaluation — not guaranteed financial outcomes.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenShareModal}
          className="px-3.5 py-1.5 rounded-lg bg-nexus-accent/20 hover:bg-nexus-accent/30 border border-nexus-accent/40 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(0,200,255,0.2)] cursor-pointer self-start sm:self-auto"
        >
          <span>Share to X (#BitgetHackathon)</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-nexus-accent" />
        </button>
      </div>

      {/* 3 Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Defensive Hedge */}
        <div className="bg-[#06090F] p-4 rounded-xl border border-white/[0.06] hover:border-nexus-bull/40 transition-all space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-nexus-bull uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-nexus-bull" />
                1. Defensive Hedge
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-nexus-bull/10 text-nexus-bull border border-nexus-bull/30">
                {hedge.expectedProtectionPct}% Protected
              </span>
            </div>

            <div>
              <span className="text-xs font-bold text-white block mb-1">{hedge.action}</span>
              <span className="text-xs text-gray-400 block">Instrument: {hedge.targetAsset}</span>
            </div>

            <div className="bg-[#0C1220] p-2.5 rounded-lg flex items-center justify-between font-mono">
              <span className="text-[11px] text-gray-400">Target Allocation:</span>
              <span className="text-sm font-bold text-nexus-bull">
                ${hedge.allocationUsd.toLocaleString()}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStagedActions((prev) => ({ ...prev, hedge: !prev.hedge }))}
            className={`w-full mt-3 py-1.5 px-3 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              stagedActions.hedge
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
            }`}
          >
            {stagedActions.hedge ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hedge Staged (Trader Approved)</span>
              </>
            ) : (
              <>
                <Shield className="w-3.5 h-3.5 text-gray-400" />
                <span>Stage Defensive Hedge</span>
              </>
            )}
          </button>
        </div>

        {/* Card 2: Dynamic Rebalance */}
        <div className="bg-[#06090F] p-4 rounded-xl border border-white/[0.06] hover:border-nexus-accent/40 transition-all space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-nexus-accent uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-nexus-accent" />
                2. Liquidity Rebalance
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-nexus-accent/10 text-nexus-accent border border-nexus-accent/30">
                Risk Reduction
              </span>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed min-h-[48px]">
              {rebalance}
            </p>

            <div className="bg-[#0C1220] p-2.5 rounded-lg flex items-center justify-between font-mono">
              <span className="text-[11px] text-gray-400">Yield Defense:</span>
              <span className="text-xs font-bold text-nexus-accent">rTBILL / rUSDC</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStagedActions((prev) => ({ ...prev, rebalance: !prev.rebalance }))}
            className={`w-full mt-3 py-1.5 px-3 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              stagedActions.rebalance
                ? 'bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
            }`}
          >
            {stagedActions.rebalance ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-nexus-accent" />
                <span>Rebalance Staged (Trader Approved)</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                <span>Stage Rebalance Order</span>
              </>
            )}
          </button>
        </div>

        {/* Card 3: Opportunistic Dip-Buy */}
        <div className="bg-[#06090F] p-4 rounded-xl border border-white/[0.06] hover:border-[#00E5FF]/40 transition-all space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-[#00E5FF] uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#00E5FF]" />
                3. Opportunistic Entry
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30">
                Alpha Strike
              </span>
            </div>

            <div>
              <span className="text-xs font-bold text-white block mb-1">Pre-Set Crash Accumulation</span>
              <span className="text-xs text-gray-400 block">Deploy staggered limit buys when cascade flushes.</span>
            </div>

            <div className="bg-[#0C1220] p-2.5 rounded-lg flex items-center justify-between font-mono">
              <span className="text-[11px] text-gray-400">Trigger Limit Price:</span>
              <span className="text-sm font-bold text-[#00E5FF]">
                ${dipPrice}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStagedActions((prev) => ({ ...prev, dip: !prev.dip }))}
            className={`w-full mt-3 py-1.5 px-3 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              stagedActions.dip
                ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
            }`}
          >
            {stagedActions.dip ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span>Limit Armed (Trader Approved)</span>
              </>
            ) : (
              <>
                <Target className="w-3.5 h-3.5 text-gray-400" />
                <span>Arm Limit Trigger</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Human-in-the-loop Governance Footer */}
      <div className="pt-2 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-gray-400 font-mono">
        <span className="flex items-center gap-1.5 text-gray-400">
          <Lock className="w-3.5 h-3.5 text-nexus-accent flex-shrink-0" />
          <span>Human Trader Governance: All staged actions require final trader confirmation prior to execution on Bitget.</span>
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 whitespace-nowrap self-end sm:self-auto">
          {Object.values(stagedActions).filter(Boolean).length}/3 Actions Staged
        </span>
      </div>
    </div>
  );
};

