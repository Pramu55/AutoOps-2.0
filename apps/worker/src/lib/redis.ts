import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    _redis.on('connect', () => logger.info('Redis connected'));
    _redis.on('error', (err: Error) => logger.error({ err }, 'Redis error'));
    _redis.on('close', () => logger.warn('Redis connection closed'));
  }

  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

/** Dedicated connection for BullMQ. Must have maxRetriesPerRequest: null. */
export function createBullConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
