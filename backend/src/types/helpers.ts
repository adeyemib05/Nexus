import type { SignalStrength } from './index';

export const clamp = (val: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, val));

export const safeDivide = (a: number, b: number, fallback = 0): number =>
  b === 0 || isNaN(b) ? fallback : a / b;

export const average = (arr: number[]): number =>
  arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

export function scoreToStrength(score: number): SignalStrength {
  if (score > 0.6)  return 'strong_bullish';
  if (score > 0.2)  return 'bullish';
  if (score > -0.2) return 'neutral';
  if (score > -0.6) return 'bearish';
  return 'strong_bearish';
}

export const isValidScore = (s: number): boolean =>
  typeof s === 'number' && !isNaN(s) && isFinite(s);
