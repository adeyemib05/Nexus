import { Zap, Cpu, Globe2, LineChart, TrendingUp, Network, Newspaper } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SignalReading, SignalStrength } from '../../types';
import { SIGNAL_CONFIG } from '../../types';
import Badge from '../ui/Badge';
import ScoreBar from '../ui/ScoreBar';
import Tooltip from '../ui/Tooltip';

interface SignalCardProps {
  signal: SignalReading;
}

const ICONS: Record<string, LucideIcon> = { Globe2, LineChart, TrendingUp, Network, Newspaper };

function strengthToBadgeVariant(strength: SignalStrength): 'bullish' | 'bearish' | 'neutral' {
  if (strength === 'strong_bullish' || strength === 'bullish') return 'bullish';
  if (strength === 'strong_bearish' || strength === 'bearish') return 'bearish';
  return 'neutral';
}

function strengthLabel(strength: SignalStrength): string {
  return strength
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function SignalCard({ signal }: SignalCardProps) {
  const cfg = SIGNAL_CONFIG[signal.type];
  const Icon = ICONS[cfg.icon] || Globe2;
  const borderColor =
    signal.score > 0 ? 'border-nexus-bull' : signal.score < 0 ? 'border-nexus-bear' : 'border-nexus-muted';

  return (
    <Tooltip
      content={
        <div className="space-y-1 font-mono">
          {Object.entries(signal.details || {}).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-nexus-textMuted">{key}:</span>
              <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
            </div>
          ))}
        </div>
      }
    >
      <div className={`glass-card p-4 border-l-2 transition-all hover:border-nexus-accent/20 ${borderColor}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Icon size={14} className="text-nexus-textMuted" />
            <span className="stat-label">{signal.label}</span>
          </div>
          {signal.source === 'agent_hub' && (
            <span className="stat-label flex items-center gap-1 text-nexus-accent">
              <Zap size={10} /> LIVE
            </span>
          )}
          {signal.source === 'local' && (
            <span className="stat-label flex items-center gap-1">
              <Cpu size={10} /> LOCAL
            </span>
          )}
          {signal.source === 'mock' && <span className="stat-label text-nexus-muted">DEMO</span>}
        </div>

        <ScoreBar score={signal.score} />

        <div className="flex items-center justify-between mt-3">
          <Badge variant={strengthToBadgeVariant(signal.strength)}>{strengthLabel(signal.strength)}</Badge>
          <span className="stat-label">{(signal.confidence * 100).toFixed(0)}% confidence</span>
        </div>
      </div>
    </Tooltip>
  );
}
