/**
 * NEXUS Anti-Fabrication & Truth Provenance Engine (Backend Service Colocation)
 *
 * Colocated within backend/src/ to satisfy backend/tsconfig.json rootDir "./src"
 * while maintaining 100% contract parity with api/provenance/antiFabrication.ts.
 */

export const REDACTION_TOKEN = '[unsourced figure removed]';

export interface TelemetryContext {
  symbol?: string;
  currentPrice?: number;
  technical?: {
    score?: number;
    rsi?: number;
    ema20?: number;
    ema50?: number;
    priceVsEma20?: number | string;
    macd?: number;
  };
  sentiment?: {
    score?: number;
    fundingRate?: number;
    fearGreedIndex?: number;
  };
  onchain?: {
    score?: number;
    networkFeeRate?: number;
    tvlMomentum24h?: number;
    tvlUsd?: number;
  };
  macro?: {
    score?: number;
    volume24hUsd?: number;
  };
  regime?: {
    fusedScore?: number;
    confidence?: number;
    regime?: string;
  };
  knownHeadlines?: string[];
  additionalNumbers?: number[];
}

export interface FigureRejection {
  raw: string;
  reason: string;
  category: 'price' | 'percentage' | 'indicator' | 'metric';
  span: [number, number];
}

export interface ValidationResult {
  sanitizedText: string;
  originalText: string;
  isClean: boolean;
  redactedCount: number;
  rejections: FigureRejection[];
  provenanceScore: number; // 0 to 100
}

interface FigureSpan {
  start: number;
  end: number;
  raw: string;
  category: 'price' | 'percentage' | 'indicator' | 'metric';
}

const STRUCTURAL_WHITELIST = new Set([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '24h',
  '7d',
  '30d',
  '3.8',
  '32b',
  '27b',
  '2.0',
  'v1',
  'v2',
  'v3',
  '1',
  '2',
  '3',
  '4',
  '5',
  '10',
]);

const RECOGNIZED_STRATEGY_PERCENTS = [1.5, 2.0, 2.5, 3.0, 5.0, 10.0, 15.0];

const PATTERNS: Array<{ regex: RegExp; category: 'price' | 'percentage' | 'indicator' | 'metric' }> = [
  { regex: /[$€£]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:bn|billion|mn|million|m|k|b|thousand|USDT|USDC|USD|BTC|ETH))?\b/gi, category: 'price' },
  { regex: /(?:^|[^\w])[-+]?\d[\d,]*(?:\.\d+)?\s?%/g, category: 'percentage' },
  { regex: /\b\d[\d,]*(?:\.\d+)?\s?(?:USDT|USDC|USD|BTC|ETH)\b/gi, category: 'price' },
  { regex: /[$€£]?\s?\d[\d,]*(?:\.\d+)?\s?(?:bn|billion|mn|million|m|k|b|thousand|bps|bp|basis points|sat\/vB|gwei)\b/gi, category: 'metric' },
  { regex: /\b\d+\.\d+\b/g, category: 'indicator' },
  { regex: /\b\d{1,3}(?:,\d{3})+\b/g, category: 'price' },
  { regex: /\b\d{4,6}\b/g, category: 'price' },
];

function extractNumericCore(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, '').replace(/\.$/, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function getScaleMultiplier(rawLower: string): number {
  if (/\b(?:bn|billion)\b|b$/i.test(rawLower.replace(/[$€£]/g, ''))) return 1_000_000_000;
  if (/\b(?:mn|million)\b|m$/i.test(rawLower.replace(/[$€£]/g, ''))) return 1_000_000;
  if (/\b(?:k|thousand)\b|k$/i.test(rawLower.replace(/[$€£]/g, ''))) return 1_000;
  return 1;
}

function findFigureSpans(text: string): FigureSpan[] {
  const candidates: FigureSpan[] = [];

  for (const { regex, category } of PATTERNS) {
    regex.lastIndex = 0;
    const matches = text.matchAll(regex);
    for (const match of matches) {
      if (match.index === undefined) continue;
      let raw = match[0];
      let start = match.index;

      if (category === 'percentage' && /^[^\w\-+]/.test(raw)) {
        raw = raw.slice(1);
        start += 1;
      }

      candidates.push({
        start,
        end: start + raw.length,
        raw,
        category,
      });
    }
  }

  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);

  const chosen: FigureSpan[] = [];
  for (const span of candidates) {
    const overlaps = chosen.some((c) => span.start < c.end && c.start < span.end);
    if (!overlaps) {
      chosen.push(span);
    }
  }

  chosen.sort((a, b) => a.start - b.start);

  return chosen;
}

