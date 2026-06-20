import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Brain, Globe2, LineChart, TrendingUp, Network, Newspaper } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNexusStore } from '../store';
import RegimeDial from '../components/dashboard/RegimeDial';
import ScoreBar from '../components/ui/ScoreBar';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import { getRegimeHistory } from '../lib/api';
import { formatTimestamp } from '../lib/utils';
import { SIGNAL_CONFIG, REGIME_CONFIG } from '../types';
import type { SignalReading } from '../types';

const ICONS: Record<string, LucideIcon> = { Globe2, LineChart, TrendingUp, Network, Newspaper };

function strengthLabel(strength: string): string {
  return strength
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function strengthVariant(strength: string): 'bullish' | 'bearish' | 'neutral' {
  if (strength.includes('bullish')) return 'bullish';
  if (strength.includes('bearish')) return 'bearish';
  return 'neutral';
}

export default function Intelligence() {
  const signals = useNexusStore((s) => s.signals);
  const currentRegime = useNexusStore((s) => s.currentRegime);
  const regimeHistory = useNexusStore((s) => s.regimeHistory);
  const setRegimeHistory = useNexusStore((s) => s.setRegimeHistory);
  const [openType, setOpenType] = useState<string | null>(signals[0]?.type ?? null);

  useEffect(() => {
    getRegimeHistory(8).then((res) => {
      if (res.success && res.data) setRegimeHistory(res.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedWeights = Object.entries(SIGNAL_CONFIG).sort((a, b) => b[1].weight - a[1].weight);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="grid lg:grid-cols-12 gap-6">
        {/* LEFT */}
        <div className="lg:col-span-7 space-y-3">
          <div>
            <h2 className="font-display font-bold text-xl text-nexus-textPrimary">Market Intelligence</h2>
            <p className="stat-label mt-1">5-signal AI-powered analysis — Bitget Agent Hub</p>
          </div>

          {signals.length === 0 ? (
            <div className="glass-card p-8 text-center text-nexus-textMuted text-sm">Loading signals...</div>
          ) : (
            signals.map((signal: SignalReading) => {
              const cfg = SIGNAL_CONFIG[signal.type];
              const Icon = ICONS[cfg.icon] || Globe2;
              const isOpen = openType === signal.type;

              return (
                <div key={signal.type} className="glass-card overflow-hidden">
                  <div
                    className="cursor-pointer flex items-center justify-between p-4"
                    onClick={() => setOpenType(isOpen ? null : signal.type)}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={16} className="text-nexus-textMuted" />
                      <span className="font-display font-medium text-sm text-nexus-textPrimary">{signal.label}</span>
                      <Badge variant="default">{signal.source}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={strengthVariant(signal.strength)}>{(signal.confidence * 100).toFixed(0)}%</Badge>
                      <ChevronDown
                        size={16}
                        className="text-nexus-textMuted transition-transform"
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
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4">
                          <ScoreBar score={signal.score} />

                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3 text-xs">
                            {Object.entries(signal.details || {}).map(([key, val]) => (
                              <div key={key} className="contents">
                                <span className="text-nexus-textMuted capitalize">{key}</span>
                                <span className="font-mono text-nexus-textPrimary">
                                  {typeof val === 'number' ? val.toFixed(3) : String(val)}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                            <Badge variant={strengthVariant(signal.strength)}>{strengthLabel(signal.strength)}</Badge>
                            <span className="stat-label">{formatTimestamp(signal.timestamp)}</span>
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

        {/* RIGHT */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-1.5 mb-3">
              <Brain size={14} className="text-nexus-accent" />
              <span className="text-xs font-display font-semibold text-nexus-accent">NEXUS ANALYSIS</span>
            </div>
            <RegimeDial regime={currentRegime} />
            <div className="mt-4 p-3 rounded-lg border-l-2 border-nexus-accent bg-nexus-accent/[0.04]">
              <p className="text-sm text-nexus-textSecondary italic leading-relaxed font-body">
                {currentRegime?.reasoning || 'Analyzing market signals...'}
              </p>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="text-xs font-display font-semibold text-nexus-textPrimary mb-3">REGIME TIMELINE</div>
            {regimeHistory.length === 0 ? (
              <div className="text-xs text-nexus-textMuted py-4 text-center">No history yet</div>
            ) : (
              <div>
                {regimeHistory.map((entry, i) => {
                  const cfg = REGIME_CONFIG[entry.regime];
                  return (
                    <div key={entry.timestamp} className="flex items-start gap-3 pb-4 relative">
                      {i < regimeHistory.length - 1 && (
                        <div className="absolute left-[7px] top-4 bottom-0 w-px bg-white/[0.06]" />
                      )}
                      <div
                        className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5"
                        style={{ borderColor: cfg.color, backgroundColor: cfg.color + '33' }}
                      />
                      <div>
                        <div className="text-xs font-display font-semibold" style={{ color: cfg.color }}>
                          {cfg.label}
                        </div>
                        <div className="stat-label">
                          {entry.confidence}% — {formatTimestamp(entry.timestamp)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="glass-card p-4">
            <div className="text-xs font-display font-semibold text-nexus-textPrimary mb-3">SIGNAL WEIGHTS</div>
            <div className="space-y-3">
              {sortedWeights.map(([type, cfg]) => (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="stat-label">{cfg.label}</span>
                    <span className="font-mono text-xs text-nexus-textSecondary">{(cfg.weight * 100).toFixed(0)}%</span>
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
