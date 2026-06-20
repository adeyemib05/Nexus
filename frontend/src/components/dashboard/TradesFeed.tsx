import { Activity } from 'lucide-react';
import type { Trade } from '../../types';
import TradeCard from './TradeCard';

interface TradesFeedProps {
  trades: Trade[];
  currentPrice?: number;
}

export default function TradesFeed({ trades, currentPrice }: TradesFeedProps) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-sm text-nexus-textPrimary">Trade History</h3>
        <span className="stat-label">{trades.length} total</span>
      </div>

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity size={32} className="text-nexus-textMuted mb-3" />
          <p className="text-sm text-nexus-textSecondary">NEXUS is watching the market</p>
          <p className="text-xs text-nexus-textMuted mt-1">Trades appear here when opportunities are identified</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {trades.map((trade) => (
            <TradeCard key={trade.id} trade={trade} currentPrice={currentPrice} />
          ))}
        </div>
      )}
    </div>
  );
}
