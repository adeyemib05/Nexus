import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { Trade } from '../../types';
import { REGIME_CONFIG } from '../../types';
import { formatPrice, formatPct, formatTimestamp } from '../../lib/utils';

interface TradeDetailModalProps {
  trade: Trade | null;
  isOpen: boolean;
  onClose: () => void;
  onViewAiRationale?: (tradeId: string) => void;
}

export default function TradeDetailModal({ trade, isOpen, onClose, onViewAiRationale }: TradeDetailModalProps) {
  if (!trade) return null;

  const isLong = trade.side === 'long';
  const isClosed = trade.status === 'closed';
  const pnl = trade.pnl || 0;
  const pnlPct = trade.pnlPct || 0;
  const regimeConfig = REGIME_CONFIG[trade.regimeAtEntry] || REGIME_CONFIG.uncertain;

  // Calculate duration if closed
  let durationStr = 'Active';
  if (trade.closedAt && trade.openedAt) {
    const minutes = Math.round((trade.closedAt - trade.openedAt) / (60 * 1000));
    if (minutes < 60) durationStr = `${minutes}m`;
    else durationStr = `${(minutes / 60).toFixed(1)}h`;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-lg bg-nexus-surface border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-nexus-base/40">
              <div className="flex items-center gap-3">
                <span className={`p-2 rounded-xl flex items-center justify-center ${isLong ? 'bg-nexus-bull/15 text-nexus-bull' : 'bg-nexus-bear/15 text-nexus-bear'}`}>
                  {isLong ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-display font-bold text-nexus-textPrimary">
                      {trade.symbol} {trade.side.toUpperCase()}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-white/[0.05] text-nexus-textMuted border border-white/[0.08]">
                      {trade.id}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-nexus-textMuted capitalize">
                    {trade.strategy.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-nexus-textMuted hover:text-nexus-textPrimary hover:bg-white/[0.05] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Financial Metrics Strip */}
              <div className="p-4 rounded-xl bg-nexus-elevated border border-white/[0.08] grid grid-cols-3 gap-3 text-center">
                <div>
                  <span className="stat-label block mb-1">Status</span>
                  <span className={`text-xs font-mono font-bold uppercase ${isClosed ? 'text-nexus-textMuted' : 'text-nexus-bull'}`}>
                    {trade.status}
                  </span>
                </div>
                <div>
                  <span className="stat-label block mb-1">Realized P&L</span>
                  <span className={`text-sm font-mono font-bold ${pnl > 0 ? 'text-nexus-bull' : pnl < 0 ? 'text-nexus-bear' : 'text-nexus-textMuted'}`}>
                    {pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
                  </span>
                </div>
                <div>
                  <span className="stat-label block mb-1">Return</span>
                  <span className={`text-sm font-mono font-bold ${pnlPct > 0 ? 'text-nexus-bull' : pnlPct < 0 ? 'text-nexus-bear' : 'text-nexus-textMuted'}`}>
                    {formatPct(pnlPct)}
                  </span>
                </div>
              </div>

              {/* Execution Price Grid */}
              <div className="p-3.5 rounded-xl bg-nexus-base border border-white/[0.06] space-y-2.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-nexus-textMuted">Entry Price:</span>
                  <span className="text-nexus-textPrimary font-semibold">{formatPrice(trade.entryPrice)}</span>
                </div>
                {trade.exitPrice && (
                  <div className="flex items-center justify-between">
                    <span className="text-nexus-textMuted">Exit Price:</span>
                    <span className="text-nexus-textPrimary font-semibold">{formatPrice(trade.exitPrice)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-nexus-textMuted">Position Size:</span>
                  <span className="text-nexus-textPrimary font-semibold">${trade.positionSizeUSD.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-nexus-textMuted">Stop Loss / Take Profit:</span>
                  <span className="text-nexus-textPrimary">
                    {formatPrice(trade.stopLoss)} / {formatPrice(trade.takeProfit)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-nexus-textMuted">Trade Duration:</span>
                  <span className="text-nexus-textPrimary font-semibold">{durationStr}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-nexus-textMuted">Opened At:</span>
                  <span className="text-nexus-textMuted">{formatTimestamp(trade.openedAt)}</span>
                </div>
                {trade.closedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-nexus-textMuted">Closed At:</span>
                    <span className="text-nexus-textMuted">{formatTimestamp(trade.closedAt)}</span>
                  </div>
                )}
              </div>

              {/* AI Thesis at Entry */}
              <div className="space-y-1.5">
                <span className="stat-label">AI Rationale at Trade Inception</span>
                <p className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs font-mono text-nexus-textPrimary leading-relaxed">
                  "{trade.explanation}"
                </p>
              </div>

              {/* Market Regime at Entry */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-nexus-elevated border border-white/[0.06] text-xs font-mono">
                <span className="text-nexus-textMuted">Regime at Entry:</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{ backgroundColor: regimeConfig.bgColor, color: regimeConfig.color }}>
                  {regimeConfig.label} ({trade.regimeConfidence}%)
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/[0.08] bg-nexus-base/60 flex items-center justify-between">
              {onViewAiRationale && (
                <button
                  onClick={() => {
                    onClose();
                    onViewAiRationale(trade.id);
                  }}
                  className="text-xs font-mono text-nexus-accent hover:underline flex items-center gap-1"
                >
                  View Related AI Decision &rarr;
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 ml-auto rounded-lg bg-white/[0.05] hover:bg-white/[0.10] text-nexus-textPrimary text-xs font-display font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
