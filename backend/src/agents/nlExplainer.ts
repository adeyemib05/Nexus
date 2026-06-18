import type { StrategyDecision } from '../types';

// Use native fetch if available (Node 18+), otherwise fall back to the
// already-installed node-fetch package.
const fetchFn: any = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

const SYSTEM_PROMPT =
  'You are NEXUS, an adaptive AI trading intelligence. You explain trade decisions in exactly 2 sentences, ' +
  'like a senior trader briefing a junior. Be specific about market signals. Use professional trading vocabulary. ' +
  'Never start with "I". Be direct and confident. ' +
  'Sentence 1: state the regime and what drove it. ' +
  'Sentence 2: state what the position does and its risk parameters.';

function isKeySet(key: string | undefined, placeholderHint: string): boolean {
  return !!key && key.length > 0 && !key.toUpperCase().includes(placeholderHint);
}

function buildUserPrompt(decision: StrategyDecision, price: number): string {
  const signalLines = decision.regime.signals
    .map(
      (s) =>
        `  ${s.label}: ${s.score > 0 ? '+' : ''}${s.score.toFixed(3)} (${(s.confidence * 100).toFixed(0)}% confidence, source: ${s.source})`
    )
    .join('\n');

  return `Explain this NEXUS trade decision:

Action: ${decision.action.toUpperCase()} ${decision.symbol} at $${price.toFixed(2)}
Regime: ${decision.regime.regime} — ${decision.regime.confidence}% confidence
Strategy: ${decision.strategy}
Position: ${(decision.positionSizePct * 100).toFixed(1)}% of portfolio
Stop Loss: ${(decision.stopLossPct * 100).toFixed(1)}% | Take Profit: ${(decision.takeProfitPct * 100).toFixed(1)}%

Signal breakdown:
${signalLines}

Internal reasoning: ${decision.reasoning}`;
}

async function callQwen(userPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchFn(`${process.env.QWEN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || 'qwen3.6-plus',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 180,
        temperature: 0.4,
        stream: false,
      }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Qwen error ${response.status}: ${data?.error?.message || JSON.stringify(data)}`);
    }
    let text = data.choices[0].message.content.trim();
    // Known issue: qwen3.6-plus may include a <think>...</think> block — strip it
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(fullPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const response = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: { maxOutputTokens: 180, temperature: 0.4 },
        }),
        signal: controller.signal,
      }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Gemini error: ${JSON.stringify(data?.error)}`);
    }
    return data.candidates[0].content.parts[0].text.trim();
  } finally {
    clearTimeout(timer);
  }
}

function buildMockExplanation(decision: StrategyDecision, price: number): string {
  const conf = decision.regime.confidence;
  const sl = decision.stopLossPct;
  const tp = decision.takeProfitPct;
  const techScore = decision.regime.signals.find((s) => s.type === 'technical')?.score.toFixed(3) ?? '0.000';

  switch (decision.strategy) {
    case 'momentum_long':
      return (
        `Bullish trend regime confirmed (${conf}% confidence) with technical analysis (${techScore}) as the primary driver. ` +
        `Long position opened at $${price.toFixed(2)} targeting ${(tp * 100).toFixed(0)}% upside with ${(sl * 100).toFixed(0)}% downside protection.`
      );
    case 'mean_reversion':
      return (
        `Ranging market identified — price near Bollinger Band support with ${conf}% confidence. ` +
        `Mean-reversion long at $${price.toFixed(2)} targets the range midpoint with tight ${(sl * 100).toFixed(0)}% stop-loss.`
      );
    case 'capital_protection':
      return (
        `Mixed market signals — NEXUS identified insufficient directional conviction (${conf}% confidence) to deploy capital. ` +
        `Protecting portfolio value while awaiting a cleaner setup.`
      );
    default:
      return `${decision.reasoning} Entry at $${price.toFixed(2)} with ${(sl * 100).toFixed(0)}% stop-loss.`;
  }
}

export class NLExplainer {
  constructor() {
    const qwenReady = isKeySet(process.env.QWEN_API_KEY, 'YOUR_QWEN');
    const geminiReady = isKeySet(process.env.GEMINI_API_KEY, 'YOUR_GEMINI');
    console.log(
      `🤖 NL Explainer: Qwen(${qwenReady ? 'ready' : 'NOT SET'}) → Gemini(${geminiReady ? 'ready' : 'NOT SET'}) → mock`
    );
  }

  async explain(
    decision: StrategyDecision,
    currentPrice: number,
    _riskResult: { approved: boolean; reason: string }
  ): Promise<string> {
    const userPrompt = buildUserPrompt(decision, currentPrice);

    if (isKeySet(process.env.QWEN_API_KEY, 'YOUR_QWEN')) {
      try {
        const result = await callQwen(userPrompt);
        console.log('[NL] ✅ Qwen explained trade');
        return result;
      } catch (err: any) {
        console.log(`[NL] ⚠️  Qwen failed: ${err.message} — trying Gemini`);
      }
    }

    if (isKeySet(process.env.GEMINI_API_KEY, 'YOUR_GEMINI')) {
      try {
        const fullPrompt = SYSTEM_PROMPT + '\n\n' + userPrompt;
        const result = await callGemini(fullPrompt);
        console.log('[NL] ✅ Gemini explained trade');
        return result;
      } catch (err: any) {
        console.log(`[NL] ⚠️  Gemini failed: ${err.message} — using template`);
      }
    }

    console.log('[NL] ℹ️  Using template explanation');
    return buildMockExplanation(decision, currentPrice);
  }
}
