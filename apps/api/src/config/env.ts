import { z } from 'zod';
import { loadEnv } from '@autoops/utils';

const PLACEHOLDER_SECRET_PATTERNS = [
  /change-me/i,
  /replace-me/i,
  /please-change/i,
  /local-only/i,
  /autoops_dev/i,
  /^secret$/i,
  /^password$/i,
  /^default$/i,
];

function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  STRICT_ENV_VALIDATION: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean)),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  ARGON2_MEMORY_COST: z.coerce.number().int().min(8192).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production' || !value.STRICT_ENV_VALIDATION) return;

  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (isPlaceholderSecret(value[key])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be a strong non-placeholder value in production`,
      });
    }
  }

  if (value.JWT_SECRET === value.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_REFRESH_SECRET'],
      message: 'JWT_REFRESH_SECRET must be different from JWT_SECRET in production',
    });
  }
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = loadEnv(envSchema);
export const isProd = env.NODE_ENV === 'production';
export const isDev  = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
