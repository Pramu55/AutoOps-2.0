import { Router, type Request, type Response } from 'express';
import { prisma } from '@autoops/database';
import { redis } from '../lib/redis.js';
import { registry } from '../lib/metrics.js';

export const healthRouter: Router = Router();

healthRouter.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

healthRouter.get('/readyz', async (_req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'fail'> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'fail';
  }
  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'fail';
  } catch {
    checks.redis = 'fail';
  }
  const ready = Object.values(checks).every((v) => v === 'ok');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
});

healthRouter.get('/metrics', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
