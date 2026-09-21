// api/market/_collect.ts
// Market Data Collection Engine — Called by cron-job.org every minute via /api/market/collect
// Collects 1m + 1h candles, calculates indicators (EMA/RSI/MACD), runs 5 signal engines.
// Does NOT call Qwen/Groq. Does NOT execute trades. Purely market memory.
//
// Protection: validates X-Collect-Secret header against COLLECT_SECRET env var.
// If COLLECT_SECRET is not set, the endpoint is open (suitable for initial testing only).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  saveCandles,
  saveIndicatorSnapshot,
  saveSignalSnapshot,
  type HistoricalCandle,
  type HistoricalSignalSnapshot,
} from '../db';

// ── TYPES ──────────────────────────────────────────────────────────────────────

interface RawCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── MARKET DATA ────────────────────────────────────────────────────────────────

async function fetchBitgetCandles(
  symbol: string,
  granularity: string, // Bitget granularity: '1min', '5min', '15min', '1H', '4H', '1D'
  limit: number
): Promise<RawCandle[]> {
  try {
    const url = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[collect] Bitget ${granularity} candles HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    if (json.code !== '00000' || !Array.isArray(json.data)) {
      console.warn('[collect] Bitget candles unexpected response:', json.code);
      return [];
    }
    // Bitget response format: [timestamp(ms), open, high, low, close, baseVolume, quoteVolume]
    return (json.data as any[]).map((r) => ({
      timestamp: parseInt(r[0], 10),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5] || '0'),
    })).filter((c) => c.timestamp > 0 && c.close > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch (err: any) {
    console.warn(`[collect] Bitget candles error (${granularity}):`, err.message);
    return [];
  }
}

