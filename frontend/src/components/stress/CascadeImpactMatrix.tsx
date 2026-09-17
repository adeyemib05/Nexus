import React from 'react';
import { Cpu, Zap, AlertTriangle, Sparkles } from 'lucide-react';
import { QwenAnalysisResponse } from '../../types';

interface CascadeImpactMatrixProps {
  qwenReasoning?: QwenAnalysisResponse;
  isLoading: boolean;
  symbol: string;
}

export const CascadeImpactMatrix: React.FC<CascadeImpactMatrixProps> = ({
  qwenReasoning,
  isLoading,
  symbol,
}) => {
  if (isLoading) {
    return (
      <div className="bg-[#0C1220] border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-nexus-accent animate-spin" />
            <h3 className="text-base font-bold text-white font-display">Qwen 3.8 Max Reasoning Engine</h3>
          </div>
          <span className="px-2 py-0.5 rounded bg-nexus-accent/10 text-nexus-accent text-xs font-mono border border-nexus-accent/30 animate-pulse">
            Synthesizing Shocks...
          </span>
        </div>
        <div className="space-y-3 animate-pulse">
          <div className="h-14 rounded-xl bg-white/5" />
          <div className="h-14 rounded-xl bg-white/5" />
          <div className="h-14 rounded-xl bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0C1220] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-nexus-accent/20 flex items-center justify-center border border-nexus-accent/40">
              <Cpu className="w-3.5 h-3.5 text-nexus-accent" />
            </div>
            <h3 className="text-base font-bold text-white tracking-wide font-display">
              Cascade Transmission Matrix
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-nexus-accent/10 text-nexus-accent text-[10px] font-mono border border-nexus-accent/30">
              <Sparkles className="w-2.5 h-2.5" />
              Qwen 3.8 Max Live
            </span>
          </div>
          <p className="text-xs text-nexus-textSecondary mt-0.5">
            Multi-order structural risk propagation across macro, collateral, and weekend on-chain liquidity
          </p>
        </div>
      </div>

      {/* Summary Banner */}
      {qwenReasoning?.summary && (
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-nexus-accent/10 via-nexus-bull/5 to-transparent border border-nexus-accent/25 text-xs text-gray-200 flex items-start gap-2.5">
          <Zap className="w-4 h-4 text-nexus-accent flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed font-medium">{qwenReasoning.summary}</span>
        </div>
      )}

      {/* 3-Order Transmission Ladder */}
      <div className="space-y-3 relative before:absolute before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-gradient-to-b before:from-[#10B981] before:via-[#00C8FF] before:to-[#EF4444] before:opacity-40">
        {/* 1st Order */}
        <div className="relative pl-12">
          <div className="absolute left-3 top-2.5 w-4 h-4 rounded-full bg-[#06090F] border-2 border-[#10B981] flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
          </div>
          <div className="bg-[#06090F] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-[#10B981] uppercase tracking-wider">
                1st Order: Valuation Shock
              </span>
              <span className="text-[10px] text-gray-400 font-mono">T + 0 Hours</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              {qwenReasoning?.firstOrder || `Direct valuation re-rating: High-beta selling pressure compresses ${symbol}'s immediate trading multiple.`}
            </p>
          </div>
        </div>

        {/* 2nd Order */}
        <div className="relative pl-12">
          <div className="absolute left-3 top-2.5 w-4 h-4 rounded-full bg-[#06090F] border-2 border-[#00C8FF] flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00C8FF]" />
          </div>
          <div className="bg-[#06090F] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-[#00C8FF] uppercase tracking-wider">
                2nd Order: Collateral Contagion
              </span>
              <span className="text-[10px] text-gray-400 font-mono">T + 12–24 Hours</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              {qwenReasoning?.secondOrder || `Deleveraging spreads into related tech equities and crypto collateral, accelerating algorithmic margin call triggers.`}
            </p>
          </div>
        </div>

        {/* 3rd Order */}
        <div className="relative pl-12">
          <div className="absolute left-3 top-2.5 w-4 h-4 rounded-full bg-[#06090F] border-2 border-[#EF4444] flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
          </div>
          <div className="bg-[#06090F] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-[#EF4444] uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-[#EF4444]" />
                3rd Order: 7×24 Weekend Liquidity Trap
              </span>
              <span className="text-[10px] text-[#EF4444] font-mono">Saturday / Sunday</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              {qwenReasoning?.thirdOrderWeekend || `Traditional markets close while ${symbol} rTokens remain live on Bitget; thin orderbooks widen bid-ask spreads significantly.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
