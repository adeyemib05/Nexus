import { LineChart, Globe2, TrendingUp, Network, Newspaper, ChevronRight } from 'lucide-react';
import type { SignalReading, SignalStrength } from '../../types';

interface IntelligenceStripProps {
  signals: SignalReading[];
  onSelectSignal?: (signal: SignalReading) => void;
}

const ENGINE_CONFIG: Record<
  string,
  { shortName: string; icon: any }
> = {
  technical: { shortName: 'Technical', icon: LineChart },
  macro: { shortName: 'Liquidity', icon: Globe2 },
  sentiment: { shortName: 'Sentiment', icon: TrendingUp },
  onchain: { shortName: 'On-Chain', icon: Network },
  news: { shortName: 'News', icon: Newspaper },
};

function formatDirection(strength: SignalStrength): { text: string; badge: string } {
  if (strength.includes('bullish')) {
    return { text: 'Bullish', badge: 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30' };
  }
  if (strength.includes('bearish')) {
    return { text: 'Bearish', badge: 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30' };
  }
  return { text: 'Neutral', badge: 'bg-nexus-caution/15 text-nexus-caution border-nexus-caution/30' };
}

function getEvidenceLine(signal: SignalReading): string {
  const d = signal.details || {};
  switch (signal.type) {
    case 'technical':
      const rsiStr = typeof d.rsi === 'number' ? `RSI ${d.rsi.toFixed(1)}` : d.rsi ? `RSI ${d.rsi}` : 'RSI Neutral';
      const macd = d.macdTrend ? String(d.macdTrend).split(' ')[0] : 'EMA';
      return `${rsiStr} · ${macd} momentum`;
    case 'macro':
      const vol = d.volExpansion ? String(d.volExpansion) : 'Normal Vol';
      const taker = typeof d.takerBuyRatio === 'number' ? ` · Taker ${d.takerBuyRatio.toFixed(2)}` : '';
      return `${vol}${taker}`;
    case 'sentiment':
      const fund =
        typeof d.fundingRate === 'number'
          ? `Fund ${(d.fundingRate * 100).toFixed(3)}%`
          : d.fundingRate
          ? `Fund ${d.fundingRate}`
          : 'Fund 0.01%';
      const fg = d.fearGreedIndex !== undefined ? ` · F&G ${d.fearGreedIndex}` : '';
      return `${fund}${fg}`;
    case 'onchain':
      const fee = d.networkFeeRate || d.networkFeeSatVb ? String(d.networkFeeRate || d.networkFeeSatVb) : '18 sat/vB';
      const cong = d.networkCongestion ? String(d.networkCongestion).replace('_congestion', '') : 'Normal';
      return `${fee} · ${cong}`;
    case 'news':
      const scanned = d.articlesScanned ? `${d.articlesScanned} Articles` : 'Verified News';
      return `${scanned} · Bitget/RSS`;
    default:
      return 'Telemetry Active';
  }
}

export default function IntelligenceStrip({ signals, onSelectSignal }: IntelligenceStripProps) {
  if (!signals || signals.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass-card h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="stat-label">5-ENGINE MARKET INTELLIGENCE STRIP</span>
        <span className="text-[10px] font-mono text-nexus-textMuted hidden sm:inline-block">
          Click any card for forensic telemetry
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {signals.map((signal) => {
          const cfg = ENGINE_CONFIG[signal.type] || { shortName: signal.label, icon: Globe2 };
          const Icon = cfg.icon;
          const dir = formatDirection(signal.strength);
          const evidence = getEvidenceLine(signal);
          const formattedScore = `${signal.score > 0 ? '+' : ''}${signal.score.toFixed(2)}`;
          const confidencePct = Math.round(signal.confidence <= 1 ? signal.confidence * 100 : signal.confidence);

          return (
            <div
              key={signal.type}
              onClick={() => onSelectSignal?.(signal)}
              className="glass-card p-3.5 flex flex-col justify-between space-y-2.5 transition-all duration-150 hover:bg-nexus-elevated hover:border-nexus-accent/40 cursor-pointer group"
            >
              {/* Header: Name + Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={14} className="text-nexus-textMuted group-hover:text-nexus-accent transition-colors" />
                  <span className="font-display font-bold text-xs text-nexus-textPrimary tracking-tight">
                    {cfg.shortName}
                  </span>
                </div>
                <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border uppercase font-medium ${dir.badge}`}>
                  {dir.text}
                </span>
              </div>

              {/* Middle: Score + Confidence */}
              <div className="flex items-baseline justify-between pt-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-mono font-bold text-nexus-textPrimary">{formattedScore}</span>
                  <span className="text-[10px] font-mono text-nexus-textMuted">score</span>
                </div>
                <span className="text-xs font-mono font-medium text-nexus-textSecondary">{confidencePct}%</span>
              </div>

              {/* Bottom: 1 short evidence line */}
              <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between">
                <span className="text-[10px] font-mono text-nexus-textMuted truncate max-w-[150px]" title={evidence}>
                  {evidence}
                </span>
                <ChevronRight size={12} className="text-nexus-textMuted group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