async function fetchTicker(symbol: string): Promise<{ price: number; changePct24h: number; volume24h: number } | null> {
  try {
    const res = await fetch(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`);
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.data?.[0];
    if (!item) return null;
    return {
      price: parseFloat(item.lastPr),
      changePct24h: parseFloat(item.change24h || '0'),
      volume24h: parseFloat(item.baseVolume || '25000'),
    };
  } catch {
    return null;
  }
}

// ── INDICATOR CALCULATIONS ────────────────────────────────────────────────────
// EMA: Exponential Moving Average (k = 2 / (period + 1))
// RSI: 14-period Wilder RSI
// MACD: Fast(12) - Slow(26), Signal(9), Histogram = MACD - Signal

function calcEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number; signal: number; histogram: number } {
  if (closes.length < slow) return { macd: 0, signal: 0, histogram: 0 };
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdSeries = emaFast.map((v, i) => v - emaSlow[i]);
  const signalSeries = calcEMA(macdSeries, signal);
  const last = macdSeries.length - 1;
  const m = macdSeries[last];
  const s = signalSeries[last];
  return {
    macd: parseFloat(m.toFixed(2)),
    signal: parseFloat(s.toFixed(2)),
    histogram: parseFloat((m - s).toFixed(2)),
  };
}

// ── SIGNAL ENGINES (SYNC-ONLY — NO LLM) ──────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function computeTechnicalScore(candles: RawCandle[]): {
  score: number; confidence: number; strength: string;
  rsi: number; ema20: number; ema50: number; macd: number; macdSignal: number; macdHistogram: number;
} {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const ema20Arr = calcEMA(closes, 20);
  const ema50Arr = calcEMA(closes, Math.min(50, closes.length));
  const ema20 = ema20Arr[ema20Arr.length - 1];
  const ema50 = ema50Arr[ema50Arr.length - 1];
  const rsi = calcRSI(closes, 14);
  const macdData = calcMACD(closes, 12, 26, 9);

  let emaTrendScore: number;
  if (ema20 > ema50) {
    emaTrendScore = clamp((price - ema20) / (ema20 * 0.03), 0.2, 0.85);
  } else {
    emaTrendScore = clamp((price - ema20) / (ema20 * 0.03), -0.85, -0.2);
  }

  let rsiScore = 0;
  if (rsi > 70) rsiScore = clamp(-(rsi - 70) / 30, -0.7, -0.2);
  else if (rsi < 30) rsiScore = clamp((30 - rsi) / 30, 0.2, 0.7);
  else rsiScore = clamp((rsi - 50) / 25, -0.6, 0.6);

  let macdScore = 0;
  if (macdData.histogram > 0) {
    macdScore = clamp(macdData.histogram / (price * 0.001 || 1), 0.1, 0.85);
  } else {
    macdScore = clamp(macdData.histogram / (price * 0.001 || 1), -0.85, -0.1);
  }

  const score = clamp(emaTrendScore * 0.45 + rsiScore * 0.30 + macdScore * 0.25, -1, 1);
  const confidence = clamp(0.65 + Math.abs(score) * 0.25, 0.50, 0.95);
  const strength =
    score >= 0.6 ? 'strong_bullish' :
    score >= 0.2 ? 'bullish' :
    score <= -0.6 ? 'strong_bearish' :
    score <= -0.2 ? 'bearish' : 'neutral';

  return {
    score: parseFloat(score.toFixed(3)),
    confidence: parseFloat(confidence.toFixed(2)),
    strength,
    rsi: parseFloat(rsi.toFixed(1)),
    ema20: parseFloat(ema20.toFixed(2)),
    ema50: parseFloat(ema50.toFixed(2)),
    macd: macdData.macd,
    macdSignal: macdData.signal,
    macdHistogram: macdData.histogram,
  };
}

function computeLiquidityScore(
  ticker: { price: number; changePct24h: number; volume24h: number } | null,
  candles1h: RawCandle[]
): { score: number; confidence: number; strength: string } {
  let volRatio = 0;
  if (candles1h.length >= 24) {
    const last24 = candles1h.slice(-24).reduce((s, c) => s + c.volume, 0);
    const avg = candles1h.reduce((s, c) => s + c.volume, 0) / (candles1h.length / 24);
    if (avg > 0) volRatio = (last24 - avg) / avg;
  } else if (ticker) {
    volRatio = (ticker.volume24h - 25000) / 25000;
  }

  const volScore = clamp(volRatio * 0.7, -0.6, 0.8);
  const priceScore = clamp((ticker?.changePct24h || 0) * 10, -0.7, 0.7);
  const score = clamp(volScore * 0.50 + priceScore * 0.50, -1, 1);
  const confidence = clamp(0.52 + Math.abs(score) * 0.30, 0.50, 0.85);
  const strength =
    score >= 0.6 ? 'strong_bullish' :
    score >= 0.2 ? 'bullish' :
    score <= -0.6 ? 'strong_bearish' :
    score <= -0.2 ? 'bearish' : 'neutral';
  return { score: parseFloat(score.toFixed(3)), confidence: parseFloat(confidence.toFixed(2)), strength };
}

async function computeSentimentScore(): Promise<{ score: number; confidence: number; strength: string }> {
  let fng: number | null = null;
  let funding: number | null = null;

  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1');
    if (r.ok) {
      const j = await r.json();
      const v = parseInt(j?.data?.[0]?.value, 10);
      if (!isNaN(v)) fng = v;
    }
  } catch { /* no-op */ }

  try {
    const r = await fetch('https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=USDT-FUTURES');
    if (r.ok) {
      const j = await r.json();
      const rate = parseFloat(j?.data?.[0]?.fundingRate || '');
      if (!isNaN(rate)) funding = rate;
    }
  } catch { /* no-op */ }

  if (fng === null && funding === null) {
    return { score: 0, confidence: 0, strength: 'neutral' };
  }

  const fngScore = fng !== null ? clamp((fng - 50) / 40, -0.85, 0.85) : 0;
  const fundScore = funding !== null ? clamp(funding * 2000, -0.80, 0.80) : 0;
  const score = clamp(
    fng !== null && funding !== null ? fngScore * 0.65 + fundScore * 0.35 : fng !== null ? fngScore : fundScore,
    -1, 1
  );
  const confidence = clamp(0.60 + Math.abs(score) * 0.25, 0.50, 0.88);
  const strength =
    score >= 0.6 ? 'strong_bullish' :
    score >= 0.2 ? 'bullish' :
    score <= -0.6 ? 'strong_bearish' :
    score <= -0.2 ? 'bearish' : 'neutral';
  return { score: parseFloat(score.toFixed(3)), confidence: parseFloat(confidence.toFixed(2)), strength };
}

async function computeOnchainScore(): Promise<{ score: number; confidence: number; strength: string }> {
  let tvlChange: number | null = null;
  let feeAvail = false;
  let feeStatus = 'low_congestion';
  let fastestFee: number | null = null;

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch('https://mempool.space/api/v1/fees/recommended', { signal: ctrl.signal });
    clearTimeout(tid);
    if (r.ok) {
      const d = await r.json();
      if (typeof d.fastestFee === 'number') {
        fastestFee = d.fastestFee as number;
        feeAvail = true;
        const fee = fastestFee;
        feeStatus = fee < 8 ? 'low_congestion' : fee <= 25 ? 'normal_congestion' : fee <= 60 ? 'elevated_congestion' : 'extreme_congestion';
      }
    }
  } catch { /* no-op */ }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch('https://api.llama.fi/charts/Bitcoin', { signal: ctrl.signal });
    clearTimeout(tid);
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d.length >= 2) {
        const last = Number(d[d.length - 1]?.totalLiquidityUSD ?? d[d.length - 1]?.tvl ?? 0);
        const prev = Number(d[d.length - 2]?.totalLiquidityUSD ?? d[d.length - 2]?.tvl ?? 0);
        if (prev > 0 && last > 0) tvlChange = ((last - prev) / prev) * 100;
      }
    }
  } catch { /* no-op */ }

  const tvlScore = tvlChange !== null ? clamp(tvlChange / 5, -0.6, 0.6) : 0;
  const score = clamp(tvlChange !== null && feeAvail ? 0 * 0.35 + tvlScore * 0.65 : tvlScore, -1, 1);
  const confidence = clamp(0.50 + (tvlChange !== null ? 0.18 : 0) + (feeAvail ? 0.10 : 0) + Math.abs(score) * 0.15, 0.45, 0.88);
  const strength =
    score >= 0.6 ? 'strong_bullish' :
    score >= 0.2 ? 'bullish' :
    score <= -0.6 ? 'strong_bearish' :
    score <= -0.2 ? 'bearish' : 'neutral';
  return { score: parseFloat(score.toFixed(3)), confidence: parseFloat(confidence.toFixed(2)), strength };
}

async function computeNewsScore(): Promise<{ score: number; confidence: number; strength: string }> {
  // Minimal news signal calculation: fetch Cointelegraph RSS and score headlines
  const POSITIVE_RX = [
    /\b(etf\s+inflows?|inflows?|institutional\s+buy(ing)?)\b/i,
    /\b(approv(ed|al|es)?|greenlights?)\b/i,
    /\b(record\s+high|all-time\s+high|\bath\b|breakout|bullish)\b/i,
    /\b(rate\s+cuts?|monetary\s+easing)\b/i,
  ];
  const NEGATIVE_RX = [
    /\b(hack(ed|s)?|exploit(ed|s)?|stolen\s+funds)\b/i,
    /\b(lawsuits?|charges|indict(ed|ment)?|crackdown)\b/i,
    /\b(ban(ned|ning|s)?)\b/i,
    /\b(insolvent|bankruptcy|bankrupt)\b/i,
    /\b(dump(ed|ing|s)?)\b/i,
  ];
  const CRYPTO_RX = /\b(bitcoin|btc|crypto|cryptocurrency|ethereum|eth)\b/i;

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch('https://cointelegraph.com/rss', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!r.ok) return { score: 0, confidence: 0.25, strength: 'neutral' };

    const xml = await r.text();
    const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
    let pos = 0;
    let neg = 0;
    let neutral = 0;
    let total = 0;
    let m: RegExpExecArray | null;

    while ((m = titleRegex.exec(xml)) !== null && total < 15) {
      const title = m[1].trim();
      if (!title || !CRYPTO_RX.test(title)) continue;
      total++;
      const isPos = POSITIVE_RX.some((rx) => rx.test(title));
      const isNeg = NEGATIVE_RX.some((rx) => rx.test(title));
      if (isPos && !isNeg) pos++;
      else if (isNeg && !isPos) neg++;
      else neutral++;
    }

    if (total === 0) return { score: 0, confidence: 0.25, strength: 'neutral' };
    const dir = pos + neg;
    const rawScore = dir > 0 ? (pos - neg) / (dir + neutral * 0.3) : 0;
    const score = clamp(rawScore, -0.75, 0.75);
    const confidence = dir === 0
      ? clamp(0.25 + Math.min(total, 5) * 0.02, 0.25, 0.35)
      : clamp(0.35 + Math.min(dir, 4) * 0.06 + Math.abs(score) * 0.10, 0.30, 0.85);
    const strength =
      score >= 0.6 ? 'strong_bullish' :
      score >= 0.2 ? 'bullish' :
      score <= -0.6 ? 'strong_bearish' :
      score <= -0.2 ? 'bearish' : 'neutral';
    return { score: parseFloat(score.toFixed(3)), confidence: parseFloat(confidence.toFixed(2)), strength };
  } catch {
    return { score: 0, confidence: 0.25, strength: 'neutral' };
  }
}

// Signal fusion (same weights as cycle.ts)
const SIGNAL_WEIGHTS = { technical: 0.30, liquidity: 0.25, sentiment: 0.20, onchain: 0.15, news: 0.10 };

function fuseScores(scores: Record<string, { score: number; confidence: number }>): { fusedScore: number; regime: string; regimeConfidence: number } {
  let totalWeight = 0;
  let weightedScore = 0;
  let weightedConf = 0;

  for (const [key, val] of Object.entries(scores)) {
    if (val.confidence <= 0) continue;
    const base = SIGNAL_WEIGHTS[key as keyof typeof SIGNAL_WEIGHTS] || 0.2;
    const dyn = base * val.confidence;
    totalWeight += dyn;
    weightedScore += val.score * dyn;
    weightedConf += val.confidence * base;
  }

  const fusedScore = totalWeight > 0 ? clamp(weightedScore / totalWeight, -1, 1) : 0;
  const totalBase = Object.values(SIGNAL_WEIGHTS).reduce((s, v) => s + v, 0);
  const avgConf = totalBase > 0 ? weightedConf / totalBase : 0.5;
  let regime = 'ranging';
  if (fusedScore >= 0.22) regime = 'bullish_trend';
  else if (fusedScore <= -0.22) regime = 'bearish_trend';
  else if (avgConf < 0.45) regime = 'uncertain';
  const regimeConfidence = Math.round(clamp(avgConf * 100 * (0.8 + Math.abs(fusedScore) * 0.2), 35, 96));
  return { fusedScore: parseFloat(fusedScore.toFixed(3)), regime, regimeConfidence };
}

// ── HANDLER ────────────────────────────────────────────────────────────────────

export async function handleCollect(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Collect-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth: strictly require X-Collect-Secret matching COLLECT_SECRET env var
  const collectSecret = process.env.COLLECT_SECRET;
  if (!collectSecret) {
    return res.status(503).json({
      success: false,
      error: 'COLLECT_SECRET is not configured on server. Please add COLLECT_SECRET to Vercel environment variables.',
      timestamp: Date.now(),
    });
  }

  const provided = req.headers['x-collect-secret'] || (typeof req.query.secret === 'string' ? req.query.secret : undefined);
  if (!provided || provided !== collectSecret) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid X-Collect-Secret header.',
      timestamp: Date.now(),
    });
  }

  const now = Date.now();
  const symbol = 'BTCUSDT';

  try {
    // 1. Fetch market data in parallel
    const [candles1m, candles1h, ticker] = await Promise.all([
      fetchBitgetCandles(symbol, '1min', 200),
      fetchBitgetCandles(symbol, '1H', 100),
      fetchTicker(symbol),
    ]);

    let candlesWritten1m = 0;
    let candlesWritten1h = 0;

    // 2. Persist 1m candles (upsert — idempotent via PRIMARY KEY)
    if (candles1m.length > 0) {
      const rows: HistoricalCandle[] = candles1m.map((c) => ({ symbol, timeframe: '1m', ...c }));
      await saveCandles(rows);
      candlesWritten1m = rows.length;
    }

    // 3. Persist 1h candles
    if (candles1h.length > 0) {
      const rows: HistoricalCandle[] = candles1h.map((c) => ({ symbol, timeframe: '1h', ...c }));
      await saveCandles(rows);
      candlesWritten1h = rows.length;
    }

    // 4. Resolve canonical market candle timestamp (latest candle timestamp e.g. 1790001900000)
    const latestCandle = candles1m.length > 0 ? candles1m[candles1m.length - 1] : null;
    const observationTimestamp = latestCandle ? latestCandle.timestamp : Math.floor(now / 60000) * 60000;

    // 5. Calculate indicators from 1m candles (need >= 26 for MACD)
    let indicatorStored = false;
    const candlesForIndicators = candles1m.length >= 26 ? candles1m : candles1h;

    if (candlesForIndicators.length >= 26) {
      const tech = computeTechnicalScore(candlesForIndicators);
      await saveIndicatorSnapshot({
        id: `ind_${symbol}_1m_${observationTimestamp}`,
        symbol,
        timeframe: '1m',
        timestamp: observationTimestamp,
        collectedAt: now,
        rsi: tech.rsi,
        ema20: tech.ema20,
        ema50: tech.ema50,
        macd: tech.macd,
        macdSignal: tech.macdSignal,
        macdHistogram: tech.macdHistogram,
        indicatorsJson: {
          priceVsEma20: candlesForIndicators.length > 0
            ? `${(((candlesForIndicators[candlesForIndicators.length - 1].close - tech.ema20) / tech.ema20) * 100).toFixed(2)}%`
            : 'N/A',
        },
      });
      indicatorStored = true;
    }

    // 6. Compute all 5 signal engines (no LLM — async I/O only for sentiment/onchain/news)
    const candlesForSignals = candles1m.length >= 25 ? candles1m : candles1h;
    let signalStored = false;

    if (candlesForSignals.length >= 25) {
      const [sentimentData, onchainData, newsData] = await Promise.all([
        computeSentimentScore(),
        computeOnchainScore(),
        computeNewsScore(),
      ]);

      const techSignal = computeTechnicalScore(candlesForSignals);
      const liqSignal = computeLiquidityScore(ticker, candles1h);

      const allScores = {
        technical: { score: techSignal.score, confidence: techSignal.confidence },
        liquidity: { score: liqSignal.score, confidence: liqSignal.confidence },
        sentiment: { score: sentimentData.score, confidence: sentimentData.confidence },
        onchain: { score: onchainData.score, confidence: onchainData.confidence },
        news: { score: newsData.score, confidence: newsData.confidence },
      };

      const { fusedScore, regime, regimeConfidence } = fuseScores(allScores);

      const snapshot: HistoricalSignalSnapshot = {
        id: `sig_${symbol}_${observationTimestamp}`,
        timestamp: observationTimestamp,
        collectedAt: now,
        symbol,
        technical: { score: techSignal.score, confidence: techSignal.confidence, strength: techSignal.strength },
        liquidity: { score: liqSignal.score, confidence: liqSignal.confidence, strength: liqSignal.strength },
        sentiment: { score: sentimentData.score, confidence: sentimentData.confidence, strength: sentimentData.strength },
        onchain: { score: onchainData.score, confidence: onchainData.confidence, strength: onchainData.strength },
        news: { score: newsData.score, confidence: newsData.confidence, strength: newsData.strength },
        fusedScore,
        regime,
        regimeConfidence,
        details: {
          rsi: techSignal.rsi,
          ema20: techSignal.ema20,
          macd: techSignal.macd,
          tickerPrice: ticker?.price,
        },
      };

      await saveSignalSnapshot(snapshot);
      signalStored = true;
    }

    return res.status(200).json({
      success: true,
      collected: true,
      symbol,
      timestamp: observationTimestamp,
      collectedAt: now,
      candlesWritten1m,
      candlesWritten1h,
      indicatorStored,
      signalStored,
      latestPrice: ticker?.price ?? null,
    });
  } catch (err: any) {
    console.error('[Market Collect] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Market collection failed',
      timestamp: now,
    });
  }
}
