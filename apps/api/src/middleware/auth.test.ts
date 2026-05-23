import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const findMembership = vi.fn();
const verifyTokenMock = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    orgMembership: {
      findUnique: findMembership,
    },
  },
}));

vi.mock('../lib/jwt.js', () => ({
  verifyToken: verifyTokenMock,
}));

const { requireAuth } = await import('./auth.js');

function requestWithBearer(): Request {
  return {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer test-token' : undefined),
  } as Request;
}

function runRequireAuth(req: Request): Promise<unknown> {
  return new Promise((resolve) => {
    requireAuth(req, {} as Response, ((err?: unknown) => resolve(err ?? null)) as NextFunction);
  });
}

describe('requireAuth tenant context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyTokenMock.mockReturnValue({
      sub: 'user-1',
      email: 'stale@example.com',
      orgId: 'org-1',
      role: 'VIEWER',
    });
  });

  it('hydrates role and email from live organization membership', async () => {
    findMembership.mockResolvedValue({
      role: 'ADMIN',
      user: {
        email: 'fresh@example.com',
        isActive: true,
        deletedAt: null,
      },
    });
    const req = requestWithBearer();

    const err = await runRequireAuth(req);

    expect(err).toBeNull();
    expect(findMembership).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: 'user-1',
          organizationId: 'org-1',
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
    expect(req.auth).toMatchObject({
      userId: 'user-1',
      email: 'fresh@example.com',
      orgId: 'org-1',
      role: 'ADMIN',
    });
  });

  it('rejects tokens whose org membership no longer exists', async () => {
    findMembership.mockResolvedValue(null);
    const req = requestWithBearer();

    const err = await runRequireAuth(req);

    expect(err).toBeInstanceOf(Error);
    expect(req.auth).toBeUndefined();
  });

  it('rejects tokens without organization context', async () => {
    verifyTokenMock.mockReturnValue({
      sub: 'user-1',
      email: 'user@example.com',
    });
    const req = requestWithBearer();

    const err = await runRequireAuth(req);

    expect(err).toBeInstanceOf(Error);
    expect(findMembership).not.toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });
});
