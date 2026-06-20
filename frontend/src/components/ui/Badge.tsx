import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'bullish' | 'bearish' | 'neutral' | 'uncertain' | 'default';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  bullish: 'bg-nexus-bull/15 text-nexus-bull border border-nexus-bull/30',
  bearish: 'bg-nexus-bear/15 text-nexus-bear border border-nexus-bear/30',
  neutral: 'bg-nexus-caution/15 text-nexus-caution border border-nexus-caution/30',
  uncertain: 'bg-nexus-muted/15 text-nexus-muted border border-nexus-muted/30',
  default: 'bg-white/5 text-nexus-textSecondary border border-white/10',
};

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'px-2.5 py-0.5 rounded-full text-[10px] font-bold font-display tracking-widest uppercase inline-flex items-center',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
