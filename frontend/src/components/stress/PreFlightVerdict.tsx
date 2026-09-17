import React from 'react';
import { ShieldCheck, AlertTriangle, XOctagon, Lock, DollarSign, TrendingDown, Clock } from 'lucide-react';
import { StressResult, EquityData } from '../../types';

interface PreFlightVerdictProps {
  result: StressResult;
  equity: EquityData;
}

export const PreFlightVerdict: React.FC<PreFlightVerdictProps> = ({ result, equity }) => {
  const { resilienceScore, verdict, verdictReason, projectedDrawdownPct, projectedLossUsd, weekendLiquidityPenaltyPct, estimatedSlippageUsd, projectedPrice, userPositionSize } = result;

  const verdictConfig = {
    PASSED: {
      label: 'STRESS TEST PASSED',
      sublabel: 'Low Vulnerability — Position Well-Buffered',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.25)]',
      icon: ShieldCheck,
      color: '#10B981',
      ringColor: '#10B981',
    },
    FRAGILE: {
      label: 'PORTFOLIO FRAGILITY DETECTED',
      sublabel: 'Hedging Required — Moderate Cascade Exposure',
      badgeClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.25)]',
      icon: AlertTriangle,
      color: '#F59E0B',
      ringColor: '#F59E0B',
    },
    KILL_SWITCH: {
      label: 'KILL SWITCH TRIGGERED',
      sublabel: 'Severe Tail Risk — Immediate Downside Abort',
      badgeClass: 'bg-red-500/10 text-red-400 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.25)]',
      icon: XOctagon,
      color: '#EF4444',
      ringColor: '#EF4444',
    },
  }[verdict];

  const VerdictIcon = verdictConfig.icon;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (resilienceScore / 100) * circumference;

  return (
    <div className="bg-[#0C1220] border border-white/[0.08] rounded-2xl p-5 relative overflow-hidden shadow-card">
      {/* Ambient background glow according to verdict */}
      <div
        className="absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20"
        style={{ backgroundColor: verdictConfig.color }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Radial Resilience Gauge */}
        <div className="lg:col-span-5 flex items-center gap-5">
          <div className="relative w-28 h-28 flex-shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-gray-800"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r={radius}
                stroke={verdictConfig.ringColor}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-2xl font-black font-mono tracking-tight text-white">
                {resilienceScore}
              </span>
              <span className="text-[10px] font-mono uppercase text-gray-400">/ 100</span>
            </div>
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold font-mono tracking-wide ${verdictConfig.badgeClass}`}>
                <VerdictIcon className="w-3.5 h-3.5" />
                {verdict.replace('_', ' ')}
              </span>
            </div>
            <span className="text-sm font-bold text-white tracking-wide">{verdictConfig.label}</span>
            <span className="text-xs text-gray-400 leading-tight mt-0.5">{verdictConfig.sublabel}</span>
          </div>
        </div>

        {/* Center: Key Financial Telemetry Bento Grid */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Projected Loss */}
          <div className="bg-[#06090F] p-3 rounded-xl border border-white/[0.06]">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-mono uppercase">Loss At Risk</span>
              <DollarSign className="w-3.5 h-3.5 text-[#EF4444]" />
            </div>
            <div className="text-lg font-bold font-mono text-[#EF4444]">
              -${projectedLossUsd.toLocaleString()}
            </div>
            <div className="text-[10px] text-gray-400 font-mono">
              on ${userPositionSize.toLocaleString()} entry
            </div>
          </div>

          {/* Max Drawdown */}
          <div className="bg-[#06090F] p-3 rounded-xl border border-white/[0.06]">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-mono uppercase">Drawdown</span>
              <TrendingDown className="w-3.5 h-3.5 text-[#EF4444]" />
            </div>
            <div className="text-lg font-bold font-mono text-white">
              -{projectedDrawdownPct}%
            </div>
            <div className="text-[10px] text-gray-400 font-mono">
              Beta: {equity.beta}x drag
            </div>
          </div>

          {/* 7x24 Weekend Liquidity Squeeze */}
          <div className="bg-[#06090F] p-3 rounded-xl border border-white/[0.06] relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-mono uppercase flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#00C8FF]" /> 7×24 Penalty
              </span>
            </div>
            <div className="text-lg font-bold font-mono text-[#00C8FF]">
              +{weekendLiquidityPenaltyPct}%
            </div>
            <div className="text-[10px] text-gray-400 font-mono">
              ~${estimatedSlippageUsd} rToken spread
            </div>
          </div>

          {/* Post-Crash Price Floor */}
          <div className="bg-[#06090F] p-3 rounded-xl border border-white/[0.06]">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-mono uppercase">Floor Target</span>
              <Lock className="w-3.5 h-3.5 text-[#10B981]" />
            </div>
            <div className="text-lg font-bold font-mono text-[#10B981]">
              ${projectedPrice}
            </div>
            <div className="text-[10px] text-gray-400 font-mono">
              from ${equity.price} entry
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Contextual Reason */}
      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-start gap-2.5 text-xs text-gray-300">
        <span className="font-mono text-[#00C8FF] font-semibold whitespace-nowrap">
          QUANT AUDIT:
        </span>
        <p className="leading-relaxed text-gray-300">{verdictReason}</p>
      </div>
    </div>
  );
};
