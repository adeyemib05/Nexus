import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  const signals = [
    {
      type: 'technical',
      score: 0.62,
      strength: 'bullish',
      confidence: 0.78,
      label: 'Technical Momentum (EMA/RSI)',
      source: 'local',
      details: {
        rsi: 61.4,
        macd: 'bullish_cross',
        ema20AboveEma50: true,
      },
      timestamp: now - 45000,
    },
    {
      type: 'macro',
      score: 0.41,
      strength: 'bullish',
      confidence: 0.70,
      label: 'Macro Liquidity Index',
      source: 'local',
      details: {
        fedRateExpectation: 'dovish',
        dxyIndex: 103.2,
        treasuryYield10Y: 'falling',
      },
      timestamp: now - 45000,
    },
    {
      type: 'sentiment',
      score: 0.58,
      strength: 'bullish',
      confidence: 0.74,
      label: 'Social & Derivatives Sentiment',
      source: 'local',
      details: {
        fundingRate: 0.008,
        fearGreedIndex: 68,
        longShortRatio: 1.34,
      },
      timestamp: now - 45000,
    },
    {
      type: 'onchain',
      score: 0.55,
      strength: 'bullish',
      confidence: 0.76,
      label: 'Exchange Netflow & Whale Accumulation',
      source: 'local',
      details: {
        netOutflowBtc: 4200,
        activeAddressesDelta: '+8.2%',
        whaleTransactionCount: 312,
      },
      timestamp: now - 45000,
    },
    {
      type: 'news',
      score: 0.49,
      strength: 'bullish',
      confidence: 0.68,
      label: 'Institutional News Flow',
      source: 'local',
      details: {
        etfInflowsUsd: '+$310M',
        headlineScore: 0.52,
        sentimentKeywordDominance: 'expansionary',
      },
      timestamp: now - 45000,
    },
  ];

  const regime = {
    regime: 'bullish_trend',
    confidence: 71,
    fusedScore: 0.54,
    signals,
    timestamp: now - 45000,
    reasoning: 'Multi-signal fusion confirms strong bullish momentum with robust on-chain volume and favorable macro backdrop.',
  };

  return res.status(200).json({
    success: true,
    data: signals,
    regime,
    timestamp: now,
  });
}
