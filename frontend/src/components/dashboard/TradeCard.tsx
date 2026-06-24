import { Brain } from 'lucide-react';
import Badge from '../ui/Badge';
import { useRelativeTime } from '../../hooks/useRelativeTime';
import { formatPrice, formatPct } from '../../lib/utils';
import type { Trade } from '../../types';

interface TradeCardProps {
  trade: Trade;
  currentPrice?: number;
}

export default function TradeCard({ trade, currentPrice }: TradeCardProps) {
  const timeAgo = useRelativeTime(trade.openedAt);
  const isOpen = trade.status === 'open';

  // FIXED: was always computed as if the trade were long. For a short, profit
  // direction is the mirror image — price falling is a gain, not a loss.
  const unrealizedPct =
    isOpen && currentPrice
      ? trade.side === 'long'
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100
      : null;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={trade.side === 'long' ? 'bullish' : 'bearish'}>{trade.side}</Badge>
          <span className="text-sm font-mono text-nexus-textPrimary">{trade.symbol}</span>
          <Badge variant="default">{trade.strategy.replace(/_/g, ' ')}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOpen ? 'bg-nexus-bull animate-pulse' : trade.status === 'closed' ? 'bg-nexus-muted' : 'bg-nexus-bear'
            }`}
          />
          <span className="stat-label">{timeAgo}</span>
        </div>
      </div>

      <div className="rounded-lg p-3 border-l-2 border-nexus-accent bg-nexus-accent/[0.04]">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Brain size={11} className="text-nexus-accent" />
          <span className="text-[9px] font-bold font-display tracking-[0.15em] uppercase text-nexus-accent">
            AI ANALYSIS
          </span>
          <span className="ml-auto text-[9px] text-nexus-textMuted font-mono">Powered by Qwen</span>
        </div>
        <p className="text-xs text-nexus-textSecondary leading-relaxed font-body italic">{trade.explanation}</p>
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-nexus-textSecondary">Entry: {formatPrice(trade.entryPrice)}</span>
        {isOpen && unrealizedPct !== null && (
          <span className={unrealizedPct >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'}>
            {formatPct(unrealizedPct)} (unrealized)
          </span>
        )}
        {!isOpen && trade.status === 'closed' && (
          <span className={(trade.pnl || 0) >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'}>
            {formatPrice(Math.abs(trade.pnl || 0))} ({formatPct(trade.pnlPct ? trade.pnlPct * 100 : 0)})
          </span>
        )}
      </div>
    </div>
  );
}
