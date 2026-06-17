import axios from 'axios';
import { buildAuthHeaders } from './auth';
import type { SignalType, SignalReading } from '../types';
import { scoreToStrength, clamp } from '../types/helpers';

// ── Skill map ──────────────────────────────────────────────────────────────
export const SKILL_MAP: Record<string, SignalType> = {
  'macro-analyst':      'macro',
  'market-intel':       'onchain',
  'news-briefing':      'news',
  'sentiment-analyst':  'sentiment',
  'technical-analysis': 'technical',
};

export const ALL_SKILLS = Object.keys(SKILL_MAP);

// ── Types ──────────────────────────────────────────────────────────────────
export interface AgentHubResult {
  raw: unknown;
  score: number;
  confidence: number;
  source: 'agent_hub' | 'mock';
  details: Record<string, unknown>;
}

// ── Response Parser ────────────────────────────────────────────────────────
function parseAgentHubResponse(response: unknown, _skillName: string): Pick<AgentHubResult, 'score' | 'confidence' | 'source'> {
  // Try #1: numeric score fields
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const obj = response as Record<string, unknown>;
    const scoreFields = ['score', 'sentiment_score', 'signal_score', 'value', 'indicator'];
    for (const field of scoreFields) {
      if (typeof obj[field] === 'number') {
        const raw = obj[field] as number;
        // Normalize to [-1, 1]: if value looks like percentage (>1 or <-1), divide by 100
        const score = Math.abs(raw) > 1 ? clamp(raw / 100, -1, 1) : clamp(raw, -1, 1);
        return { score, confidence: 0.75, source: 'agent_hub' };
      }
    }

    // Try #2: directional string
    const textFields = ['direction', 'signal', 'trend', 'bias', 'recommendation', 'summary'];
    for (const field of textFields) {
      if (typeof obj[field] === 'string') {
        const txt = (obj[field] as string).toLowerCase();
        let score = 0;
        if (txt.includes('bullish') || txt.includes('positive') || txt.includes('buy')) score = 0.5;
        else if (txt.includes('bearish') || txt.includes('negative') || txt.includes('sell')) score = -0.5;
        if (txt.includes('strong')) score *= 1.4;
        if (txt.includes('weak') || txt.includes('slight')) score *= 0.6;
        if (score !== 0) return { score: clamp(score, -1, 1), confidence: 0.65, source: 'agent_hub' };
      }
    }
  }

  // Try #3: plain text sentiment
  if (typeof response === 'string' && response.length > 0) {
    const txt = response.toLowerCase();
    const posWords = ['bull', 'up', 'rise', 'growth', 'positive', 'gain', 'rally', 'surge'];
    const negWords = ['bear', 'down', 'fall', 'decline', 'negative', 'loss', 'drop', 'crash'];
    let score = 0;
    posWords.forEach((w) => { if (txt.includes(w)) score += 0.1; });
    negWords.forEach((w) => { if (txt.includes(w)) score -= 0.1; });
    if (score !== 0) return { score: clamp(score, -1, 1), confidence: 0.55, source: 'agent_hub' };
  }

  // Try #4: final fallback
  return { score: 0, confidence: 0.30, source: 'mock' };
}

// ── Cache ──────────────────────────────────────────────────────────────────
interface CacheEntry {
  result: AgentHubResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 55000; // 55 seconds

// ── Client ─────────────────────────────────────────────────────────────────
export class AgentHubClient {
  private apiKey: string;
  private secretKey: string;
  private passphrase: string;
  private baseUrl: string;
  private cache = new Map<string, CacheEntry>();

  constructor() {
    this.apiKey = process.env.BITGET_API_KEY ?? '';
    this.secretKey = process.env.BITGET_SECRET_KEY ?? '';
    this.passphrase = process.env.BITGET_PASSPHRASE ?? '';
    this.baseUrl = process.env.BITGET_BASE_URL ?? 'https://api.bitget.com';
  }

  private authHeaders(method: string, path: string, body = ''): Record<string, string> {
    return buildAuthHeaders(method, path, body, this.apiKey, this.secretKey, this.passphrase);
  }

