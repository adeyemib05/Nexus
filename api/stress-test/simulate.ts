import type { VercelRequest, VercelResponse } from '@vercel/node';

interface DefensiveHedge {
  action: string;
  targetAsset: string;
  allocationUsd: number;
  expectedProtectionPct: number;
}

interface QwenAnalysisResponse {
  summary: string;
  firstOrder: string;
  secondOrder: string;
  thirdOrderWeekend: string;
  defensiveHedge: DefensiveHedge;
  rebalanceAdvice: string;
  opportunisticDipPrice: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Method guard: POST only
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { symbol, scenario, severity, positionUsd, userThesis, currentPrice } = req.body || {};

  const safeSymbol = symbol || 'NVDA';
  const safePosition = Number(positionUsd) || 25000;
  const safeThesis = userThesis || 'Standard long position';
  const scenarioName = scenario?.name || 'Macro Liquidity Shock';
  const shockPct = scenario?.marketShockPct || -12;
  const basePrice = Number(currentPrice) || Number(req.body?.currentPrice) || 100;

  const systemPrompt = `You are the quantitative risk reasoning engine for NEXUS, an institutional pre-trade stress testing platform for tokenized stocks (rTokens) trading 24/7 on Bitget.
Analyze the multi-order transmission chain under weekend liquidity conditions.
Respond strictly in valid JSON matching this exact schema:
{
  "summary": "1 punchy sentence highlighting the core vulnerability",
  "firstOrder": "Direct valuation and multiple compression impact on this ticker",
  "secondOrder": "Cross-asset collateral contagion and margin liquidation implications",
  "thirdOrderWeekend": "The 7x24 weekend liquidity trap: how holding on-chain rTokens while US traditional markets are closed impacts slippage and exit liquidity",
  "defensiveHedge": {
    "action": "Name of hedge strategy",
    "targetAsset": "Exact inverse or protective instrument",
    "allocationUsd": number,
    "expectedProtectionPct": number
  },
  "rebalanceAdvice": "Specific actionable portfolio adjustment",
  "opportunisticDipPrice": number
}`;

  const userPrompt = `Stress Context:
- Asset: ${safeSymbol}
- Position Size: $${safePosition.toLocaleString()}
- Thesis: ${safeThesis}
- Scenario: ${scenarioName} (Shock: ${shockPct}%, Severity: ${severity || 'severe'})
- Reference Price: $${basePrice}
Generate pre-trade risk analysis and return valid JSON only.`;

  // 2. Primary: Alibaba Cloud Qwen 3.8 Max (Bitget Hackathon Sponsor)
  const qwenKey = process.env.QWEN_API_KEY;
  const qwenBase = process.env.QWEN_BASE_URL || 'https://hackathon.bitgetops.com/v1';
  const qwenModel = process.env.QWEN_MODEL || 'qwen3.8-max';

  if (qwenKey && !qwenKey.includes('YOUR')) {
    try {
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
          temperature: 0.2,
          max_tokens: 800,
        }),
      });

      if (qwenRes.ok) {
        const data = await qwenRes.json();
        const rawContent = data?.choices?.[0]?.message?.content || '{}';
        const cleaned = rawContent.replace(/```json\n?|```/g, '').trim();
        const parsed: QwenAnalysisResponse = JSON.parse(cleaned);

        if (parsed.summary && parsed.firstOrder) {
          return res.status(200).json({
            success: true,
            data: { aiReasoning: parsed },
            provider: 'qwen-3.8-max',
          });
        }
      } else {
        console.warn(`[NEXUS API] Qwen returned status ${qwenRes.status}`);
      }
    } catch (err: any) {
      console.warn('[NEXUS API] Qwen parse/fetch failed:', err.message);
    }
  }

  // 3. Fallback: Groq LPU Engine
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && !groqKey.includes('YOUR')) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'qwen/qwen3-32b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 800,
        }),
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        const rawContent = data?.choices?.[0]?.message?.content || '{}';
        const cleaned = rawContent.replace(/```json\n?|```/g, '').trim();
        const parsed: QwenAnalysisResponse = JSON.parse(cleaned);

        if (parsed.summary && parsed.firstOrder) {
          return res.status(200).json({
            success: true,
            data: { aiReasoning: parsed },
            provider: 'groq-qwen-32b',
          });
        }
      } else {
        console.warn(`[NEXUS API] Groq returned status ${groqRes.status}`);
      }
    } catch (err: any) {
      console.warn('[NEXUS API] Groq parse/fetch failed:', err.message);
    }
  }

  // 4. Deterministic Quant Fallback (Never return 500 to user)
  const hedgeAmount = Math.round(safePosition * 0.14);
  const fallbackResponse: QwenAnalysisResponse = {
    summary: `${safeSymbol} exhibits heightened tail-risk sensitivity under ${scenarioName}, with severe drawdown risk exacerbated by 7x24 weekend liquidity thinning.`,
    firstOrder: `Immediate multiple compression: High beta forces an acute valuation re-rating toward ${safeSymbol}'s 52-week support corridor.`,
    secondOrder: `Collateral contagion: Margin liquidations in correlated crypto and high-beta equities trigger stop-loss runs across decentralized pools.`,
    thirdOrderWeekend: `The 7x24 Asymmetry Trap: When traditional US exchanges are closed, on-chain rToken order books face wider bid-ask spreads, heavily penalizing market exits.`,
    defensiveHedge: {
      action: 'Defensive Delta Neutralizer',
      targetAsset: 'Inverse Tech (SOXS / rUSDC Yield)',
      allocationUsd: hedgeAmount,
      expectedProtectionPct: 75,
    },
    rebalanceAdvice: `Trim 15% of open ${safeSymbol} risk into tokenized short-term treasuries (rTBILL) until the VIX retreats below 22.`,
    opportunisticDipPrice: Number((basePrice * 0.88).toFixed(2)),
  };

  return res.status(200).json({
    success: true,
    data: { aiReasoning: fallbackResponse },
    provider: 'nexus-quant-deterministic',
  });
}
