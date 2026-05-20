import { pino, type Logger as PinoLogger, type LoggerOptions } from 'pino';

export type Logger = PinoLogger;

export interface CreateLoggerOptions {
  service: string;
  level?: string;
  prettyPrint?: boolean;
  /** Extra fields included on every log line. */
  bindings?: Record<string, unknown>;
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.Authorization',
  'headers.cookie',
  'authorization',
  'Authorization',
  'cookie',
  'session',
  'credential',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.apiKey',
  '*.api_key',
  '*.apikey',
  '*.access_key',
  '*.private_key',
  '*.secret',
  '*.authorization',
  '*.cookie',
  '*.session',
  '*.credential',
  '*.kubeconfig',
  '*.KUBECONFIG',
  '*.DATABASE_URL',
  '*.REDIS_URL',
  '*.JENKINS_API_TOKEN',
  '*.JWT_SECRET',
  '*.JWT_REFRESH_SECRET',
];

export function createLogger(options: CreateLoggerOptions): Logger {
  const level = options.level ?? process.env.LOG_LEVEL ?? 'info';
  const isProd = process.env.NODE_ENV === 'production';
  const usePretty = options.prettyPrint ?? !isProd;

  const config: LoggerOptions = {
    level,
    base: {
      service: options.service,
      env: process.env.NODE_ENV ?? 'development',
      ...options.bindings,
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  if (usePretty) {
    return pino({
      ...config,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,env,service',
          messageFormat: '[{service}] {msg}',
        },
      },
    });
  }

  return pino(config);
}

/**
 * Wraps a base logger with a per-request child carrying correlation ids.
 */
export function withRequestContext(
  base: Logger,
  context: { requestId: string; userId?: string; orgId?: string },
): Logger {
  return base.child(context);
}