  async callSkill(skillName: string, symbol: string): Promise<AgentHubResult> {
    const cacheKey = `${skillName}:${symbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }

    // ── Attempt 1: POST /api/v2/agenthub/skill/invoke ──────────────────
    const attempts: Array<() => Promise<unknown>> = [
      async () => {
        const path = '/api/v2/agenthub/skill/invoke';
        const body = JSON.stringify({ skill: skillName, symbol, params: {} });
        console.log(`[AGENT HUB] Trying endpoint format 1: POST ${this.baseUrl}${path}`);
        const res = await axios.post(`${this.baseUrl}${path}`, JSON.parse(body), {
          headers: this.authHeaders('POST', path, body),
          timeout: 6000,
        });
        if (res.data?.code && res.data.code !== '00000') {
          throw new Error(`code=${res.data.code} msg=${res.data.msg}`);
        }
        return res.data?.data ?? res.data;
      },

      // ── Attempt 2: POST /api/v2/agenthub/analyze ───────────────────
      async () => {
        const path = '/api/v2/agenthub/analyze';
        const body = JSON.stringify({ skillName, instId: symbol, granularity: '1H' });
        console.log(`[AGENT HUB] Trying endpoint format 2: POST ${this.baseUrl}${path}`);
        const res = await axios.post(`${this.baseUrl}${path}`, JSON.parse(body), {
          headers: this.authHeaders('POST', path, body),
          timeout: 6000,
        });
        if (res.data?.code && res.data.code !== '00000') {
          throw new Error(`code=${res.data.code} msg=${res.data.msg}`);
        }
        return res.data?.data ?? res.data;
      },

      // ── Attempt 3: GET /api/v2/agenthub/signal ──────────────────────
      async () => {
        const qs = `?skill=${encodeURIComponent(skillName)}&symbol=${encodeURIComponent(symbol)}`;
        const path = `/api/v2/agenthub/signal${qs}`;
        console.log(`[AGENT HUB] Trying endpoint format 3: GET ${this.baseUrl}${path}`);
        const res = await axios.get(`${this.baseUrl}${path}`, {
          headers: this.authHeaders('GET', path, ''),
          timeout: 6000,
        });
        if (res.data?.code && res.data.code !== '00000') {
          throw new Error(`code=${res.data.code} msg=${res.data.msg}`);
        }
        return res.data?.data ?? res.data;
      },
    ];

    for (let i = 0; i < attempts.length; i++) {
      try {
        const raw = await attempts[i]();
        const { score, confidence, source } = parseAgentHubResponse(raw, skillName);
        const successUrl = i === 0 ? 'POST /api/v2/agenthub/skill/invoke'
                         : i === 1 ? 'POST /api/v2/agenthub/analyze'
                         : 'GET /api/v2/agenthub/signal';
        console.log(`[AGENT HUB] ✅ Endpoint confirmed: ${successUrl}`);
        console.log(`[AGENT HUB] ${skillName}: score=${score.toFixed(3)} (source: ${source})`);

        const result: AgentHubResult = {
          raw,
          score,
          confidence,
          source,
          details: typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : { raw: String(raw) },
        };

        this.cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      } catch (err: any) {
        console.log(`[AGENT HUB] Format ${i + 1} failed: ${err.message}`);
      }
    }

    // All attempts failed — return mock
    console.warn(`[AGENT HUB] ⚠️  ${skillName} — all endpoints failed, using mock score`);
    const fallback: AgentHubResult = {
      raw: null,
      score: 0,
      confidence: 0.30,
      source: 'mock',
      details: { error: 'Agent Hub unavailable' },
    };
    this.cache.set(cacheKey, { result: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  async callAllSkills(symbol: string): Promise<Record<string, AgentHubResult>> {
    const results = await Promise.allSettled(
      ALL_SKILLS.map((skill) => this.callSkill(skill, symbol).then((r) => [skill, r] as [string, AgentHubResult]))
    );

    const map: Record<string, AgentHubResult> = {};
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [skill, result] = r.value;
        map[skill] = result;
      }
    }

    // Ensure every skill has an entry
    for (const skill of ALL_SKILLS) {
      if (!map[skill]) {
        map[skill] = { raw: null, score: 0, confidence: 0.30, source: 'mock', details: { error: 'Promise rejected' } };
      }
    }

    return map;
  }

  /**
   * Convert AgentHub results to SignalReadings (for use by signal aggregator)
   */
  resultsToSignals(results: Record<string, AgentHubResult>, symbol: string): SignalReading[] {
    return ALL_SKILLS.map((skill) => {
      const type = SKILL_MAP[skill] as SignalType;
      const result = results[skill];
      return {
        type,
        score: result.score,
        strength: scoreToStrength(result.score),
        confidence: result.confidence,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        source: result.source,
        details: result.details,
        timestamp: Date.now(),
      } satisfies SignalReading;
    });
  }
}
