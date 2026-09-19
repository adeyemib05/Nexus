import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet } from '../db';
import type { RegimeReading } from '../_lib/engine';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
    const limit = parseInt(req.query.limit as string, 10) || 12;
    const history: RegimeReading[] = (await kvGet('regimeHistory')) || [];

    // If history in Turso is empty, seed with current agentState regime or a default
    if (history.length === 0) {
      const state = await kvGet('agentState');
      if (state?.currentRegime) {
        history.push(state.currentRegime);
      }
    }

    return res.status(200).json({
      success: true,
      data: history.slice(0, limit),
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[Regime History API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch regime history',
      timestamp: Date.now(),
    });
  }
}
