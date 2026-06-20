import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subvalue?: string;
  trend?: 'up' | 'down' | 'flat';
  icon?: LucideIcon;
  className?: string;
}

export default function StatCard({ label, value, subvalue, trend, icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn('glass-card p-4 transition-all hover:border-nexus-accent/20', className)}>
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        {Icon && <Icon size={14} className="text-nexus-textMuted" />}
      </div>
      <div className="text-2xl font-mono font-medium text-nexus-textPrimary mt-2">{value}</div>
      {subvalue && (
        <div
          className={cn(
            'text-xs mt-1 font-body',
            trend === 'up' ? 'text-nexus-bull' : trend === 'down' ? 'text-nexus-bear' : 'text-nexus-textSecondary'
          )}
        >
          {subvalue}
        </div>
      )}
    </div>
  );
}
