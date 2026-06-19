import { Router, Request, Response } from 'express';
import { db, bitgetREST, bitgetWS } from '../state';
import { generateMockSignals, generateMockTicker } from '../services/mockData';

const router = Router();
let lastRefreshAt = 0;

async function currentSignalsHandler(_req: Request, res: Response) {
  try {
    const regime = db.getRegimeHistory(1)[0];
    const signals = regime?.signals || generateMockSignals();
    res.json({ success: true, data: signals, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
}

// Supports both bare /api/signals (used by the frontend client) and
// /api/signals/current (used by the hackathon spec's verification curl).
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
    // The agent cycle handles regime computation automatically on its own
    // timer; this endpoint just returns whatever the most recent cycle produced.
    const regime = db.getRegimeHistory(1)[0];
    res.json({ success: true, data: regime || { message: 'Cycle pending' }, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

export default router;
