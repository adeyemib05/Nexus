import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, Target, BarChart3, Pause, Play, Brain, FlaskConical, Compass, ExternalLink } from 'lucide-react';
import { useNexusStore } from '../store';
import StatCard from '../components/ui/StatCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AiDecisionHero from '../components/dashboard/AiDecisionHero';
import IntelligenceStrip from '../components/dashboard/IntelligenceStrip';
import RecentAiActivity from '../components/dashboard/RecentAiActivity';
import OperationalStatus from '../components/dashboard/OperationalStatus';
import IntelligenceDrawer from '../components/intelligence/IntelligenceDrawer';
import MarketChart from '../components/chart/MarketChart';
import AiRationaleDrawer from '../components/chart/AiRationaleDrawer';
import { formatPrice, formatPct } from '../lib/utils';
import { startAgent, pauseAgent, getAgentState } from '../lib/api';
import type { SignalReading, HistoricalAiDecision } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
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
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

  const isRunning = agentState?.status === 'running';
  const sharpe = performance?.sharpeRatio || 0;
  const dailyTrades = trades.filter((t) => t.openedAt > Date.now() - 24 * 3600 * 1000).length;

  // Adapt lastAiDecision to HistoricalAiDecision for the drawer
  const currentAiDecision: HistoricalAiDecision | null = agentState?.lastAiDecision
    ? {
        id: `ai_${agentState.lastAiDecision.timestamp}`,
        timestamp: agentState.lastAiDecision.timestamp,
        symbol: agentState.lastAiDecision.symbol || 'BTCUSDT',
        marketPrice: agentState.lastAiDecision.marketPrice || ticker?.price || 0,
        action: agentState.lastAiDecision.action as 'BUY' | 'SELL' | 'HOLD',
        confidence: agentState.lastAiDecision.confidence,
        strategy: agentState.lastAiDecision.strategy,
        reasoning: agentState.lastAiDecision.reasoning,
        provider: agentState.lastAiDecision.provider,
        fusedScore: agentState.lastAiDecision.fusedScore,
        regime: agentState.lastAiDecision.regime,
        executed: agentState.lastAiDecision.executed,
        blockReason: agentState.lastAiDecision.blockReason,
        tradeId: agentState.lastAiDecision.tradeId,
      }
    : null;

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

      {/* PROMINENT QUICK ACTIONS STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-nexus-elevated border border-white/[0.08]">
        <span className="text-xs font-mono text-nexus-textMuted flex items-center gap-1.5 pl-1">
          <Compass size={14} className="text-nexus-accent" />
          Terminal Navigation:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {currentAiDecision && (
            <button
              onClick={() => setIsAiDrawerOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-nexus-accent/15 border border-nexus-accent/40 text-nexus-accent font-display font-semibold text-xs flex items-center gap-1.5 hover:bg-nexus-accent/25 transition-all cursor-pointer"
            >
              <Brain size={13} />
              View Current AI Reasoning
            </button>
          )}

          <button
            onClick={() => navigate('/intelligence')}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-nexus-textPrimary font-display font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ExternalLink size={13} />
            View Full Intelligence
          </button>

          <button
            onClick={() => navigate('/backtest')}
            className="px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-purple-300 font-display font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <FlaskConical size={13} />
            Open Backtest Lab
          </button>
        </div>
      </div>

      {/* 2. 5-ENGINE MARKET INTELLIGENCE STRIP */}
      <IntelligenceStrip
        signals={signals}
        onSelectSignal={(sig) => setSelectedSignal(sig)}
      />

      {/* 3. LIVE INTERACTIVE MARKET CHART */}
      <MarketChart
        symbol={ticker?.symbol || 'BTCUSDT'}
        currentTicker={ticker}
        trades={trades}
        defaultTimeframe="1m"
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

      {/* AI Decision Rationale Drawer */}
      <AiRationaleDrawer
        decision={currentAiDecision}
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
      />
    </motion.div>
  );
}
