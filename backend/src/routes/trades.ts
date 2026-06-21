import { Router, Request, Response } from 'express';
import { db } from '../state';
import { generateMockTrade } from '../services/mockData';
import type { TradeStatus, Trade } from '../types';

const router = Router();

// NOTE: /open and /stats must stay registered before /:id, otherwise
// Express would treat "open" or "stats" as a trade id.

router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const status = (req.query.status as string) || 'all';

    let trades = db.getTrades(limit);
    if (status !== 'all') {
      trades = trades.filter((t) => t.status === (status as TradeStatus));
    }
    if (trades.length === 0) {
      trades = Array.from({ length: 5 }, (_, i) => generateMockTrade(i));
    }
    res.json({ success: true, data: trades, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.get('/open', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: db.getOpenTrades(), timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const trades = db.getTrades(1000).filter((t) => t.status === 'closed');

    if (trades.length === 0) {
      return res.json({
        success: true,
        data: {
          totalTrades: 0,
          winRate: 0,
          avgWinPct: 0,
          avgLossPct: 0,
          profitFactor: 0,
          bestTrade: null,
          worstTrade: null,
          strategyBreakdown: {},
        },
        timestamp: Date.now(),
      });
    }

    const winners = trades.filter((t) => (t.pnl || 0) > 0);
    const losers = trades.filter((t) => (t.pnl || 0) < 0);
    const winRate = winners.length / trades.length;
    const avgWinPct = winners.length > 0 ? winners.reduce((s, t) => s + (t.pnlPct || 0), 0) / winners.length : 0;
    const avgLossPct = losers.length > 0 ? losers.reduce((s, t) => s + (t.pnlPct || 0), 0) / losers.length : 0;
    const grossWin = winners.reduce((s, t) => s + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losers.reduce((s, t) => s + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;

    const bestTrade = trades.reduce((best, t) => ((t.pnl || 0) > (best.pnl || -Infinity) ? t : best), trades[0]);
    const worstTrade = trades.reduce((worst, t) => ((t.pnl || 0) < (worst.pnl || Infinity) ? t : worst), trades[0]);

    const strategyBreakdown: Record<string, { count: number; winRate: number; avgPnl: number }> = {};
    const grouped: Record<string, Trade[]> = {};
    for (const t of trades) {
      if (!grouped[t.strategy]) grouped[t.strategy] = [];
      grouped[t.strategy].push(t);
    }
    for (const strategy of Object.keys(grouped)) {
      const strategyTrades = grouped[strategy];
      const strategyWinners = strategyTrades.filter((t) => (t.pnl || 0) > 0);
      strategyBreakdown[strategy] = {
        count: strategyTrades.length,
        winRate: strategyWinners.length / strategyTrades.length,
        avgPnl: strategyTrades.reduce((s, t) => s + (t.pnl || 0), 0) / strategyTrades.length,
      };
    }

    res.json({
      success: true,
      data: { totalTrades: trades.length, winRate, avgWinPct, avgLossPct, profitFactor, bestTrade, worstTrade, strategyBreakdown },
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const trade = db.getTradeById(req.params.id);
    if (!trade) {
      return res.status(404).json({ success: false, error: 'Trade not found', timestamp: Date.now() });
    }
    res.json({ success: true, data: trade, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

export default router;
