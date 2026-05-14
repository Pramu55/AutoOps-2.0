import type { Request, Response } from 'express';
import { prisma } from '@autoops/database';
import { redis } from '../../lib/redis.js';

type HealthResponse = {
  status: 'ok';
  service: 'api';
  uptime: number;
};

type ReadyCheckStatus = 'ok' | 'error';

type ReadyResponse = {
  status: 'ready' | 'not_ready';
  checks: {
    postgres: ReadyCheckStatus;
    redis: ReadyCheckStatus;
  };
};

export class HealthController {
  health = (_req: Request, res: Response<HealthResponse>): void => {
    res.json({
      status: 'ok',
      service: 'api',
      uptime: process.uptime(),
    });
  };

  ready = async (_req: Request, res: Response<ReadyResponse>): Promise<void> => {
    const checks: ReadyResponse['checks'] = {
      postgres: 'ok',
      redis: 'ok',
    };

    const [postgresResult, redisResult] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);

    if (postgresResult.status === 'rejected') {
      checks.postgres = 'error';
    }

    if (redisResult.status === 'rejected') {
      checks.redis = 'error';
    }

    const isReady = checks.postgres === 'ok' && checks.redis === 'ok';

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      checks,
    });
  };
}

export const healthController = new HealthController();