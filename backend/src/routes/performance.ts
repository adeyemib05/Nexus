import { Router, Request, Response } from 'express';
import { db } from '../state';

const router = Router();

async function snapshotHandler(_req: Request, res: Response) {
  try {
    const snap = db.getLatestPerformance();
    // No mock fallback — null means "no snapshot yet", which is the honest
    // state right after a fresh deploy. The frontend already handles this
    // gracefully with sensible defaults (e.g. $10,000 starting portfolio).
    res.json({ success: true, data: snap, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
}

router.get('/', snapshotHandler);
router.get('/snapshot', snapshotHandler);

router.get('/equity-curve', async (req: Request, res: Response) => {
  try {
    const points = parseInt(req.query.points as string) || 100;
    const curve = db.getEquityCurve(points);
    res.json({ success: true, data: curve, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ success: true, data: db.getPerformanceHistory(limit), timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

export default router;
