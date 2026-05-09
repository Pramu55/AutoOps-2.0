import { createHash } from 'node:crypto';
import { prisma, OrgRole } from '@autoops/database';
import {
  ConflictError,
  UnauthenticatedError,
  newId,
  newToken,
  slugify,
} from '@autoops/utils';
import type {
  RegisterInput,
  LoginInput,
  AuthSession,
  PublicUser,
  AuthTokens,
  JwtPayload,
} from '@autoops/types';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken, verifyToken } from '../lib/jwt.js';
import { env } from '../config/env.js';
import ms from 'ms';

const ACCESS_TTL_SEC = Math.floor(ms(env.JWT_ACCESS_TTL) / 1000);
const REFRESH_TTL_MS = ms(env.JWT_REFRESH_TTL);

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

export class AuthService {
  async register(input: RegisterInput): Promise<AuthSession> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
        },
      });

      const orgName = input.organizationName ?? `${input.name}'s Workspace`;
      const baseSlug = slugify(orgName) || `org-${newId().slice(0, 8)}`;
      let slug = baseSlug;
      let suffix = 0;
      // Ensure uniqueness — slug column is @unique.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const exists = await tx.organization.findUnique({ where: { slug } });
        if (!exists) break;
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }

      const org = await tx.organization.create({ data: { name: orgName, slug } });
      await tx.orgMembership.create({
        data: { userId: user.id, organizationId: org.id, role: OrgRole.OWNER },
      });

      const tokens = await this._issueTokens(user.id, user.email, org.id, OrgRole.OWNER);

      return {
        user: this._toPublic(user),
        tokens,
        organizations: [{ id: org.id, name: org.name, slug: org.slug, role: OrgRole.OWNER }],
      };
    });
  }

  async login(input: LoginInput, ctx?: { userAgent?: string; ip?: string }): Promise<AuthSession> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: { include: { organization: true } },
      },
    });

    if (!user || !user.isActive) throw new UnauthenticatedError('Invalid credentials');
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) throw new UnauthenticatedError('Invalid credentials');

    const primaryMembership = user.memberships[0];
    const tokens = await this._issueTokens(
      user.id,
      user.email,
      primaryMembership?.organizationId,
      primaryMembership?.role,
      ctx,
    );

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return {
      user: this._toPublic(user),
      tokens,
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  async refresh(refreshToken: string, ctx?: { userAgent?: string; ip?: string }): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = verifyToken('refresh', refreshToken);
    } catch {
      throw new UnauthenticatedError('Invalid refresh token');
    }

    const tokenHash = sha256(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      throw new UnauthenticatedError('Refresh token revoked or expired');
    }

    const tokens = await this._issueTokens(payload.sub, payload.email, payload.orgId, payload.role, ctx);
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedBy: sha256(tokens.refreshToken) },
    });
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = sha256(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async _issueTokens(
    userId: string,
    email: string,
    orgId?: string,
    role?: string,
    ctx?: { userAgent?: string; ip?: string },
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, orgId, role };
    const accessToken = signToken('access', payload);
    const refreshTokenRaw = newToken(48);
    const refreshToken = signToken('refresh', { ...payload, jti: refreshTokenRaw } as JwtPayload & { jti: string });

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        userAgent: ctx?.userAgent ?? null,
        ipAddress: ctx?.ip ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC };
  }

  private _toPublic(user: { id: string; email: string; name: string; avatarUrl: string | null; createdAt: Date }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

export const authService = new AuthService();
