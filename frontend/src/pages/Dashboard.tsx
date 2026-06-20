import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, Target, BarChart3, Pause, Play, Zap } from 'lucide-react';
import { useNexusStore } from '../store';
import StatCard from '../components/ui/StatCard';
import ProgressBar from '../components/ui/ProgressBar';
import ScoreBar from '../components/ui/ScoreBar';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import RegimeDial from '../components/dashboard/RegimeDial';
import SignalGrid from '../components/dashboard/SignalGrid';
import TradesFeed from '../components/dashboard/TradesFeed';
import PnLMiniChart from '../components/dashboard/PnLMiniChart';
import { formatPrice, formatPct } from '../lib/utils';
import { startAgent, pauseAgent, getAgentState } from '../lib/api';
import { REGIME_CONFIG } from '../types';

export default function Dashboard() {
  const agentState = useNexusStore((s) => s.agentState);
  const signals = useNexusStore((s) => s.signals);
  const currentRegime = useNexusStore((s) => s.currentRegime);
  const trades = useNexusStore((s) => s.trades);
  const performance = useNexusStore((s) => s.performance);
  const equityCurve = useNexusStore((s) => s.equityCurve);
  const ticker = useNexusStore((s) => s.ticker);
  const setAgentState = useNexusStore((s) => s.setAgentState);
  const [isToggling, setIsToggling] = useState(false);

  const isRunning = agentState?.status === 'running';
  const sharpe = performance?.sharpeRatio || 0;
  const dd = agentState?.currentDrawdown || 0;
  const dailyTrades = trades.filter((t) => t.openedAt > Date.now() - 24 * 3600 * 1000).length;

  async function handleToggle() {
    setIsToggling(true);
    try {
      const res = isRunning ? await pauseAgent() : await startAgent();
      if (res.success && res.data) {
        setAgentState(res.data);
      } else {
        const fresh = await getAgentState();
        if (fresh.success && fresh.data) setAgentState(fresh.data);
      }
    } finally {
      setIsToggling(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* STATS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="PORTFOLIO VALUE"
          value={formatPrice(performance?.portfolioValue || 10000)}
          subvalue={`${formatPct((performance?.totalPnlPct || 0) * 100)} total`}
          trend={(performance?.totalPnl || 0) >= 0 ? 'up' : 'down'}
          icon={Wallet}
        />
        <StatCard
          label="TOTAL P&L"
          value={formatPrice(Math.abs(performance?.totalPnl || 0))}
          subvalue={(performance?.totalPnl || 0) >= 0 ? '▲ Profitable' : '▼ In drawdown'}
          trend={(performance?.totalPnl || 0) >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
        />
        <StatCard
          label="WIN RATE"
          value={formatPct((performance?.winRate || 0) * 100)}
          subvalue={`${performance?.totalTrades || 0} trades executed`}
          icon={Target}
        />
        <StatCard
          label="SHARPE RATIO"
          value={sharpe.toFixed(2)}
          subvalue={sharpe > 1.5 ? 'Excellent' : sharpe > 1 ? 'Good' : sharpe > 0 ? 'Fair' : 'Building...'}
          icon={BarChart3}
        />
      </div>

      {/* MAIN GRID */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* LEFT */}
        <div className="lg:col-span-5 space-y-6">
          <RegimeDial regime={currentRegime} />

          <div className="flex items-center gap-3">
            <span className="stat-label whitespace-nowrap">SIGNAL INTELLIGENCE</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <SignalGrid signals={signals} />
        </div>

        {/* MIDDLE */}
        <div className="lg:col-span-4 space-y-4">
          <div className="glass-card p-3 flex items-center justify-between">
            <span className="stat-label">Cycle #{agentState?.cycleCount || 0}</span>
            {isToggling ? (
              <LoadingSpinner size="sm" />
            ) : isRunning ? (
              <button
                onClick={handleToggle}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-display font-semibold bg-nexus-caution/10 border border-nexus-caution/30 text-nexus-caution hover:bg-nexus-caution/20 transition-all"
              >
                <Pause size={12} /> PAUSE
              </button>
            ) : (
              <button
                onClick={handleToggle}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-display font-semibold bg-nexus-bull/10 border border-nexus-bull/30 text-nexus-bull hover:bg-nexus-bull/20 transition-all"
              >
                <Play size={12} /> START
              </button>
            )}
          </div>

          <TradesFeed trades={trades} currentPrice={ticker?.price} />
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-3 space-y-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Zap size={14} className="text-nexus-accent" />
              <span className="text-xs font-display font-semibold text-nexus-textPrimary">LIVE SIGNALS</span>
              <span className="w-1.5 h-1.5 rounded-full bg-nexus-bull animate-pulse ml-auto" />
            </div>
            <div className="space-y-2">
              {signals.map((s) => (
                <div key={s.type} className="flex items-center gap-2" style={{ maxHeight: 28 }}>
                  <span className="stat-label w-16 flex-shrink-0">{s.label}</span>
                  <div className="flex-1">
                    <ScoreBar score={s.score} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="stat-label mb-2">EQUITY CURVE</div>
            <PnLMiniChart data={equityCurve} height={100} />
            <div className="font-mono text-xs text-nexus-textSecondary mt-2">
              {equityCurve.length > 0 ? formatPrice(equityCurve[equityCurve.length - 1].value) : formatPrice(10000)}
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="text-xs font-display font-semibold text-nexus-textPrimary mb-3">RISK MONITOR</div>

            <div className="stat-label mb-1">DRAWDOWN</div>
            <ProgressBar value={dd} color={dd < 0.05 ? '#10B981' : dd < 0.08 ? '#F59E0B' : '#EF4444'} showValue />

            <div className="flex justify-between mt-3">
              <span className="stat-label">DAILY TRADES</span>
              <span className="font-mono text-xs">{dailyTrades}/10</span>
            </div>

            {agentState?.status === 'halted' && (
              <div className="mt-3 p-2 rounded-lg bg-nexus-bear/10 border border-nexus-bear/30">
                <div className="text-xs font-display font-semibold text-nexus-bear">⚠ AGENT HALTED</div>
                <div className="text-[10px] text-nexus-textSecondary mt-1">{agentState.haltReason}</div>
              </div>
            )}

            {currentRegime && (
              <div className="text-[10px] text-nexus-textMuted mt-3 pt-3 border-t border-white/[0.06]">
                {REGIME_CONFIG[currentRegime.regime].description}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
