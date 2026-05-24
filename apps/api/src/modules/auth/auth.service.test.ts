import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

const transactionMock = {
  user: {
    create: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  orgMembership: {
    create: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
  },
};

const hashPasswordMock = vi.fn();
const verifyPasswordMock = vi.fn();
const signTokenMock = vi.fn();

vi.mock('@autoops/database', () => ({
  OrgRole: {
    OWNER: 'OWNER',
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER',
    VIEWER: 'VIEWER',
  },
  prisma: prismaMock,
}));

vi.mock('@autoops/utils', () => ({
  ConflictError: class ConflictError extends Error {},
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  newId: () => 'mock-new-id',
  newToken: () => 'mock-refresh-id',
  slugify: (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
}));

vi.mock('../../lib/password.js', () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
}));

vi.mock('../../lib/jwt.js', () => ({
  signToken: signTokenMock,
  verifyToken: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({
  env: {
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
  },
}));

const { authService } = await import('./auth.service.js');

describe('AuthService tenant onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashPasswordMock.mockResolvedValue('hashed-password');
    verifyPasswordMock.mockResolvedValue(true);
    signTokenMock.mockImplementation((type: string, payload: { orgId?: string }) => `${type}:${payload.orgId ?? 'none'}`);
    prismaMock.$transaction.mockImplementation(async (handler: (tx: typeof transactionMock) => unknown) =>
      handler(transactionMock),
    );
    prismaMock.refreshToken.create.mockResolvedValue({});
    transactionMock.refreshToken.create.mockResolvedValue({});
  });

  it('registers a new user into a newly created organization instead of the demo organization', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    transactionMock.user.create.mockResolvedValue({
      id: 'user-new',
      email: 'newuser.local@autoops.dev',
      name: 'New User',
      avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    transactionMock.organization.findUnique.mockResolvedValue(null);
    transactionMock.organization.create.mockResolvedValue({
      id: 'org-new',
      name: 'New User Workspace',
      slug: 'new-user-workspace',
    });
    transactionMock.orgMembership.create.mockResolvedValue({});

    const session = await authService.register({
      name: 'New User',
      email: 'newuser.local@autoops.dev',
      password: 'StrongPass123!',
      organizationName: 'New User Workspace',
    });

    expect(transactionMock.organization.create).toHaveBeenCalledWith({
      data: {
        name: 'New User Workspace',
        slug: 'new-user-workspace',
      },
    });
    expect(transactionMock.orgMembership.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-new',
        organizationId: 'org-new',
        role: 'OWNER',
      },
    });
    expect(session.organizations).toEqual([
      {
        id: 'org-new',
        name: 'New User Workspace',
        slug: 'new-user-workspace',
        role: 'OWNER',
      },
    ]);
    expect(session.organizations[0]?.slug).not.toBe('autoops-demo');
    expect(session.tokens.accessToken).toBe('access:org-new');
  });

  it('issues login tokens for the user membership organization, not a global fallback', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-new',
      email: 'newuser.local@autoops.dev',
      name: 'New User',
      passwordHash: 'hashed-password',
      avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      isActive: true,
      memberships: [
        {
          organizationId: 'org-new',
          role: 'OWNER',
          organization: {
            id: 'org-new',
            name: 'New User Workspace',
            slug: 'new-user-workspace',
          },
        },
      ],
    });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});

    const session = await authService.login({
      email: 'newuser.local@autoops.dev',
      password: 'StrongPass123!',
    });

    expect(session.organizations).toEqual([
      {
        id: 'org-new',
        name: 'New User Workspace',
        slug: 'new-user-workspace',
        role: 'OWNER',
      },
    ]);
    expect(session.tokens.accessToken).toBe('access:org-new');
    expect(signTokenMock).toHaveBeenCalledWith(
      'access',
      expect.objectContaining({
        sub: 'user-new',
        orgId: 'org-new',
        role: 'OWNER',
      }),
    );
  });
});
