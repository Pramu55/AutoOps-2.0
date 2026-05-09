import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { httpLogger } from './middleware/http-logger.js';
import { globalRateLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { healthRouter } from './modules/health/health.routes.js';
import { v1Router } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Trust proxy when behind Nginx — required for accurate req.ip and rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security baseline
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Observability
  app.use(requestIdMiddleware);
  app.use(httpLogger);

  // Health & metrics — outside the rate limiter and outside /api/v1.
  app.use(healthRouter);

  // Rate-limited API surface
  app.use('/api/v1', globalRateLimiter, v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
