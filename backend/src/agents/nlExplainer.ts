import type { StrategyDecision } from '../types';

const fetchFn: any = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

const SYSTEM_PROMPT =
  'You are NEXUS, an adaptive AI trading intelligence speaking to a general audience, not just traders. ' +
  'Explain each trade decision in clear, simple, everyday English, in 3 to 4 short sentences — enough room to ' +
  'actually explain the decision, not a rigid 2-sentence summary. ' +
  "You'll be given readings from 5 signals: macro, sentiment, on-chain, news, and technical. " +
  'Weave in what at least 3 of them are indicating, described in plain qualitative language ' +
  '(e.g. "fear is elevated among traders", "macro conditions look supportive", "on-chain activity is quiet") — ' +
  'never recite raw scores or numbers from the input. ' +
  'Then state what action NEXUS is taking and why, and describe the risk protection in plain terms ' +
  '(e.g. "if price drops about 1.5%, the position closes automatically to limit losses"). ' +
  'Never start with "I". Write like a knowledgeable analyst explaining a decision to a smart friend — warm, ' +
  'clear, and free of jargon.';

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

  return `Explain this NEXUS trade decision to someone with no trading background:

Action: ${decision.action.toUpperCase()} ${decision.symbol} at $${price.toFixed(2)}
Regime: ${decision.regime.regime} — ${decision.regime.confidence}% confidence
Strategy: ${decision.strategy}
Position: ${(decision.positionSizePct * 100).toFixed(1)}% of portfolio
Stop Loss: ${(decision.stopLossPct * 100).toFixed(1)}% | Take Profit: ${(decision.takeProfitPct * 100).toFixed(1)}%

Signal breakdown (translate these into plain qualitative language, don't quote the numbers):
${signalLines}

Internal reasoning: ${decision.reasoning}`;
}

async function callQwen(userPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
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
        max_tokens: 320,
        temperature: 0.5,
        stream: false,
      }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Qwen error ${response.status}: ${data?.error?.message || JSON.stringify(data)}`);
    }
    let text = data.choices[0].message.content.trim();
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(fullPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const response = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: { maxOutputTokens: 320, temperature: 0.5 },
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

/** Plain-English helper for the template fallback — same qualitative translation Qwen is asked to do. */
function describeSignal(score: number, positiveLabel: string, negativeLabel: string, neutralLabel: string): string {
  if (score > 0.2) return positiveLabel;
  if (score < -0.2) return negativeLabel;
  return neutralLabel;
}

function buildMockExplanation(decision: StrategyDecision, price: number): string {
  const conf = decision.regime.confidence;
  const sl = decision.stopLossPct;
  const tp = decision.takeProfitPct;
  const signals = decision.regime.signals;

  const macro = signals.find((s) => s.type === 'macro');
  const sentiment = signals.find((s) => s.type === 'sentiment');
  const news = signals.find((s) => s.type === 'news');

  const notes = [
    macro && describeSignal(macro.score, 'macro conditions look supportive', 'macro conditions are a headwind', 'macro conditions are neutral'),
    sentiment &&
      describeSignal(sentiment.score, 'trader sentiment is optimistic', 'trader sentiment shows elevated fear', 'trader sentiment is mixed'),
    news && describeSignal(news.score, 'recent headlines lean positive', 'recent headlines carry a negative tone', 'news flow is quiet'),
  ].filter(Boolean);

  const context = notes.length > 0 ? notes.join(', and ') : 'signals are mixed across the board';

  switch (decision.strategy) {
    case 'momentum_long':
      return (
        `NEXUS sees a bullish trend forming with ${conf}% confidence — ${context}. ` +
        `Acting on this, a long position opened at $${price.toFixed(2)}, targeting roughly ${(tp * 100).toFixed(0)}% upside. ` +
        `If price instead falls about ${(sl * 100).toFixed(0)}%, the position closes automatically to limit losses.`
      );
    case 'mean_reversion':
      return (
        `Price is trading within a range and looks stretched toward its lower edge (${conf}% confidence) — ${context}. ` +
        `NEXUS opened a long at $${price.toFixed(2)}, expecting a bounce back toward the middle of the range. ` +
        `A tight ${(sl * 100).toFixed(0)}% stop protects against a deeper breakdown if that read is wrong.`
      );
    case 'capital_protection':
      return (
        `Signals are mixed right now — ${context} — giving only ${conf}% confidence in any clear direction. ` +
        `Rather than guess, NEXUS is staying in cash and protecting capital until a cleaner setup appears.`
      );
    default:
      return `${decision.reasoning} Entry at $${price.toFixed(2)} with a ${(sl * 100).toFixed(0)}% stop-loss.`;
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
