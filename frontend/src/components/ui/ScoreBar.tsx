import { cn } from '../../lib/utils';

interface ScoreBarProps {
  score: number; // -1 to +1
  label?: string;
  size?: 'sm' | 'md';
}

export default function ScoreBar({ score, label, size = 'md' }: ScoreBarProps) {
  const clamped = Math.min(1, Math.max(-1, score));
  const height = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div>
      {label && <div className="stat-label mb-1">{label}</div>}
      <div className={cn('relative flex items-center bg-white/5 rounded-full overflow-hidden', height)}>
        {clamped < 0 && (
          <div
            className="absolute right-1/2 h-full bg-nexus-bear rounded-l-full"
            style={{ width: `${Math.abs(clamped) * 50}%` }}
          />
        )}
        {clamped > 0 && (
          <div
            className="absolute left-1/2 h-full bg-nexus-bull rounded-r-full"
            style={{ width: `${clamped * 50}%` }}
          />
        )}
        <div className="absolute left-1/2 w-px h-full bg-white/20" />
      </div>
      <div className={cn('font-mono text-[10px] mt-1', clamped >= 0 ? 'text-nexus-bull' : 'text-nexus-bear')}>
        {clamped > 0 ? '+' : ''}
        {clamped.toFixed(3)}
      </div>
    </div>
  );
}
