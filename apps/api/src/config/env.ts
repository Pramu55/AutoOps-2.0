import net from 'node:net';
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

const BLOCKED_PUBLIC_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  'host.docker.internal',
]);

function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const first = parts[0]!;
  const second = parts[1]!;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 192 && second === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224 ||
    first === 0
  );
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();
  return normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;
}

function parseHexIpv4MappedTail(value: string): string | null {
  const parts = value.split(':');
  if (parts.length !== 2) return null;
  const high = Number.parseInt(parts[0]!, 16);
  const low = Number.parseInt(parts[1]!, 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join('.');
}

function isBlockedIpv6(hostname: string): boolean {
  if (net.isIP(hostname) !== 6) return false;
  if (hostname === '::' || hostname === '::1') return true;

  const firstHextet = Number.parseInt(hostname.split(':')[0] || '0', 16);
  if ((firstHextet & 0xfe00) === 0xfc00) return true;
  if ((firstHextet & 0xffc0) === 0xfe80) return true;

  if (hostname.startsWith('::ffff:')) {
    const mappedTail = hostname.slice('::ffff:'.length);
    const mappedIpv4 = net.isIP(mappedTail) === 4 ? mappedTail : parseHexIpv4MappedTail(mappedTail);
    if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) return true;
  }

  return false;
}

function isBlockedPublicHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  const ipVersion = net.isIP(normalized);
  return (
    BLOCKED_PUBLIC_HOSTNAMES.has(normalized) ||
    normalized.endsWith('.localhost') ||
    (ipVersion === 4 && isPrivateIpv4(normalized)) ||
    (ipVersion === 6 && isBlockedIpv6(normalized)) ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    (ipVersion === 0 && !normalized.includes('.'))
  );
}

function addIssue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [path],
    message,
  });
}

function validateProductionPublicUrl(ctx: z.RefinementCtx, field: string, value: string): void {
  const url = parseUrl(value);
  if (!url) {
    addIssue(ctx, field, `${field} must be a valid URL in production`);
    return;
  }
  if (url.protocol !== 'https:') {
    addIssue(ctx, field, `${field} must use https in production`);
  }
  if (url.username || url.password) {
    addIssue(ctx, field, `${field} must not include username or password in production`);
  }
  if (isBlockedPublicHostname(url.hostname)) {
    addIssue(ctx, field, `${field} must be an explicit public hostname in production`);
  }
}

function validateProductionCorsOrigin(ctx: z.RefinementCtx, origin: string): void {
  if (origin === '*') {
    addIssue(ctx, 'CORS_ORIGINS', 'CORS_ORIGINS must not include wildcard origins in production');
    return;
  }

  const url = parseUrl(origin);
  if (!url) {
    addIssue(ctx, 'CORS_ORIGINS', 'CORS_ORIGINS contains an invalid origin');
    return;
  }
  if (url.protocol !== 'https:') {
    addIssue(ctx, 'CORS_ORIGINS', 'CORS_ORIGINS origin must use https in production');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    addIssue(ctx, 'CORS_ORIGINS', 'CORS_ORIGINS must contain origins only in production');
  }
  if (isBlockedPublicHostname(url.hostname)) {
    addIssue(ctx, 'CORS_ORIGINS', 'CORS_ORIGINS origin must use a public hostname in production');
  }
}

const envSchema = z
  .object({
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
      .transform((s) =>
        s
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),

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
    OPA_URL: z.string().url().default('http://opa:8181'),
    OPA_POLICY_PATH: z.string().default('/v1/data/autoops/operation/decision'),
    OPA_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2500),
    OPA_ENFORCEMENT_MODE: z.enum(['shadow', 'enforce']).default('shadow'),

    JENKINS_ALLOWED_JOBS: z
      .string()
      .default('')
      .transform((s) =>
        s
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),

    POLICY_KUBERNETES_PROTECTED_NAMESPACES: z
      .string()
      .default('kube-system,kube-public,kube-node-lease')
      .transform((s) =>
        s
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),

    POLICY_KUBERNETES_SCALE_APPROVAL_THRESHOLD: z.coerce.number().int().min(0).default(2),

    ARGOCD_URL: z.string().trim().optional().default(''),
    ARGOCD_AUTH_TOKEN: z.string().trim().optional().default(''),
    ARGOCD_USERNAME: z.string().trim().optional().default(''),
    ARGOCD_PASSWORD: z.string().trim().optional().default(''),
    ARGOCD_SKIP_TLS_VERIFY: z
      .string()
      .optional()
      .default('false')
      .transform((value) => value === 'true' || value === '1'),
    ARGOCD_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5000),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (!value.STRICT_ENV_VALIDATION) {
      addIssue(ctx, 'STRICT_ENV_VALIDATION', 'STRICT_ENV_VALIDATION must be true in production');
    }

    validateProductionPublicUrl(ctx, 'API_PUBLIC_URL', value.API_PUBLIC_URL);

    if (value.CORS_ORIGINS.length === 0) {
      addIssue(ctx, 'CORS_ORIGINS', 'CORS_ORIGINS must contain at least one origin in production');
    } else {
      for (const origin of value.CORS_ORIGINS) {
        validateProductionCorsOrigin(ctx, origin);
      }
    }

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
export function parseEnv(input: NodeJS.ProcessEnv): Env {
  return envSchema.parse(input);
}
export const env: Env = loadEnv(envSchema);
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
