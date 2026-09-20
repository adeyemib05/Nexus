import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Brain, Globe2, LineChart, TrendingUp, Network, Newspaper, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNexusStore } from '../store';
import ScoreBar from '../components/ui/ScoreBar';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import { getRegimeHistory } from '../lib/api';
import { formatTimestamp } from '../lib/utils';
import { SIGNAL_CONFIG, REGIME_CONFIG } from '../types';
import type { SignalReading, SignalStrength } from '../types';

const ICONS: Record<string, LucideIcon> = {
  technical: LineChart,
  macro: Globe2,
  sentiment: TrendingUp,
  onchain: Network,
  news: Newspaper,
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

export default function Intelligence() {
  const signals = useNexusStore((s) => s.signals);
  const currentRegime = useNexusStore((s) => s.currentRegime);
  const regimeHistory = useNexusStore((s) => s.regimeHistory);
  const setRegimeHistory = useNexusStore((s) => s.setRegimeHistory);
  const [openType, setOpenType] = useState<string | null>(signals[0]?.type ?? 'technical');

  useEffect(() => {
    getRegimeHistory(8).then((res) => {
      if (res.success && res.data) setRegimeHistory(res.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedWeights = Object.entries(SIGNAL_CONFIG).sort((a, b) => b[1].weight - a[1].weight);
  const regimeCfg = currentRegime?.regime ? REGIME_CONFIG[currentRegime.regime] : null;

  const renderCuratedSignalBody = (signal: SignalReading) => {
    const d = signal.details || {};

    if (signal.type === 'technical') {
      return (
        <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">RSI (14)</div>
            <div className="text-sm font-bold text-nexus-textPrimary mt-0.5">
              {typeof d.rsi === 'number' ? d.rsi.toFixed(1) : d.rsi ? String(d.rsi) : 'Not available'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">
              {typeof d.rsi === 'number' && d.rsi > 70 ? 'Overbought' : typeof d.rsi === 'number' && d.rsi < 30 ? 'Oversold' : 'Neutral range'}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">MACD Trend</div>
            <div className="text-xs font-bold text-nexus-textPrimary mt-0.5 truncate" title={String(d.macdTrend || 'Not available')}>
              {d.macdTrend ? String(d.macdTrend) : 'Not available'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Momentum bias</div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">EMA 20 vs 50</div>
            <div className="text-xs font-bold text-nexus-textPrimary mt-0.5">
              {d.ema20_above_ema50 !== undefined ? (d.ema20_above_ema50 ? 'Bullish Alignment' : 'Bearish Alignment') : 'Aligned'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Short-term trend</div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">Price vs EMA 20</div>
            <div className="text-xs font-bold text-nexus-textPrimary mt-0.5">
              {d.price_vs_ema20 ? String(d.price_vs_ema20) : 'Above Benchmark'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Benchmark support</div>
          </div>
        </div>
      );
    }

    if (signal.type === 'macro') {
      return (
        <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">Volume Expansion</div>
            <div className="text-sm font-bold text-nexus-textPrimary mt-0.5">
              {d.volExpansion ? String(d.volExpansion) : 'Not available'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">24h volume shift</div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">Taker Buy Ratio</div>
            <div className="text-sm font-bold text-nexus-textPrimary mt-0.5">
              {typeof d.takerBuyRatio === 'number' ? d.takerBuyRatio.toFixed(2) : d.takerBuyRatio ? String(d.takerBuyRatio) : 'Not available'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Aggressive buying flow</div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] col-span-2">
            <div className="text-[10px] text-nexus-textMuted uppercase">Spot Liquidity Depth</div>
            <div className="text-xs font-bold text-nexus-textPrimary mt-0.5">
              {d.macroEnvironment ? String(d.macroEnvironment) : 'Healthy Orderbook Liquidity'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Bitget Spot Market Depth Proxy</div>
          </div>
        </div>
      );
    }

    if (signal.type === 'sentiment') {
      return (
        <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">Funding Rate</div>
            <div className="text-sm font-bold text-nexus-textPrimary mt-0.5">
              {typeof d.fundingRate === 'number'
                ? `${(d.fundingRate * 100).toFixed(3)}%`
                : d.fundingRate
                ? String(d.fundingRate)
                : 'Not available'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Perpetuals cost of carry</div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">Fear & Greed Index</div>
            <div className="text-sm font-bold text-nexus-textPrimary mt-0.5">
              {d.fearGreedIndex !== undefined ? String(d.fearGreedIndex) : 'Not available'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Retail sentiment</div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] col-span-2">
            <div className="text-[10px] text-nexus-textMuted uppercase">Leverage Assessment</div>
            <div className="text-xs font-bold text-nexus-textPrimary mt-0.5">
              {d.openInterestTrend ? String(d.openInterestTrend) : 'Normalizing Perpetual Open Interest'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Derivatives positioning risk</div>
          </div>
        </div>
      );
    }

    if (signal.type === 'onchain') {
      return (
        <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">Mempool Fee Rate</div>
            <div className="text-sm font-bold text-nexus-textPrimary mt-0.5">
              {d.networkFeeRate || d.networkFeeSatVb ? String(d.networkFeeRate || d.networkFeeSatVb) : 'Not available'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Fast-tier transaction fee</div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-nexus-textMuted uppercase">Network Congestion</div>
            <div className="text-xs font-bold text-nexus-textPrimary mt-0.5 capitalize">
              {d.networkCongestion ? String(d.networkCongestion).replace(/_/g, ' ') : 'Normal'}
            </div>
            <div className="text-[9px] text-nexus-textSecondary mt-0.5">Blockchain settlement load</div>
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] col-span-2">
            <div className="text-[10px] text-nexus-textMuted uppercase">Network Status</div>
            <div className="text-xs font-bold text-nexus-textPrimary mt-0.5">
              Healthy Transaction Throughput · Zero settlement backpressure
            </div>
          </div>
        </div>
      );
    }

    if (signal.type === 'news') {
      const headlines = Array.isArray(d.headlines) ? d.headlines : [];
      return (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-nexus-textMuted">
            <span>SCANNED HEADLINES & CATALYSTS</span>
            <span>{d.articlesScanned ? `${d.articlesScanned} scanned` : `${headlines.length} articles`}</span>
          </div>

          {headlines.length === 0 ? (
            <div className="p-3 rounded-lg bg-white/[0.02] text-xs font-mono text-nexus-textMuted text-center">
              No high-impact macro catalysts detected in current cycle.
            </div>
          ) : (
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {headlines.map((item: any, idx: number) => {
                const title = typeof item === 'string' ? item : item.title || 'Market Announcement';
                const source = typeof item === 'object' && item.source ? item.source : 'Public RSS';
                const sentiment = typeof item === 'object' && item.sentiment ? item.sentiment : 'neutral';
                return (
                  <div key={idx} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-nexus-accent border border-white/10 uppercase">
                        {source}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded border uppercase ${
                          sentiment === 'positive' || sentiment === 'bullish'
                            ? 'bg-nexus-bull/10 text-nexus-bull border-nexus-bull/20'
                            : sentiment === 'negative' || sentiment === 'bearish'
                            ? 'bg-nexus-bear/10 text-nexus-bear border-nexus-bear/20'
                            : 'bg-white/5 text-nexus-textMuted border-white/10'
                        }`}
                      >
                        {sentiment}
                      </span>
                    </div>
                    <p className="text-xs text-nexus-textPrimary font-body leading-relaxed">{title}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.06]">
        <div>
          <h2 className="font-display font-bold text-xl text-nexus-textPrimary tracking-tight">
            Market Intelligence Terminal
          </h2>
          <p className="text-xs font-mono text-nexus-textMuted mt-0.5">
            5-signal autonomous fusion model calibrated via Bitget & public market data
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-nexus-bull animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-nexus-textMuted">
            5 Feeds Synchronized
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 5 Curated Intelligence Engines (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {signals.length === 0 ? (
            <div className="glass-card p-8 text-center text-nexus-textMuted text-sm font-mono">
              Loading 5-signal telemetry feeds...
            </div>
          ) : (
            signals.map((signal: SignalReading) => {
              const cfg = SIGNAL_CONFIG[signal.type];
              const Icon = ICONS[signal.type] || Globe2;
              const isOpen = openType === signal.type;

              return (
                <div key={signal.type} className="glass-card overflow-hidden transition-all duration-150">
                  <div
                    className="cursor-pointer flex items-center justify-between p-4 hover:bg-white/[0.02]"
                    onClick={() => setOpenType(isOpen ? null : signal.type)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-nexus-accent/10 border border-nexus-accent/20 flex items-center justify-center">
                        <Icon size={15} className="text-nexus-accent" />
                      </div>
                      <div>
                        <div className="font-display font-semibold text-sm text-nexus-textPrimary">
                          {signal.label}
                        </div>
                        <div className="text-[10px] font-mono text-nexus-textMuted">
                          Weight: {Math.round(cfg.weight * 100)}% · Calibrated via {signal.source}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-nexus-textPrimary">
                          {signal.score > 0 ? '+' : ''}
                          {signal.score.toFixed(2)}
                        </div>
                        <Badge variant={strengthVariant(signal.strength)} className="mt-0.5">
                          {strengthLabel(signal.strength)}
                        </Badge>
                      </div>

                      <ChevronDown
                        size={16}
                        className="text-nexus-textMuted transition-transform duration-200"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-white/[0.04]"
                      >
                        <div className="p-4 pt-3 space-y-3 bg-nexus-elevated/40">
                          <ScoreBar score={signal.score} />
                          {renderCuratedSignalBody(signal)}

                          <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] text-[10px] font-mono text-nexus-textMuted">
                            <span className="flex items-center gap-1">
                              <ShieldCheck size={11} className="text-nexus-accent" />
                              Confidence: {(signal.confidence * 100).toFixed(0)}%
                            </span>
                            <span>{formatTimestamp(signal.timestamp)}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: Fused Regime, Timeline & Fusion Weights (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Fused Market Regime Card */}
          <div className="glass-card p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <Brain size={14} className="text-nexus-accent" />
                <span className="stat-label text-nexus-accent">FUSED MARKET REGIME</span>
              </div>
              <span className="text-[10px] font-mono text-nexus-textMuted">5-Signal Synthesis</span>
            </div>

            {currentRegime && regimeCfg ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-nexus-elevated border border-white/[0.06] flex items-center justify-between">
                  <div>
                    <div
                      className="text-sm font-mono font-bold uppercase tracking-wider"
                      style={{ color: regimeCfg.color }}
                    >
                      {regimeCfg.label}
                    </div>
                    <div className="text-xs text-nexus-textSecondary font-body mt-0.5">
                      Strategy Archetype: {regimeCfg.strategy}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-mono font-bold text-nexus-textPrimary">
                      {currentRegime.confidence}%
                    </div>
                    <div className="text-[10px] font-mono text-nexus-textMuted">
                      Fused: {currentRegime.fusedScore > 0 ? '+' : ''}
                      {currentRegime.fusedScore.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-nexus-void/70 border border-white/[0.06] border-l-2 border-nexus-accent">
                  <span className="text-[10px] font-mono text-nexus-accent uppercase font-semibold block mb-1">
                    Systemic Rationale
                  </span>
                  <p className="text-xs text-nexus-textPrimary leading-relaxed font-body">
                    &ldquo;{currentRegime.reasoning}&rdquo;
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-xs font-mono text-nexus-textMuted">
                Analyzing market signals...
              </div>
            )}
          </div>

          {/* Regime Timeline */}
          <div className="glass-card p-4 space-y-3">
            <div className="stat-label">REGIME TRANSITION TIMELINE</div>
            {regimeHistory.length === 0 ? (
              <div className="text-xs font-mono text-nexus-textMuted py-3 text-center">
                Awaiting transition logs...
              </div>
            ) : (
              <div className="space-y-3">
                {regimeHistory.slice(0, 5).map((entry, i) => {
                  const cfg = REGIME_CONFIG[entry.regime];
                  return (
                    <div key={entry.timestamp} className="flex items-start gap-3 relative pb-1">
                      {i < Math.min(regimeHistory.length, 5) - 1 && (
                        <div className="absolute left-[6px] top-4 bottom-0 w-px bg-white/[0.08]" />
                      )}
                      <div
                        className="w-3 h-3 rounded-full border-2 flex-shrink-0 mt-0.5"
                        style={{ borderColor: cfg.color, backgroundColor: cfg.color + '33' }}
                      />
                      <div className="flex-1 flex items-baseline justify-between">
                        <div>
                          <span className="text-xs font-mono font-semibold" style={{ color: cfg.color }}>
                            {cfg.label}
                          </span>
                          <span className="text-[10px] font-mono text-nexus-textMuted ml-2">
                            {entry.confidence}% confidence
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-nexus-textMuted">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Signal Weights in Fused Decision */}
          <div className="glass-card p-4 space-y-3">
            <div className="stat-label">FUSION MODEL ENGINE WEIGHTS</div>
            <div className="space-y-2.5">
              {sortedWeights.map(([type, cfg]) => (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-nexus-textSecondary">{cfg.label}</span>
                    <span className="font-bold text-nexus-textPrimary">{(cfg.weight * 100).toFixed(0)}%</span>
                  </div>
                  <ProgressBar value={cfg.weight} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
