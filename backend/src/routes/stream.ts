import { Router, Request, Response } from 'express';
import { agent, db } from '../state';

const router = Router();

router.get('/events', (req: Request, res: Response) => {
  // Headers must be set in this exact order, with no middleware buffering,
  // for SSE to actually stream through proxies like Railway's.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (type: string, data: unknown) => {
    try {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    } catch {
      // Client likely disconnected mid-write — safe to ignore
    }
  };

  // Send current state immediately on connect
  sendEvent('connected', { timestamp: Date.now() });
  sendEvent('agent_state', agent.getState());

  const regime = db.getRegimeHistory(1)[0];
  if (regime) sendEvent('regime_updated', regime);
  sendEvent('trades', db.getTrades(20));
  sendEvent('performance', db.getLatestPerformance());

  // Subscribe to live agent events
  const unsub = agent.subscribe((event) => sendEvent(event.type, event.data));

  // Heartbeat keeps the connection alive through Railway/Vercel proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch {
      // ignore
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsub();
  });
});

export default router;
