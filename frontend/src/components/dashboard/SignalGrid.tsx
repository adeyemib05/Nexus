import type { SignalReading } from '../../types';
import SignalCard from './SignalCard';

interface SignalGridProps {
  signals: SignalReading[];
}

export default function SignalGrid({ signals }: SignalGridProps) {
  if (signals.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass-card h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {signals.map((signal) => (
        <SignalCard key={signal.type} signal={signal} />
      ))}
    </div>
  );
}
