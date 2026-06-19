import { Router, Request, Response } from 'express';
import { agent } from '../state';

const router = Router();

router.get('/state', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: agent.getState(), timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.post('/start', async (_req: Request, res: Response) => {
  try {
    agent.start();
    res.json({ success: true, data: { message: 'started', state: agent.getState() }, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.post('/pause', async (_req: Request, res: Response) => {
  try {
    agent.pause();
    res.json({ success: true, data: { message: 'paused', state: agent.getState() }, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

router.get('/regime', async (_req: Request, res: Response) => {
  try {
    const regime = agent.getState().currentRegime;
    if (!regime) {
      return res.status(404).json({ success: false, error: 'No regime yet', timestamp: Date.now() });
    }
    res.json({ success: true, data: regime, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, timestamp: Date.now() });
  }
});

export default router;
