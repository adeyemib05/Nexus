import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Globe2,
  LineChart,
  TrendingUp,
  Network,
  Newspaper,
  Activity,
  Layers,
  Clock,
  RotateCcw,
  Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNexusStore } from '../store';
import ScoreBar from '../components/ui/ScoreBar';
import Badge from '../components/ui/Badge';
import MarketChart from '../components/chart/MarketChart';
import EngineStreamTimeline from '../components/intelligence/EngineStreamTimeline';
import NewsDetailModal from '../components/intelligence/NewsDetailModal';
import {
  getRegimeHistory,
  getSignalsHistory,
  getHistoricalIndicators,
} from '../lib/api';
import { formatTimestamp, formatPrice, formatPct } from '../lib/utils';
import { SIGNAL_CONFIG, REGIME_CONFIG } from '../types';
import type {
  SignalStrength,
  HistoricalSignalSnapshot,
  HistoricalIndicatorSnapshot,
} from '../types';

const ICONS: Record<string, LucideIcon> = {
  technical: LineChart,
  macro: Globe2,
  sentiment: TrendingUp,
  onchain: Network,
  news: Newspaper,
};

const ENGINE_TITLES: Record<string, { title: string; subtitle: string }> = {
  technical: {
    title: 'Technical Momentum & Volatility Engine',
    subtitle: 'RSI(14), dual EMAs (20/50), standard MACD oscillator & directional momentum',
  },
  macro: {
    title: 'Spot & Market Liquidity Engine',
    subtitle: '24h spot volume expansion, turnover velocity, and liquidity depth proxy',
  },
  sentiment: {
    title: 'Derivatives & Sentiment Engine',
    subtitle: 'Perpetuals funding rates, retail Fear & Greed index, and positioning leverage',
  },
  onchain: {
    title: 'Blockchain On-Chain Network Engine',
    subtitle: 'Mempool sat/vB fees, block settlement congestion, and network throughput',
  },
  news: {
    title: 'NLP Catalyst & Macro News Engine',
    subtitle: 'Algorithmic headline scanning, catalyst categorization, and sentiment classification',
  },
};

