/**
 * Domain-typed error hierarchy. Every API thrown error must be an AppError or subclass.
 * The error middleware in apps/api maps these to HTTP responses.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly isOperational: boolean = true;

  constructor(opts: {
    code: ErrorCode;
    statusCode: number;
    message: string;
    details?: unknown;
    cause?: unknown;
  }) {
    super(opts.message, opts.cause ? { cause: opts.cause as Error } : undefined);
    this.name = this.constructor.name;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    if (opts.details !== undefined) {
      this.details = opts.details;
    }
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ code: 'VALIDATION_FAILED', statusCode: 400, message, details });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super({ code: 'UNAUTHENTICATED', statusCode: 401, message });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super({ code: 'UNAUTHORIZED', statusCode: 403, message });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super({ code: 'NOT_FOUND', statusCode: 404, message: `${resource} not found` });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ code: 'CONFLICT', statusCode: 409, message, details });
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super({
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'Rate limit exceeded',
      details: retryAfterSeconds ? { retryAfterSeconds } : undefined,
    });
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ code: 'BAD_REQUEST', statusCode: 400, message, details });
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, cause?: unknown) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      statusCode: 502,
      message: `${service}: ${message}`,
      cause,
    });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
