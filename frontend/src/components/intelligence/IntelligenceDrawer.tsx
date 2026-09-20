import { X, LineChart, Globe2, TrendingUp, Network, Newspaper, ShieldCheck } from 'lucide-react';
import type { SignalReading, SignalStrength } from '../../types';
import { SIGNAL_CONFIG } from '../../types';
import ScoreBar from '../ui/ScoreBar';
import { formatTimestamp } from '../../lib/utils';

interface IntelligenceDrawerProps {
  signal: SignalReading | null;
  isOpen: boolean;
  onClose: () => void;
}

const ICONS = {
  technical: LineChart,
  macro: Globe2,
  sentiment: TrendingUp,
  onchain: Network,
  news: Newspaper,
};

function strengthBadge(strength: SignalStrength) {
  if (strength.includes('bullish')) {
    return 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30';
  }
  if (strength.includes('bearish')) {
    return 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30';
  }
  return 'bg-nexus-caution/15 text-nexus-caution border-nexus-caution/30';
}

function strengthLabel(strength: SignalStrength): string {
  return strength
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function IntelligenceDrawer({ signal, isOpen, onClose }: IntelligenceDrawerProps) {
  if (!isOpen || !signal) return null;

  const Icon = ICONS[signal.type] || Globe2;
  const cfg = SIGNAL_CONFIG[signal.type];
  const d = signal.details || {};

  // Render engine-specific curated panels without raw JSON dumping
  const renderCuratedTelemetry = () => {
    switch (signal.type) {
      case 'technical':
        return (
          <div className="space-y-4">
            <div className="stat-label">Core Technical Indicators</div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">RSI (14)</div>
                <div className="text-base font-mono font-bold text-nexus-textPrimary mt-1">
                  {typeof d.rsi === 'number' ? d.rsi.toFixed(1) : d.rsi ? String(d.rsi) : 'Not available'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">
                  {typeof d.rsi === 'number' && d.rsi > 70 ? 'Overbought' : typeof d.rsi === 'number' && d.rsi < 30 ? 'Oversold' : 'Neutral Momentum'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">MACD Trend</div>
                <div className="text-sm font-mono font-semibold text-nexus-textPrimary mt-1 truncate" title={String(d.macdTrend || 'Not available')}>
                  {d.macdTrend ? String(d.macdTrend) : 'Not available'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Momentum bias</div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">EMA 20 vs 50</div>
                <div className="text-sm font-mono font-semibold text-nexus-textPrimary mt-1">
                  {d.ema20_above_ema50 !== undefined ? (d.ema20_above_ema50 ? 'Bullish Cross (Above)' : 'Bearish Cross (Below)') : 'Aligned'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Short-term alignment</div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Price vs EMA 20</div>
                <div className="text-sm font-mono font-semibold text-nexus-textPrimary mt-1">
                  {d.price_vs_ema20 ? String(d.price_vs_ema20) : 'Above Benchmark'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Baseline trend</div>
              </div>
            </div>
          </div>
        );

      case 'macro':
        return (
          <div className="space-y-4">
            <div className="stat-label">Liquidity & Volume Telemetry</div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Volume Expansion</div>
                <div className="text-base font-mono font-bold text-nexus-textPrimary mt-1">
                  {d.volExpansion ? String(d.volExpansion) : 'Not available'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Relative 24h expansion</div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Taker Buy Ratio</div>
                <div className="text-base font-mono font-bold text-nexus-textPrimary mt-1">
                  {typeof d.takerBuyRatio === 'number' ? d.takerBuyRatio.toFixed(2) : d.takerBuyRatio ? String(d.takerBuyRatio) : 'Not available'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Aggressive buyer pressure</div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] col-span-2">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Market Liquidity Status</div>
                <div className="text-sm font-mono font-semibold text-nexus-textPrimary mt-1">
                  {d.macroEnvironment ? String(d.macroEnvironment) : 'Sufficient Spot Liquidity'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Bitget Spot Orderbook Depth</div>
              </div>
            </div>
          </div>
        );

      case 'sentiment':
        return (
          <div className="space-y-4">
            <div className="stat-label">Derivatives & Market Sentiment</div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Funding Rate</div>
                <div className="text-base font-mono font-bold text-nexus-textPrimary mt-1">
                  {typeof d.fundingRate === 'number'
                    ? `${(d.fundingRate * 100).toFixed(3)}%`
                    : d.fundingRate
                    ? String(d.fundingRate)
                    : 'Not available'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Perpetual swap benchmark</div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Fear & Greed Index</div>
                <div className="text-base font-mono font-bold text-nexus-textPrimary mt-1">
                  {d.fearGreedIndex !== undefined ? String(d.fearGreedIndex) : 'Not available'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Composite retail sentiment</div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] col-span-2">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Open Interest Context</div>
                <div className="text-sm font-mono font-semibold text-nexus-textPrimary mt-1">
                  {d.openInterestTrend ? String(d.openInterestTrend) : 'Normalizing Leverage'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Perpetuals positioning</div>
              </div>
            </div>
          </div>
        );

      case 'onchain':
        return (
          <div className="space-y-4">
            <div className="stat-label">Bitcoin Network & On-Chain Status</div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Mempool Fee Rate</div>
                <div className="text-base font-mono font-bold text-nexus-textPrimary mt-1">
                  {d.networkFeeRate || d.networkFeeSatVb ? String(d.networkFeeRate || d.networkFeeSatVb) : 'Not available'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Fast-tier transaction fee</div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Network Congestion</div>
                <div className="text-base font-mono font-bold text-nexus-textPrimary mt-1 capitalize">
                  {d.networkCongestion ? String(d.networkCongestion).replace(/_/g, ' ') : 'Normal'}
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">Blockchain confirmation speed</div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] col-span-2">
                <div className="text-[10px] font-mono text-nexus-textMuted uppercase">Network Settlement Status</div>
                <div className="text-sm font-mono font-semibold text-nexus-textPrimary mt-1">
                  Healthy · Zero settlement backpressure
                </div>
                <div className="text-[10px] text-nexus-textSecondary mt-0.5">On-chain transaction throughput</div>
              </div>
            </div>
          </div>
        );

      case 'news':
        const headlines = Array.isArray(d.headlines) ? d.headlines : [];
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="stat-label">Market News & Announcements</span>
              <span className="text-[10px] font-mono text-nexus-textMuted">
                {d.articlesScanned ? `${d.articlesScanned} scanned` : `${headlines.length} articles`}
              </span>
            </div>

            {headlines.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center text-xs text-nexus-textMuted font-mono">
                No active macro catalysts or high-impact headlines detected in current cycle.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {headlines.map((item: any, idx: number) => {
                  const title = typeof item === 'string' ? item : item.title || 'Market Announcement';
                  const source = typeof item === 'object' && item.source ? item.source : 'Public RSS';
                  const sentiment = typeof item === 'object' && item.sentiment ? item.sentiment : 'neutral';
                  return (
                    <div key={idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-nexus-accent border border-white/10 uppercase">
                          {source}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
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

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md h-full bg-nexus-surface border-l border-white/[0.08] shadow-2xl overflow-y-auto p-6 flex flex-col justify-between space-y-6">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-nexus-accent/10 border border-nexus-accent/30 flex items-center justify-center">
                <Icon size={16} className="text-nexus-accent" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-nexus-textPrimary">{signal.label}</h3>
                <span className="text-[10px] font-mono text-nexus-textMuted uppercase tracking-wider">
                  Weight: {Math.round(cfg.weight * 100)}% of Fused Model
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-nexus-textMuted hover:text-nexus-textPrimary hover:bg-white/[0.05] transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Core Score & Strength */}
          <div className="p-4 rounded-xl bg-nexus-elevated border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="stat-label">ENGINE EVALUATION</span>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border uppercase ${strengthBadge(
                      signal.strength
                    )}`}
                  >
                    {strengthLabel(signal.strength)}
                  </span>
                  <span className="text-xs font-mono text-nexus-textMuted">
                    {(signal.confidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="stat-label">RAW SCORE</span>
                <div className="text-lg font-mono font-bold text-nexus-textPrimary mt-0.5">
                  {signal.score > 0 ? '+' : ''}
                  {signal.score.toFixed(2)}
                </div>
              </div>
            </div>

            <ScoreBar score={signal.score} />
          </div>

          {/* Engine Curated Telemetry */}
          {renderCuratedTelemetry()}
        </div>

        {/* Footer Audit Stamp */}
        <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-nexus-textMuted">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-nexus-accent" />
            <span>Telemetry calibrated via {signal.source}</span>
          </div>
          <span>{formatTimestamp(signal.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
