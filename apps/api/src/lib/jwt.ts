import jwt, { type SignOptions, type JwtPayload as JwtRawPayload } from 'jsonwebtoken';
import type { JwtPayload } from '@autoops/types';
import { UnauthenticatedError } from '@autoops/utils';
import { env } from '../config/env.js';
import { getJwtSecret } from '../config/application-secrets.js';

type TokenKind = 'access' | 'refresh';

const ttls: Record<TokenKind, SignOptions['expiresIn']> = {
  access: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  refresh: env.JWT_REFRESH_TTL as SignOptions['expiresIn'],
};

export function signToken(kind: TokenKind, payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(kind).revealForUse(), {
    expiresIn: ttls[kind],
    issuer: 'autoops-api',
    audience: 'autoops',
  });
}

export function verifyToken(kind: TokenKind, token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret(kind).revealForUse(), {
      issuer: 'autoops-api',
      audience: 'autoops',
    }) as JwtRawPayload;
    if (typeof decoded === 'string' || !decoded.sub) {
      throw new UnauthenticatedError('Invalid token payload');
    }
    return decoded as JwtPayload;
  } catch (err) {
    if (err instanceof UnauthenticatedError) throw err;
    throw new UnauthenticatedError('Invalid or expired token');
  }
}
