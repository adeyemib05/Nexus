/**
 * NEXUS Anti-Fabrication & Truth Provenance Engine
 *
 * Programmatically enforces zero-hallucination compliance across AI-generated
 * trading decisions, cascade stress narratives, and trade rationales.
 *
 * Verified against live Bitget telemetry:
 * - Validates prices, percentages, indicators, basis points, and scaled metrics.
 * - Detects bare multi-digit integers (e.g. 45000) and ticker suffixes (45000 USDT).
 * - Multiplies scale terms (k, m, b) to their true mathematical magnitudes.
 * - Eliminates partial-token leaks (e.g., "$120m" is redacted as a whole, not "[unsourced figure removed]m").
 * - Exempts structural domain tokens (years, timeframes, model sponsors, integer counts).
 * - Honors explicit telemetry contextual figures (positionUsd, stress test shockPct, headline citations).
 * - Redacts unverified or fabricated figures in-place as `[unsourced figure removed]`.
 * - Records structured rejection provenance for transparent auditability.
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

// ── Structural & Sponsor Whitelist ───────────────────────────────────────────
// These tokens represent structural metadata, model versions, timeframes, or standard
// grammar and must NEVER be flagged as fabricated market figures.
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

// Standard execution safety bounds recognized by NEXUS Risk Cage
const RECOGNIZED_STRATEGY_PERCENTS = [1.5, 2.0, 2.5, 3.0, 5.0, 10.0, 15.0];

// ── Core Regex Patterns ───────────────────────────────────────────────────────
// Patterns are carefully structured so that scale suffixes (m, bn, k) or ticker suffixes
// are captured as part of the figure token to prevent orphaned characters upon redaction.
const PATTERNS: Array<{ regex: RegExp; category: 'price' | 'percentage' | 'indicator' | 'metric' }> = [
  // 1. Currency prefixes with optional scale or ticker suffix ($67,420, $120m, €50,000, $1.5bn)
  { regex: /[$€£]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:bn|billion|mn|million|m|k|b|thousand|USDT|USDC|USD|BTC|ETH))?\b/gi, category: 'price' },
  // 2. Percentages (54.2%, 82 %, -12%)
  { regex: /(?:^|[^\w])[-+]?\d[\d,]*(?:\.\d+)?\s?%/g, category: 'percentage' },
  // 3. Ticker-suffixed prices (67,420 USDT, 45000 USD)
  { regex: /\b\d[\d,]*(?:\.\d+)?\s?(?:USDT|USDC|USD|BTC|ETH)\b/gi, category: 'price' },
  // 4. Metric scales & suffixes (120m, 1.5bn, 15 bps, 18 sat/vB, 15 gwei)
  { regex: /[$€£]?\s?\d[\d,]*(?:\.\d+)?\s?(?:bn|billion|mn|million|m|k|b|thousand|bps|bp|basis points|sat\/vB|gwei)\b/gi, category: 'metric' },
  // 5. Decimals (54.2, 0.412)
  { regex: /\b\d+\.\d+\b/g, category: 'indicator' },
  // 6. Formatted comma numbers (67,420)
  { regex: /\b\d{1,3}(?:,\d{3})+\b/g, category: 'price' },
  // 7. Bare 4-6 digit integers without commas or $ (45000, 67420)
  { regex: /\b\d{4,6}\b/g, category: 'price' },
];

function extractNumericCore(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, '').replace(/\.$/, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Returns the true mathematical magnitude multiplier for a raw figure.
 */
function getScaleMultiplier(rawLower: string): number {
  if (/\b(?:bn|billion)\b|b$/i.test(rawLower.replace(/[$€£]/g, ''))) return 1_000_000_000;
  if (/\b(?:mn|million)\b|m$/i.test(rawLower.replace(/[$€£]/g, ''))) return 1_000_000;
  if (/\b(?:k|thousand)\b|k$/i.test(rawLower.replace(/[$€£]/g, ''))) return 1_000;
  return 1;
}

/**
 * Finds non-overlapping candidate figure spans in text, preferring longest match
 * (Maximal Non-Overlapping Match) so enclosing tokens like "$120m" beat "$120" or "120m".
 */
