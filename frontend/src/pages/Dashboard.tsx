import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, Target, BarChart3, Pause, Play } from 'lucide-react';
import { useNexusStore } from '../store';
import StatCard from '../components/ui/StatCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AiDecisionHero from '../components/dashboard/AiDecisionHero';
import IntelligenceStrip from '../components/dashboard/IntelligenceStrip';
import RecentAiActivity from '../components/dashboard/RecentAiActivity';
import OperationalStatus from '../components/dashboard/OperationalStatus';
import IntelligenceDrawer from '../components/intelligence/IntelligenceDrawer';
import { formatPrice, formatPct } from '../lib/utils';
import { startAgent, pauseAgent, getAgentState } from '../lib/api';
import type { SignalReading } from '../types';

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
  const [selectedSignal, setSelectedSignal] = useState<SignalReading | null>(null);

  const isRunning = agentState?.status === 'running';
  const sharpe = performance?.sharpeRatio || 0;
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5 max-w-7xl mx-auto"
    >
      {/* 1. AI AUTONOMOUS DECISION HERO (Centerpiece) */}
      <AiDecisionHero agentState={agentState} currentRegime={currentRegime} />

      {/* 2. 5-ENGINE MARKET INTELLIGENCE STRIP */}
      <IntelligenceStrip
        signals={signals}
        onSelectSignal={(sig) => setSelectedSignal(sig)}
      />

      {/* 3. CORE FINANCIAL KPIS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          subvalue={sharpe > 1.5 ? 'Institutional' : sharpe > 1 ? 'Positive' : 'Calibrating'}
          icon={BarChart3}
        />
      </div>

      {/* 4. SPLIT OPERATIONAL COCKPIT (60% Feed / 40% Safety Status) */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Recent Activity Feed (7 of 12 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <RecentAiActivity
            agentState={agentState}
            trades={trades}
            currentPrice={ticker?.price}
          />
        </div>

        {/* Right Column: Operational Controls & Risk Gate Status (5 of 12 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Agent Engine Control Pill */}
          <div className="glass-card p-3.5 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-mono font-semibold text-nexus-textPrimary">
                Autonomous Engine: {isRunning ? 'Running' : 'Paused'}
              </div>
              <div className="text-[10px] font-mono text-nexus-textMuted">
                Bitget Live Simulated Execution
              </div>
            </div>

            {isToggling ? (
              <LoadingSpinner size="sm" />
            ) : isRunning ? (
              <button
                onClick={handleToggle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-nexus-caution/10 border border-nexus-caution/30 text-nexus-caution hover:bg-nexus-caution/20 transition cursor-pointer"
              >
                <Pause size={12} /> PAUSE ENGINE
              </button>
            ) : (
              <button
                onClick={handleToggle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-nexus-bull/10 border border-nexus-bull/30 text-nexus-bull hover:bg-nexus-bull/20 transition cursor-pointer"
              >
                <Play size={12} /> START ENGINE
              </button>
            )}
          </div>

          <OperationalStatus
            agentState={agentState}
            currentRegime={currentRegime}
            equityCurve={equityCurve}
            dailyTrades={dailyTrades}
          />
        </div>
      </div>

      {/* Progressive Disclosure: Forensic Intelligence Drawer */}
      <IntelligenceDrawer
        signal={selectedSignal}
        isOpen={!!selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </motion.div>
  );
}
