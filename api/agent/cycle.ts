import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  kvGet,
  kvSet,
  saveCandles,
  saveIndicatorSnapshot,
  saveSignalSnapshot,
  saveHistoricalAiDecision,
  saveRiskEvent,
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

export function calculateEMASeries(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macd: number; signal: number; histogram: number; series: Array<{ macd: number; signal: number; histogram: number }> } {
  if (closes.length < slowPeriod) {
    return { macd: 0, signal: 0, histogram: 0, series: [] };
  }

  const emaFast = calculateEMASeries(closes, fastPeriod);
  const emaSlow = calculateEMASeries(closes, slowPeriod);

  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdSeries.push(emaFast[i] - emaSlow[i]);
  }

  const signalSeries = calculateEMASeries(macdSeries, signalPeriod);

  const series: Array<{ macd: number; signal: number; histogram: number }> = [];
  for (let i = 0; i < closes.length; i++) {
    const m = macdSeries[i];
    const s = signalSeries[i];
    series.push({
      macd: parseFloat(m.toFixed(2)),
      signal: parseFloat(s.toFixed(2)),
      histogram: parseFloat((m - s).toFixed(2)),
    });
  }

  const latest = series[series.length - 1];
  return {
    macd: latest.macd,
    signal: latest.signal,
    histogram: latest.histogram,
    series,
  };
}

