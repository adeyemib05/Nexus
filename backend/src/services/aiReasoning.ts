import axios from 'axios';

interface StressContext {
  symbol: string;
  scenarioName: string;
  scenarioCategory: string;
  marketShockPct: number;
  projectedDrawdownPct: number;
  projectedLossUsd: number;
  resilienceScore: number;
  userPositionSize: number;
  closestAnalog: string;
  userThesis?: string;
}

export interface AIReasoningResult {
  summary: string;
  firstOrder: string;
  secondOrder: string;
  thirdOrderWeekend: string;
  defensiveHedge: {
    action: string;
    targetAsset: string;
    allocationUsd: number;
    expectedProtectionPct: number;
  };
  rebalanceAdvice: string;
  opportunisticDipPrice: number;
  provider: 'qwen-3.8-max' | 'groq-qwen-27b' | 'nexus-quant-engine';
}

// 15-Minute LRU Memory Cache to conserve Qwen tokens
const memoryCache = new Map<string, { data: AIReasoningResult; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function generateCascadeReasoning(ctx: StressContext): Promise<AIReasoningResult> {
  const cacheKey = `${ctx.symbol}_${ctx.scenarioName}_${ctx.marketShockPct}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const systemPrompt = `You are the lead quantitative risk reasoning engine for NEXUS, an institutional pre-trade decision stress testing platform for tokenized US stocks (rTokens) trading 24/7 on Bitget.
Provide concise, institutional-grade, multi-order transmission analysis.
Respond in strictly valid JSON with NO markdown wrapping, matching this schema:
{
  "summary": "1 punchy sentence highlighting the core vulnerability",
  "firstOrder": "Direct valuation and multiple compression impact on this ticker",
  "secondOrder": "Cross-asset collateral contagion and margin liquidation implications",
  "thirdOrderWeekend": "The 7x24 weekend liquidity trap: how holding on-chain rToken while traditional US exchanges are closed impacts slippage and exit liquidity",
  "defensiveHedge": {
    "action": "Name of hedge strategy",
    "targetAsset": "Exact inverse or protective instrument",
    "allocationUsd": number,
    "expectedProtectionPct": number
  },
  "rebalanceAdvice": "Specific actionable portfolio adjustment",
  "opportunisticDipPrice": number
}`;

  const userPrompt = `Stress Test Context:
- Ticker: ${ctx.symbol}
- Trade Thesis: ${ctx.userThesis || 'Standard long position'}
- Position Size: $${ctx.userPositionSize}
- Stress Scenario: ${ctx.scenarioName} (${ctx.scenarioCategory}, Market Shock: ${ctx.marketShockPct}%)
- Projected Drawdown: -${ctx.projectedDrawdownPct}% (Estimated Loss: -$${ctx.projectedLossUsd})
- NEXUS Resilience Score: ${ctx.resilienceScore}/100
- Closest Historical Analog: ${ctx.closestAnalog}

Analyze transmission chain and return the structured JSON.`;

  // 1. PRIMARY: Alibaba Cloud Qwen 3.8 Max (Bitget Hackathon Sponsor)
  const qwenKey = process.env.QWEN_API_KEY || '';
  const qwenBase = process.env.QWEN_BASE_URL || 'https://hackathon.bitgetops.com/v1';
  const qwenModel = process.env.QWEN_MODEL || 'qwen3.8-max';

  try {
    const qwenRes = await axios.post(
      `${qwenBase}/chat/completions`,
      {
        model: qwenModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 800,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${qwenKey}`,
        },
        timeout: 7000,
      }
    );

    const content = qwenRes.data?.choices?.[0]?.message?.content || '{}';
    const cleaned = content.replace(/```json\n?|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const result: AIReasoningResult = {
      ...parsed,
      provider: 'qwen-3.8-max',
    };
    memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (qwenError: any) {
    console.warn(`[NEXUS AI] Qwen 3.8 Max unavailable (${qwenError.message}). Failing over to Groq...`);
  }

  // 2. SECONDARY: Groq LPU Engine (qwen/qwen3.8-27b)
  const groqKey = process.env.GROQ_API_KEY || '';
  if (groqKey) {
    try {
      const groqRes = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 800,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          timeout: 4000,
        }
      );

      const content = groqRes.data?.choices?.[0]?.message?.content || '{}';
      const cleaned = content.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const result: AIReasoningResult = {
        ...parsed,
        provider: 'groq-qwen-27b',
      };
      memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (groqError: any) {
      console.warn(`[NEXUS AI] Groq fallback error (${groqError.message}). Using quant engine...`);
    }
  }

  // 3. DETERMINISTIC QUANT ENGINE (Zero-Downtime Guarantee)
  const result: AIReasoningResult = {
    summary: `${ctx.symbol} exhibits elevated tail-risk sensitivity under ${ctx.scenarioName}, with projected -$${ctx.projectedLossUsd.toLocaleString()} drawdown exacerbated by 7x24 weekend liquidity thinning.`,
    firstOrder: `Immediate multiple contraction: High beta forces an acute price re-rating, suppressing trading multiples toward ${ctx.symbol}'s 52-week historical trough.`,
    secondOrder: `Collateral contagion: Accelerated liquidations in correlated crypto and high-beta equities trigger stop-loss cascades across decentralized lending pools.`,
    thirdOrderWeekend: `The 7x24 Asymmetry Trap: When traditional US exchanges are closed, on-chain rToken orderbooks face wider bid-ask spreads, penalizing market-order exits.`,
    defensiveHedge: {
      action: 'Defensive Delta Neutralizer',
      targetAsset: 'Inverse Tech (SOXS / rUSDC Yield)',
      allocationUsd: Math.round(ctx.userPositionSize * 0.12),
      expectedProtectionPct: Math.min(85, Math.round(ctx.projectedDrawdownPct * 2.5)),
    },
    rebalanceAdvice: `Trim ${ctx.projectedDrawdownPct > 12 ? '20%' : '10%'} of open ${ctx.symbol} risk into tokenized short-term treasuries (rTBILL) until the VIX retreats below 22.`,
    opportunisticDipPrice: Number((ctx.userPositionSize * 0.95).toFixed(2)),
    provider: 'nexus-quant-engine',
  };

  return result;
}
