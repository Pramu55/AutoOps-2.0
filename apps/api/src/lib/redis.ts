import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/** Primary connection used for cache, lookups, and rate-limiter store. */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('connect', () => logger.info('[redis] connected'));
redis.on('error', (err) => logger.error({ err }, '[redis] error'));
redis.on('close', () => logger.warn('[redis] connection closed'));

/** Subscriber connection — required by Socket.IO Redis adapter and pub/sub fan-out. */
export const redisSubscriber = redis.duplicate();
/** Publisher connection — separate from cache to avoid blocking on pub/sub. */
export const redisPublisher = redis.duplicate();

export async function disconnectRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), redisSubscriber.quit(), redisPublisher.quit()]);
}
