import { Router, Request, Response } from 'express';
import { generateCascadeReasoning } from '../services/aiReasoning';

const router = Router();

export const POPULAR_TOKENIZED_EQUITIES: Record<string, any> = {
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corp (rNVDA)',
    price: 119.50,
    change24h: 2.85,
    beta: 2.15,
    peRatio: 52.4,
    marketCap: '$2.94T',
    volume24h: '$42.8M (rToken)',
    volatility30d: 58.4,
    sector: 'Semiconductors & AI',
    tokenizedChain: 'Arbitrum',
    isWeekendTradingActive: true,
    weekendSpreadBps: 28,
  },
  AAPL: {
    symbol: 'AAPL',
    name: 'Apple Inc (rAAPL)',
    price: 228.20,
    change24h: -0.42,
    beta: 1.05,
    peRatio: 33.1,
    marketCap: '$3.47T',
    volume24h: '$18.2M (rToken)',
    volatility30d: 22.1,
    sector: 'Consumer Tech',
    tokenizedChain: 'Solana',
    isWeekendTradingActive: true,
    weekendSpreadBps: 16,
  },
  TSLA: {
    symbol: 'TSLA',
    name: 'Tesla Inc (rTSLA)',
    price: 242.80,
    change24h: 5.12,
    beta: 2.45,
    peRatio: 68.2,
    marketCap: '$774B',
    volume24h: '$36.5M (rToken)',
    volatility30d: 64.8,
    sector: 'Automotive & CleanTech',
    tokenizedChain: 'Arbitrum',
    isWeekendTradingActive: true,
    weekendSpreadBps: 34,
  },
  MSFT: {
    symbol: 'MSFT',
    name: 'Microsoft Corp (rMSFT)',
    price: 432.10,
    change24h: 1.15,
    beta: 1.18,
    peRatio: 35.8,
    marketCap: '$3.21T',
    volume24h: '$14.9M (rToken)',
    volatility30d: 24.6,
    sector: 'Cloud & Enterprise AI',
    tokenizedChain: 'Arbitrum',
    isWeekendTradingActive: true,
    weekendSpreadBps: 18,
  },
  COIN: {
    symbol: 'COIN',
    name: 'Coinbase Global (rCOIN)',
    price: 215.40,
    change24h: -3.40,
    beta: 3.10,
    peRatio: 41.2,
    marketCap: '$52.4B',
    volume24h: '$29.1M (rToken)',
    volatility30d: 82.3,
    sector: 'Crypto Infrastructure',
    tokenizedChain: 'Solana',
    isWeekendTradingActive: true,
    weekendSpreadBps: 46,
  },
  MSTR: {
    symbol: 'MSTR',
    name: 'MicroStrategy Inc (rMSTR)',
    price: 138.90,
    change24h: 4.80,
    beta: 3.65,
    peRatio: 88.0,
    marketCap: '$28.3B',
    volume24h: '$24.6M (rToken)',
    volatility30d: 94.2,
    sector: 'Bitcoin Treasury Proxy',
    tokenizedChain: 'Arbitrum',
    isWeekendTradingActive: true,
    weekendSpreadBps: 52,
  },
};

export const HISTORICAL_BLACK_SWANS = [
  {
    id: 'yen_carry_2024',
    name: 'Aug 2024 Yen Carry Trade Collapse',
    date: 'August 5, 2024',
    similarityScore: 98,
    historicalDrawdown: -15.8,
    durationDays: 4,
    recoveryDays: 14,
    context: 'Bank of Japan rate hike triggered sudden global margin calls. High-beta tech dropped 15% in 72h while US futures were locked.',
    keyTransmission: 'Forced margin liquidations cascaded through high-beta tech longs during Asian off-hours.',
  },
  {
    id: 'svb_collapse_2023',
    name: 'Mar 2023 SVB Weekend Bank Run',
    date: 'March 10-12, 2023',
    similarityScore: 93,
    historicalDrawdown: -8.4,
    durationDays: 3,
    recoveryDays: 8,
    context: 'SVB failed Friday afternoon. Tokenized equities traded into severe panic Saturday/Sunday before Fed announcement Monday.',
    keyTransmission: 'Weekend market asymmetry: on-chain liquidity bore 100% of price discovery while traditional banks were closed.',
  },
  {
    id: 'fed_jumbo_2022',
    name: 'Oct 2022 CPI Surprise & Semi Export Bans',
    date: 'October 13, 2022',
    similarityScore: 88,
    historicalDrawdown: -11.2,
    durationDays: 6,
    recoveryDays: 22,
    context: 'Higher-than-expected CPI matched with Commerce Dept sweeping semiconductor equipment export controls.',
    keyTransmission: 'P/E multiple de-rating from elevated levels down to sector historical troughs.',
  },
  {
    id: 'covid_flash_2020',
    name: 'Mar 2020 Global Liquidity Freeze',
    date: 'March 12-18, 2020',
    similarityScore: 76,
    historicalDrawdown: -28.6,
    durationDays: 16,
    recoveryDays: 48,
    context: 'Cross-asset fire sales where safe havens, equities, and commodities fell simultaneously.',
    keyTransmission: 'Cross-asset correlation spiked toward 1.0; forced leverage unwinds occurred regardless of balance sheet quality.',
  },
];

// GET /api/stress-test/equities
router.get('/equities', (_req: Request, res: Response) => {
  res.json({ success: true, data: POPULAR_TOKENIZED_EQUITIES });
});

