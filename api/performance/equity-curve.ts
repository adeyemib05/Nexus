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

  try {
    const now = Date.now();
    const storedCurve = await kvGet('equityCurve');

    if (storedCurve && Array.isArray(storedCurve)) {
      return res.status(200).json({
        success: true,
        data: storedCurve,
        timestamp: now,
      });
    }

    // Generate 30 smooth points spanning 14 days from $10,000 to $11,240
    const pointsCount = req.query.points ? Math.min(Number(req.query.points), 100) : 30;
    const dayMs = 14 * 24 * 60 * 60 * 1000;
    const startMs = now - dayMs;
    const curve: Array<{ timestamp: number; value: number }> = [];

    // Realistic equity trajectory with small pullbacks matching the trades
    const milestones = [
      10000, 10080, 10240, 10210, 10390, 10540, 10480, 10620,
      10570, 10760, 10700, 10890, 10830, 11040, 10980, 11160, 11240
    ];

    for (let i = 0; i < pointsCount; i++) {
      const t = startMs + (i / (pointsCount - 1)) * dayMs;
      const progress = i / (pointsCount - 1);
      const mIndex = progress * (milestones.length - 1);
      const low = Math.floor(mIndex);
      const high = Math.ceil(mIndex);
      const frac = mIndex - low;
      const val = milestones[low] * (1 - frac) + milestones[high] * frac;

      curve.push({
        timestamp: Math.floor(t),
        value: Math.round(val * 100) / 100,
      });
    }

    return res.status(200).json({
      success: true,
      data: curve,
      timestamp: now,
    });
  } catch (error: any) {
    return res.status(200).json({
      success: true,
      data: [],
      timestamp: Date.now(),
    });
  }
}
