import { Router, Request, Response } from 'express';
import { db } from '../state';
import { generateMockPerformance, generateMockEquityCurve } from '../services/mockData';

const router = Router();

async function snapshotHandler(_req: Request, res: Response) {
  try {
    const snap = db.getLatestPerformance();
    res.json({ success: true, data: snap || generateMockPerformance(), timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
}

// Supports both bare /api/performance (used by the frontend client) and
// /api/performance/snapshot (used by the hackathon spec's verification curl).
router.get('/', snapshotHandler);
router.get('/snapshot', snapshotHandler);

router.get('/equity-curve', async (req: Request, res: Response) => {
  try {
    const points = parseInt(req.query.points as string) || 100;
    const curve = db.getEquityCurve(points);
    res.json({ success: true, data: curve.length < 5 ? generateMockEquityCurve(100) : curve, timestamp: Date.now() });
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
