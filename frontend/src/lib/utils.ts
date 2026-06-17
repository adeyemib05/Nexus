import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format as dfnsFormat } from 'date-fns';
import type { MarketRegime, SignalStrength } from '../types';
import { REGIME_CONFIG } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(n: number, decimals = 2): string {
  if (n === undefined || n === null || isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatPct(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '0.00%';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function formatTimestamp(ts: number | string | Date): string {
  if (!ts) return '';
  return dfnsFormat(new Date(ts), 'MMM dd, HH:mm');
}

export function formatDuration(ms: number): string {
  if (ms < 60000) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export function getRegimeColor(regime: MarketRegime): string {
  return REGIME_CONFIG[regime]?.color || '#6B7280';
}

export function scoreToStrength(score: number): SignalStrength {
  if (score > 0.6)  return 'strong_bullish';
  if (score > 0.2)  return 'bullish';
  if (score > -0.2) return 'neutral';
  if (score > -0.6) return 'bearish';
  return 'strong_bearish';
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
