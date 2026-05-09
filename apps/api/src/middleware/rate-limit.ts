import rateLimit, { type Options } from 'express-rate-limit';
import RedisStore, { type RedisReply } from 'rate-limit-redis';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';

function buildLimiter(name: string, overrides: Partial<Options> = {}): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${req.ip ?? 'unknown'}`,
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args) as Promise<RedisReply>,
      prefix: `rl:${name}:`,
    }),
    ...overrides,
  });
}

/** Default global limiter — generous, applied to /api/*. */
export const globalRateLimiter = buildLimiter('global');

/** Tight limiter for auth endpoints to slow credential stuffing. */
export const authRateLimiter = buildLimiter('auth', { windowMs: 60_000, limit: 10 });
