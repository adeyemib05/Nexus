import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getHistoricalCandles, saveCandles, type HistoricalCandle } from '../db';

async function fetchLiveCandles(symbol: string, granularity: string, limit = 100): Promise<HistoricalCandle[]> {
  try {
    const url = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const rows: any[] = json?.data || [];
    return rows.map((r) => ({
      symbol,
      timeframe: granularity,
      timestamp: parseInt(r[0], 10),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5] || r[6] || '0'),
    })).sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.warn('[fetchLiveCandles] Bitget notice:', err);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=5');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase().trim();
    const timeframe = String(req.query.timeframe || req.query.granularity || '1m').toLowerCase().trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || 150), 10) || 150, 10), 500);
    const from = req.query.from ? parseInt(String(req.query.from), 10) : undefined;
    const to = req.query.to ? parseInt(String(req.query.to), 10) : undefined;

    let candles = await getHistoricalCandles(symbol, timeframe, limit, from, to);

    // Warm-up cache if historical database has insufficient rows for the requested timeframe
    if (candles.length < 20 && !from) {
      const fresh = await fetchLiveCandles(symbol, timeframe, limit);
      if (fresh.length > 0) {
        await saveCandles(fresh);
        candles = fresh;
      }
    }

    return res.status(200).json({
      success: true,
      data: candles,
      count: candles.length,
      symbol,
      timeframe,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[Market Candles API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve market candles',
      timestamp: Date.now(),
    });
  }
}
