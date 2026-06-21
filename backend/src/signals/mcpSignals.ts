import { marketDataMcp } from '../services/marketDataMcp';
import { clamp } from '../types/helpers';

export interface McpSignalResult {
  score: number;
  confidence: number;
  details: Record<string, unknown>;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

/** Unwraps FRED-style entries that come back as {label, date, value, change} instead of a bare number. */
function unwrapValue(v: unknown, fallback = 0): number {
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return safeNum((v as Record<string, unknown>).value, fallback);
  }
  return safeNum(v, fallback);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'");
}

async function callMcp(name: string, args: Record<string, unknown>): Promise<any> {
  const result: any = await marketDataMcp.callTool(name, args);
  const text = result?.content?.[0]?.text;
  if (text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const POSITIVE_WORDS = [
  'surge', 'rally', 'bullish', 'soar', 'gain', 'breakout', 'record high', 'adoption', 'approval', 'upgrade', 'rebound',
];
const NEGATIVE_WORDS = [
  'crash', 'plunge', 'bearish', 'selloff', 'sell-off', 'hack', 'ban', 'lawsuit', 'collapse', 'fraud', 'downgrade', 'liquidation',
];

// ── SENTIMENT — Fear & Greed Index + Binance futures positioning ──────────
export async function computeMcpSentiment(symbol: string): Promise<McpSignalResult> {
  try {
    const [fgRaw, lsRaw, takerRaw] = await Promise.all([
      callMcp('sentiment_index', { action: 'current' }),
      callMcp('derivatives_sentiment', { action: 'long_short', symbol, period: '4h' }),
      callMcp('derivatives_sentiment', { action: 'taker_ratio', symbol, period: '4h' }),
    ]);

    const fgValue = safeNum(fgRaw?.value, 50);
    const lsEntry = Array.isArray(lsRaw) ? lsRaw[0] : lsRaw;
    const lsRatio = safeNum(lsEntry?.longShortRatio, 1);
    const takerEntry = Array.isArray(takerRaw) ? takerRaw[0] : takerRaw;
    const takerRatio = safeNum(takerEntry?.buySellRatio ?? takerEntry?.takerBuySellRatio ?? takerEntry?.ratio, 1);

    const fgScore = clamp((fgValue - 50) / 50, -1, 1);
    // Heavy long positioning treated as a crowded-trade caution signal (contrarian),
    // not as bullish confirmation — a documented, intentional interpretation choice.
    const lsScore = clamp((1 - lsRatio) * 0.6, -1, 1);
    const takerScore = clamp((takerRatio - 1) * 1.5, -1, 1);

    const score = clamp(fgScore * 0.5 + lsScore * 0.25 + takerScore * 0.25, -1, 1);

    return {
      score,
      confidence: 0.7,
      details: {
        fearGreedIndex: fgValue,
        fearGreedLabel: fgRaw?.classification ?? null,
        longShortRatio: lsRatio,
        takerBuySellRatio: takerRatio,
      },
    };
  } catch (err: any) {
    console.warn(`[MCP] sentiment failed: ${err.message}`);
    return { score: 0, confidence: 0.3, details: { error: 'mcp_unavailable' } };
  }
}

// ── MACRO — Treasury yield spread + BTC cross-asset correlation ──────────
export async function computeMcpMacro(): Promise<McpSignalResult> {
  try {
    const [ratesRaw, corrRaw] = await Promise.all([
      callMcp('rates_yields', { action: 'rates_snapshot' }),
      callMcp('cross_asset', { action: 'correlation', base: 'btc', targets: 'dxy,ndx' }),
    ]);

    // FIXED: each rate is {label, date, value, change} — unwrap .value, don't Number() the object
    const spread = unwrapValue(ratesRaw?.spread_10y2y, 0.1);
    const spreadScore = clamp(spread * 4, -1, 1);

    const correlations = corrRaw?.correlations ?? {};
    // FIXED: each correlation entry is {yahoo_symbol, full_period_corr, rolling_corr, ...}
    const ndxCorr = safeNum(correlations?.ndx?.rolling_corr ?? correlations?.ndx?.full_period_corr, 0);
    const dxyCorr = safeNum(correlations?.dxy?.rolling_corr ?? correlations?.dxy?.full_period_corr, 0);

    const crossAssetScore = clamp(ndxCorr * 0.5 - dxyCorr * 0.5, -1, 1);
    const score = clamp(spreadScore * 0.4 + crossAssetScore * 0.6, -1, 1);

    return {
      score,
      confidence: 0.65,
      details: { yieldSpread10y2y: spread, btcNdxCorrelation: ndxCorr, btcDxyCorrelation: dxyCorr },
    };
  } catch (err: any) {
    console.warn(`[MCP] macro failed: ${err.message}`);
    return { score: 0, confidence: 0.3, details: { error: 'mcp_unavailable' } };
  }
}

// ── ON-CHAIN — BTC network fee pressure + DeFi TVL (best real proxy available) ──
export async function computeMcpOnchain(): Promise<McpSignalResult> {
  try {
    const [feesRaw, tvlRaw] = await Promise.all([
      callMcp('network_status', { action: 'btc_fees' }),
      callMcp('defi_analytics', { action: 'tvl_rank', limit: 5 }),
    ]);

    const feeRate = safeNum(feesRaw?.fastestFee, 15);
    const feeScore = clamp((feeRate - 15) / 35, -1, 1);

    const topProtocols = Array.isArray(tvlRaw) ? tvlRaw.slice(0, 3) : tvlRaw?.protocols?.slice(0, 3) ?? [];

    return {
      score: feeScore,
      confidence: 0.5,
      details: { btcFastestFeeSatVb: feeRate, topDefiProtocols: topProtocols },
    };
  } catch (err: any) {
    console.warn(`[MCP] onchain failed: ${err.message}`);
    return { score: 0, confidence: 0.3, details: { error: 'mcp_unavailable' } };
  }
}

// ── NEWS — Real headlines, simple keyword sentiment scoring ──────────────
export async function computeMcpNews(): Promise<McpSignalResult> {
  try {
    const newsRaw = await callMcp('news_feed', { action: 'latest', feeds: 'all', keyword: 'bitcoin', limit: 10 });

    // FIXED: response is grouped by source — [{feed, items: [...]}] — flatten to real articles
    const feedGroups: any[] = Array.isArray(newsRaw) ? newsRaw : [];
    const articles: any[] = feedGroups.flatMap((g) => (Array.isArray(g?.items) ? g.items : []));

    let pos = 0;
    let neg = 0;
    for (const a of articles) {
      const title = decodeEntities(String(a?.title ?? '')).toLowerCase();
      if (POSITIVE_WORDS.some((w) => title.includes(w))) pos++;
      if (NEGATIVE_WORDS.some((w) => title.includes(w))) neg++;
    }

    const total = pos + neg;
    const score = total > 0 ? clamp((pos - neg) / Math.max(total, 1), -1, 1) : 0;
    const sampleHeadlines = articles.slice(0, 3).map((a) => decodeEntities(String(a?.title ?? '')));

    return {
      score,
      confidence: articles.length > 0 ? 0.55 : 0.3,
      details: { articlesScanned: articles.length, positiveHits: pos, negativeHits: neg, sampleHeadlines },
    };
  } catch (err: any) {
    console.warn(`[MCP] news failed: ${err.message}`);
    return { score: 0, confidence: 0.3, details: { error: 'mcp_unavailable' } };
  }
}
