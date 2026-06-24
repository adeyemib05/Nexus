import { Router, Request, Response } from 'express';
import { db, bitgetREST, bitgetWS } from '../state';
import { generateMockTicker } from '../services/mockData';

const router = Router();
let lastRefreshAt = 0;

async function currentSignalsHandler(_req: Request, res: Response) {
  try {
    const regime = db.getRegimeHistory(1)[0];
    // No mock fallback here — an empty array for the first few seconds after
    // boot (before cycle #1 finishes) is the honest state, and the frontend
    // already shows a clean loading skeleton for it.
    res.json({ success: true, data: regime?.signals ?? [], timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
}

router.get('/', currentSignalsHandler);
router.get('/current', currentSignalsHandler);

router.get('/regime-history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ success: true, data: db.getRegimeHistory(limit), timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.get('/ticker', async (_req: Request, res: Response) => {
  try {
    let ticker = bitgetWS?.getLastTicker() ?? null;
    if (!ticker) {
      try {
        ticker = await bitgetREST.getTicker('BTCUSDT');
      } catch {
        // fall through to mock below
      }
    }
    // Ticker price is the one place a mock fallback is still fine — it's
    // clearly never presented as a trade or performance figure, just a
    // placeholder price label for a few seconds before the real feed connects.
    if (!ticker) ticker = generateMockTicker('BTCUSDT');
    res.json({ success: true, data: ticker, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    if (Date.now() - lastRefreshAt < 10000) {
      return res
        .status(429)
        .json({ success: false, error: 'Rate limited — try again in a few seconds', timestamp: Date.now() });
    }
    lastRefreshAt = Date.now();
    const regime = db.getRegimeHistory(1)[0];
    res.json({ success: true, data: regime || { message: 'Cycle pending' }, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

export default router;
