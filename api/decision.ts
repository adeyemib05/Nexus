import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getCanonicalDecisionRecord,
  getHistoricalAiDecisions,
  getHistoricalSignals,
  getHistoricalRiskEvents,
  getDefaultHistoricalTrades,
  kvGet,
  reconstructDecisionRecord,
  type Trade,
  type HistoricalSignalSnapshot,
  type HistoricalRiskEvent,
} from './db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.',
      timestamp: Date.now(),
    });
  }

  try {
    const id = req.query.id ? String(req.query.id).trim() : null;

    if (id) {
      const record = await getCanonicalDecisionRecord(id);
      if (!record) {
        return res.status(404).json({
          success: false,
          error: `Decision record not found for id: ${id}`,
          timestamp: Date.now(),
        });
      }
      return res.status(200).json({
        success: true,
        data: record,
        timestamp: Date.now(),
      });
    }

    // If no specific id is passed, reconstruct a list of recent decision records
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase().trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || 20), 10) || 20, 1), 100);
    const decisions = await getHistoricalAiDecisions(symbol, limit);
    const signals = await getHistoricalSignals(symbol, limit * 2).catch(() => []);
    const risks = await getHistoricalRiskEvents(symbol, limit * 2).catch(() => []);
    const trades = (await kvGet('trades').catch(() => null)) || getDefaultHistoricalTrades();

    const records = decisions.map((dec) => {
      const matchedSignal = signals.find((s: HistoricalSignalSnapshot) => {
        if (s.collectedAt && Math.abs(s.collectedAt - dec.timestamp) <= 10000) return true;
        const canonicalMinute = Math.floor(dec.timestamp / 60000) * 60000;
        return s.timestamp === canonicalMinute && Math.abs(s.timestamp - dec.timestamp) <= 60000;
      }) || null;

      const matchedRisk = dec.executed
        ? null
        : risks.find((r: HistoricalRiskEvent) => Math.abs(r.timestamp - dec.timestamp) <= 10000) || null;

      const linkedTrade = dec.tradeId && Array.isArray(trades)
        ? trades.find((t: Trade) => t.id === dec.tradeId) || null
        : null;

      return reconstructDecisionRecord(dec, matchedSignal, matchedRisk, linkedTrade);
    });

    return res.status(200).json({
      success: true,
      data: records,
      count: records.length,
      symbol,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[Decision Record API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve canonical decision record',
      timestamp: Date.now(),
    });
  }
}
