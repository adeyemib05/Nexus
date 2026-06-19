import { Router, Request, Response } from 'express';
import { db } from '../state';

const router = Router();

// Matches frontend/src/lib/api.ts -> getCurrentRegime() -> GET /api/regime/current
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const regime = db.getRegimeHistory(1)[0];
    if (!regime) {
      return res.status(404).json({ success: false, error: 'No regime yet', timestamp: Date.now() });
    }
    res.json({ success: true, data: regime, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

// Matches frontend/src/lib/api.ts -> getRegimeHistory() -> GET /api/regime/history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ success: true, data: db.getRegimeHistory(limit), timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

export default router;
