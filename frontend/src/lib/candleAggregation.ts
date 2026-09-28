import type { HistoricalCandle } from '../types';

export interface AggregatedCandle extends HistoricalCandle {
  isForming?: boolean;
  constituentCount: number;
  expectedConstituents: number;
}

/**
 * Calendar-aligned deterministic candle aggregator.
 *
 * Rules:
 * 1. 5m bucket: bucketStart = Math.floor(timestamp / 300000) * 300000
 * 2. 15m bucket: bucketStart = Math.floor(timestamp / 900000) * 900000
 * 3. Open = first constituent open
 *    High = maximum constituent high
 *    Low = minimum constituent low
 *    Close = last constituent close
 *    Volume = sum of constituent volumes
 * 4. Strictly avoids fabricating non-existent 1m records.
 * 5. Identifies forming/incomplete buckets at the frontier.
 */
export function aggregateCandles(
  candles1m: HistoricalCandle[],
  targetMinutes: 5 | 15
): AggregatedCandle[] {
  if (!candles1m || candles1m.length === 0) return [];

  const bucketMs = targetMinutes * 60 * 1000;
  const expectedConstituents = targetMinutes;
  const symbol = candles1m[0].symbol || 'BTCUSDT';
  const targetTimeframe = targetMinutes === 5 ? '5m' : '15m';

  // Sort ascending chronologically
  const sorted = [...candles1m].sort((a, b) => a.timestamp - b.timestamp);

  // Group into calendar-aligned buckets
  const buckets = new Map<number, HistoricalCandle[]>();

  for (const c of sorted) {
    const bucketStart = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const list = buckets.get(bucketStart) || [];
    list.push(c);
    buckets.set(bucketStart, list);
  }

  const result: AggregatedCandle[] = [];
  const bucketKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  const now = Date.now();

  for (let idx = 0; idx < bucketKeys.length; idx++) {
    const bucketStart = bucketKeys[idx];
    const constituents = buckets.get(bucketStart)!;

    if (constituents.length === 0) continue;

    // Constituents sorted within bucket
    constituents.sort((a, b) => a.timestamp - b.timestamp);

    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const c of constituents) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume || 0;
    }

    const open = constituents[0].open;
    const close = constituents[constituents.length - 1].close;

    // The latest bucket in the series or any bucket whose window extends into the future is forming
    const isLatest = idx === bucketKeys.length - 1;
    const isForming = isLatest && (now < bucketStart + bucketMs || constituents.length < expectedConstituents);

    result.push({
      symbol,
      timeframe: targetTimeframe,
      timestamp: bucketStart,
      open,
      high,
      low,
      close,
      volume: parseFloat(volume.toFixed(4)),
      constituentCount: constituents.length,
      expectedConstituents,
      isForming,
    });
  }

  return result;
}

/**
 * Maps any event timestamp (AI decision, trade) to its containing calendar bucket
 * on aggregated timeframes without look-ahead.
 *
 * Example:
 * 13:27:14 on 5m -> 13:25:00 (since 13:25:00 <= 13:27:14 < 13:30:00)
 */
export function getBucketAnchor(timestampMs: number, timeframe: string): number {
  if (timeframe === '5m') {
    return Math.floor(timestampMs / 300000) * 300000;
  }
  if (timeframe === '15m') {
    return Math.floor(timestampMs / 900000) * 900000;
  }
  if (timeframe === '1h' || timeframe === '1H') {
    return Math.floor(timestampMs / 3600000) * 3600000;
  }
  // Default 1m: canonical minute boundary
  return Math.floor(timestampMs / 60000) * 60000;
}

/**
 * Calculates continuous Exponential Moving Average (EMA) on any candle series.
 * Preserves standard multiplier k = 2 / (period + 1).
 */
export function calculateContinuousEMA(
  candles: HistoricalCandle[],
  period: number
): Array<{ time: number; value: number }> {
  if (!candles || candles.length < period) return [];

  const k = 2 / (period + 1);
  const result: Array<{ time: number; value: number }> = [];

  // Seed with Simple Moving Average of first `period` bars
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;

  result.push({
    time: Math.floor(candles[period - 1].timestamp / 1000),
    value: parseFloat(ema.toFixed(2)),
  });

  // Calculate EMA for remaining bars
  for (let i = period; i < candles.length; i++) {
    const price = candles[i].close;
    ema = price * k + ema * (1 - k);
    result.push({
      time: Math.floor(candles[i].timestamp / 1000),
      value: parseFloat(ema.toFixed(2)),
    });
  }

  return result;
}
