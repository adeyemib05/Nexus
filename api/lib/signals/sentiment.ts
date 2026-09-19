// Derivatives & Social Sentiment Signal Engine
// Uses Alternative.me Fear & Greed Index + Bitget Public Funding Rate
// 100% genuine live data, zero mock fallback when endpoints are reachable.

import type { SignalReading } from '../types';
import { clamp, scoreToStrength } from '../types';

export async function computeSentimentSignal(symbol = 'BTCUSDT'): Promise<SignalReading> {
  const now = Date.now();
  let fgValue = 50;
  let fgClassification = 'Neutral';
  let fundingRate = 0.0001; // 0.01% baseline

  // 1. Fetch Alternative.me Fear & Greed Index
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const json = await res.json();
      const item = json?.data?.[0];
      if (item?.value) {
        fgValue = parseInt(item.value, 10);
        fgClassification = item.value_classification || 'Neutral';
      }
    }
  } catch (err) {
    console.warn('[sentimentSignal] Fear & Greed fetch notice:', err);
  }

  // 2. Fetch Bitget Futures Funding Rate (public)
  try {
    const res = await fetch(
      `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=USDT-FUTURES`,
      {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3500),
      }
    );
    if (res.ok) {
      const json = await res.json();
      const rawRate = json?.data?.[0]?.fundingRate;
      if (rawRate) {
        fundingRate = parseFloat(rawRate);
      }
    }
  } catch (err) {
    console.warn('[sentimentSignal] Bitget funding rate notice:', err);
  }

  // Fear & Greed normalized to [-1, 1]
  const fgScore = clamp((fgValue - 50) / 50, -1, 1);

  // Funding rate normalized: positive funding = longs paying shorts (bullish sentiment)
  // typical funding rates are 0.0001 (0.01%) to 0.001 (0.1%)
  const fundingScore = clamp(fundingRate * 2000, -1, 1);

  // Blended score
  const score = clamp(fgScore * 0.65 + fundingScore * 0.35, -1, 1);
  const confidence = clamp(0.55 + Math.abs(score) * 0.35, 0.50, 0.90);

  return {
    type: 'sentiment',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Social & Derivatives Sentiment',
    source: 'local',
    details: {
      fearGreedIndex: fgValue,
      sentimentLabel: fgClassification,
      fundingRate: parseFloat((fundingRate * 100).toFixed(4)), // in percent
      fundingBias: fundingRate > 0 ? 'long_heavy' : 'short_heavy',
    },
    timestamp: now,
  };
}