function isFigureSupported(span: FigureSpan, ctx: TelemetryContext, text: string): boolean {
  const rawTrimmed = span.raw.trim().toLowerCase();

  const strippedWord = rawTrimmed.replace(/[$€£%,]/g, '');
  if (STRUCTURAL_WHITELIST.has(strippedWord) || STRUCTURAL_WHITELIST.has(rawTrimmed)) {
    return true;
  }

  const baseNum = extractNumericCore(span.raw);
  if (baseNum === null) return true;

  if (baseNum >= 2000 && baseNum <= 2035 && !span.raw.includes('$') && !span.raw.includes('€') && !span.raw.includes('£')) {
    return true;
  }

  const surrounding = text.slice(Math.max(0, span.start - 16), Math.min(text.length, span.end + 16)).toLowerCase();
  if (
    surrounding.includes('qwen') ||
    surrounding.includes('groq') ||
    surrounding.includes('gemini') ||
    surrounding.includes('alibaba') ||
    surrounding.includes('deepseek')
  ) {
    return true;
  }

  const postContext = text.slice(span.end, Math.min(text.length, span.end + 15)).toLowerCase();
  if (/^\s*(?:hours?|hrs?|h\b|mins?|minutes?|m\b|days?|d\b|weeks?|w\b|months?|secs?|seconds?|s\b|candles?|bars?|periods?)/i.test(postContext)) {
    return true;
  }

  const multiplier = getScaleMultiplier(rawTrimmed);
  const trueScaledNum = baseNum * multiplier;

  if (ctx.additionalNumbers && ctx.additionalNumbers.length > 0) {
    if (
      ctx.additionalNumbers.some((n) => {
        const absN = Math.abs(n);
        return (
          Math.abs(trueScaledNum - absN) <= 0.5 ||
          Math.abs(baseNum - absN) <= 0.5 ||
          Math.abs(trueScaledNum - absN) / Math.max(absN, 1) <= 0.02
        );
      })
    ) {
      return true;
    }
  }

  if (ctx.knownHeadlines && ctx.knownHeadlines.length > 0) {
    const rawDigits = span.raw.replace(/[^\d]/g, '');
    if (rawDigits.length >= 2) {
      const headlineNumRegex = new RegExp(`\\b${rawDigits}\\b`);
      if (ctx.knownHeadlines.some((h) => headlineNumRegex.test(h))) {
        return true;
      }
    }
  }

  if (multiplier > 1) {
    const vol24h = ctx.macro?.volume24hUsd || 0;
    if (vol24h > 0 && Math.abs(trueScaledNum - vol24h) / vol24h <= 0.25) {
      return true;
    }
    const tvlUsd = ctx.onchain?.tvlUsd || 0;
    if (tvlUsd > 0 && Math.abs(trueScaledNum - tvlUsd) / tvlUsd <= 0.25) {
      return true;
    }
    return false;
  }

  if (rawTrimmed.includes('bps') || rawTrimmed.includes('bp') || rawTrimmed.includes('basis points')) {
    const bpsRate = baseNum * 0.0001;
    const fundingRate = ctx.sentiment?.fundingRate ?? null;
    if (fundingRate !== null && Math.abs(bpsRate - Math.abs(fundingRate)) <= 0.0002) {
      return true;
    }
    if (baseNum >= 1 && baseNum <= 5) {
      return true;
    }
    return false;
  }

  if (span.category === 'price' || span.raw.includes('$') || /USDT|USDC|USD/i.test(span.raw)) {
    const currentPrice = ctx.currentPrice || 0;
    if (currentPrice > 0) {
      const priceTolerance = currentPrice * 0.15;
      const isNearMarketPrice = Math.abs(trueScaledNum - currentPrice) <= priceTolerance;

      const ema20 = ctx.technical?.ema20 || 0;
      const isNearEma20 = ema20 > 0 && Math.abs(trueScaledNum - ema20) <= priceTolerance;

      const ema50 = ctx.technical?.ema50 || 0;
      const isNearEma50 = ema50 > 0 && Math.abs(trueScaledNum - ema50) <= priceTolerance;

      const isSmallDelta = multiplier === 1 && trueScaledNum <= currentPrice * 0.05 && (span.raw.includes('$') || /USDT|USD/i.test(span.raw));

      if (isNearMarketPrice || isNearEma20 || isNearEma50 || isSmallDelta) {
        return true;
      }
      return false;
    }
  }

  if (span.category === 'percentage' || span.raw.includes('%')) {
    if (RECOGNIZED_STRATEGY_PERCENTS.some((p) => Math.abs(baseNum - p) <= 0.2)) {
      return true;
    }

    const rsi = typeof ctx.technical?.rsi === 'number' ? ctx.technical.rsi : null;
    if (rsi !== null && Math.abs(baseNum - rsi) <= 1.5) {
      return true;
    }

    const conf = ctx.regime?.confidence || 0;
    if (conf > 0 && Math.abs(baseNum - conf) <= 2.0) {
      return true;
    }

    const funding = ctx.sentiment?.fundingRate ? Math.abs(ctx.sentiment.fundingRate * 100) : null;
    if (funding !== null && Math.abs(baseNum - funding) <= 0.05) {
      return true;
    }

    const pve = typeof ctx.technical?.priceVsEma20 === 'number' ? Math.abs(ctx.technical.priceVsEma20 * 100) : null;
    if (pve !== null && Math.abs(baseNum - pve) <= 0.5) {
      return true;
    }

    if (baseNum >= 0.1 && baseNum <= 3.5) {
      return true;
    }

    return false;
  }

  if (span.category === 'indicator') {
    const fused = ctx.regime?.fusedScore ?? null;
    if (fused !== null && Math.abs(baseNum - Math.abs(fused)) <= 0.05) {
      return true;
    }

    const techScore = ctx.technical?.score ?? null;
    if (techScore !== null && Math.abs(baseNum - Math.abs(techScore)) <= 0.05) {
      return true;
    }

    const rsi = ctx.technical?.rsi ?? null;
    if (rsi !== null && Math.abs(baseNum - rsi) <= 1.0) {
      return true;
    }

    if (baseNum >= 0.0 && baseNum <= 1.0) {
      return true;
    }
  }

  if (Number.isInteger(baseNum) && baseNum >= 1 && baseNum <= 7 && !span.raw.includes('$') && !span.raw.includes('%')) {
    return true;
  }

  return false;
}

