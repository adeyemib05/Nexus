import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getHistoricalCandles,
  insertMarketCandles,
  getHistoricalIndicators,
} from '../_lib/db';
import { handleCollect } from './_collect';

function toBitgetGranularity(tf: string): string {
  const norm = tf.toLowerCase();
  if (norm === '1m' || norm === '1min') return '1min';
  if (norm === '5m' || norm === '5min') return '5min';
  if (norm === '15m' || norm === '15min') return '15min';
  if (norm === '30m' || norm === '30min') return '30min';
  if (norm === '1h') return '1h';
  if (norm === '4h') return '4h';
  if (norm === '1d' || norm === '1day') return '1day';
  return '1h';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Collect-Secret');
  res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=5');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const isCollect = req.url?.includes('/collect') || req.query.sub === 'collect';
  if (isCollect) {
    return handleCollect(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase().trim();
  const timeframe = String(req.query.timeframe || '1h').toLowerCase().trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || 100), 10) || 100, 5), 500);
  const from = req.query.from ? parseInt(String(req.query.from), 10) : undefined;
  const to = req.query.to ? parseInt(String(req.query.to), 10) : undefined;

  const isIndicators = req.url?.includes('/indicators') || req.query.sub === 'indicators';

  try {
    if (isIndicators) {
      const indicators = await getHistoricalIndicators(symbol, timeframe, limit, from, to);
      return res.status(200).json({
        success: true,
        data: indicators,
        symbol,
        timeframe,
        count: indicators.length,
        timestamp: Date.now(),
      });
    }

    // Default or sub === 'candles'
    let candles = await getHistoricalCandles(symbol, timeframe, limit, from, to);

    // Warm-up or replenishment fallback from Bitget if database hasn't ingested enough candles for this timeframe
    if (candles.length < 15) {
      try {
        const bitgetGranularity = toBitgetGranularity(timeframe);
        const fetchLimit = Math.max(limit, 100);
        const bitgetRes = await fetch(
          `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${bitgetGranularity}&limit=${fetchLimit}`
        );
        if (bitgetRes.ok) {
          const json = (await bitgetRes.json()) as any;
          if (json.code === '00000' && Array.isArray(json.data) && json.data.length > 0) {
            const fetchedCandles = json.data.map((c: any) => ({
              symbol,
              timeframe,
              timestamp: parseInt(c[0], 10),
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5] || '0'),
            })).filter((c: any) => c.timestamp > 0 && c.close > 0);
            await insertMarketCandles(fetchedCandles);
            candles = await getHistoricalCandles(symbol, timeframe, limit, from, to);
            if (candles.length === 0) {
              candles = fetchedCandles.sort((a: any, b: any) => a.timestamp - b.timestamp);
            }
          }
        }
      } catch (fetchErr) {
        console.warn('[Market API] Remote Bitget warm-up warning:', fetchErr);
      }
    }

    return res.status(200).json({
      success: true,
      data: candles,
      symbol,
      timeframe,
      count: candles.length,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[Market API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Market data retrieval failed',
      timestamp: Date.now(),
    });
  }
}
