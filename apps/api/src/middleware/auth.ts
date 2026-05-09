import type { Request, Response, NextFunction } from 'express';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { verifyToken } from '../lib/jwt.js';

const BEARER = /^Bearer\s+(.+)$/i;

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const match = header?.match(BEARER);
  if (!match) {
    throw new UnauthenticatedError('Missing bearer token');
  }
  const payload = verifyToken('access', match[1]!);
  req.auth = {
    userId: payload.sub,
    email: payload.email,
    orgId: payload.orgId,
    role: payload.role,
    token: payload,
  };
  next();
}

/**
 * Role gate — applied AFTER requireAuth.
 * Roles are organization-scoped; expand to per-resource permissions in Phase 2.
 */
export function requireRole(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.role || !allowed.includes(req.auth.role)) {
      throw new UnauthorizedError(`Requires role: ${allowed.join(', ')}`);
    }
    next();
  };
}
