import { AnimatePresence, motion } from 'framer-motion';
import type { RegimeReading } from '../../types';
import { REGIME_CONFIG } from '../../types';
import LoadingSpinner from '../ui/LoadingSpinner';

interface RegimeDialProps {
  regime: RegimeReading | null;
}

const RADIUS = 115;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function RegimeDial({ regime }: RegimeDialProps) {
  if (!regime) {
    return (
      <div className="relative w-[260px] h-[260px] mx-auto flex-shrink-0 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <span className="stat-label">Analyzing market...</span>
      </div>
    );
  }

  const cfg = REGIME_CONFIG[regime.regime];
  const offset = CIRCUMFERENCE * (1 - regime.confidence / 100);

  return (
    <div className="relative w-[260px] h-[260px] mx-auto flex-shrink-0">
      {/* Layer 1 — ambient glow */}
      <div
        className="absolute inset-4 rounded-full blur-3xl opacity-25 transition-all duration-1000"
        style={{ backgroundColor: cfg.color }}
      />

      {/* Layer 2 — static background rings */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 260 260">
        {[110, 95, 78].map((r, i) => (
          <circle key={r} cx="130" cy="130" r={r} fill="none" stroke="white" strokeOpacity={0.04 + i * 0.02} strokeWidth="1" />
        ))}
      </svg>

      {/* Layer 3 — animated confidence arc */}
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 260 260">
        <circle cx="130" cy="130" r={RADIUS} fill="none" stroke="white" strokeOpacity="0.06" strokeWidth="10" />
        <circle
          cx="130"
          cy="130"
          r={RADIUS}
          fill="none"
          stroke={cfg.color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1.2s ease, stroke 0.8s ease',
            filter: `drop-shadow(0 0 8px ${cfg.color}60)`,
          }}
        />
      </svg>

      {/* Layer 4 — center content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={regime.regime}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
        >
          <div className="w-2 h-2 rounded-full mb-3 animate-pulse" style={{ backgroundColor: cfg.color }} />
          <div className="text-[11px] font-bold font-display tracking-[0.2em] uppercase mb-2" style={{ color: cfg.color }}>
            {cfg.label}
          </div>
          <div className="text-5xl font-mono font-medium text-nexus-textPrimary tabular-nums leading-none">
            {regime.confidence}
          </div>
          <div className="stat-label mt-1">% CONFIDENCE</div>
          <div className="text-[10px] font-mono mt-3 text-nexus-textMuted">
            Score: {regime.fusedScore > 0 ? '+' : ''}
            {regime.fusedScore.toFixed(3)}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
