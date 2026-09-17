import React from 'react';
import { History, GitCommit, CheckCircle2, ArrowDownRight, Clock } from 'lucide-react';
import { HistoricalAnalog } from '../../types';

interface HistoricalAnalogsViewProps {
  analogs: HistoricalAnalog[];
  symbol: string;
}

export const HistoricalAnalogsView: React.FC<HistoricalAnalogsViewProps> = ({
  analogs,
  symbol,
}) => {
  return (
    <div className="bg-[#0C1220] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-card">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-nexus-accent" />
            <h3 className="text-base font-bold text-white tracking-wide font-display">
              Empirical Historical Analog Engine
            </h3>
            <span className="px-2 py-0.5 rounded bg-nexus-accent/10 text-nexus-accent text-[10px] font-mono border border-nexus-accent/30">
              Handbook Mandate
            </span>
          </div>
          <p className="text-xs text-nexus-textSecondary mt-0.5">
            Retrieved historical distribution patterns matching <span className="text-nexus-accent font-mono font-semibold">{symbol}</span>'s volatility and liquidity signature
          </p>
        </div>
      </div>

      {/* Analogs Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {analogs.slice(0, 4).map((analog) => (
          <div
            key={analog.id}
            className="bg-[#06090F] p-4 rounded-xl border border-white/[0.06] hover:border-nexus-accent/40 transition-all space-y-3 relative group"
          >
            {/* Top Bar: Name & Similarity Badge */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-white group-hover:text-nexus-accent transition-colors">
                  {analog.name}
                </h4>
                <span className="text-[11px] font-mono text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3 text-gray-500" /> {analog.date}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-nexus-accent/10 text-nexus-accent border border-nexus-accent/30">
                  {analog.similarityScore}% Match
                </span>
              </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-3 gap-2 bg-[#0C1220] p-2 rounded-lg text-center font-mono">
              <div>
                <span className="text-[9px] text-gray-400 uppercase block">Drawdown</span>
                <span className="text-xs font-bold text-[#EF4444] flex items-center justify-center">
                  <ArrowDownRight className="w-3 h-3 mr-0.5" />
                  {analog.historicalDrawdown}%
                </span>
              </div>
              <div>
                <span className="text-[9px] text-gray-400 uppercase block">Drop Period</span>
                <span className="text-xs font-bold text-gray-200">
                  {analog.durationDays} Days
                </span>
              </div>
              <div>
                <span className="text-[9px] text-gray-400 uppercase block">Recovery</span>
                <span className="text-xs font-bold text-[#10B981]">
                  {analog.recoveryDays} Days
                </span>
              </div>
            </div>

            {/* Key Transmission Chain */}
            <div className="text-xs text-gray-300 space-y-1">
              <div className="text-[10px] font-mono uppercase text-gray-400 flex items-center gap-1">
                <GitCommit className="w-3 h-3 text-nexus-caution" /> Transmission Mechanism:
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed pl-4 border-l border-nexus-caution/30">
                {analog.keyTransmission}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Empirical Assurance Pill */}
      <div className="flex items-center gap-2 text-[11px] text-gray-400 bg-white/5 p-2.5 rounded-lg border border-white/5">
        <CheckCircle2 className="w-4 h-4 text-nexus-bull flex-shrink-0" />
        <span>
          Distributions are statistically calibrated across cross-asset volatility, funding rate anomalies, and off-market weekend pricing differentials.
        </span>
      </div>
    </div>
  );
};
