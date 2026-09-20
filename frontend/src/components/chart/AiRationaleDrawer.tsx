import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Brain,
  ShieldCheck,
  Clock,
  ExternalLink,
  Zap,
  Layers,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import type { HistoricalAiDecision, MarketRegime } from '../../types';
import { REGIME_CONFIG } from '../../types';
import { formatPrice, formatTimestamp } from '../../lib/utils';

interface AiRationaleDrawerProps {
  decision: HistoricalAiDecision | null;
  isOpen: boolean;
  onClose: () => void;
  onJumpToChartTimestamp?: (timestamp: number) => void;
}

export default function AiRationaleDrawer({
  decision,
  isOpen,
  onClose,
  onJumpToChartTimestamp,
}: AiRationaleDrawerProps) {
  if (!decision) return null;

  const action = decision.action.toUpperCase();
  const confidence = Math.round(decision.confidence <= 1 ? decision.confidence * 100 : decision.confidence);
  const regimeKey = (decision.regime as MarketRegime) || 'uncertain';
  const regimeConfig = REGIME_CONFIG[regimeKey] || REGIME_CONFIG.uncertain;

  const actionBadge =
    action === 'BUY'
      ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/40'
      : action === 'SELL'
      ? 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/40'
      : 'bg-nexus-caution/15 text-nexus-caution border-nexus-caution/40';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          />

          {/* Slide-out Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] md:w-[540px] bg-nexus-surface border-l border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-nexus-base/40">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-nexus-accent/10 border border-nexus-accent/30 text-nexus-accent">
                  <Brain size={16} />
                </span>
                <div>
                  <h2 className="text-sm font-display font-bold text-nexus-textPrimary">
                    AI Decision Rationale
                  </h2>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-nexus-textMuted">
                    <span>{decision.symbol}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatTimestamp(decision.timestamp)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onJumpToChartTimestamp && (
                  <button
                    onClick={() => onJumpToChartTimestamp(decision.timestamp)}
                    title="Center on Market Chart"
                    className="px-2.5 py-1 rounded text-[11px] font-mono text-nexus-accent border border-nexus-accent/30 hover:bg-nexus-accent/10 transition-colors flex items-center gap-1"
                  >
                    <ExternalLink size={11} />
                    Sync Chart
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-nexus-textMuted hover:text-nexus-textPrimary hover:bg-white/[0.05] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Verdict Summary Bar */}
              <div className="p-4 rounded-xl bg-nexus-elevated border border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="stat-label block mb-1">Decision</span>
                  <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase border ${actionBadge}`}>
                    {action}
                  </span>
                </div>
                <div>
                  <span className="stat-label block mb-1">Confidence</span>
                  <span className="font-mono font-bold text-sm text-nexus-textPrimary">
                    {confidence}%
                  </span>
                </div>
                <div>
                  <span className="stat-label block mb-1">Price at Decision</span>
                  <span className="font-mono font-bold text-sm text-nexus-textPrimary">
                    {formatPrice(decision.marketPrice)}
                  </span>
                </div>
                <div>
                  <span className="stat-label block mb-1">Risk Gate</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-mono font-semibold ${decision.executed ? 'text-nexus-bull' : 'text-nexus-caution'}`}>
                    {decision.executed ? <CheckCircle2 size={12} /> : <ShieldCheck size={12} />}
                    {decision.executed ? 'EXECUTED' : 'BLOCKED'}
                  </span>
                </div>
              </div>

              {/* Concise Model Rationale (No Chain of Thought) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="stat-label flex items-center gap-1.5">
                    <Zap size={11} className="text-nexus-accent" />
                    Model Synthesis & Thesis
                  </span>
                  <span className="text-[10px] font-mono text-nexus-textMuted">
                    Provider: {decision.provider || 'Groq Qwen 32B'}
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs font-mono text-nexus-textPrimary leading-relaxed">
                  "{decision.reasoning}"
                </div>
              </div>

              {/* Execution & Guardrail Details */}
              <div className="space-y-2">
                <span className="stat-label flex items-center gap-1.5">
                  <ShieldCheck size={11} className="text-nexus-accent" />
                  Deterministic Risk Authority Gate
                </span>
                <div className="p-3.5 rounded-xl bg-nexus-elevated border border-white/[0.06] space-y-2.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-nexus-textMuted">Execution Status:</span>
                    <span className={`font-semibold ${decision.executed ? 'text-nexus-bull' : 'text-nexus-textMuted'}`}>
                      {decision.executed ? 'Simulated Order Filled' : 'Protected / Not Executed'}
                    </span>
                  </div>
                  {decision.blockReason && (
                    <div className="pt-2 border-t border-white/[0.05]">
                      <span className="text-nexus-textMuted block mb-1">Gate Evaluation Reason:</span>
                      <p className="text-[11px] text-nexus-caution bg-nexus-caution/10 p-2 rounded border border-nexus-caution/20">
                        {decision.blockReason}
                      </p>
                    </div>
                  )}
                  {decision.tradeId && (
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-nexus-textMuted">Linked Trade ID:</span>
                      <span className="text-nexus-accent font-semibold">{decision.tradeId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Macro & Strategy Context */}
              <div className="space-y-2">
                <span className="stat-label flex items-center gap-1.5">
                  <Layers size={11} className="text-nexus-accent" />
                  Market Regime & Strategy Alignment
                </span>
                <div className="p-3.5 rounded-xl bg-nexus-elevated border border-white/[0.06] space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-nexus-textMuted">Market Regime:</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{ backgroundColor: regimeConfig.bgColor, color: regimeConfig.color }}>
                      {regimeConfig.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-nexus-textMuted">Active Strategy:</span>
                    <span className="text-nexus-textPrimary font-semibold capitalize">
                      {decision.strategy.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {decision.fusedScore !== undefined && decision.fusedScore !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-nexus-textMuted">5-Signal Fused Score:</span>
                      <span className={`font-semibold ${decision.fusedScore > 0 ? 'text-nexus-bull' : decision.fusedScore < 0 ? 'text-nexus-bear' : 'text-nexus-textMuted'}`}>
                        {decision.fusedScore > 0 ? `+${decision.fusedScore.toFixed(3)}` : decision.fusedScore.toFixed(3)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Verified Evidence Streams */}
              <div className="space-y-2">
                <span className="stat-label flex items-center gap-1.5">
                  <Radio size={11} className="text-nexus-accent" />
                  Signal Evidence Supplied to AI
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <span className="text-[10px] text-nexus-textMuted block">Technical</span>
                    <span className="text-nexus-textPrimary font-semibold">EMA20/50 + RSI + MACD</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <span className="text-[10px] text-nexus-textMuted block">Liquidity</span>
                    <span className="text-nexus-textPrimary font-semibold">24h Volume Expansion</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <span className="text-[10px] text-nexus-textMuted block">Sentiment</span>
                    <span className="text-nexus-textPrimary font-semibold">Funding Rate + F&G</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <span className="text-[10px] text-nexus-textMuted block">On-Chain</span>
                    <span className="text-nexus-textPrimary font-semibold">Mempool & Gas Pressure</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/[0.08] bg-nexus-base/60 text-right">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] text-nexus-textPrimary text-xs font-display font-medium transition-colors"
              >
                Close Rationale
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
