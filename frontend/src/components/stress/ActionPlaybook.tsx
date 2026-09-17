import React from 'react';
import { Shield, RefreshCw, Target, ArrowUpRight } from 'lucide-react';
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
          <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2 font-display">
            <Shield className="w-4 h-4 text-nexus-accent" /> Actionable Execution Playbook
          </h3>
          <p className="text-xs text-nexus-textSecondary mt-0.5">
            Prescriptive hedging, rebalancing, and opportunistic dip-buy triggers
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenShareModal}
          className="px-3.5 py-1.5 rounded-lg bg-nexus-accent/20 hover:bg-nexus-accent/30 border border-nexus-accent/40 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(0,200,255,0.2)] cursor-pointer"
        >
          <span>Share to X (#BitgetHackathon)</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-nexus-accent" />
        </button>
      </div>

      {/* 3 Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Defensive Hedge */}
        <div className="bg-[#06090F] p-4 rounded-xl border border-white/[0.06] hover:border-nexus-bull/40 transition-all space-y-3">
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

        {/* Card 2: Dynamic Rebalance */}
        <div className="bg-[#06090F] p-4 rounded-xl border border-white/[0.06] hover:border-nexus-accent/40 transition-all space-y-3">
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

        {/* Card 3: Opportunistic Dip-Buy */}
        <div className="bg-[#06090F] p-4 rounded-xl border border-white/[0.06] hover:border-[#00E5FF]/40 transition-all space-y-3">
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
      </div>
    </div>
  );
};
