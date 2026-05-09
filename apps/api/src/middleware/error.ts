import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError, ValidationError } from '@autoops/utils';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  let normalized: AppError;

  if (err instanceof ZodError) {
    normalized = new ValidationError('Request validation failed', err.flatten());
  } else if (isAppError(err)) {
    normalized = err;
  } else {
    normalized = new AppError({
      code: 'INTERNAL',
      statusCode: 500,
      message: 'An unexpected error occurred',
      cause: err,
    });
  }

  const isServerError = normalized.statusCode >= 500;
  if (isServerError) {
    req.log.error({ err: normalized, cause: normalized.cause }, normalized.message);
  } else {
    req.log.warn({ code: normalized.code, status: normalized.statusCode }, normalized.message);
  }

  res.status(normalized.statusCode).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
      ...(isProd || !isServerError ? {} : { stack: (normalized.stack ?? '').split('\n').slice(0, 5) }),
    },
  });
};
