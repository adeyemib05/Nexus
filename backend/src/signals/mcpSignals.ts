import { marketDataMcp } from '../services/marketDataMcp';
import { clamp } from '../types/helpers';

export interface McpSignalResult {
  score: number;
  confidence: number;
  details: Record<string, unknown>;
}

const CACHE_TTL_MS = 4 * 60 * 1000;
const cache = new Map<string, { result: McpSignalResult; expiresAt: number }>();

async function withCache(key: string, compute: () => Promise<McpSignalResult>): Promise<McpSignalResult> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  const result = await compute();
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

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
  return withCache(`sentiment:${symbol}`, async () => {
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
      const lsScore = clamp((1 - lsRatio) * 0.6, -1, 1);
      const takerScore = clamp((takerRatio - 1) * 1.5, -1, 1);

      const score = clamp(fgScore * 0.5 + lsScore * 0.25 + takerScore * 0.25, -1, 1);

      return {
        score,
        confidence: 0.7,
        details: {
          fearGreedIndex: `${fgValue} (${fgRaw?.classification ?? 'N/A'})`,
          longShortRatio: lsRatio.toFixed(2),
          takerBuySellRatio: takerRatio.toFixed(2),
        },
      };
    } catch (err: any) {
      console.warn(`[MCP] sentiment failed: ${err.message}`);
      return { score: 0, confidence: 0.3, details: { error: 'mcp_unavailable' } };
    }
  });
}

// ── MACRO — Treasury yield spread + BTC cross-asset correlation ──────────
export async function computeMcpMacro(): Promise<McpSignalResult> {
  return withCache('macro', async () => {
    try {
      const [ratesRaw, corrRaw] = await Promise.all([
        callMcp('rates_yields', { action: 'rates_snapshot' }),
        callMcp('cross_asset', { action: 'correlation', base: 'btc', targets: 'dxy,ndx' }),
      ]);

      const spread = unwrapValue(ratesRaw?.spread_10y2y, 0.1);
      const spreadScore = clamp(spread * 4, -1, 1);

      const correlations = corrRaw?.correlations ?? {};
      const ndxCorr = safeNum(correlations?.ndx?.rolling_corr ?? correlations?.ndx?.full_period_corr, 0);
      const dxyCorr = safeNum(correlations?.dxy?.rolling_corr ?? correlations?.dxy?.full_period_corr, 0);

      const crossAssetScore = clamp(ndxCorr * 0.5 - dxyCorr * 0.5, -1, 1);
      const score = clamp(spreadScore * 0.4 + crossAssetScore * 0.6, -1, 1);

      return {
        score,
        confidence: 0.65,
        details: {
          yieldCurveSpread: `${(spread * 100).toFixed(2)}%`,
          btcVsNasdaqCorrelation: ndxCorr.toFixed(2),
          btcVsDollarCorrelation: dxyCorr.toFixed(2),
        },
      };
    } catch (err: any) {
      console.warn(`[MCP] macro failed: ${err.message}`);
      return { score: 0, confidence: 0.3, details: { error: 'mcp_unavailable' } };
    }
  });
}

// ── ON-CHAIN — BTC network fee pressure + DeFi TVL (best real proxy available) ──
export async function computeMcpOnchain(): Promise<McpSignalResult> {
  return withCache('onchain', async () => {
    try {
      const [feesRaw, tvlRaw] = await Promise.all([
        callMcp('network_status', { action: 'btc_fees' }),
        callMcp('defi_analytics', { action: 'tvl_rank', limit: 5 }),
      ]);

      const feeRate = safeNum(feesRaw?.fastestFee, 15);
      const feeScore = clamp((feeRate - 15) / 35, -1, 1);
      const onchainConfidence = clamp(0.4 + Math.abs(feeScore) * 0.25, 0.4, 0.65);
      const feeLevel = feeRate <= 3 ? 'Low' : feeRate <= 15 ? 'Moderate' : 'High';

      // Reduce the raw protocol objects (which include TVL breakdowns, logos,
      // chain data, etc.) down to just the names — that's all a reader needs.
      const protocolList: any[] = Array.isArray(tvlRaw) ? tvlRaw : tvlRaw?.protocols ?? [];
      const topNames = protocolList
        .slice(0, 3)
        .map((p) => p?.name)
        .filter(Boolean)
        .join(', ');

      return {
        score: feeScore,
        confidence: onchainConfidence,
        details: {
          networkFeePressure: `${feeLevel} (${feeRate} sat/vB)`,
          topDeFiProtocols: topNames || 'N/A',
        },
      };
    } catch (err: any) {
      console.warn(`[MCP] onchain failed: ${err.message}`);
      return { score: 0, confidence: 0.3, details: { error: 'mcp_unavailable' } };
    }
  });
}

// ── NEWS — Real headlines, simple keyword sentiment scoring ──────────────
export async function computeMcpNews(): Promise<McpSignalResult> {
  return withCache('news', async () => {
    try {
      const newsRaw = await callMcp('news_feed', { action: 'latest', feeds: 'all', keyword: 'bitcoin', limit: 10 });

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
      const sampleHeadline = articles.length > 0 ? decodeEntities(String(articles[0]?.title ?? '')) : 'No recent headlines';

      const newsConfidence =
        articles.length > 0
          ? clamp(0.4 + Math.abs(score) * 0.3 + Math.min(total, 5) * 0.02, 0.4, 0.7)
          : 0.3;

      return {
        score,
        confidence: newsConfidence,
        details: {
          articlesScanned: articles.length,
          latestHeadline: sampleHeadline,
        },
      };
    } catch (err: any) {
      console.warn(`[MCP] news failed: ${err.message}`);
      return { score: 0, confidence: 0.3, details: { error: 'mcp_unavailable' } };
    }
  });
}
