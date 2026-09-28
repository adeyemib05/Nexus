import React from 'react';
import { formatPrice } from '../../lib/utils';
import { Clock, Brain } from 'lucide-react';

export interface HoveredCandleContext {
  timestamp: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  ema20: number | null;
  ema50: number | null;
  emaSource?: 'STORED' | 'DERIVED' | null;
  isForming?: boolean;
  aiDecision?: {
    id: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    strategy: string;
    executed: boolean;
    blockReason?: string | null;
    decisionType?: 'model' | 'failsafe_hold';
  } | null;
}

interface ChartHUDProps {
  data: HoveredCandleContext | null;
  symbol?: string;
  timeframe?: string;
  isHovered?: boolean;
  className?: string;
}

export const ChartHUD: React.FC<ChartHUDProps> = React.memo(({
  data,
  symbol = 'BTCUSDT',
  timeframe = '1m',
  isHovered = false,
  className = '',
}) => {
  if (!data || data.open === null || data.close === null) {
    return (
      <div className={`flex items-center gap-3 text-xs font-mono text-nexus-textMuted/60 py-1 ${className}`}>
        <span className="text-nexus-accent font-semibold">{symbol}</span>
        <span>•</span>
        <span>{timeframe}</span>
        <span>•</span>
        <span>Move crosshair across chart to inspect point-in-time market memory</span>
      </div>
    );
  }

  const {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    ema20,
    ema50,
    emaSource,
    isForming,
    aiDecision,
  } = data;

  const isUp = (close || 0) >= (open || 0);
  const priceChange = (close || 0) - (open || 0);
  const priceChangePct = open ? (priceChange / open) * 100 : 0;

  const timeStr = timestamp
    ? new Date(timestamp).toLocaleString([], {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: timeframe === '1m' ? '2-digit' : undefined,
      })
    : '---';

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.05] text-[11px] font-mono transition-all ${className}`}
    >
      {/* Left: Time & OHLC */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Time Badge */}
        <span className="flex items-center gap-1 text-nexus-textMuted font-semibold">
          <Clock size={11} className={isHovered ? 'text-nexus-accent' : 'text-nexus-textMuted'} />
          <span>{timeStr}</span>
        </span>

        {isForming && (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Forming
          </span>
        )}

        {/* OHLC Readings */}
        <div className="flex items-center gap-2">
          <span className="text-nexus-textMuted">O:</span>
          <span className="font-semibold text-nexus-textPrimary">{formatPrice(open || 0)}</span>

          <span className="text-nexus-textMuted">H:</span>
          <span className="font-semibold text-nexus-textPrimary">{formatPrice(high || 0)}</span>

          <span className="text-nexus-textMuted">L:</span>
          <span className="font-semibold text-nexus-textPrimary">{formatPrice(low || 0)}</span>

          <span className="text-nexus-textMuted">C:</span>
          <span
            className={`font-semibold ${
              isUp ? 'text-nexus-bull' : 'text-nexus-bear'
            }`}
          >
            {formatPrice(close || 0)}
          </span>

          <span
            className={`text-[10px] font-semibold ${
              isUp ? 'text-nexus-bull' : 'text-nexus-bear'
            }`}
          >
            ({isUp ? '+' : ''}
            {priceChangePct.toFixed(2)}%)
          </span>
        </div>

        {/* Volume */}
        {volume !== null && volume !== undefined && (
          <div className="flex items-center gap-1.5 pl-1 border-l border-white/[0.08]">
            <span className="text-nexus-textMuted">Vol:</span>
            <span className="text-nexus-textSecondary font-semibold">
              {volume >= 1000 ? `${(volume / 1000).toFixed(2)}k` : volume.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Right: EMAs & Compact AI Decision Indicator */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Indicators Context */}
        {(ema20 !== null || ema50 !== null) && (
          <div className="flex items-center gap-2.5">
            {ema20 !== null && (
              <span className="flex items-center gap-1">
                <span className="text-cyan-400 font-semibold">EMA20:</span>
                <span className="text-nexus-textPrimary">{formatPrice(ema20)}</span>
              </span>
            )}

            {ema50 !== null && (
              <span className="flex items-center gap-1">
                <span className="text-purple-400 font-semibold">EMA50:</span>
                <span className="text-nexus-textPrimary">{formatPrice(ema50)}</span>
              </span>
            )}

            {emaSource && (
              <span className="px-1 py-0.2 rounded text-[8px] font-mono uppercase bg-white/[0.03] text-nexus-textMuted/70 border border-white/[0.05]">
                {emaSource === 'STORED' ? 'Stored' : 'Derived'}
              </span>
            )}
          </div>
        )}

        {/* Compact AI Decision Marker Context if bar has an AI Decision */}
        {aiDecision && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/[0.08]">
            <Brain size={11} className="text-nexus-accent" />
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border ${
                aiDecision.executed
                  ? aiDecision.action === 'BUY'
                    ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                    : 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                  : aiDecision.action === 'HOLD'
                  ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                  : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
              }`}
            >
              AI {aiDecision.action} ({Math.round(aiDecision.confidence <= 1 ? aiDecision.confidence * 100 : aiDecision.confidence)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

export default ChartHUD;