function strengthLabel(strength: SignalStrength): string {
  return strength
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function strengthVariant(strength: SignalStrength): 'bullish' | 'bearish' | 'neutral' {
  if (strength.includes('bullish')) return 'bullish';
  if (strength.includes('bearish')) return 'bearish';
  return 'neutral';
}

type Horizon = 'current' | '1d' | '7d' | '30d';

export default function Intelligence() {
  const signals = useNexusStore((s) => s.signals);
  const ticker = useNexusStore((s) => s.ticker);
  const currentRegime = useNexusStore((s) => s.currentRegime);
  const setRegimeHistory = useNexusStore((s) => s.setRegimeHistory);

  const [activeEngine, setActiveEngine] = useState<string>('technical');
  const [horizon, setHorizon] = useState<Horizon>('1d');
  const [selectedNews, setSelectedNews] = useState<any | null>(null);

  // Historical and Point-in-Time Inspection states
  const [histSignals, setHistSignals] = useState<HistoricalSignalSnapshot[]>([]);
  const [histIndicators, setHistIndicators] = useState<HistoricalIndicatorSnapshot[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<HistoricalSignalSnapshot | null>(null);

  const handleSetHorizon = (h: Horizon) => {
    setHorizon(h);
    setSelectedSnapshot(null);
  };

  useEffect(() => {
    getRegimeHistory(10).then((res) => {
      if (res.success && res.data) setRegimeHistory(res.data);
    });
  }, [setRegimeHistory]);

  // Fetch historical data based on selected horizon time windows and retrieval caps
  useEffect(() => {
    let isMounted = true;
    setLoadingHistory(true);

    const now = Date.now();
    let limit: number;
    let from: number | undefined;

    switch (horizon) {
      case 'current':
        limit = 15;
        from = undefined;
        break;
      case '1d':
        limit = 100;
        from = now - 24 * 60 * 60 * 1000;
        break;
      case '7d':
        limit = 150;
        from = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        limit = 200;
        from = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }

    Promise.all([
      getSignalsHistory({ symbol: 'BTCUSDT', limit, from, to: from ? now : undefined }),
      getHistoricalIndicators({ symbol: 'BTCUSDT', timeframe: '1h', limit, from, to: from ? now : undefined }),
    ])
      .then(([sigRes, indRes]) => {
        if (!isMounted) return;
        if (sigRes.success && sigRes.data) {
          setHistSignals(sigRes.data);
        }
        if (indRes.success && indRes.data) {
          setHistIndicators(indRes.data);
        }
      })
      .catch((err) => console.error('Failed to load historical intelligence:', err))
      .finally(() => {
        if (isMounted) setLoadingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [horizon]);

  // Derived signals: When a historical snapshot is selected, derive strictly authentic point-in-time scores
  const displaySignals = useMemo(() => {
    if (!selectedSnapshot) return signals;

    return [
      {
        type: 'technical' as const,
        score: selectedSnapshot.technical?.score ?? 0,
        strength: (selectedSnapshot.technical?.strength || 'neutral') as SignalStrength,
        confidence: selectedSnapshot.technical?.confidence ?? 0.8,
        label: 'Technical',
        source: 'local' as const,
        details: selectedSnapshot.details || {},
        timestamp: selectedSnapshot.timestamp,
      },
      {
        type: 'macro' as const,
        score: selectedSnapshot.liquidity?.score ?? 0,
        strength: (selectedSnapshot.liquidity?.strength || 'neutral') as SignalStrength,
        confidence: selectedSnapshot.liquidity?.confidence ?? 0.7,
        label: 'Volume & Liquidity',
        source: 'local' as const,
        details: selectedSnapshot.details || {},
        timestamp: selectedSnapshot.timestamp,
      },
      {
        type: 'sentiment' as const,
        score: selectedSnapshot.sentiment?.score ?? 0,
        strength: (selectedSnapshot.sentiment?.strength || 'neutral') as SignalStrength,
        confidence: selectedSnapshot.sentiment?.confidence ?? 0.75,
        label: 'Sentiment',
        source: 'local' as const,
        details: selectedSnapshot.details || {},
        timestamp: selectedSnapshot.timestamp,
      },
      {
        type: 'onchain' as const,
        score: selectedSnapshot.onchain?.score ?? 0,
        strength: (selectedSnapshot.onchain?.strength || 'neutral') as SignalStrength,
        confidence: selectedSnapshot.onchain?.confidence ?? 0.7,
        label: 'On-Chain & Fees',
        source: 'local' as const,
        details: selectedSnapshot.details || {},
        timestamp: selectedSnapshot.timestamp,
      },
      {
        type: 'news' as const,
        score: selectedSnapshot.news?.score ?? 0,
        strength: (selectedSnapshot.news?.strength || 'neutral') as SignalStrength,
        confidence: selectedSnapshot.news?.confidence ?? 0.65,
        label: 'News & Events',
        source: 'local' as const,
        details: selectedSnapshot.details || {},
        timestamp: selectedSnapshot.timestamp,
      },
    ];
  }, [selectedSnapshot, signals]);

  const activeSignal = useMemo(() => {
    return displaySignals.find((s) => s.type === activeEngine) || displaySignals[0] || null;
  }, [displaySignals, activeEngine]);

  const displayRegime = useMemo(() => {
    if (!selectedSnapshot) return currentRegime;
    const regKey = (selectedSnapshot.regime || 'uncertain').toLowerCase().replace(/ /g, '_') as keyof typeof REGIME_CONFIG;
    return {
      regime: regKey in REGIME_CONFIG ? regKey : ('uncertain' as const),
      confidence: selectedSnapshot.regimeConfidence ?? 0,
      fusedScore: selectedSnapshot.fusedScore ?? 0,
      signals: displaySignals as any,
      timestamp: selectedSnapshot.timestamp,
    };
  }, [selectedSnapshot, currentRegime, displaySignals]);

  const regimeCfg = displayRegime?.regime && REGIME_CONFIG[displayRegime.regime]
    ? REGIME_CONFIG[displayRegime.regime]
    : REGIME_CONFIG['uncertain'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* TOP COMMAND BAR */}
      <div className="glass-card p-4 sm:p-5 border border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Asset, Live Price & 24h Change */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-nexus-accent/10 border border-nexus-accent/20 flex items-center justify-center">
              <Brain size={22} className="text-nexus-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-display font-bold text-nexus-textPrimary tracking-tight">
                  BTCUSDT
                </h1>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-nexus-textMuted border border-white/[0.08]">
                  SPOT
                </span>
                {selectedSnapshot ? (
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-nexus-accent bg-nexus-accent/15 border border-nexus-accent/30 px-2 py-0.5 rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-pulse" />
                      HISTORICAL SNAPSHOT · {formatTimestamp(selectedSnapshot.timestamp)} UTC
                    </span>
                    <button
                      onClick={() => setSelectedSnapshot(null)}
                      className="text-[10px] font-mono text-nexus-accent hover:underline flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]"
                      title="Return to live state"
                    >
                      <RotateCcw size={10} />
                      Return to Live
                    </button>
                  </div>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-nexus-bull">
                    <span className="w-1.5 h-1.5 rounded-full bg-nexus-bull animate-pulse" />
                    LIVE FEEDS
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className="text-lg font-mono font-bold text-nexus-textPrimary">
                  {ticker ? formatPrice(ticker.price) : '---'}
                </span>
                {ticker && (
                  <span
                    className={`text-xs font-mono font-semibold ${
                      ticker.change24h >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                    }`}
                  >
                    {formatPct(ticker.change24h)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="hidden sm:block h-8 w-px bg-white/[0.08]" />

          {/* Regime & Fused Score Pill */}
          {displayRegime && regimeCfg && (
            <div className="flex items-center gap-3">
              <div
                className="px-3 py-1.5 rounded-lg border text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2"
                style={{
                  backgroundColor: regimeCfg.color + '15',
                  borderColor: regimeCfg.color + '40',
                  color: regimeCfg.color,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: regimeCfg.color }}
                />
                {regimeCfg.label}
              </div>

              <div className="text-xs font-mono">
                <span className="text-nexus-textMuted">Fused Score: </span>
                <span className="font-bold text-nexus-textPrimary">
                  {displayRegime.fusedScore > 0 ? '+' : ''}
                  {displayRegime.fusedScore.toFixed(2)}
                </span>
                <span className="text-nexus-textMuted ml-1.5">
                  ({displayRegime.confidence}%)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Horizon Selector */}
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <span className="text-[10px] font-mono uppercase text-nexus-textMuted flex items-center gap-1 mr-1">
            <Clock size={12} />
            Horizon:
          </span>
          {(['current', '1d', '7d', '30d'] as Horizon[]).map((h) => (
            <button
              key={h}
              onClick={() => handleSetHorizon(h)}
              className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${
                horizon === h
                  ? 'bg-nexus-accent text-nexus-void font-bold shadow-sm'
                  : 'bg-white/[0.03] text-nexus-textMuted hover:text-nexus-textPrimary hover:bg-white/[0.06] border border-white/[0.06]'
              }`}
            >
              {h.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN VIEWPORT: INTERACTIVE MARKET CHART */}
      <div className="glass-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-display font-bold text-nexus-textPrimary flex items-center gap-2">
              <Activity size={16} className="text-nexus-accent" />
              Autonomous Intelligence Execution Chart
            </h2>
            <p className="text-xs font-mono text-nexus-textMuted mt-0.5">
              Live multi-timeframe candles, indicators, AI decision markers & execution points
            </p>
          </div>
          <span className="text-[11px] font-mono text-nexus-textMuted">
            Click AI markers (●) on chart to inspect model rationale
          </span>
        </div>

        <MarketChart
          symbol="BTCUSDT"
          defaultTimeframe="15m"
        />
      </div>

      {/* 5-ENGINE MULTI-STREAM INTELLIGENCE TIMELINE */}
      <EngineStreamTimeline
        data={histSignals}
        horizon={horizon}
        activeEngine={activeEngine}
        onSelectEngine={setActiveEngine}
        selectedSnapshot={selectedSnapshot}
        onSelectSnapshot={setSelectedSnapshot}
        isLoading={loadingHistory}
      />

      {/* FIVE INTELLIGENCE ENGINES: INTERACTIVE NAVIGATOR */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            <h3 className="text-sm font-display font-bold text-nexus-textPrimary flex items-center gap-2">
              <Layers size={16} className="text-nexus-accent" />
              5-Signal Autonomous Fusion Breakdown
            </h3>
            <p className="text-xs font-mono text-nexus-textMuted mt-0.5">
              Select an engine below to inspect granular telemetry and chronological trends
            </p>
          </div>
          <span className="text-[10px] font-mono text-nexus-textMuted">
            Total Fusion Weight: 100%
          </span>
        </div>

        {/* Engine Tabs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {displaySignals.map((sig) => {
            const Icon = ICONS[sig.type] || Globe2;
            const cfg = SIGNAL_CONFIG[sig.type];
            const isActive = activeEngine === sig.type;
            const dir = strengthVariant(sig.strength);

            return (
              <button
                key={sig.type}
                onClick={() => setActiveEngine(sig.type)}
                className={`glass-card p-3.5 text-left transition-all relative overflow-hidden group ${
                  isActive
                    ? 'border-nexus-accent/60 bg-nexus-accent/[0.04] shadow-md'
                    : 'hover:border-white/20 hover:bg-white/[0.02]'
                }`}
              >
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-nexus-accent shadow-[0_0_8px_rgba(0,229,255,0.6)]" />
                )}

                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      size={14}
                      className={isActive ? 'text-nexus-accent' : 'text-nexus-textMuted'}
                    />
                    <span className="font-display font-bold text-xs text-nexus-textPrimary tracking-tight">
                      {sig.label}
                    </span>
                  </div>
                  <Badge variant={dir} className="text-[9px]">
                    {strengthLabel(sig.strength)}
                  </Badge>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-mono font-bold text-nexus-textPrimary">
                      {sig.score > 0 ? '+' : ''}
                      {sig.score.toFixed(2)}
                    </span>
                    <span className="text-[10px] font-mono text-nexus-textMuted">score</span>
                  </div>
                  <span className="text-xs font-mono text-nexus-textSecondary">
                    {(sig.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="mt-2 text-[10px] font-mono text-nexus-textMuted flex items-center justify-between border-t border-white/[0.04] pt-2">
                  <span>Weight: {Math.round(cfg.weight * 100)}%</span>
                  <span className={isActive ? 'text-nexus-accent font-semibold' : ''}>
                    {isActive ? 'ACTIVE VIEW' : 'INSPECT →'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ACTIVE ENGINE DEEP-DIVE WORKSPACE */}
        {activeSignal && (
          <div className="glass-card p-5 sm:p-6 space-y-6 border border-white/[0.08]">
            {/* Header of Active Engine */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-widest text-nexus-accent font-semibold">
                    {selectedSnapshot ? 'FORENSIC ENGINE AUDIT · HISTORICAL' : 'FORENSIC ENGINE AUDIT'}
                  </span>
                  <span className="text-[10px] font-mono text-nexus-textMuted">
                    · {selectedSnapshot ? `Snapshot ${formatTimestamp(selectedSnapshot.timestamp)} UTC` : `Calibrated via ${activeSignal.source}`}
                  </span>
                </div>
                <h3 className="text-lg font-display font-bold text-nexus-textPrimary mt-0.5">
                  {ENGINE_TITLES[activeSignal.type]?.title || activeSignal.label}
                </h3>
                <p className="text-xs font-mono text-nexus-textMuted mt-0.5">
                  {ENGINE_TITLES[activeSignal.type]?.subtitle || 'Autonomous market feed'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-mono text-nexus-textMuted">Calibrated Score</div>
                  <div className="text-base font-mono font-bold text-nexus-textPrimary">
                    {activeSignal.score > 0 ? '+' : ''}
                    {activeSignal.score.toFixed(2)}
                  </div>
                </div>
                <div className="h-8 w-px bg-white/[0.08]" />
                <div className="text-right">
                  <div className="text-xs font-mono text-nexus-textMuted">Confidence</div>
                  <div className="text-base font-mono font-bold text-nexus-textPrimary">
                    {(activeSignal.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Score Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-nexus-textMuted">Directional Polarization</span>
                <Badge variant={strengthVariant(activeSignal.strength)}>
                  {strengthLabel(activeSignal.strength)}
                </Badge>
              </div>
              <ScoreBar score={activeSignal.score} />
            </div>

            {/* Semantic Boundary Notice: Historical Persisted Vector vs Live Secondary Telemetry */}
            {selectedSnapshot && (
              <div className="p-3.5 rounded-xl bg-nexus-accent/[0.04] border border-nexus-accent/25 flex items-start gap-2.5 text-xs font-mono text-nexus-textSecondary">
                <Info size={15} className="text-nexus-accent mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <div className="text-nexus-textPrimary font-semibold flex items-center gap-2">
                    <span>HISTORICAL POINT-IN-TIME PERSISTED VECTOR</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-nexus-accent/15 text-nexus-accent">
                      {formatTimestamp(selectedSnapshot.timestamp)} UTC
                    </span>
                  </div>
                  <div>
                    Engine score ({activeSignal.score > 0 ? '+' : ''}{activeSignal.score.toFixed(2)}), confidence ({Math.round(activeSignal.confidence * 100)}%), and strength ({strengthLabel(activeSignal.strength)}) represent the verified historical signal snapshot. Granular sub-metrics below (live RSI, funding rate, mempool gas) reflect active node telemetry as sub-metrics are not persisted in historical signal snapshots.
                  </div>
                </div>
              </div>
            )}

            {/* ENGINE-SPECIFIC CURATED TELEMETRY */}
            {activeSignal.type === 'technical' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      RSI (14)
                    </div>
                    <div className="text-lg font-mono font-bold text-nexus-textPrimary mt-1">
                      {typeof activeSignal.details?.rsi === 'number'
                        ? activeSignal.details.rsi.toFixed(1)
                        : activeSignal.details?.rsi ? String(activeSignal.details.rsi) : '50.0'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      {Number(activeSignal.details?.rsi) > 70
                        ? 'Overbought Zone'
                        : Number(activeSignal.details?.rsi) < 30
                        ? 'Oversold Zone'
                        : 'Neutral Momentum'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      MACD Momentum
                    </div>
                    <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-1 truncate">
                      {activeSignal.details?.macdTrend ? String(activeSignal.details.macdTrend) : 'Calculated Oscillator'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Standard (12, 26, 9)
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      EMA 20 vs EMA 50
                    </div>
                    <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-1">
                      {activeSignal.details?.ema20_above_ema50 !== undefined
                        ? activeSignal.details.ema20_above_ema50
                          ? 'Bullish Alignment (20 > 50)'
                          : 'Bearish Alignment (20 < 50)'
                        : 'Aligned'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Trend filter
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Price vs EMA 20
                    </div>
                    <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-1">
                      {activeSignal.details?.price_vs_ema20 ? String(activeSignal.details.price_vs_ema20) : 'Baseline Support'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Mean reversion reference
                    </div>
                  </div>
                </div>

                {/* Historical Indicator Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="stat-label">CHRONOLOGICAL INDICATOR LOG</span>
                    <span className="text-[10px] font-mono text-nexus-textMuted">
                      Turso Persistent Indicator Series
                    </span>
                  </div>

                  {histIndicators.length === 0 ? (
                    <div className="p-6 rounded-xl bg-nexus-void/40 text-center text-xs font-mono text-nexus-textMuted border border-white/[0.04]">
                      {loadingHistory
                        ? 'Retrieving chronological indicators...'
                        : 'No historical indicator snapshots recorded yet in current window.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-nexus-void/80 text-nexus-textMuted border-b border-white/[0.06]">
                          <tr>
                            <th className="px-3.5 py-2.5 text-left font-medium">Timestamp</th>
                            <th className="px-3.5 py-2.5 text-right font-medium">RSI (14)</th>
                            <th className="px-3.5 py-2.5 text-right font-medium">EMA 20</th>
                            <th className="px-3.5 py-2.5 text-right font-medium">EMA 50</th>
                            <th className="px-3.5 py-2.5 text-right font-medium">MACD</th>
                            <th className="px-3.5 py-2.5 text-right font-medium">Signal</th>
                            <th className="px-3.5 py-2.5 text-right font-medium">Hist</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {histIndicators.slice(0, 8).map((ind, idx) => (
                            <tr key={idx} className="hover:bg-white/[0.02]">
                              <td className="px-3.5 py-2 text-nexus-textSecondary">
                                {formatTimestamp(ind.timestamp)}
                              </td>
                              <td
                                className={`px-3.5 py-2 text-right font-bold ${
                                  ind.rsi > 70
                                    ? 'text-nexus-bear'
                                    : ind.rsi < 30
                                    ? 'text-nexus-bull'
                                    : 'text-nexus-textPrimary'
                                }`}
                              >
                                {ind.rsi.toFixed(1)}
                              </td>
                              <td className="px-3.5 py-2 text-right text-nexus-textPrimary">
                                {formatPrice(ind.ema20)}
                              </td>
                              <td className="px-3.5 py-2 text-right text-nexus-textMuted">
                                {formatPrice(ind.ema50)}
                              </td>
                              <td
                                className={`px-3.5 py-2 text-right ${
                                  ind.macd >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                                }`}
                              >
                                {ind.macd.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2 text-right text-nexus-textMuted">
                                {ind.macdSignal.toFixed(2)}
                              </td>
                              <td
                                className={`px-3.5 py-2 text-right font-bold ${
                                  ind.macdHistogram >= 0
                                    ? 'text-nexus-bull'
                                    : 'text-nexus-bear'
                                }`}
                              >
                                {ind.macdHistogram > 0 ? '+' : ''}
                                {ind.macdHistogram.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSignal.type === 'macro' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      24H Volume Expansion
                    </div>
                    <div className="text-lg font-mono font-bold text-nexus-textPrimary mt-1">
                      {activeSignal.details?.volExpansion ? String(activeSignal.details.volExpansion) : 'Normal Turnover'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Relative to 30-period baseline
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Taker Buy Ratio
                    </div>
                    <div className="text-lg font-mono font-bold text-nexus-textPrimary mt-1">
                      {typeof activeSignal.details?.takerBuyRatio === 'number'
                        ? activeSignal.details.takerBuyRatio.toFixed(2)
                        : activeSignal.details?.takerBuyRatio ? String(activeSignal.details.takerBuyRatio) : '1.02'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Aggressive market taker flow
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Spot Liquidity Depth Proxy
                    </div>
                    <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-1">
                      {activeSignal.details?.macroEnvironment ? String(activeSignal.details.macroEnvironment) : 'Healthy Orderbook Liquidity'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Bitget Spot Exchange Feeds
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-nexus-void/40 border border-white/[0.06] text-xs font-mono text-nexus-textSecondary leading-relaxed">
                  <span className="text-nexus-accent font-semibold block mb-1">
                    LIQUIDITY CONTEXT
                  </span>
                  The liquidity engine evaluates spot orderbook depth and turnover expansion. It acts as a safety dampener for the autonomous agent: during abnormal volume dry-ups or slippage risks, confidence is throttled to prevent execution slippage.
                </div>
              </div>
            )}

            {activeSignal.type === 'sentiment' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Perpetuals Funding Rate
                    </div>
                    <div className="text-lg font-mono font-bold text-nexus-textPrimary mt-1">
                      {typeof activeSignal.details?.fundingRate === 'number'
                        ? `${(activeSignal.details.fundingRate * 100).toFixed(3)}%`
                        : activeSignal.details?.fundingRate ? String(activeSignal.details.fundingRate) : '0.010%'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Cost of leverage carry (8h)
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Fear & Greed Index
                    </div>
                    <div className="text-lg font-mono font-bold text-nexus-textPrimary mt-1">
                      {activeSignal.details?.fearGreedIndex !== undefined
                        ? String(activeSignal.details.fearGreedIndex)
                        : '50'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Retail sentiment distribution
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Open Interest Trend
                    </div>
                    <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-1">
                      {activeSignal.details?.openInterestTrend ? String(activeSignal.details.openInterestTrend) : 'Normalizing Derivatives OI'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Derivatives positioning overhang
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-nexus-void/40 border border-white/[0.06] text-xs font-mono text-nexus-textSecondary leading-relaxed">
                  <span className="text-nexus-accent font-semibold block mb-1">
                    SENTIMENT ANALYSIS
                  </span>
                  Crowded longs with extreme positive funding rates indicate elevated long-squeeze risk, while negative funding rates with high open interest signal potential short-squeeze expansion.
                </div>
              </div>
            )}

            {activeSignal.type === 'onchain' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Mempool Priority Fee
                    </div>
                    <div className="text-lg font-mono font-bold text-nexus-textPrimary mt-1">
                      {activeSignal.details?.networkFeeRate ||
                        activeSignal.details?.networkFeeSatVb
                        ? String(activeSignal.details.networkFeeRate || activeSignal.details.networkFeeSatVb)
                        : '18 sat/vB'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Fast-tier transaction fee
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Network Congestion
                    </div>
                    <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-1 capitalize">
                      {activeSignal.details?.networkCongestion
                        ? String(activeSignal.details.networkCongestion).replace(/_/g, ' ')
                        : 'Normal Throughput'}
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Mempool backpressure state
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-nexus-void/50 border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-nexus-textMuted uppercase">
                      Blockchain Settlement Health
                    </div>
                    <div className="text-sm font-mono font-bold text-nexus-textPrimary mt-1">
                      Zero Settlement Delays
                    </div>
                    <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                      Public node verification
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSignal.type === 'news' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="stat-label">CATALYST & HEADLINE TIMELINE</span>
                  <span className="text-[10px] font-mono text-nexus-textMuted">
                    Click any item to view forensic metadata
                  </span>
                </div>

                {Array.isArray(activeSignal.details?.headlines) &&
                activeSignal.details.headlines.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {activeSignal.details.headlines.map((item: any, idx: number) => {
                      const title = typeof item === 'string' ? item : item.title || 'Market Catalyst';
                      const source = typeof item === 'object' && item.source ? item.source : 'Public RSS';
                      const sentiment = typeof item === 'object' && item.sentiment ? item.sentiment : 'neutral';
                      const isBull = sentiment.includes('bull') || sentiment.includes('pos');
                      const isBear = sentiment.includes('bear') || sentiment.includes('neg');

                      return (
                        <div
                          key={idx}
                          onClick={() =>
                            setSelectedNews(
                              typeof item === 'string'
                                ? { title: item, source: 'Public Feed', sentiment: 'neutral' }
                                : item
                            )
                          }
                          className="p-3 rounded-xl bg-nexus-void/60 border border-white/[0.06] hover:border-nexus-accent/40 hover:bg-nexus-elevated transition-all cursor-pointer space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-nexus-accent border border-white/10 uppercase">
                              {source}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                                isBull
                                  ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                                  : isBear
                                  ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                                  : 'bg-white/5 text-nexus-textMuted border-white/10'
                              }`}
                            >
                              {sentiment}
                            </span>
                          </div>
                          <p className="text-xs text-nexus-textPrimary font-body leading-relaxed">
                            {title}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl bg-nexus-void/40 border border-white/[0.04] text-center text-xs font-mono text-nexus-textMuted">
                    No major macro catalysts detected in current cycle window.
                  </div>
                )}
              </div>
            )}

            {/* CHRONOLOGICAL SIGNAL SCORE LOG */}
            <div className="space-y-2 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <span className="stat-label">CHRONOLOGICAL SIGNAL SCORE LOG</span>
                <span className="text-[10px] font-mono text-nexus-textMuted">
                  {histSignals.length} Observations Persisted
                </span>
              </div>

              {histSignals.length === 0 ? (
                <div className="p-4 rounded-xl bg-nexus-void/40 text-center text-xs font-mono text-nexus-textMuted border border-white/[0.04]">
                  {loadingHistory ? 'Retrieving signal telemetry...' : 'Awaiting historical signal records.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-nexus-void/80 text-nexus-textMuted border-b border-white/[0.06]">
                      <tr>
                        <th className="px-3.5 py-2.5 text-left font-medium">Timestamp</th>
                        <th className="px-3.5 py-2.5 text-right font-medium">Technical</th>
                        <th className="px-3.5 py-2.5 text-right font-medium">Liquidity</th>
                        <th className="px-3.5 py-2.5 text-right font-medium">Sentiment</th>
                        <th className="px-3.5 py-2.5 text-right font-medium">On-Chain</th>
                        <th className="px-3.5 py-2.5 text-right font-medium">News</th>
                        <th className="px-3.5 py-2.5 text-right font-medium">Fused</th>
                        <th className="px-3.5 py-2.5 text-center font-medium">Regime</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {histSignals.slice(0, 10).map((sig, idx) => {
                        const isSelected = selectedSnapshot?.timestamp === sig.timestamp;
                        return (
                          <tr
                            key={idx}
                            onClick={() => setSelectedSnapshot(isSelected ? null : sig)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-nexus-accent/15 border-l-2 border-nexus-accent'
                                : 'hover:bg-white/[0.03]'
                            }`}
                            title={isSelected ? 'Click to deselect (return to live)' : 'Click to lock inspection to this historical cycle'}
                          >
                            <td className="px-3.5 py-2 text-nexus-textSecondary">
                              <div className="flex items-center gap-1.5">
                                {isSelected && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-pulse" />
                                )}
                                <span>{formatTimestamp(sig.timestamp)}</span>
                                {isSelected && (
                                  <span className="text-[9px] px-1 rounded bg-nexus-accent/20 text-nexus-accent font-bold">
                                    LOCKED
                                  </span>
                                )}
                              </div>
                            </td>
                            <td
                              className={`px-3.5 py-2 text-right ${
                                (sig.technical?.score ?? 0) >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                              }`}
                            >
                              {(sig.technical?.score ?? 0) > 0 ? '+' : ''}
                              {(sig.technical?.score ?? 0).toFixed(2)}
                            </td>
                            <td
                              className={`px-3.5 py-2 text-right ${
                                (sig.liquidity?.score ?? 0) >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                              }`}
                            >
                              {(sig.liquidity?.score ?? 0) > 0 ? '+' : ''}
                              {(sig.liquidity?.score ?? 0).toFixed(2)}
                            </td>
                            <td
                              className={`px-3.5 py-2 text-right ${
                                (sig.sentiment?.score ?? 0) >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                              }`}
                            >
                              {(sig.sentiment?.score ?? 0) > 0 ? '+' : ''}
                              {(sig.sentiment?.score ?? 0).toFixed(2)}
                            </td>
                            <td
                              className={`px-3.5 py-2 text-right ${
                                (sig.onchain?.score ?? 0) >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                              }`}
                            >
                              {(sig.onchain?.score ?? 0) > 0 ? '+' : ''}
                              {(sig.onchain?.score ?? 0).toFixed(2)}
                            </td>
                            <td
                              className={`px-3.5 py-2 text-right ${
                                (sig.news?.score ?? 0) >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                              }`}
                            >
                              {(sig.news?.score ?? 0) > 0 ? '+' : ''}
                              {(sig.news?.score ?? 0).toFixed(2)}
                            </td>
                            <td
                              className={`px-3.5 py-2 text-right font-bold ${
                                (sig.fusedScore ?? 0) >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                              }`}
                            >
                              {(sig.fusedScore ?? 0) > 0 ? '+' : ''}
                              {(sig.fusedScore ?? 0).toFixed(2)}
                            </td>
                            <td className="px-3.5 py-2 text-center text-nexus-textMuted uppercase text-[10px]">
                              {sig.regime ? sig.regime.replace(/_/g, ' ') : 'NORMAL'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* News Article Modal */}
      <NewsDetailModal
        news={selectedNews}
        isOpen={Boolean(selectedNews)}
        onClose={() => setSelectedNews(null)}
      />
    </motion.div>
  );
}
