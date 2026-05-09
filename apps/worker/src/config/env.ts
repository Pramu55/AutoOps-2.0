import { z } from 'zod';
import { loadEnv } from '@autoops/utils';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  WORKER_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Concurrency per queue
  DEPLOYMENTS_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  BUILDS_CONCURRENCY: z.coerce.number().int().min(1).default(3),
  AI_CONCURRENCY: z.coerce.number().int().min(1).default(2),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = loadEnv(envSchema);
export const isProd = env.NODE_ENV === 'production';
export const isDev  = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
