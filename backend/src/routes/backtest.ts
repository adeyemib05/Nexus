import { Router, Request, Response } from 'express';
import { BacktestEngine } from '../backtest/backtestEngine';
import { db, bitgetREST } from '../state';

const router = Router();

router.post('/run', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const params = {
      symbol: body.symbol || 'BTCUSDT',
      granularity: body.granularity || '1H',
      days: Math.min(parseInt(body.days) || 30, 90),
    };
    const engine = new BacktestEngine(bitgetREST, db);
    const result = await engine.run(params);
    res.json({ success: true, data: result, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.get('/results', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    // No mock fallback — an empty list just means no backtest has been run
    // yet, which is the honest state.
    const results = db.getBacktestResults(limit);
    res.json({ success: true, data: results, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.get('/results/:id', async (req: Request, res: Response) => {
  try {
    const result = db.getBacktestById(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Backtest result not found', timestamp: Date.now() });
    }
    res.json({ success: true, data: result, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

export default router;
