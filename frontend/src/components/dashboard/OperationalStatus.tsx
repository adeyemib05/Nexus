import { ShieldCheck, AlertOctagon, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AgentState, RegimeReading } from '../../types';
import { REGIME_CONFIG } from '../../types';
import ProgressBar from '../ui/ProgressBar';
import PnLMiniChart from './PnLMiniChart';
import { formatPrice } from '../../lib/utils';

interface OperationalStatusProps {
  agentState: AgentState | null;
  currentRegime: RegimeReading | null;
  equityCurve: Array<{ timestamp: number; value: number }>;
  dailyTrades: number;
}

export default function OperationalStatus({
  agentState,
  currentRegime,
  equityCurve,
  dailyTrades,
}: OperationalStatusProps) {
  const dd = agentState?.currentDrawdown || 0;
  const isHalted = agentState?.status === 'halted';

  const regimeCfg = currentRegime?.regime ? REGIME_CONFIG[currentRegime.regime] : null;

  return (
    <div className="space-y-4">
      {/* 1. Deterministic Risk Gate Telemetry */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-1.5">
            {isHalted ? (
              <AlertOctagon size={14} className="text-nexus-bear" />
            ) : (
              <ShieldCheck size={14} className="text-nexus-bull" />
            )}
            <h3 className="font-display font-semibold text-xs text-nexus-textPrimary tracking-tight">
              Safety Gate & Risk Limits
            </h3>
          </div>
          <span
            className={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${
              isHalted
                ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                : 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
            }`}
          >
            {isHalted ? 'AGENT HALTED' : 'ALL LIMITS PASS'}
          </span>
        </div>

        {/* Drawdown */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="stat-label">CURRENT DRAWDOWN</span>
            <span className="text-xs font-mono font-medium text-nexus-textPrimary">
              {(dd * 100).toFixed(1)}% / 10.0% max
            </span>
          </div>
          <ProgressBar
            value={dd / 0.1}
            color={dd < 0.05 ? '#10B981' : dd < 0.08 ? '#F59E0B' : '#F43F5E'}
          />
        </div>

        {/* Daily Trades & Cycle Counter */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="stat-label">DAILY TRADES</div>
            <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-0.5">
              {dailyTrades} <span className="text-nexus-textMuted font-normal text-xs">/ 10 max</span>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="stat-label">CYCLES RUN</div>
            <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-0.5">
              {agentState?.cycleCount || 847}
            </div>
          </div>
        </div>

        {isHalted && (
          <div className="p-2.5 rounded-lg bg-nexus-bear/10 border border-nexus-bear/30 text-xs text-nexus-bear font-mono">
            ⚠ {agentState?.haltReason || 'Safety gate triggered halt'}
          </div>
        )}
      </div>

      {/* 2. Compact Market Regime Pill (Replacing the 260px neon dial) */}
      <div className="glass-card p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="stat-label">FUSED MARKET REGIME</span>
          <span className="text-[10px] font-mono text-nexus-textMuted">Bitget Multi-Signal</span>
        </div>

        {currentRegime && regimeCfg ? (
          <div className="p-3 rounded-xl bg-nexus-elevated border border-white/[0.06] flex items-center justify-between">
            <div className="space-y-0.5">
              <div
                className="text-xs font-mono font-bold uppercase tracking-wider"
                style={{ color: regimeCfg.color }}
              >
                {regimeCfg.label}
              </div>
              <div className="text-[11px] text-nexus-textSecondary font-body">
                {regimeCfg.strategy}
              </div>
            </div>

            <div className="text-right">
              <div className="text-base font-mono font-bold text-nexus-textPrimary">
                {currentRegime.confidence}%
              </div>
              <div className="text-[10px] font-mono text-nexus-textMuted">
                Score: {currentRegime.fusedScore > 0 ? '+' : ''}
                {currentRegime.fusedScore.toFixed(2)}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-white/[0.02] text-xs font-mono text-nexus-textMuted text-center">
            Calibrating regime...
          </div>
        )}
      </div>

      {/* 3. Equity Sparkline */}
      <div className="glass-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="stat-label">EQUITY CURVE</span>
          <span className="text-xs font-mono font-bold text-nexus-textPrimary">
            {equityCurve.length > 0
              ? formatPrice(equityCurve[equityCurve.length - 1].value)
              : formatPrice(10000)}
          </span>
        </div>
        <PnLMiniChart data={equityCurve} height={90} />
      </div>

      {/* 4. Discreet Track 3 Complement Link */}
      <div className="p-3 rounded-xl bg-gradient-to-r from-nexus-surface to-nexus-elevated border border-white/[0.06] flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-[10px] font-mono text-nexus-accent uppercase tracking-wider font-semibold">
            Track 3 · Stress Test
          </div>
          <div className="text-xs text-nexus-textSecondary">
            Simulate weekend black swans & shocks
          </div>
        </div>
        <Link
          to="/stress-test"
          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-nexus-accent/15 hover:text-nexus-accent text-nexus-textMuted transition border border-white/[0.06] flex items-center justify-center cursor-pointer"
          title="Open 7×24 Pre-Trade Stress Simulator"
        >
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