function computeTechnicalSignal(candles: Candle[]): SignalReading {
  const now = Date.now();
  if (!candles || candles.length < 25) {
    return {
      type: 'technical',
      score: 0,
      strength: 'neutral',
      confidence: 0,
      label: 'Technical Momentum (EMA/RSI/MACD)',
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
  const macdData = calculateMACD(closes, 12, 26, 9);

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

  // Genuine MACD momentum: positive when histogram is expanding above zero line
  let macdScore = 0;
  if (macdData.histogram > 0) {
    macdScore = clamp(macdData.histogram / (currentPrice * 0.001 || 1), 0.1, 0.85);
  } else {
    macdScore = clamp(macdData.histogram / (currentPrice * 0.001 || 1), -0.85, -0.1);
  }

  const score = clamp(emaTrendScore * 0.45 + rsiScore * 0.30 + macdScore * 0.25, -1, 1);
  const confidence = clamp(0.65 + Math.abs(score) * 0.25, 0.50, 0.95);

  return {
    type: 'technical',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Technical Momentum (EMA/RSI/MACD)',
    source: 'live',
    available: true,
    details: {
      rsi: parseFloat(rsi.toFixed(1)),
      ema20: parseFloat(ema20.toFixed(2)),
      ema50: parseFloat(ema50.toFixed(2)),
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram,
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
      label: 'Derivatives & Market Sentiment',
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
    label: 'Derivatives & Market Sentiment',
    source: 'live',
    available: true,
    details: {
      fundingRate: fundingRate ?? 0.0001,
      fearGreedIndex: fngValue ?? 50,
      evidenceScope: 'Bitget USDT-Futures funding rate + Alternative.me daily Fear & Greed index (No direct X/Twitter stream)',
    },
    timestamp: now,
  };
}

// ── 4. ON-CHAIN SIGNAL ENGINE ───────────────────────────────────────────────

async function computeOnchainSignal(): Promise<SignalReading> {
  const now = Date.now();
  let fastestFee: number | null = null;
  let tvlChange24h: number | null = null;
  let lastTvl = 0;
  let feeAvailable = false;
  let tvlAvailable = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const mempoolRes = await fetch('https://mempool.space/api/v1/fees/recommended', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (mempoolRes.ok) {
      const data = await mempoolRes.json();
      if (typeof data.fastestFee === 'number') {
        fastestFee = data.fastestFee;
        feeAvailable = true;
      }
    }
  } catch (err: any) {
    console.warn('[onchainSignal] Mempool notice:', err.message);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const llamaRes = await fetch('https://api.llama.fi/charts/Bitcoin', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (llamaRes.ok) {
      const data = await llamaRes.json();
      if (Array.isArray(data) && data.length >= 2) {
        lastTvl = Number(data[data.length - 1]?.totalLiquidityUSD ?? data[data.length - 1]?.tvl ?? 0);
        const prev = Number(data[data.length - 2]?.totalLiquidityUSD ?? data[data.length - 2]?.tvl ?? 0);
        if (prev > 0 && lastTvl > 0) {
          tvlChange24h = ((lastTvl - prev) / prev) * 100;
          tvlAvailable = true;
        }
      }
    }
  } catch (err: any) {
    console.warn('[onchainSignal] DefiLlama notice:', err.message);
  }

  if (!feeAvailable && !tvlAvailable) {
    return {
      type: 'onchain',
      score: 0,
      strength: 'neutral',
      confidence: 0,
      label: 'On-Chain Activity & Network Status',
      source: 'fallback',
      available: false,
      details: { reason: 'providers_unavailable' },
      timestamp: now,
    };
  }

  // Network Fee Interpretation:
  // Network congestion is contextual rather than directional; feeScore is 0 across all states.
  let feeStatus: 'low_congestion' | 'normal_congestion' | 'elevated_congestion' | 'extreme_congestion' = 'low_congestion';
  const feeScore = 0.0;
  if (feeAvailable && fastestFee !== null) {
    if (fastestFee < 8) {
      feeStatus = 'low_congestion';
    } else if (fastestFee <= 25) {
      feeStatus = 'normal_congestion';
    } else if (fastestFee <= 60) {
      feeStatus = 'elevated_congestion';
    } else {
      feeStatus = 'extreme_congestion';
    }
  }

  const tvlScore = tvlAvailable && tvlChange24h !== null ? clamp(tvlChange24h / 5, -0.6, 0.6) : 0;

  const score = clamp(
    feeAvailable && tvlAvailable
      ? feeScore * 0.35 + tvlScore * 0.65
      : tvlAvailable
      ? tvlScore
      : feeScore,
    -1,
    1
  );
  const confidence = clamp(
    0.50 + (tvlAvailable ? 0.18 : 0) + (feeAvailable ? 0.10 : 0) + Math.abs(score) * 0.15,
    0.45,
    0.88
  );

  return {
    type: 'onchain',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'On-Chain Activity & Network Status',
    source: 'live',
    available: true,
    details: {
      networkFeeRate: fastestFee !== null ? `${fastestFee} sat/vB` : 'N/A',
      networkCongestion: feeStatus,
      tvlMomentum24h: tvlChange24h !== null ? `${tvlChange24h >= 0 ? '+' : ''}${tvlChange24h.toFixed(2)}%` : 'N/A',
      tvlBtcUSD: lastTvl > 0 ? `$${(lastTvl / 1e9).toFixed(2)}B` : 'N/A',
      evidenceScope: 'Bitcoin mempool fee congestion + DefiLlama protocol TVL (No exchange netflow/whale tracking)',
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
    label: 'Market Volume & Liquidity',
    source: 'live',
    available: true,
    details: {
      proxyType: 'crypto_volume_liquidity_proxy',
      volume24hBtc: ticker?.volume24h ? Math.round(ticker.volume24h) : dynamicBaselineVol,
      dynamicBaselineDailyBtc: dynamicBaselineVol,
      liquidityExpansion: `${volRatio >= 0 ? '+' : ''}${(volRatio * 100).toFixed(1)}%`,
      macroEnvironment: score > 0.15 ? 'expansionary' : score < -0.15 ? 'contracting' : 'neutral',
      evidenceScope: 'Bitget 24h volume & 4-day hourly baseline turnover (Not tradfi macro)',
    },
    timestamp: now,
  };
}

// ── 6. NEWS SIGNAL ENGINE ───────────────────────────────────────────────────

interface NewsHeadlineItem {
  title: string;
  source: string;
  link?: string;
  timestamp?: number;
}

const POSITIVE_CATALYST_PATTERNS = [
  /\b(etf\s+inflows?|inflows?|institutional\s+buy(ing)?)\b/i,
  /\b(approv(ed|al|es)?|greenlights?|clears?)\b/i,
  /\b(institutional\s+adoption|partnerships?|strategic\s+partner)\b/i,
  /\b(reserve\s+asset|treasury\s+reserve)\b/i,
  /\b(record\s+high|all-time\s+high|\bath\b|breakout|bullish)\b/i,
  /\b(rate\s+cuts?|monetary\s+easing|liquidity\s+expansion)\b/i,
  /\b(mainnet\s+upgrade|network\s+upgrade)\b/i,
];

const NEGATIVE_CATALYST_PATTERNS = [
  /\b(hack(ed|s)?|exploit(ed|s)?|rugpull|stolen\s+funds|security\s+breach)\b/i,
  /\b(lawsuits?|sues|charges|indict(ed|ment)?|crackdown|subpoena(ed|s)?)\b/i,
  /\b(ban(ned|ning|s)?)\b/i,
  /\b(fine(d|s)?|penalt(y|ies))\b/i,
  /\b(insolvent|insolvency|bankruptcy|bankrupt)\b/i,
  /\b(fraud|scam(s|med)?|ponzi)\b/i,
  /\b(outflows?|liquidations?|market\s+crash|flash\s+crash)\b/i,
  /\b(dump(ed|ing|s)?)\b/i,
];

// Relevance Category A: Direct Crypto Context
const DIRECT_CRYPTO_PATTERNS = [
  /\b(bitcoin|btc|satoshi|crypto|cryptocurrency|cryptocurrencies|digital\s+assets?|web3|defi)\b/i,
  /\b(ethereum|eth|ether|solana|sol|stablecoins?|usdt|tether|usdc|circle)\b/i,
  /\b(binance|coinbase|bitget|kraken|bybit|okx|microstrategy)\b/i,
  /\b(sec\s+crypto|cftc|mica|clarity\s+act|crypto\s+bill|crypto\s+law|crypto\s+market)\b/i,
  /\b(crypto\s+hack|crypto\s+exploit|rugpull)\b/i,
];

// Relevance Category B: Macroeconomic context relevant to risk assets
const MACRO_RELEVANCE_PATTERNS = [
  /\b(federal\s+reserve|\bfed\b|\bfomc\b|rate\s+cuts?|rate\s+hikes?|interest\s+rates?|monetary\s+policy)\b/i,
];

// Relevance Category C: Financial instruments (require explicit crypto/asset context)
const FINANCIAL_INSTRUMENT_PATTERNS = [
  /\b(etfs?|spot\s+etf|futures|perps?|perpetuals?|derivatives)\b/i,
];
const CRYPTO_ASSET_CONTEXT_PATTERNS = [
  /\b(bitcoin|btc|crypto|cryptocurrency|cryptocurrencies|digital\s+assets?|ethereum|eth|solana|sol|altcoins?)\b/i,
];

function isHeadlineCryptoRelevant(title: string): boolean {
  if (DIRECT_CRYPTO_PATTERNS.some((rx) => rx.test(title))) return true;
  if (MACRO_RELEVANCE_PATTERNS.some((rx) => rx.test(title))) return true;
  const hasInstrument = FINANCIAL_INSTRUMENT_PATTERNS.some((rx) => rx.test(title));
  const hasCryptoContext = CRYPTO_ASSET_CONTEXT_PATTERNS.some((rx) => rx.test(title));
  if (hasInstrument && hasCryptoContext) return true;
  return false;
}

async function computeNewsSignal(): Promise<SignalReading> {
  const now = Date.now();
  const articles: NewsHeadlineItem[] = [];
  const sourcesUsed: string[] = [];

  // Source A: Bitget public announcements
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const bgRes = await fetch('https://api.bitget.com/api/v2/public/annoucements?language=en_US', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'NEXUS-Trading-Agent/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (bgRes.ok) {
      const json = await bgRes.json();
      const list = json?.data;
      if (Array.isArray(list) && list.length > 0) {
        sourcesUsed.push('Bitget Announcements');
        for (const item of list.slice(0, 10)) {
          const title = String(item.annTitle || '').trim();
          if (title) {
            articles.push({
              title,
              source: 'Bitget',
              link: item.annUrl || undefined,
              timestamp: parseInt(item.cTime, 10) || now,
            });
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[newsSignal] Bitget announcements notice:', err.message);
  }

  // Source B: Cointelegraph RSS (enrichment or fallback)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const ctRes = await fetch('https://cointelegraph.com/rss', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (ctRes.ok) {
      const xml = await ctRes.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match: RegExpExecArray | null;
      let count = 0;
      while ((match = itemRegex.exec(xml)) !== null && count < 15) {
        count++;
        const itemXml = match[1];
        const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
        const pubDateMatch = itemXml.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/);
        const title = titleMatch ? titleMatch[1].trim() : '';
        if (title) {
          articles.push({
            title,
            source: 'Cointelegraph',
            link: linkMatch ? linkMatch[1].trim() : undefined,
            timestamp: pubDateMatch ? Date.parse(pubDateMatch[1].trim()) || now : now,
          });
        }
      }
      if (count > 0) {
        sourcesUsed.push('Cointelegraph RSS');
      }
    }
  } catch (err: any) {
    console.warn('[newsSignal] Cointelegraph RSS notice:', err.message);
  }

  // Deduplicate articles by normalized title
  const seenTitles = new Set<string>();
  const uniqueArticles: NewsHeadlineItem[] = [];
  for (const art of articles) {
    const norm = art.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seenTitles.has(norm)) {
      seenTitles.add(norm);
      uniqueArticles.push(art);
    }
  }

  if (uniqueArticles.length === 0) {
    return {
      type: 'news',
      score: 0,
      strength: 'neutral',
      confidence: 0,
      label: 'Market News & Announcements',
      source: 'fallback',
      available: false,
      details: {
        reason: 'providers_unavailable',
        attemptedSources: ['Bitget Announcements', 'Cointelegraph RSS'],
      },
      timestamp: now,
    };
  }

  const MAX_NEWS_AGE_MS = 48 * 60 * 60 * 1000; // 48-hour freshness window

  // Filter for crypto relevance and freshness (< 48 hours)
  const relevantArticles: NewsHeadlineItem[] = [];
  let irrelevantCount = 0;
  let staleCount = 0;

  for (const art of uniqueArticles) {
    if (art.timestamp && (now - art.timestamp > MAX_NEWS_AGE_MS)) {
      staleCount++;
      continue;
    }
    const isRel = isHeadlineCryptoRelevant(art.title);
    if (!isRel) {
      irrelevantCount++;
      continue;
    }
    relevantArticles.push(art);
  }

  if (relevantArticles.length === 0) {
    return {
      type: 'news',
      score: 0,
      strength: 'neutral',
      confidence: 0.25,
      label: 'Market News & Announcements',
      source: 'live',
      available: true,
      details: {
        newsSource: sourcesUsed.join(' + ') || 'Live Aggregation',
        articlesScanned: uniqueArticles.length,
        relevantArticles: 0,
        bullishCatalysts: 0,
        bearishCatalysts: 0,
        neutralCount: 0,
        irrelevantCount,
        staleCount,
        freshnessWindow: '48h',
        topHeadlines: [],
      },
      timestamp: now,
    };
  }

  // Deterministic Keyword / Catalyst Scoring (with word boundaries)
  let pos = 0;
  let neg = 0;
  let neu = 0;

  for (const art of relevantArticles) {
    const isPos = POSITIVE_CATALYST_PATTERNS.some((rx) => rx.test(art.title));
    const isNeg = NEGATIVE_CATALYST_PATTERNS.some((rx) => rx.test(art.title));
    if (isPos && !isNeg) pos++;
    else if (isNeg && !isPos) neg++;
    else neu++;
  }

  const dirCount = pos + neg;
  let rawScore = 0;
  if (dirCount > 0) {
    rawScore = (pos - neg) / (dirCount + neu * 0.3);
  }
  const score = clamp(rawScore, -0.75, 0.75);

  let confidence = 0.25;
  if (dirCount === 0) {
    // Relevant items exist but all neutral: low-to-moderate confidence (25% - 35%)
    confidence = clamp(0.25 + Math.min(relevantArticles.length, 5) * 0.02, 0.25, 0.35);
  } else {
    // Directional catalysts detected: scale by catalyst count, agreement, and score magnitude
    const agreement = Math.abs(pos - neg) / dirCount;
    confidence = clamp(
      0.35 + Math.min(dirCount, 4) * 0.06 + agreement * 0.20 + Math.abs(score) * 0.10,
      0.30,
      0.85
    );
  }

  return {
    type: 'news',
    score: parseFloat(score.toFixed(3)),
    strength: scoreToStrength(score),
    confidence: parseFloat(confidence.toFixed(2)),
    label: 'Market News & Announcements',
    source: 'live',
    available: true,
    details: {
      newsSource: sourcesUsed.join(' + ') || 'Live Aggregation',
      articlesScanned: uniqueArticles.length,
      relevantArticles: relevantArticles.length,
      bullishCatalysts: pos,
      bearishCatalysts: neg,
      neutralCount: neu,
      irrelevantCount,
      staleCount,
      freshnessWindow: '48h',
      topHeadlines: relevantArticles.slice(0, 3).map((a) => a.title),
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
  // Canonical provider id format: 'qwen-3.8-max' | 'groq:qwen/qwen3.8-27b' | 'fallback_hold'
  provider: 'qwen-3.8-max' | 'groq:qwen/qwen3.8-27b' | 'fallback_hold';
  providerAttempted?: string;
  providerSuccess?: boolean;
  providerFailureReason?: string;
  latencyMs?: number;
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
The multi-signal intelligence layer provides you with factual market evidence categorized by provenance:
- Direct Live Evidence: Real-time Bitget spot price, 1h candle EMAs & RSI, live Bitget futures funding rate, live Bitcoin network fee, and active news headlines.
- Derived/Proxy Evidence: "Market Volume & Liquidity" is an exchange volume/turnover proxy (NOT traditional macroeconomic liquidity). "Derivatives & Market Sentiment" reflects funding rates & daily Fear/Greed (NOT direct X/Twitter streams). "On-Chain Activity & Network Status" reflects mempool fee congestion & DeFi TVL (NOT exchange netflow or whale tracking).
- Unavailable Data: Exchange netflow, whale wallet tracking, direct X/Twitter feeds, order book depth, and traditional macro data (Fed/CPI/DXY) are NOT available. Never interpret unavailable data as bullish or bearish.
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

  const topHeadlines = Array.isArray(ctx.news.details?.topHeadlines) && (ctx.news.details.topHeadlines as string[]).length > 0
    ? (ctx.news.details.topHeadlines as string[]).slice(0, 2).map((h) => `"${h}"`).join(' | ')
    : 'None';

  const userPrompt = `Market & Signal Evidence:
- Symbol: ${ctx.symbol}
- Market Price: $${ctx.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

1. Technical Momentum (Direct Live): score=${ctx.technical.score}, strength=${ctx.technical.strength}, conf=${Math.round(ctx.technical.confidence * 100)}%, RSI=${ctx.technical.details?.rsi ?? 'N/A'}, EMA20=${ctx.technical.details?.ema20 ?? 'N/A'}, EMA50=${ctx.technical.details?.ema50 ?? 'N/A'}, PriceVsEMA20=${ctx.technical.details?.priceVsEma20 ?? 'N/A'}
2. Market Volume & Liquidity (Crypto Volume Proxy): score=${ctx.macro.score}, strength=${ctx.macro.strength}, conf=${Math.round(ctx.macro.confidence * 100)}%, VolExpansion=${ctx.macro.details?.liquidityExpansion ?? 'N/A'}, VolEnvironment=${ctx.macro.details?.macroEnvironment ?? 'N/A'} (Note: Exchange volume turnover proxy, not tradfi macro)
3. Derivatives & Market Sentiment (Live Funding + Daily F&G): score=${ctx.sentiment.score}, strength=${ctx.sentiment.strength}, conf=${Math.round(ctx.sentiment.confidence * 100)}%, FundingRate=${ctx.sentiment.details?.fundingRate ?? 'N/A'}, FearGreed=${ctx.sentiment.details?.fearGreedIndex ?? 'N/A'} (Note: No direct social/X data)
4. On-Chain Activity & Network Status (Fee Congestion + DeFi TVL): score=${ctx.onchain.score}, strength=${ctx.onchain.strength}, conf=${Math.round(ctx.onchain.confidence * 100)}%, Fee=${ctx.onchain.details?.networkFeeRate ?? 'N/A'} (${ctx.onchain.details?.networkCongestion ?? 'calm'}), TVL24h=${ctx.onchain.details?.tvlMomentum24h ?? 'N/A'} (Note: No exchange netflow or whale tracking)
5. Market News & Announcements (Live Feed): score=${ctx.news.score}, strength=${ctx.news.strength}, conf=${Math.round(ctx.news.confidence * 100)}%, Available=${ctx.news.available}, Source=${ctx.news.details?.newsSource ?? 'none'}, Headlines=${topHeadlines}

Fused Evidence: FusedScore=${ctx.regime.fusedScore >= 0 ? '+' : ''}${ctx.regime.fusedScore.toFixed(3)}, FusedConfidence=${ctx.regime.confidence}%, Regime=${ctx.regime.regime}
Portfolio Context: ActivePositions=${ctx.openLiveTrades.length === 0 ? 'None (Flat)' : ctx.openLiveTrades.map((t) => `${t.side.toUpperCase()} @ $${t.entryPrice}`).join(', ')}, CooldownActive=${ctx.recentClosedLiveLong || ctx.recentClosedLiveShort ? 'YES' : 'NO'}

Decide BUY, SELL, or HOLD. Return valid JSON only.`;

  return { systemPrompt, userPrompt };
}

export async function requestAiTradingDecision(ctx: AiDecisionContext): Promise<AiDecisionResult> {
  const startTime = Date.now();
  let providerAttempted = 'qwen-3.8-max';
  let providerFailureReason: string | undefined;

  const fallbackHold = (reason: string): AiDecisionResult => ({
    action: 'HOLD',
    confidence: 50,
    strategy: 'capital_protection',
    reasoning: `Safe hold enforced: ${reason}`,
    provider: 'fallback_hold',
    providerAttempted,
    providerSuccess: false,
    providerFailureReason: reason,
    latencyMs: Date.now() - startTime,
    failed: true,
    failureReason: reason,
  });

  const { systemPrompt, userPrompt } = buildAiPrompts(ctx);

  const qwenKey = process.env.QWEN_API_KEY;
  const qwenBase = process.env.QWEN_BASE_URL || 'https://hackathon.bitgetops.com/v1';
  const qwenModel = process.env.QWEN_MODEL || 'qwen3.8-max';

  // 1. Primary: Alibaba Cloud Qwen 3.8 Max (Bitget Hackathon Sponsor)
  if (qwenKey && !qwenKey.includes('YOUR')) {
    const qwenStart = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8.0s safe serverless budget

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
          max_tokens: 180,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (qwenRes.ok) {
        const data = await qwenRes.json();
        const rawContent = data?.choices?.[0]?.message?.content || '{}';
        const parsed = parseAndValidateDecision(rawContent);
        if (parsed) {
          return {
            ...parsed,
            provider: 'qwen-3.8-max',
            providerAttempted: 'qwen-3.8-max',
            providerSuccess: true,
            latencyMs: Date.now() - qwenStart,
          };
        } else {
          providerFailureReason = 'Qwen response failed schema validation';
          console.warn('[requestAiTradingDecision] Qwen response failed schema validation:', rawContent);
        }
      } else {
        providerFailureReason = `Qwen HTTP ${qwenRes.status}`;
        console.warn(`[requestAiTradingDecision] Qwen returned HTTP ${qwenRes.status}`);
      }
    } catch (err: any) {
      providerFailureReason = err.name === 'AbortError' ? 'Qwen 8s timeout exceeded' : `Qwen error: ${err.message}`;
      console.warn('[requestAiTradingDecision] Qwen fetch/parse failed:', err.message);
    }
  } else {
    providerFailureReason = 'Qwen API key unconfigured';
  }

  // 2. Secondary: Groq LPU Engine (groq:qwen/qwen3.8-27b)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && !groqKey.includes('YOUR')) {
    providerAttempted = 'groq:qwen/qwen3.8-27b';
    const groqStart = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

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
          max_tokens: 180,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (groqRes.ok) {
        const data = await groqRes.json();
        const rawContent = data?.choices?.[0]?.message?.content || '{}';
        const parsed = parseAndValidateDecision(rawContent);
        if (parsed) {
          return {
            ...parsed,
            provider: 'groq:qwen/qwen3.8-27b',
            providerAttempted: 'groq:qwen/qwen3.8-27b',
            providerSuccess: true,
            latencyMs: Date.now() - groqStart,
          };
        } else {
          providerFailureReason = 'Groq response failed schema validation';
          console.warn('[requestAiTradingDecision] Groq response failed schema validation:', rawContent);
        }
      } else if (groqRes.status === 429) {
        providerFailureReason = 'Groq daily rate limit reached (HTTP 429)';
        console.warn('[requestAiTradingDecision] Groq daily token-per-day rate limit reached (HTTP 429)');
      } else {
        providerFailureReason = `Groq HTTP ${groqRes.status}`;
        console.warn(`[requestAiTradingDecision] Groq returned HTTP ${groqRes.status}`);
      }
    } catch (err: any) {
      providerFailureReason = err.name === 'AbortError' ? 'Groq 3.5s timeout exceeded' : `Groq error: ${err.message}`;
      console.warn('[requestAiTradingDecision] Groq fetch/parse failed:', err.message);
    }
  }

  // 3. Fail-Safe: HOLD (Never fall back to deterministic BUY/SELL)
  return fallbackHold(providerFailureReason || 'AI reasoning service unavailable or returned invalid contract. Operating in fail-safe capital protection mode.');
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

    // 3. Fetch live market data from Bitget (1m candles for precision + 1h candles for macro trend)
    const [ticker, candles1m, candles1h] = await Promise.all([
      fetchTicker('BTCUSDT'),
      fetchCandles('BTCUSDT', '1m', 100),
      fetchCandles('BTCUSDT', '1h', 100),
    ]);
    const candles = candles1m.length >= 25 ? candles1m : candles1h;

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
    const macro = computeMacroSignal(ticker, candles1h.length >= 20 ? candles1h : candles);

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
      providerAttempted: aiDecision.providerAttempted || aiDecision.provider,
      providerSuccess: aiDecision.providerSuccess ?? (aiDecision.provider !== 'fallback_hold'),
      providerFailureReason: aiDecision.providerFailureReason || null,
      latencyMs: aiDecision.latencyMs || null,
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

    // 12. Relational Historical Store Ingestion (Turso structured tables + kv_store fallback)
    const historicalTasks: Promise<any>[] = [
      kvSet('agentState', newState),
      kvSet('trades', finalTrades),
      kvSet('regimeHistory', updatedRegimeHistory),
    ];

    // Ingest 1m & 1h market candles into market_candles table
    if (candles1m && candles1m.length > 0) {
      historicalTasks.push(
        saveCandles(candles1m.map((c) => ({ symbol: 'BTCUSDT', timeframe: '1m', ...c })))
      );
    }
    if (candles1h && candles1h.length > 0) {
      historicalTasks.push(
        saveCandles(candles1h.map((c) => ({ symbol: 'BTCUSDT', timeframe: '1h', ...c })))
      );
    }

    // Ingest indicator snapshot
    const techDetails = technical.details || {};
    historicalTasks.push(
      saveIndicatorSnapshot({
        symbol: 'BTCUSDT',
        timeframe: '1m',
        timestamp: now,
        rsi: typeof techDetails.rsi === 'number' ? techDetails.rsi : 50,
        ema20: typeof techDetails.ema20 === 'number' ? techDetails.ema20 : currentPrice,
        ema50: typeof techDetails.ema50 === 'number' ? techDetails.ema50 : currentPrice,
        macd: typeof techDetails.macd === 'number' ? techDetails.macd : 0,
        macdSignal: typeof techDetails.macdSignal === 'number' ? techDetails.macdSignal : 0,
        macdHistogram: typeof techDetails.macdHistogram === 'number' ? techDetails.macdHistogram : 0,
        indicatorsJson: {
          priceVsEma20: techDetails.priceVsEma20,
        },
      })
    );

    // Ingest 5-engine signal snapshot
    historicalTasks.push(
      saveSignalSnapshot({
        timestamp: now,
        symbol: 'BTCUSDT',
        technical: { score: technical.score, confidence: technical.confidence, strength: technical.strength },
        liquidity: { score: macro.score, confidence: macro.confidence, strength: macro.strength },
        sentiment: { score: sentiment.score, confidence: sentiment.confidence, strength: sentiment.strength },
        onchain: { score: onchain.score, confidence: onchain.confidence, strength: onchain.strength },
        news: { score: news.score, confidence: news.confidence, strength: news.strength },
        fusedScore: regime.fusedScore,
        regime: regime.regime,
        regimeConfidence: regime.confidence,
        details: {
          rsi: techDetails.rsi,
          macd: techDetails.macd,
          fundingRate: sentiment.details?.fundingRate,
          volume24hUsd: macro.details?.volume24hUsd,
        },
      })
    );

    // Ingest historical AI decision (with full provider telemetry)
    // decisionType: 'model' = genuine model inference, 'failsafe_hold' = AI failure/fallback
    const decisionType: 'model' | 'failsafe_hold' = aiDecision.provider === 'fallback_hold' ? 'failsafe_hold' : 'model';
    historicalTasks.push(
      saveHistoricalAiDecision({
        id: `ai_${now}_${nextCycleCount}`,
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
        providerAttempted: aiDecision.providerAttempted || aiDecision.provider,
        providerSuccess: aiDecision.providerSuccess ?? (aiDecision.provider !== 'fallback_hold'),
        providerFailureReason: aiDecision.providerFailureReason || null,
        latencyMs: aiDecision.latencyMs || null,
        decisionType,
      })
    );

    // Persist risk_events when execution was blocked (AI decision not acted upon)
    if (blockReason && !aiDecision.failed) {
      // Genuine AI decision that was blocked by guardrails (e.g. duplicate position, cooldown)
      historicalTasks.push(
        saveRiskEvent({
          id: `risk_${now}_${nextCycleCount}`,
          timestamp: now,
          symbol: 'BTCUSDT',
          action: aiDecision.action,
          strategy: aiDecision.strategy,
          confidence: aiDecision.confidence,
          blockReason,
          executed: false,
          fusedScore: regime.fusedScore,
          regime: regime.regime,
          details: {
            provider: aiDecision.provider,
            reasoning: aiDecision.reasoning,
            cycleCount: nextCycleCount,
          },
        })
      );
    } else if (aiDecision.failed && aiDecision.action === 'HOLD') {
      // Fail-safe hold: AI inference failed entirely
      historicalTasks.push(
        saveRiskEvent({
          id: `risk_fshold_${now}_${nextCycleCount}`,
          timestamp: now,
          symbol: 'BTCUSDT',
          action: 'HOLD',
          strategy: 'capital_protection',
          confidence: aiDecision.confidence,
          blockReason: `Fail-safe hold: ${aiDecision.failureReason || aiDecision.providerFailureReason || 'AI provider unavailable'}`,
          executed: false,
          fusedScore: regime.fusedScore,
          regime: regime.regime,
          details: {
            providerAttempted: aiDecision.providerAttempted,
            providerFailureReason: aiDecision.providerFailureReason,
            cycleCount: nextCycleCount,
          },
        })
      );
    }

    await Promise.allSettled(historicalTasks);

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
