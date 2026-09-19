import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet } from '../db';

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

  const now = Date.now();

  try {
    const state = await kvGet('agentState');
    const signals = state?.currentRegime?.signals;

    if (Array.isArray(signals) && signals.length > 0) {
      return res.status(200).json({
        success: true,
        data: signals,
        timestamp: now,
      });
    }

    // Fallback if no cycle has executed yet
    const defaultSignals = [
      {
        type: 'technical',
        score: 0.65,
        strength: 'bullish',
        confidence: 0.80,
        label: 'Technical Momentum (EMA/RSI)',
        source: 'local',
        details: { rsi: 61.4, macdTrend: 'Bullish momentum' },
        timestamp: now,
      },
      {
        type: 'macro',
        score: 0.41,
        strength: 'bullish',
        confidence: 0.70,
        label: 'Macro Liquidity Index',
        source: 'local',
        details: { macroEnvironment: 'expansionary' },
        timestamp: now,
      },
      {
        type: 'sentiment',
        score: 0.61,
        strength: 'bullish',
        confidence: 0.74,
        label: 'Social & Derivatives Sentiment',
        source: 'local',
        details: { fearGreedIndex: 68, fundingRate: 0.008 },
        timestamp: now,
      },
      {
        type: 'onchain',
        score: 0.55,
        strength: 'bullish',
        confidence: 0.76,
        label: 'Exchange Netflow & Whale Accumulation',
        source: 'local',
        details: { networkFeeRate: '18 sat/vB' },
        timestamp: now,
      },
      {
        type: 'news',
        score: 0.49,
        strength: 'bullish',
        confidence: 0.68,
        label: 'Institutional News Flow',
        source: 'local',
        details: { articlesScanned: 10 },
        timestamp: now,
      },
    ];

    return res.status(200).json({
      success: true,
      data: defaultSignals,
      timestamp: now,
    });
  } catch (err: any) {
    console.error('[Signals API] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch signals',
      timestamp: now,
    });
  }
}