function findFigureSpans(text: string): FigureSpan[] {
  const candidates: FigureSpan[] = [];

  for (const { regex, category } of PATTERNS) {
    regex.lastIndex = 0;
    const matches = text.matchAll(regex);
    for (const match of matches) {
      if (match.index === undefined) continue;
      let raw = match[0];
      let start = match.index;

      // Handle leading non-word character if captured by percentage pattern (e.g. " 12%")
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

  // Sort by span length descending (prefer longest matching span), then by start index
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);

  // Eliminate overlaps favoring maximal spans
  const chosen: FigureSpan[] = [];
  for (const span of candidates) {
    const overlaps = chosen.some((c) => span.start < c.end && c.start < span.end);
    if (!overlaps) {
      chosen.push(span);
    }
  }

  // Re-sort chosen spans by start index ascending for deterministic left-to-right order
  chosen.sort((a, b) => a.start - b.start);

  return chosen;
}

/**
 * Semantic evaluation of whether a detected figure is supported by input telemetry.
 */
function isFigureSupported(span: FigureSpan, ctx: TelemetryContext, text: string): boolean {
  const rawTrimmed = span.raw.trim().toLowerCase();

  // 1. Check structural & brand whitelist
  const strippedWord = rawTrimmed.replace(/[$€£%,]/g, '');
  if (STRUCTURAL_WHITELIST.has(strippedWord) || STRUCTURAL_WHITELIST.has(rawTrimmed)) {
    return true;
  }

  const baseNum = extractNumericCore(span.raw);
  if (baseNum === null) return true;

  // 2. Calendar year detection (2000 to 2035) without currency symbols
  if (baseNum >= 2000 && baseNum <= 2035 && !span.raw.includes('$') && !span.raw.includes('€') && !span.raw.includes('£')) {
    return true;
  }

  // 3. Check model sponsor names in surrounding 16-char context
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

  // 4. Check timeframes with word-boundary safety (e.g., "24h", "over 4 hours", "in 15 mins")
  const postContext = text.slice(span.end, Math.min(text.length, span.end + 15)).toLowerCase();
  if (/^\s*(?:hours?|hrs?|h\b|mins?|minutes?|m\b|days?|d\b|weeks?|w\b|months?|secs?|seconds?|s\b|candles?|bars?|periods?)/i.test(postContext)) {
    return true;
  }

  const multiplier = getScaleMultiplier(rawTrimmed);
  const trueScaledNum = baseNum * multiplier;

  // 5. PRIORITY HOIST: Check explicit numbers provided in telemetry context
  // (e.g. portfolio sizes, positionUsd, scenario shocks like -12%, custom tolerances)
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

  // 6. PRIORITY HOIST: Check verbatim citations in known headlines
  if (ctx.knownHeadlines && ctx.knownHeadlines.length > 0) {
    const rawDigits = span.raw.replace(/[^\d]/g, '');
    if (rawDigits.length >= 2) {
      const headlineNumRegex = new RegExp(`\\b${rawDigits}\\b`);
      if (ctx.knownHeadlines.some((h) => headlineNumRegex.test(h))) {
        return true;
      }
    }
  }

  // 7. METRIC WITH SCALE (e.g., "$120m liquidation", "1.5bn volume")
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

  // 8. BASIS POINTS (bps) VALIDATION
  if (rawTrimmed.includes('bps') || rawTrimmed.includes('bp') || rawTrimmed.includes('basis points')) {
    const bpsRate = baseNum * 0.0001;
    const fundingRate = ctx.sentiment?.fundingRate ?? null;
    if (fundingRate !== null && Math.abs(bpsRate - Math.abs(fundingRate)) <= 0.0002) {
      return true;
    }
    // Allow standard market threshold descriptors (1 to 5 bps)
    if (baseNum >= 1 && baseNum <= 5) {
      return true;
    }
    return false;
  }

  // 9. PRICE VALIDATION ($ amounts, ticker suffixes, or bare 4-6 digit integers)
  if (span.category === 'price' || span.raw.includes('$') || /USDT|USDC|USD/i.test(span.raw)) {
    const currentPrice = ctx.currentPrice || 0;
    if (currentPrice > 0) {
      const priceTolerance = currentPrice * 0.15;
      const isNearMarketPrice = Math.abs(trueScaledNum - currentPrice) <= priceTolerance;

      const ema20 = ctx.technical?.ema20 || 0;
      const isNearEma20 = ema20 > 0 && Math.abs(trueScaledNum - ema20) <= priceTolerance;

      const ema50 = ctx.technical?.ema50 || 0;
      const isNearEma50 = ema50 > 0 && Math.abs(trueScaledNum - ema50) <= priceTolerance;

      // Small dollar delta mentions (e.g. "$100 pullback", "$250 spread")
      const isSmallDelta = multiplier === 1 && trueScaledNum <= currentPrice * 0.05 && (span.raw.includes('$') || /USDT|USD/i.test(span.raw));

      if (isNearMarketPrice || isNearEma20 || isNearEma50 || isSmallDelta) {
        return true;
      }
      return false;
    }
  }

  // 10. PERCENTAGE VALIDATION
  if (span.category === 'percentage' || span.raw.includes('%')) {
    // Check against standard risk parameters (SL 1.5%, TP 2.5%, etc.)
    if (RECOGNIZED_STRATEGY_PERCENTS.some((p) => Math.abs(baseNum - p) <= 0.2)) {
      return true;
    }

    // Check against RSI (e.g. 54%)
    const rsi = typeof ctx.technical?.rsi === 'number' ? ctx.technical.rsi : null;
    if (rsi !== null && Math.abs(baseNum - rsi) <= 1.5) {
      return true;
    }

    // Check against Confidence (e.g. 82%)
    const conf = ctx.regime?.confidence || 0;
    if (conf > 0 && Math.abs(baseNum - conf) <= 2.0) {
      return true;
    }

    // Check against Funding Rate (e.g. 0.01% or 0.008%)
    const funding = ctx.sentiment?.fundingRate ? Math.abs(ctx.sentiment.fundingRate * 100) : null;
    if (funding !== null && Math.abs(baseNum - funding) <= 0.05) {
      return true;
    }

    // Check against PriceVsEMA20 %
    const pve = typeof ctx.technical?.priceVsEma20 === 'number' ? Math.abs(ctx.technical.priceVsEma20 * 100) : null;
    if (pve !== null && Math.abs(baseNum - pve) <= 0.5) {
      return true;
    }

    // Check against arbitrary small delta percentages (0.1% to 3.5%)
    if (baseNum >= 0.1 && baseNum <= 3.5) {
      return true;
    }

    return false;
  }

  // 11. INDICATOR & METRIC VALIDATION
  if (span.category === 'indicator') {
    // Check Fused Score (e.g. +0.412)
    const fused = ctx.regime?.fusedScore ?? null;
    if (fused !== null && Math.abs(baseNum - Math.abs(fused)) <= 0.05) {
      return true;
    }

    // Check Technical Score
    const techScore = ctx.technical?.score ?? null;
    if (techScore !== null && Math.abs(baseNum - Math.abs(techScore)) <= 0.05) {
      return true;
    }

    // Check RSI decimal
    const rsi = ctx.technical?.rsi ?? null;
    if (rsi !== null && Math.abs(baseNum - rsi) <= 1.0) {
      return true;
    }

    // Small decimals between 0.0 and 1.0 are common score descriptors
    if (baseNum >= 0.0 && baseNum <= 1.0) {
      return true;
    }
  }

  // Fallback: If it's a small natural integer count under 10 (e.g. "3 signals aligned"), permit
  if (Number.isInteger(baseNum) && baseNum >= 1 && baseNum <= 7 && !span.raw.includes('$') && !span.raw.includes('%')) {
    return true;
  }

  return false;
}

/**
 * Validates a text response against telemetry context, redacting unverified figures.
 * Rewrites right-to-left to ensure string offsets remain valid during replacement.
 */
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

  // Sort descending by start offset to rewrite right-to-left safely
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
