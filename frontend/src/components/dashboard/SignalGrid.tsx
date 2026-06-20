import type { SignalReading } from '../../types';
import SignalCard from './SignalCard';

interface SignalGridProps {
  signals: SignalReading[];
}

export default function SignalGrid({ signals }: SignalGridProps) {
  if (signals.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass-card h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {signals.map((signal, i) => (
        <div
          key={signal.type}
          className={i === signals.length - 1 && signals.length % 2 !== 0 ? 'md:col-span-2 lg:col-span-1' : ''}
        >
          <SignalCard signal={signal} />
        </div>
      ))}
    </div>
  );
}