export function validateAndRedactReasoning(text: string, ctx: TelemetryContext): ValidationResult {
  if (!text || typeof text !== 'string') {
    return {
      sanitizedText: text || '',
      originalText: text || '',
      isClean: true,
      redactedCount: 0,
      rejections: [],
      provenanceScore: 100,
    };
  }

  const spans = findFigureSpans(text);
  const rejections: FigureRejection[] = [];

  const doomedSpans = spans.filter((span) => {
    const supported = isFigureSupported(span, ctx, text);
    if (!supported) {
      rejections.push({
        raw: span.raw,
        category: span.category,
        reason: `Figure "${span.raw}" cannot be verified against current Bitget telemetry`,
        span: [span.start, span.end],
      });
      return true;
    }
    return false;
  });

  doomedSpans.sort((a, b) => b.start - a.start);

  let sanitized = text;
  for (const doomed of doomedSpans) {
    sanitized = sanitized.slice(0, doomed.start) + REDACTION_TOKEN + sanitized.slice(doomed.end);
  }

  const totalEvaluated = spans.length;
  const redactedCount = doomedSpans.length;
  const provenanceScore = totalEvaluated === 0 ? 100 : Math.round(((totalEvaluated - redactedCount) / totalEvaluated) * 100);

  return {
    sanitizedText: sanitized,
    originalText: text,
    isClean: redactedCount === 0,
    redactedCount,
    rejections,
    provenanceScore,
  };
}
