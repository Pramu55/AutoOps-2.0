import http from 'node:http';
import { prisma as db } from '@autoops/database';
import { getRedis } from '../lib/redis.js';
import { registry } from '../lib/metrics.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);

  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });

  res.end(payload);
}

async function handleLiveness(res: http.ServerResponse): Promise<void> {
  send(res, 200, {
    status: 'ok',
    service: 'autoops-worker',
  });
}

async function handleReadiness(res: http.ServerResponse): Promise<void> {
  const checks: Record<string, 'ok' | 'error'> = {
    db: 'ok',
    redis: 'ok',
  };

  const [dbResult, redisResult] = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    getRedis().ping(),
  ]);

  if (dbResult.status === 'rejected') {
    checks.db = 'error';
  }

  if (redisResult.status === 'rejected') {
    checks.redis = 'error';
  }

  const ok = checks.db === 'ok' && checks.redis === 'ok';

  send(res, ok ? 200 : 503, {
    status: ok ? 'ok' : 'degraded',
    checks,
  });
}

async function handleMetrics(res: http.ServerResponse): Promise<void> {
  const metrics = await registry.metrics();

  res.writeHead(200, {
    'Content-Type': registry.contentType,
  });

  res.end(metrics);
}

export function createHealthServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url ?? '/';

      if (url === '/healthz') {
        await handleLiveness(res);
        return;
      }

      if (url === '/readyz') {
        await handleReadiness(res);
        return;
      }

      if (url === '/metrics') {
        await handleMetrics(res);
        return;
      }

      send(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error({ err }, 'Health server error');
      send(res, 500, { error: 'Internal error' });
    }
  });

  server.listen(env.WORKER_PORT, env.WORKER_HOST, () => {
    logger.info(`Worker health server listening on ${env.WORKER_HOST}:${env.WORKER_PORT}`);
  });

  return server;
}
