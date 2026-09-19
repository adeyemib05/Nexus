// Market Data Client for Bitget Public REST API (Serverless Ready)
// 100% public, no authentication required for tickers and candles.

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceTicker {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

export function normalizeGranularity(g: string): string {
  const map: Record<string, string> = {
    '1M': '1m',
    '5M': '5m',
    '15M': '15m',
    '30M': '30m',
    '1H': '1h',
    '4H': '4h',
    '6H': '6h',
    '12H': '12h',
    '1D': '1day',
    '1W': '1week',
  };
  return map[g.toUpperCase()] ?? g.toLowerCase();
}

const BITGET_BASE_URL = 'https://api.bitget.com';

export async function fetchTicker(symbol = 'BTCUSDT'): Promise<PriceTicker | null> {
  try {
    const res = await fetch(`${BITGET_BASE_URL}/api/v2/spot/market/tickers?symbol=${symbol}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.data?.[0];
    if (!item) return null;

    const price = parseFloat(item.lastPr);
    const changePct24h = parseFloat(item.changeUtc24h || item.change24h || '0');

    return {
      symbol: item.symbol || symbol,
      price,
      change24h: parseFloat(item.change24h || '0'),
      changePct24h,
      high24h: parseFloat(item.high24h || String(price * 1.02)),
      low24h: parseFloat(item.low24h || String(price * 0.98)),
      volume24h: parseFloat(item.baseVolume || '0'),
      timestamp: parseInt(item.ts, 10) || Date.now(),
    };
  } catch (err) {
    console.warn(`[marketData] fetchTicker failed for ${symbol}:`, err);
    return null;
  }
}

export async function fetchCandles(
  symbol = 'BTCUSDT',
  granularity = '1h',
  limit = 100
): Promise<Candle[]> {
  try {
    const normG = normalizeGranularity(granularity);
    const url = `${BITGET_BASE_URL}/api/v2/spot/market/history-candles?symbol=${symbol}&granularity=${normG}&limit=${limit}&endTime=${Date.now()}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const json = await res.json();
    const rows: string[][] = json?.data ?? [];

    const candles: Candle[] = rows.map((row) => ({
      timestamp: parseInt(row[0], 10),
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: parseFloat(row[5]),
    }));

    return candles.sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.warn(`[marketData] fetchCandles failed for ${symbol}:`, err);
    return [];
  }
}

export async function fetchHistoricalCandles(
  symbol = 'BTCUSDT',
  granularity = '1h',
  startTime: number,
  endTime: number
): Promise<Candle[]> {
  const allCandles: Candle[] = [];
  let currentEnd = endTime;
  const MAX_PAGES = 5;
  const normG = normalizeGranularity(granularity);

  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const url = `${BITGET_BASE_URL}/api/v2/spot/market/history-candles?symbol=${symbol}&granularity=${normG}&limit=200&endTime=${currentEnd}`;
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) break;
      const json = await res.json();
      const rows: string[][] = json?.data ?? [];
      if (rows.length === 0) break;

      const batch: Candle[] = rows.map((row) => ({
        timestamp: parseInt(row[0], 10),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      }));

      allCandles.push(...batch);

      const oldest = Math.min(...batch.map((c) => c.timestamp));
      if (oldest <= startTime) break;
      currentEnd = oldest - 1;
    } catch (err) {
      console.warn(`[marketData] Historical candles page ${page} failed:`, err);
      break;
    }
  }

  // Deduplicate and sort
  const seen = new Set<number>();
  const unique = allCandles.filter((c) => {
    if (seen.has(c.timestamp)) return false;
    seen.add(c.timestamp);
    return true;
  });

  return unique.sort((a, b) => a.timestamp - b.timestamp);
}
