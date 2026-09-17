import React, { useState } from 'react';
import { Search, Zap, DollarSign, ArrowRight } from 'lucide-react';
import { EquityData, StressScenario, PresetTradeIdea } from '../../types';
import { STRESS_SCENARIOS, PRESET_TRADE_IDEAS } from '../../data/blackSwans';

interface LUIIntentBarProps {
  equity: EquityData;
  scenario: StressScenario;
  positionUsd: number;
  onUpdateEquity: (symbol: string) => void;
  onUpdateScenario: (scenario: StressScenario) => void;
  onUpdatePosition: (size: number) => void;
  onRunAnalysis: (thesis: string) => void;
  isLoading: boolean;
}

export const LUIIntentBar: React.FC<LUIIntentBarProps> = ({
  equity,
  scenario,
  positionUsd,
  onUpdateEquity,
  onUpdateScenario,
  onUpdatePosition,
  onRunAnalysis,
  isLoading,
}) => {
  const [naturalQuery, setNaturalQuery] = useState(
    `Long $${positionUsd.toLocaleString()} ${equity.symbol} into weekend close, stress-test against macro shock`
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRunAnalysis(naturalQuery);
  };

  const handleSelectPreset = (preset: PresetTradeIdea) => {
    onUpdateEquity(preset.symbol);
    onUpdatePosition(preset.positionUsd);
    const matchedScenario = STRESS_SCENARIOS.find((s) => s.id === preset.recommendedScenarioId);
    if (matchedScenario) {
      onUpdateScenario(matchedScenario);
    }
    setNaturalQuery(preset.thesis);
    onRunAnalysis(preset.thesis);
  };

  return (
    <div className="w-full space-y-4">
      {/* Preset Trade Ideas Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
        <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
          <Zap className="w-3 h-3 text-nexus-caution" /> Quick Presets:
        </span>
        {PRESET_TRADE_IDEAS.map((idea) => (
          <button
            key={idea.title}
            onClick={() => handleSelectPreset(idea)}
            className="px-2.5 py-1 rounded-full bg-[#0C1220] hover:bg-[#111827] border border-white/[0.08] hover:border-nexus-accent/40 text-gray-300 hover:text-white whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="font-mono font-bold text-nexus-bull">{idea.symbol}</span>
            <span>{idea.title}</span>
            <span className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.2 rounded font-mono">
              ${(idea.positionUsd / 1000).toFixed(0)}k
            </span>
          </button>
        ))}
      </div>

      {/* Main LUI Search & Intent Bar */}
      <form onSubmit={handleSubmit} className="relative group">
        <div className="bg-[#0C1220] border border-white/[0.08] rounded-2xl p-2 flex flex-col sm:flex-row items-center gap-3 focus-within:border-nexus-accent transition-all shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2.5 flex-1 w-full px-2">
            <Search className="w-5 h-5 text-gray-400 group-focus-within:text-nexus-accent transition-colors" />
            <input
              type="text"
              value={naturalQuery}
              onChange={(e) => setNaturalQuery(e.target.value)}
              placeholder="Describe your trade idea or paste thesis (e.g. Long $30k NVDA ahead of FOMC...)"
              className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>

          {/* Position Size Quick Selector */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start px-2 py-1 border-t sm:border-t-0 sm:border-l border-white/[0.08]">
            <span className="text-xs text-gray-400 font-mono flex items-center">
              <DollarSign className="w-3.5 h-3.5 text-gray-500" /> Size:
            </span>
            <div className="flex gap-1">
              {[10000, 25000, 50000, 100000].map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => onUpdatePosition(amt)}
                  className={`px-2 py-0.5 text-xs font-mono rounded transition-all cursor-pointer ${
                    positionUsd === amt
                      ? 'bg-nexus-accent text-black font-bold'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  ${amt / 1000}k
                </button>
              ))}
            </div>
          </div>

          {/* Run Stress Test Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-nexus-bull to-nexus-accent text-black font-bold text-xs flex items-center justify-center gap-2 hover:opacity-95 shadow-[0_0_20px_rgba(0,200,255,0.3)] transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Stress Testing...
              </span>
            ) : (
              <>
                <span>SIMULATE STRESS</span>
                <ArrowRight className="w-3.5 h-3.5 text-black" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Quick Scenario Picker Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
          Simulated Shocks:
        </span>
        {STRESS_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onUpdateScenario(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border flex items-center gap-1.5 cursor-pointer ${
              scenario.id === s.id
                ? 'bg-red-500/15 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                : 'bg-[#0C1220] border-white/[0.08] text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span>{s.name}</span>
            <span className="font-mono text-[10px] text-gray-400">
              ({s.marketShockPct}%)
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
