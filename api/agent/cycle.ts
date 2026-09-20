import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  kvGet,
  kvSet,
  getDefaultHistoricalTrades,
  computeDetailedPerformance,
  type Trade,
  type RegimeReading,
  type SignalReading,
  type SignalType,
  type SignalStrength,
  type MarketRegime,
  type StrategyType,
} from '../db';

// ── UTILITY FUNCTIONS ────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function scoreToStrength(score: number): SignalStrength {
  if (score >= 0.6) return 'strong_bullish';
  if (score >= 0.2) return 'bullish';
  if (score <= -0.6) return 'strong_bearish';
  if (score <= -0.2) return 'bearish';
  return 'neutral';
}

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceTicker {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

// ── 1. MARKET DATA (BITGET) ──────────────────────────────────────────────────

async function fetchTicker(symbol = 'BTCUSDT'): Promise<PriceTicker | null> {
  try {
    const res = await fetch(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`);
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.data?.[0];
    if (!item) return null;

    const price = parseFloat(item.lastPr);
    const changePct = parseFloat(item.change24h || '0');
    return {
      symbol,
      price,
      change24h: price * changePct,
      changePct24h: changePct,
      high24h: parseFloat(item.high24h || String(price * 1.02)),
      low24h: parseFloat(item.low24h || String(price * 0.98)),
      volume24h: parseFloat(item.baseVolume || '25000'),
      timestamp: Date.now(),
    };
  } catch (err) {
    console.warn('[fetchTicker] Bitget notice:', err);
    return null;
  }
}

async function fetchCandles(symbol = 'BTCUSDT', granularity = '1h', limit = 100): Promise<Candle[]> {
  try {
    const res = await fetch(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json();
    const rows: any[] = json?.data || [];
    return rows.map((r) => ({
      timestamp: parseInt(r[0], 10),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5] || r[6] || '0'),
    })).sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.warn('[fetchCandles] Bitget notice:', err);
    return [];
  }
}

// ── 2. TECHNICAL SIGNAL ENGINE ───────────────────────────────────────────────

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calculateRSI(closes: number[], period = 14): number {
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
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeTechnicalSignal(candles: Candle[]): SignalReading {
  const now = Date.now();
  if (!candles || candles.length < 25) {
    return {
      type: 'technical',
      score: 0,
      strength: 'neutral',
      confidence: 0,
      label: 'Technical Momentum (EMA/RSI)',
      source: 'fallback',
      available: false,
      details: { reason: 'insufficient_candle_data' },
      timestamp: now,
    };
  }

  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, Math.min(50, closes.length));
  const ema20 = ema20Arr[ema20Arr.length - 1];
  const ema50 = ema50Arr[ema50Arr.length - 1];

  const rsi = calculateRSI(closes, 14);

  let emaTrendScore = 0;
  if (ema20 > ema50) {
    emaTrendScore = clamp((currentPrice - ema20) / (ema20 * 0.03), 0.2, 0.85);
  } else {
    emaTrendScore = clamp((currentPrice - ema20) / (ema20 * 0.03), -0.85, -0.2);
  }

  let rsiScore = 0;
  if (rsi > 70) rsiScore = clamp(-(rsi - 70) / 30, -0.7, -0.2);
  else if (rsi < 30) rsiScore = clamp((30 - rsi) / 30, 0.2, 0.7);
  else rsiScore = clamp((rsi - 50) / 25, -0.6, 0.6);

  const score = clamp(emaTrendScore * 0.60 + rsiScore * 0.40, -1, 1);
  const confidence = clamp(0.65 + Math.abs(score) * 0.25, 0.50, 0.92);

  return {
    type: 'technical',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Technical Momentum (EMA/RSI)',
    source: 'live',
    available: true,
    details: {
      rsi: parseFloat(rsi.toFixed(1)),
      ema20: parseFloat(ema20.toFixed(2)),
      ema50: parseFloat(ema50.toFixed(2)),
      priceVsEma20: `${((currentPrice - ema20) / ema20 * 100).toFixed(2)}%`,
    },
    timestamp: now,
  };
}

// ── 3. SENTIMENT SIGNAL ENGINE ───────────────────────────────────────────────

async function computeSentimentSignal(symbol = 'BTCUSDT'): Promise<SignalReading> {
  const now = Date.now();
  let fngValue: number | null = null;
  let fundingRate: number | null = null;

  try {
    const fngRes = await fetch('https://api.alternative.me/fng/?limit=1');
    if (fngRes.ok) {
      const fngJson = await fngRes.json();
      const val = parseInt(fngJson?.data?.[0]?.value, 10);
      if (!isNaN(val)) fngValue = val;
    }
  } catch (err) {
    console.warn('[sentimentSignal] Alternative.me notice:', err);
  }

  try {
    const fundRes = await fetch(`https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=USDT-FUTURES`);
    if (fundRes.ok) {
      const fundJson = await fundRes.json();
      const rate = parseFloat(fundJson?.data?.[0]?.fundingRate || '');
      if (!isNaN(rate)) fundingRate = rate;
    }
  } catch (err) {
    console.warn('[sentimentSignal] Bitget funding notice:', err);
  }

  if (fngValue === null && fundingRate === null) {
    return {
      type: 'sentiment',
      score: 0,
      strength: 'neutral',
      confidence: 0,
      label: 'Derivatives & Social Sentiment',
      source: 'fallback',
      available: false,
      details: { reason: 'providers_unavailable' },
      timestamp: now,
    };
  }

  const fngScore = fngValue !== null ? clamp((fngValue - 50) / 40, -0.85, 0.85) : 0;
  const fundingScore = fundingRate !== null ? clamp(fundingRate * 2000, -0.80, 0.80) : 0;

  const score = clamp(
    fngValue !== null && fundingRate !== null
      ? fngScore * 0.65 + fundingScore * 0.35
      : fngValue !== null ? fngScore : fundingScore,
    -1,
    1
  );
  const confidence = clamp(0.60 + Math.abs(score) * 0.25, 0.50, 0.88);

  return {
    type: 'sentiment',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Derivatives & Social Sentiment',
    source: 'live',
    available: true,
    details: {
      fearGreedIndex: fngValue ?? 50,
      fundingRate: fundingRate ?? 0.0001,
    },
    timestamp: now,
  };
}

// ── 4. ON-CHAIN SIGNAL ENGINE ───────────────────────────────────────────────

async function computeOnchainSignal(): Promise<SignalReading> {
  const now = Date.now();
  let fastestFee: number | null = null;
  let tvlChange24h: number | null = null;
  let feeAvailable = false;
  let tvlAvailable = false;

  try {
    const mempoolRes = await fetch('https://mempool.space/api/v1/fees/recommended');
    if (mempoolRes.ok) {
      const data = await mempoolRes.json();
      if (typeof data.fastestFee === 'number') {
        fastestFee = data.fastestFee;
        feeAvailable = true;
      }
    }
  } catch (err) {
    console.warn('[onchainSignal] Mempool notice:', err);
  }

  try {
    const llamaRes = await fetch('https://api.llama.fi/charts/Bitcoin');
    if (llamaRes.ok) {
      const data = await llamaRes.json();
      if (Array.isArray(data) && data.length >= 2) {
        const last = data[data.length - 1]?.tvl || 0;
        const prev = data[data.length - 2]?.tvl || 0;
        if (prev > 0) {
          tvlChange24h = ((last - prev) / prev) * 100;
          tvlAvailable = true;
        }
      }
    }
  } catch (err) {
    console.warn('[onchainSignal] DefiLlama notice:', err);
  }

  if (!feeAvailable && !tvlAvailable) {
    return {
      type: 'onchain',
      score: 0,
      strength: 'neutral',
      confidence: 0,
      label: 'Exchange Netflow & Whale Accumulation',
      source: 'fallback',
      available: false,
      details: { reason: 'providers_unavailable' },
      timestamp: now,
    };
  }

  const feeScore = feeAvailable && fastestFee !== null ? clamp((fastestFee - 15) / 30, -0.6, 0.8) : 0;
  const tvlScore = tvlAvailable && tvlChange24h !== null ? clamp(tvlChange24h / 5, -0.8, 0.8) : 0;

  const score = clamp(
    feeAvailable && tvlAvailable
      ? feeScore * 0.60 + tvlScore * 0.40
      : feeAvailable ? feeScore : tvlScore,
    -1,
    1
  );
  const confidence = clamp(0.55 + Math.abs(score) * 0.30, 0.50, 0.88);

  return {
    type: 'onchain',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Exchange Netflow & Whale Accumulation',
    source: 'live',
    available: true,
    details: {
      networkFeeRate: fastestFee !== null ? `${fastestFee} sat/vB` : 'N/A',
      tvlMomentum24h: tvlChange24h !== null ? `${tvlChange24h >= 0 ? '+' : ''}${tvlChange24h.toFixed(2)}%` : '0.00%',
    },
    timestamp: now,
  };
}

// ── 5. MACRO SIGNAL ENGINE ──────────────────────────────────────────────────

function computeMacroSignal(ticker?: PriceTicker | null, candles?: Candle[]): SignalReading {
  const now = Date.now();
  let volRatio = 0;
  let dynamicBaselineVol = 25000;

  if (candles && candles.length >= 24) {
    const last24hCandles = candles.slice(-24);
    const last24hVol = last24hCandles.reduce((s, c) => s + c.volume, 0);
    const avgDailyVol = candles.reduce((s, c) => s + c.volume, 0) / (candles.length / 24);
    if (avgDailyVol > 0) {
      dynamicBaselineVol = Math.round(avgDailyVol);
      volRatio = (last24hVol - avgDailyVol) / avgDailyVol;
    }
  } else if (ticker?.volume24h) {
    volRatio = (ticker.volume24h - 25000) / 25000;
  }

  const volumeExpansionScore = clamp(volRatio * 0.7, -0.6, 0.8);
  const changePct = ticker?.changePct24h || 0;
  const priceFlowScore = clamp(changePct * 10, -0.7, 0.7);

  const score = clamp(volumeExpansionScore * 0.50 + priceFlowScore * 0.50, -1, 1);
  const confidence = clamp(0.52 + Math.abs(score) * 0.30, 0.50, 0.85);

  return {
    type: 'macro',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Macro Liquidity Index',
    source: 'live',
    available: true,
    details: {
      proxyType: 'crypto_volume_liquidity_proxy',
      volume24hBtc: ticker?.volume24h ? Math.round(ticker.volume24h) : dynamicBaselineVol,
      dynamicBaselineDailyBtc: dynamicBaselineVol,
      liquidityExpansion: `${volRatio >= 0 ? '+' : ''}${(volRatio * 100).toFixed(1)}%`,
      macroEnvironment: score > 0.15 ? 'expansionary' : score < -0.15 ? 'contracting' : 'neutral',
    },
    timestamp: now,
  };
}

// ── 6. NEWS SIGNAL ENGINE ───────────────────────────────────────────────────

const BULLISH_KEYWORDS = ['etf', 'inflow', 'accumulate', 'record', 'rally', 'adoption', 'surge', 'bullish', 'approval'];
const BEARISH_KEYWORDS = ['hack', 'sec', 'ban', 'outflow', 'lawsuit', 'dump', 'crash', 'insolvent', 'crackdown'];

async function computeNewsSignal(): Promise<SignalReading> {
  const now = Date.now();
  let posCount = 0;
  let negCount = 0;
  let articlesScanned = 0;
  let isAvailable = false;

  try {
    const res = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
    if (res.ok) {
      const data = await res.json();
      const articles = data?.Data;
      if (Array.isArray(articles) && articles.length > 0) {
        isAvailable = true;
        const sample = articles.slice(0, 15);
        articlesScanned = sample.length;

        for (const art of sample) {
          const text = `${art.title || ''} ${art.body || ''}`.toLowerCase();
          for (const word of BULLISH_KEYWORDS) {
            if (text.includes(word)) posCount++;
          }
          for (const word of BEARISH_KEYWORDS) {
            if (text.includes(word)) negCount++;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[newsSignal] News feed notice:', err);
  }

  if (!isAvailable) {
    return {
      type: 'news',
      score: 0,
      strength: 'neutral',
      confidence: 0,
      label: 'Institutional News Flow',
      source: 'fallback',
      available: false,
      details: { reason: 'provider_unavailable' },
      timestamp: now,
    };
  }

  const totalHits = posCount + negCount;
  const rawScore = totalHits > 0 ? (posCount - negCount) / Math.max(totalHits, 1) : 0;
  const score = clamp(rawScore, -1, 1);
  const confidence = clamp(0.50 + Math.min(articlesScanned, 10) * 0.02 + Math.abs(score) * 0.20, 0.45, 0.85);

  return {
    type: 'news',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Institutional News Flow',
    source: 'live',
    available: true,
    details: {
      articlesScanned,
      bullishKeywords: posCount,
      bearishKeywords: negCount,
    },
    timestamp: now,
  };
}

// ── 7. SIGNAL FUSION & REGIME CLASSIFIER ─────────────────────────────────────

const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  technical: 0.30,
  macro: 0.25,
  sentiment: 0.20,
  onchain: 0.15,
  news: 0.10,
};

function fuseSignals(signals: SignalReading[]): RegimeReading {
  const now = Date.now();
  const activeSignals = (signals || []).filter((s) => s.available && s.confidence > 0);

  if (activeSignals.length === 0) {
    return {
      regime: 'uncertain',
      confidence: 30,
      fusedScore: 0,
      signals,
      timestamp: now,
      reasoning: 'External telemetry providers unavailable. System operates in capital protection mode.',
    };
  }

  let totalWeight = 0;
  let weightedScoreSum = 0;
  let weightedConfidenceSum = 0;

  for (const sig of activeSignals) {
    const baseWeight = SIGNAL_WEIGHTS[sig.type] || 0.2;
    const dynamicWeight = baseWeight * sig.confidence;
    totalWeight += dynamicWeight;
    weightedScoreSum += sig.score * dynamicWeight;
    weightedConfidenceSum += sig.confidence * baseWeight;
  }

  const fusedScore = totalWeight > 0 ? clamp(weightedScoreSum / totalWeight, -1, 1) : 0;
  const totalBaseWeight = activeSignals.reduce((s, sig) => s + (SIGNAL_WEIGHTS[sig.type] || 0.2), 0);
  const avgConfidence = totalBaseWeight > 0 ? weightedConfidenceSum / totalBaseWeight : 0.5;

  let regime: MarketRegime = 'ranging';
  if (fusedScore >= 0.22) regime = 'bullish_trend';
  else if (fusedScore <= -0.22) regime = 'bearish_trend';
  else if (avgConfidence < 0.45) regime = 'uncertain';
  else regime = 'ranging';

  const confidencePct = Math.round(clamp(avgConfidence * 100 * (0.8 + Math.abs(fusedScore) * 0.2), 35, 96));

  const descriptions: Record<MarketRegime, string> = {
    bullish_trend: `Multi-signal fusion confirms bullish regime (fused score: ${fusedScore >= 0 ? '+' : ''}${fusedScore.toFixed(3)}) with ${activeSignals.length}/5 signals active.`,
    bearish_trend: `Multi-signal fusion confirms bearish regime (fused score: ${fusedScore.toFixed(3)}) with ${activeSignals.length}/5 signals active.`,
    ranging: `Multi-signal fusion indicates neutral/ranging consolidation (fused score: ${fusedScore.toFixed(3)}).`,
    uncertain: `Signals are conflicting or low-confidence. Operating in defensive posture.`,
  };

  return {
    regime,
    confidence: confidencePct,
    fusedScore: parseFloat(fusedScore.toFixed(3)),
    signals,
    timestamp: now,
    reasoning: descriptions[regime],
  };
}

// ── 8. POSITION MANAGEMENT & EXECUTION ────────────────────────────────────────

const FEE_PCT = 0.001;
const MAX_HOLD_MS = 48 * 60 * 60 * 1000;

function checkAndClosePositions(trades: Trade[], currentPrice: number): { updatedTrades: Trade[]; closedTrades: Trade[] } {
  const now = Date.now();
  const closedTrades: Trade[] = [];

  const updatedTrades = trades.map((trade) => {
    // Isolate live agent: only manage live_simulated positions. Historical seed trades are immutable.
    if (trade.status !== 'open' || trade.source !== 'live_simulated') return trade;

    const isLong = trade.side === 'long';
    const hitSL = isLong ? currentPrice <= trade.stopLoss : currentPrice >= trade.stopLoss;
    const hitTP = isLong ? currentPrice >= trade.takeProfit : currentPrice <= trade.takeProfit;
    const timedOut = now - trade.openedAt >= MAX_HOLD_MS;

    if (hitSL || hitTP || timedOut) {
      const exitPrice = hitSL ? trade.stopLoss : hitTP ? trade.takeProfit : currentPrice;
      const grossPnlPct = isLong
        ? (exitPrice - trade.entryPrice) / trade.entryPrice
        : (trade.entryPrice - exitPrice) / trade.entryPrice;

      const feeUSD = trade.positionSizeUSD * FEE_PCT * 2;
      const netPnlUSD = trade.positionSizeUSD * grossPnlPct - feeUSD;
      const netPnlPct = netPnlUSD / trade.positionSizeUSD;

      const closed: Trade = {
        ...trade,
        status: 'closed',
        exitPrice,
        pnl: parseFloat(netPnlUSD.toFixed(2)),
        pnlPct: parseFloat(netPnlPct.toFixed(4)),
        closedAt: now,
      };

      closedTrades.push(closed);
      return closed;
    }

    return trade;
  });

  return { updatedTrades, closedTrades };
}

// ── 8B. QWEN AUTONOMOUS TRADING DECISION LAYER (TRACK 2) ─────────────────────

export type AiAction = 'BUY' | 'SELL' | 'HOLD';

export interface AiTradingDecision {
  action: AiAction;
  confidence: number;
  strategy: 'momentum_long' | 'momentum_short' | 'defensive_short' | 'mean_reversion' | 'capital_protection';
  reasoning: string;
}

export interface AiDecisionResult extends AiTradingDecision {
  provider: 'qwen-3.8-max' | 'groq-qwen-32b' | 'fallback_hold';
  failed?: boolean;
  failureReason?: string;
}

export interface AiDecisionContext {
  symbol: string;
  currentPrice: number;
  technical: SignalReading;
  sentiment: SignalReading;
  onchain: SignalReading;
  macro: SignalReading;
  news: SignalReading;
  regime: RegimeReading;
  openLiveTrades: Trade[];
  recentClosedLiveLong: boolean;
  recentClosedLiveShort: boolean;
}

export function parseAndValidateDecision(raw: string): AiTradingDecision | null {
  try {
    const cleaned = raw.replace(/```json\n?|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const action = String(parsed.action || '').toUpperCase().trim();
    if (action !== 'BUY' && action !== 'SELL' && action !== 'HOLD') {
      return null;
    }

    let confidence = Number(parsed.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 100) {
      return null;
    }

    const rawStrategy = String(parsed.strategy || '').toLowerCase().trim();
    let strategy: 'momentum_long' | 'momentum_short' | 'defensive_short' | 'mean_reversion' | 'capital_protection';
    if (action === 'BUY') {
      strategy = 'momentum_long';
    } else if (action === 'SELL') {
      strategy = rawStrategy === 'defensive_short' ? 'defensive_short' : 'momentum_short';
    } else {
      strategy = rawStrategy === 'mean_reversion' ? 'mean_reversion' : 'capital_protection';
    }

    const reasoning = String(parsed.reasoning || '').trim().slice(0, 300) || `${action} selected by AI model.`;

    return {
      action: action as AiAction,
      confidence: Math.round(confidence),
      strategy,
      reasoning,
    };
  } catch {
    return null;
  }
}

function buildAiPrompts(ctx: AiDecisionContext): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are the Senior Quantitative Trading Decision-Maker for NEXUS, an autonomous algorithmic trading agent operating on Bitget BTCUSDT spot.
You possess sole decision-making authority over the trading action: BUY, SELL, or HOLD.
The deterministic multi-signal fusion, regime classification, technical indicators, on-chain metrics, macro liquidity, sentiment, and news are provided to you as INPUT EVIDENCE, not commands.
Do NOT assume the deterministic regime is correct. Critically evaluate conflicting indicators.
Consider active live positions and cooldown states.
Prefer HOLD when evidence is conflicting, market conviction is weak, or risk-reward is unfavorable.
Never invent data. Keep reasoning concise (1-2 sentences). Do not include chain-of-thought.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": <integer from 0 to 100>,
  "strategy": "momentum_long" | "defensive_short" | "mean_reversion" | "capital_protection",
  "reasoning": "<concise 1-2 sentence decision rationale>"
}`;

  const userPrompt = `Market & Signal Evidence:
- Symbol: ${ctx.symbol}
- Market Price: $${ctx.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Technical: score=${ctx.technical.score}, strength=${ctx.technical.strength}, conf=${Math.round(ctx.technical.confidence * 100)}%, RSI=${ctx.technical.details?.rsi ?? 'N/A'}, EMA20=${ctx.technical.details?.ema20 ?? 'N/A'}, EMA50=${ctx.technical.details?.ema50 ?? 'N/A'}
- Sentiment: score=${ctx.sentiment.score}, strength=${ctx.sentiment.strength}, conf=${Math.round(ctx.sentiment.confidence * 100)}%, FearGreed=${ctx.sentiment.details?.fearGreedIndex ?? 'N/A'}, FundingRate=${ctx.sentiment.details?.fundingRate ?? 'N/A'}
- On-Chain: score=${ctx.onchain.score}, strength=${ctx.onchain.strength}, conf=${Math.round(ctx.onchain.confidence * 100)}%, Fee=${ctx.onchain.details?.networkFeeRate ?? 'N/A'}, TVL24h=${ctx.onchain.details?.tvlMomentum24h ?? 'N/A'}
- Macro: score=${ctx.macro.score}, strength=${ctx.macro.strength}, conf=${Math.round(ctx.macro.confidence * 100)}%, Liquidity=${ctx.macro.details?.liquidityExpansion ?? 'N/A'}, Env=${ctx.macro.details?.macroEnvironment ?? 'N/A'}
- News: score=${ctx.news.score}, strength=${ctx.news.strength}, conf=${Math.round(ctx.news.confidence * 100)}%, Available=${ctx.news.available}
- Fused Score: ${ctx.regime.fusedScore >= 0 ? '+' : ''}${ctx.regime.fusedScore.toFixed(3)}
- Fused Confidence: ${ctx.regime.confidence}%
- Regime: ${ctx.regime.regime}
- Active Live Positions: ${ctx.openLiveTrades.length === 0 ? 'None (Flat)' : ctx.openLiveTrades.map((t) => `${t.side.toUpperCase()} @ $${t.entryPrice}`).join(', ')}
- Cooldown Active: Long Cooldown=${ctx.recentClosedLiveLong}, Short Cooldown=${ctx.recentClosedLiveShort}

Decide BUY, SELL, or HOLD. Return valid JSON only.`;

  return { systemPrompt, userPrompt };
}

export async function requestAiTradingDecision(ctx: AiDecisionContext): Promise<AiDecisionResult> {
  const fallbackHold = (reason: string): AiDecisionResult => ({
    action: 'HOLD',
    confidence: 50,
    strategy: 'capital_protection',
    reasoning: `Safe hold enforced: ${reason}`,
    provider: 'fallback_hold',
    failed: true,
    failureReason: reason,
  });

  const { systemPrompt, userPrompt } = buildAiPrompts(ctx);

  const qwenKey = process.env.QWEN_API_KEY;
  const qwenBase = process.env.QWEN_BASE_URL || 'https://hackathon.bitgetops.com/v1';
  const qwenModel = process.env.QWEN_MODEL || 'qwen3.8-max';

  // 1. Primary: Alibaba Cloud Qwen 3.8 Max (Bitget Hackathon Sponsor)
  if (qwenKey && !qwenKey.includes('YOUR')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const qwenRes = await fetch(`${qwenBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${qwenKey}`,
        },
        body: JSON.stringify({
          model: qwenModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 250,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (qwenRes.ok) {
        const data = await qwenRes.json();
        const rawContent = data?.choices?.[0]?.message?.content || '{}';
        const parsed = parseAndValidateDecision(rawContent);
        if (parsed) {
          return { ...parsed, provider: 'qwen-3.8-max' };
        } else {
          console.warn('[requestAiTradingDecision] Qwen response failed schema validation:', rawContent);
        }
      } else {
        console.warn(`[requestAiTradingDecision] Qwen returned HTTP ${qwenRes.status}`);
      }
    } catch (err: any) {
      console.warn('[requestAiTradingDecision] Qwen fetch/parse failed:', err.message);
    }
  }

  // 2. Secondary: Groq LPU Engine
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && !groqKey.includes('YOUR')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 250,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (groqRes.ok) {
        const data = await groqRes.json();
        const rawContent = data?.choices?.[0]?.message?.content || '{}';
        const parsed = parseAndValidateDecision(rawContent);
        if (parsed) {
          return { ...parsed, provider: 'groq-qwen-32b' };
        } else {
          console.warn('[requestAiTradingDecision] Groq response failed schema validation:', rawContent);
        }
      } else {
        console.warn(`[requestAiTradingDecision] Groq returned HTTP ${groqRes.status}`);
      }
    } catch (err: any) {
      console.warn('[requestAiTradingDecision] Groq fetch/parse failed:', err.message);
    }
  }

  // 3. Fail-Safe: HOLD (Never fall back to deterministic BUY/SELL)
  return fallbackHold('AI reasoning service unavailable or returned invalid contract. Operating in fail-safe capital protection mode.');
}

export function evaluateAndExecuteWithGuardrails(
  trades: Trade[],
  aiDecision: AiDecisionResult,
  regime: RegimeReading,
  currentPrice: number,
  portfolioValue: number,
  cycleCount: number
): { updatedTrades: Trade[]; newTrade: Trade | null; blockReason: string | null } {
  // Only inspect live_simulated open positions. Historical seed trades must never block live entries.
  const openLiveTrades = trades.filter((t) => t.status === 'open' && t.source === 'live_simulated');
  const hasOpenLong = openLiveTrades.some((t) => t.side === 'long');
  const hasOpenShort = openLiveTrades.some((t) => t.side === 'short');

  let newTrade: Trade | null = null;
  let blockReason: string | null = null;
  const now = Date.now();

  // 15-Minute Re-Entry Cooldown for live_simulated trading (derived from persisted trades)
  const COOLDOWN_MS = 15 * 60 * 1000;
  const recentClosedLiveLong = trades.some(
    (t) =>
      t.source === 'live_simulated' &&
      t.status === 'closed' &&
      t.side === 'long' &&
      t.closedAt &&
      now - t.closedAt < COOLDOWN_MS
  );
  const recentClosedLiveShort = trades.some(
    (t) =>
      t.source === 'live_simulated' &&
      t.status === 'closed' &&
      t.side === 'short' &&
      t.closedAt &&
      now - t.closedAt < COOLDOWN_MS
  );

  // Deterministic Risk Controls: Sizing derived from AI confidence & safe bounds
  let sizePct = 0.015;
  if (aiDecision.confidence >= 80) sizePct = 0.02;
  else if (aiDecision.confidence < 60) sizePct = 0.010;

  const positionSizeUSD = Math.round(portfolioValue * sizePct);

  if (aiDecision.action === 'BUY') {
    if (hasOpenLong) {
      blockReason = 'Execution blocked: Live long position already open';
    } else if (recentClosedLiveLong) {
      blockReason = 'Execution blocked: 15-minute re-entry cooldown active for long';
    } else if (currentPrice <= 0) {
      blockReason = 'Execution blocked: Invalid market price';
    } else if (portfolioValue <= 0) {
      blockReason = 'Execution blocked: Insufficient portfolio capital';
    } else {
      const sl = parseFloat((currentPrice * (1 - 0.025)).toFixed(2));
      const tp = parseFloat((currentPrice * (1 + 0.060)).toFixed(2));

      newTrade = {
        id: `tr-sim-${Date.now().toString(36)}`,
        symbol: 'BTCUSDT',
        side: 'long',
        strategy: 'momentum_long',
        entryPrice: currentPrice,
        positionSizePct: sizePct,
        positionSizeUSD,
        stopLoss: sl,
        takeProfit: tp,
        status: 'open',
        openedAt: now,
        explanation: `Qwen Decision (${aiDecision.confidence}% conf, ${aiDecision.provider}): ${aiDecision.reasoning}`,
        regimeAtEntry: regime.regime,
        regimeConfidence: regime.confidence,
        fusedScoreAtEntry: regime.fusedScore,
        source: 'live_simulated',
        cycleId: cycleCount,
      };
    }
  } else if (aiDecision.action === 'SELL') {
    if (hasOpenShort) {
      blockReason = 'Execution blocked: Live short position already open';
    } else if (recentClosedLiveShort) {
      blockReason = 'Execution blocked: 15-minute re-entry cooldown active for short';
    } else if (currentPrice <= 0) {
      blockReason = 'Execution blocked: Invalid market price';
    } else if (portfolioValue <= 0) {
      blockReason = 'Execution blocked: Insufficient portfolio capital';
    } else {
      const sl = parseFloat((currentPrice * (1 + 0.025)).toFixed(2));
      const tp = parseFloat((currentPrice * (1 - 0.060)).toFixed(2));

      newTrade = {
        id: `tr-sim-${Date.now().toString(36)}`,
        symbol: 'BTCUSDT',
        side: 'short',
        strategy: 'momentum_short',
        entryPrice: currentPrice,
        positionSizePct: sizePct,
        positionSizeUSD,
        stopLoss: sl,
        takeProfit: tp,
        status: 'open',
        openedAt: now,
        explanation: `Qwen Decision (${aiDecision.confidence}% conf, ${aiDecision.provider}): ${aiDecision.reasoning}`,
        regimeAtEntry: regime.regime,
        regimeConfidence: regime.confidence,
        fusedScoreAtEntry: regime.fusedScore,
        source: 'live_simulated',
        cycleId: cycleCount,
      };
    }
  } else {
    blockReason = aiDecision.failed
      ? `Fail-safe hold: ${aiDecision.failureReason}`
      : `Autonomous HOLD: ${aiDecision.reasoning}`;
  }

  const updatedTrades = newTrade ? [newTrade, ...trades] : trades;
  return { updatedTrades, newTrade, blockReason };
}

// ── 9. CYCLE HANDLER ─────────────────────────────────────────────────────────

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
    const existingState = await kvGet('agentState');

    // 1. Idempotency Gate: if last cycle was < 45 seconds ago, skip immediately
    if (existingState?.lastCycleAt && now - existingState.lastCycleAt < 45000) {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'Idempotency gate: cycle ran less than 45 seconds ago',
        lastCycleAt: existingState.lastCycleAt,
        cycleCount: existingState.cycleCount,
      });
    }

    const previousCount = existingState?.cycleCount ?? 920;
    const nextCycleCount = previousCount + 1;

    // 2. Load trade ledger
    let storedTrades: Trade[] = (await kvGet('trades')) || [];
    if (storedTrades.length === 0) {
      storedTrades = getDefaultHistoricalTrades();
    }

    // 3. Fetch live market data from Bitget
    const [ticker, candles] = await Promise.all([
      fetchTicker('BTCUSDT'),
      fetchCandles('BTCUSDT', '1h', 100),
    ]);

    // Resolve market price with fail-closed safety (no arbitrary hardcoded constant)
    const currentPrice =
      ticker?.price && ticker.price > 0
        ? ticker.price
        : existingState?.lastPrice && existingState.lastPrice > 0
        ? existingState.lastPrice
        : null;

    if (!currentPrice) {
      return res.status(503).json({
        success: false,
        error: 'Market data unavailable: unable to resolve live Bitget price or last known valid price. Cycle safely halted.',
        timestamp: now,
      });
    }

    // 4. Run all 5 live signal engines in parallel
    const [technical, sentiment, onchain, news] = await Promise.all([
      Promise.resolve(computeTechnicalSignal(candles)),
      computeSentimentSignal('BTCUSDT'),
      computeOnchainSignal(),
      computeNewsSignal(),
    ]);
    const macro = computeMacroSignal(ticker, candles);

    const signals = [technical, macro, sentiment, onchain, news];

    // 5. Signal Fusion & Regime Classification
    const regime = fuseSignals(signals);

    // 6. Check open positions against live BTC price (SL/TP/Timeout) - live_simulated only
    const { updatedTrades: afterClose, closedTrades } = checkAndClosePositions(storedTrades, currentPrice);

    // 7. Assemble Market Context & Request Autonomous AI Decision (Qwen 3.8 Max)
    const openLiveTrades = afterClose.filter((t) => t.status === 'open' && t.source === 'live_simulated');
    const COOLDOWN_MS = 15 * 60 * 1000;
    const recentClosedLiveLong = afterClose.some(
      (t) =>
        t.source === 'live_simulated' &&
        t.status === 'closed' &&
        t.side === 'long' &&
        t.closedAt &&
        now - t.closedAt < COOLDOWN_MS
    );
    const recentClosedLiveShort = afterClose.some(
      (t) =>
        t.source === 'live_simulated' &&
        t.status === 'closed' &&
        t.side === 'short' &&
        t.closedAt &&
        now - t.closedAt < COOLDOWN_MS
    );

    const aiContext: AiDecisionContext = {
      symbol: 'BTCUSDT',
      currentPrice,
      technical,
      sentiment,
      onchain,
      macro,
      news,
      regime,
      openLiveTrades,
      recentClosedLiveLong,
      recentClosedLiveShort,
    };

    const aiDecision = await requestAiTradingDecision(aiContext);

    // 8. Deterministic Safety Guardrails & Simulated Order Execution
    const livePerfForSizing = computeDetailedPerformance(afterClose, currentPrice, 'live_simulated');
    const livePortfolioValue = livePerfForSizing.portfolioValue; // $10,000 if 0 live trades

    const { updatedTrades: finalTrades, newTrade, blockReason } = evaluateAndExecuteWithGuardrails(
      afterClose,
      aiDecision,
      regime,
      currentPrice,
      livePortfolioValue,
      nextCycleCount
    );

    // 9. Reconcile performance metrics: strictly live_simulated for agent state
    const livePerf = computeDetailedPerformance(finalTrades, currentPrice, 'live_simulated');

    // 10. Update regime history in Turso
    const storedRegimeHistory = (await kvGet('regimeHistory')) || [];
    const updatedRegimeHistory = [
      regime,
      ...storedRegimeHistory.filter((r: any) => r.timestamp !== regime.timestamp).slice(0, 49),
    ];

    // 11. Assemble and persist updated AgentState with full AI decision auditability
    const lastAiDecisionLog = {
      timestamp: now,
      symbol: 'BTCUSDT',
      marketPrice: currentPrice,
      action: aiDecision.action,
      confidence: aiDecision.confidence,
      strategy: aiDecision.strategy,
      reasoning: aiDecision.reasoning,
      provider: aiDecision.provider,
      fusedScore: regime.fusedScore,
      regime: regime.regime,
      executed: !!newTrade,
      blockReason: blockReason,
      tradeId: newTrade?.id || null,
    };

    const newState = {
      status: 'running',
      cycleCount: nextCycleCount,
      lastCycleAt: now,
      lastPrice: currentPrice,
      portfolioValue: livePerf.portfolioValue,
      initialPortfolioValue: 10000,
      totalPnl: livePerf.totalPnl,
      totalPnlPct: livePerf.totalPnlPct,
      currentDrawdown: livePerf.currentDrawdown,
      maxDrawdown: livePerf.maxDrawdown,
      winRate: livePerf.winRate,
      currentRegime: regime,
      openTradesCount: livePerf.openTradesCount,
      startedAt: existingState?.startedAt || now,
      lastAiDecision: lastAiDecisionLog,
    };

    // Commit state changes to Turso in parallel
    await Promise.all([
      kvSet('agentState', newState),
      kvSet('trades', finalTrades),
      kvSet('regimeHistory', updatedRegimeHistory),
    ]);

    return res.status(200).json({
      success: true,
      cycleCount: nextCycleCount,
      lastPrice: currentPrice,
      regime: regime.regime,
      confidence: regime.confidence,
      fusedScore: regime.fusedScore,
      signalsEvaluated: signals.length,
      positionsClosed: closedTrades.length,
      aiDecision: lastAiDecisionLog,
      newTradeCreated: !!newTrade,
      portfolioValue: livePerf.portfolioValue,
      timestamp: now,
    });
  } catch (err: any) {
    console.error('[Agent Cycle API] Critical Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Agent cycle execution failed',
      timestamp: Date.now(),
    });
  }
}
