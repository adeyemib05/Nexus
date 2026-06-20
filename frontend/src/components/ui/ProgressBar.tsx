import { motion } from 'framer-motion';

interface ProgressBarProps {
  value: number; // 0-1
  color?: string;
  label?: string;
  showValue?: boolean;
  height?: number;
}

export default function ProgressBar({ value, color, label, showValue, height = 6 }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));

  return (
    <div>
      {label && <div className="stat-label mb-1.5">{label}</div>}
      <div className="relative rounded-full overflow-hidden bg-white/5" style={{ height }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color || '#00C8FF' }}
          initial={{ width: '0%' }}
          animate={{ width: `${pct.toFixed(1)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        {showValue && (
          <span className="absolute right-0 -top-4 text-[10px] font-mono text-nexus-textMuted">
            {pct.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