// GET /api/stress-test/analogs
router.get('/analogs', (_req: Request, res: Response) => {
  res.json({ success: true, data: HISTORICAL_BLACK_SWANS });
});

// POST /api/stress-test/simulate
router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const {
      symbol = 'NVDA',
      scenario,
      positionUsd = 25000,
      severity = 'severe',
      userThesis,
    } = req.body;

    const equity = POPULAR_TOKENIZED_EQUITIES[symbol.toUpperCase()] || POPULAR_TOKENIZED_EQUITIES['NVDA'];

    const severityMultipliers: Record<string, number> = {
      mild: 0.6,
      severe: 1.0,
      black_swan: 1.75,
    };
    const mult = severityMultipliers[severity] || 1.0;

    const baseShockPct = Math.abs(scenario?.marketShockPct || -11.8) * mult;
    const betaDrag = equity.beta > 1.5 ? 1 + (equity.beta - 1.5) * 0.35 : 1.0;
    const rawDrawdownPct = baseShockPct * equity.beta * betaDrag;

    const weekendMultiplier = (scenario?.weekendSpreadMultiplier || 2.5) * (severity === 'black_swan' ? 1.4 : 1.0);
    const spreadBps = equity.weekendSpreadBps * weekendMultiplier;
    const weekendLiquidityPenaltyPct = Number((spreadBps / 100).toFixed(2));

    const projectedDrawdownPct = Math.min(
      78.0,
      Number((rawDrawdownPct + weekendLiquidityPenaltyPct).toFixed(2))
    );

    const projectedPrice = Number((equity.price * (1 - projectedDrawdownPct / 100)).toFixed(2));
    const projectedLossUsd = Math.round(positionUsd * (projectedDrawdownPct / 100));
    const estimatedSlippageUsd = Math.round(positionUsd * (weekendLiquidityPenaltyPct / 100));

    const vulnerabilityPoints = 
      projectedDrawdownPct * 1.3 + 
      equity.volatility30d * 0.35 + 
      (equity.beta - 1.0) * 8 +
      weekendLiquidityPenaltyPct * 5;

    const resilienceScore = Math.max(8, Math.min(95, Math.round(100 - vulnerabilityPoints)));

    let verdict: 'PASSED' | 'FRAGILE' | 'KILL_SWITCH' = 'FRAGILE';
    let verdictReason = '';

    if (resilienceScore >= 70) {
      verdict = 'PASSED';
      verdictReason = `Position exhibits strong structural resilience. Projected drawdown (${projectedDrawdownPct}%) is within expected risk budget.`;
    } else if (resilienceScore >= 42) {
      verdict = 'FRAGILE';
      verdictReason = `High beta (${equity.beta}x) and 7x24 weekend liquidity spreads expose position to severe cascade drawdowns under ${scenario?.name || 'Macro Shock'}. Hedging required.`;
    } else {
      verdict = 'KILL_SWITCH';
      verdictReason = `CRITICAL FRAGILITY: Projected loss of $${projectedLossUsd.toLocaleString()} (-${projectedDrawdownPct}%) exceeds safe risk limits. Deleveraging or aborting trade recommended.`;
    }

    // 7-day Confidence Fan Chart
    const fanChart = [];
    const dailyVol = (equity.volatility30d / 100) / Math.sqrt(252);

    for (let day = 0; day <= 7; day++) {
      const timeFactor = Math.sqrt(Math.max(0.2, day));
      const baselinePrice = Number((equity.price * (1 + (day * 0.0015))).toFixed(2));
      const shockDrop = (projectedDrawdownPct * 0.6) * (day / 7);
      const lowerBand = Number(
        Math.max(5, equity.price * (1 - (shockDrop / 100) - (dailyVol * timeFactor * 0.5))).toFixed(2)
      );
      const upperBand = Number((equity.price * (1 + (dailyVol * timeFactor * 1.1))).toFixed(2));
      const tailDrop = projectedDrawdownPct * Math.min(1.2, 0.4 + (day / 7) * 0.8);
      const tailRiskPrice = Number(Math.max(2, equity.price * (1 - tailDrop / 100)).toFixed(2));

      fanChart.push({
        day,
        label: day === 0 ? 'Entry' : `Day ${day}`,
        baselinePrice,
        upperBand,
        lowerBand,
        tailRiskPrice,
      });
    }

    // AI Multi-Order Reasoning (Qwen 3.8 Max + Groq Fallback)
    const aiReasoning = await generateCascadeReasoning({
      symbol: equity.symbol,
      scenarioName: scenario?.name || 'Macro Guidance Shock',
      scenarioCategory: scenario?.category || 'Tech',
      marketShockPct: scenario?.marketShockPct || -11.8,
      projectedDrawdownPct,
      projectedLossUsd,
      resilienceScore,
      userPositionSize: positionUsd,
      closestAnalog: HISTORICAL_BLACK_SWANS[0].name,
      userThesis,
    });

    return res.json({
      success: true,
      data: {
        symbol: equity.symbol,
        equity,
        scenario,
        shockSeverity: severity,
        userPositionSize: positionUsd,
        projectedPrice,
        projectedLossUsd,
        projectedDrawdownPct,
        resilienceScore,
        verdict,
        verdictReason,
        weekendLiquidityPenaltyPct,
        estimatedSlippageUsd,
        fanChart,
        analogs: HISTORICAL_BLACK_SWANS,
        aiReasoning,
      },
    });
  } catch (error: any) {
    console.error('Stress test error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
