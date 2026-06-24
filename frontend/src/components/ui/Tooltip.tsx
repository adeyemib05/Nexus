import type { ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  return (
    <div className="relative group">
      {children}
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                   opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity
                   bg-nexus-surface border border-white/10 rounded-lg p-3
                   text-xs text-nexus-textSecondary z-50 w-64"
      >
        {content}
      </div>
    </div>
  );
}
