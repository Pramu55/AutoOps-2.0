import type { Request, Response, NextFunction } from 'express';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { prisma } from '@autoops/database';
import { verifyToken } from '../lib/jwt.js';

const BEARER = /^Bearer\s+(.+)$/i;

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  void authenticate(req).then(() => next()).catch(next);
}

async function authenticate(req: Request): Promise<void> {
  const header = req.header('authorization');
  const match = header?.match(BEARER);
  if (!match) {
    throw new UnauthenticatedError('Missing bearer token');
  }

  const payload = verifyToken('access', match[1]!);
  if (!payload.orgId) {
    throw new UnauthorizedError('Organization context is required');
  }

  const membership = await prisma.orgMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: payload.sub,
        organizationId: payload.orgId,
      },
    },
    select: {
      role: true,
      user: {
        select: {
          email: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!membership || !membership.user.isActive || membership.user.deletedAt) {
    throw new UnauthorizedError('Organization membership is required');
  }

  req.auth = {
    userId: payload.sub,
    email: membership.user.email,
    orgId: payload.orgId,
    role: membership.role,
    token: {
      ...payload,
      email: membership.user.email,
      role: membership.role,
    },
  };
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
