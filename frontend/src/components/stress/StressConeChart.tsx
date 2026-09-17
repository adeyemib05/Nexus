import React, { useState } from 'react';
import { Sliders, Shield, AlertOctagon } from 'lucide-react';
import { StressResult, ShockSeverity } from '../../types';

interface StressConeChartProps {
  result: StressResult;
  onUpdateSeverity: (severity: ShockSeverity) => void;
  activeSeverity: ShockSeverity;
}

export const StressConeChart: React.FC<StressConeChartProps> = ({
  result,
  onUpdateSeverity,
  activeSeverity,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { fanChart, scenario, projectedDrawdownPct } = result;

  const width = 760;
  const height = 300;
  const padding = { top: 30, right: 40, bottom: 40, left: 60 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allPrices = fanChart.flatMap((d) => [
    d.baselinePrice,
    d.upperBand,
    d.lowerBand,
    d.tailRiskPrice,
  ]);
  const minPrice = Math.max(1, Math.min(...allPrices) * 0.95);
  const maxPrice = Math.max(...allPrices) * 1.05;

  const getX = (index: number) => padding.left + (index / (fanChart.length - 1)) * chartWidth;
  const getY = (price: number) =>
    padding.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;

  const upperPolygonPoints = [
    ...fanChart.map((d, i) => `${getX(i)},${getY(d.upperBand)}`),
    ...fanChart.slice().reverse().map((d, i) => `${getX(fanChart.length - 1 - i)},${getY(d.baselinePrice)}`),
  ].join(' ');

  const lowerPolygonPoints = [
    ...fanChart.map((d, i) => `${getX(i)},${getY(d.baselinePrice)}`),
    ...fanChart.slice().reverse().map((d, i) => `${getX(fanChart.length - 1 - i)},${getY(d.lowerBand)}`),
  ].join(' ');

  const tailRiskPolygonPoints = [
    ...fanChart.map((d, i) => `${getX(i)},${getY(d.lowerBand)}`),
    ...fanChart.slice().reverse().map((d, i) => `${getX(fanChart.length - 1 - i)},${getY(d.tailRiskPrice)}`),
  ].join(' ');

  const baselinePath = fanChart
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.baselinePrice)}`)
    .join(' ');

  const tailPath = fanChart
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.tailRiskPrice)}`)
    .join(' ');

  return (
    <div className="bg-[#0C1220] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-card">
      {/* Chart Header & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white tracking-wide font-display">
              The 7-Day Stress Cone
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-nexus-accent border border-nexus-accent/20">
              Monte Carlo Fan Chart
            </span>
          </div>
          <p className="text-xs text-nexus-textSecondary mt-0.5">
            Real-time projection under <span className="text-white font-medium">{scenario.name}</span> with weekend liquidity penalty
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-gray-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]/30 border border-[#10B981]" />
            <span>+1σ Upside</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B]/30 border border-[#F59E0B]" />
            <span>-1σ Stress</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444]/30 border border-[#EF4444]" />
            <span>-3σ Tail Risk</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full h-[280px] sm:h-[300px] overflow-hidden rounded-xl bg-[#06090F] border border-white/[0.06]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="upperGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#00C8FF" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="lowerGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#FF8A00" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="tailGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#B91C1C" stopOpacity="0.35" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const priceVal = minPrice + (maxPrice - minPrice) * (1 - ratio);
            const y = padding.top + chartHeight * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  fill="#64748B"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  ${priceVal.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Envelopes */}
          <polygon points={upperPolygonPoints} fill="url(#upperGrad)" />
          <polygon points={lowerPolygonPoints} fill="url(#lowerGrad)" />
          <polygon points={tailRiskPolygonPoints} fill="url(#tailGrad)" />

          {/* Paths */}
          <path d={baselinePath} fill="none" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="3 3" opacity="0.6" />
          <path d={tailPath} fill="none" stroke="#EF4444" strokeWidth="2.5" />

          {/* Data Nodes */}
          {fanChart.map((d, i) => {
            const x = getX(i);
            const yTail = getY(d.tailRiskPrice);
            const isHovered = hoveredIndex === i;

            return (
              <g
                key={d.day}
                onMouseEnter={() => setHoveredIndex(i)}
                className="cursor-pointer"
              >
                {isHovered && (
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={height - padding.bottom}
                    stroke="#00C8FF"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}

                <text
                  x={x}
                  y={height - padding.bottom + 18}
                  fill={isHovered ? '#FFFFFF' : '#64748B'}
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight={isHovered ? 'bold' : 'normal'}
                >
                  {d.label}
                </text>

                <circle
                  cx={x}
                  cy={yTail}
                  r={isHovered ? 6 : 4}
                  fill="#EF4444"
                  stroke="#06090F"
                  strokeWidth="2"
                  className="transition-all"
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none p-2.5 rounded-lg bg-[#0C1220]/95 border border-[#00C8FF]/50 shadow-xl backdrop-blur-md text-xs font-mono space-y-1"
            style={{
              left: `${Math.min(75, Math.max(15, (hoveredIndex / 7) * 100))}%`,
              top: '15px',
            }}
          >
            <div className="text-white font-bold pb-1 border-b border-white/10 flex justify-between gap-4">
              <span>{fanChart[hoveredIndex].label}</span>
              <span className="text-[#EF4444]">-{projectedDrawdownPct}% Risk</span>
            </div>
            <div className="flex justify-between gap-4 text-[#10B981]">
              <span>+1σ Upside:</span>
              <span>${fanChart[hoveredIndex].upperBand}</span>
            </div>
            <div className="flex justify-between gap-4 text-gray-300">
              <span>Baseline:</span>
              <span>${fanChart[hoveredIndex].baselinePrice}</span>
            </div>
            <div className="flex justify-between gap-4 text-[#EF4444]">
              <span>-3σ Worst Case:</span>
              <span>${fanChart[hoveredIndex].tailRiskPrice}</span>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Scenario Scrubber */}
      <div className="bg-[#06090F] p-4 rounded-xl border border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-nexus-textSecondary flex items-center gap-1.5 uppercase">
            <Sliders className="w-3.5 h-3.5 text-nexus-accent" /> Scenario Severity Scrubber:
          </span>
          <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 border border-white/10 text-nexus-textPrimary">
            Mode: {activeSeverity.replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['mild', 'severe', 'black_swan'] as ShockSeverity[]).map((sev) => {
            const isActive = activeSeverity === sev;
            const labels = {
              mild: { title: 'Mild Shock', desc: '-4% to -6% macro drag' },
              severe: { title: 'Severe Stress', desc: '-10% to -15% selloff' },
              black_swan: { title: 'Black Swan', desc: '-20% to -35% liquidation' },
            }[sev];

            return (
              <button
                key={sev}
                type="button"
                onClick={() => onUpdateSeverity(sev)}
                className={`p-2.5 rounded-lg text-left transition-all border ${
                  isActive
                    ? sev === 'black_swan'
                      ? 'bg-red-500/20 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                      : 'bg-nexus-accent/20 border-nexus-accent text-white shadow-[0_0_15px_rgba(0,200,255,0.3)]'
                    : 'bg-white/5 border-transparent text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold font-mono">{labels.title}</span>
                  {sev === 'black_swan' ? (
                    <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Shield className="w-3.5 h-3.5 text-nexus-accent" />
                  )}
                </div>
                <span className="text-[10px] text-gray-400 block">{labels.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
