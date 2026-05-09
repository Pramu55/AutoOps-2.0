import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@autoops/database";
import { UnauthorizedError, NotFoundError } from "@autoops/shared";
import { config } from "@/config/index.js";

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: { id: string; email: string; name: string | null; role: string }; tokens: AuthTokens }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  if (!user) {
    // Constant-time rejection: still run a dummy compare so timing is uniform
    await bcrypt.compare(password, "$2b$10$invalidhashpadding000000000000000000000000000000000000");
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Update last login timestamp (fire-and-forget, don't block response)
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => null);

  const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
  const expiresIn = 60 * 60 * 24 * 7; // 7 days in seconds

  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn,
    issuer: "autoops",
    audience: "autoops-web",
  });

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens: { accessToken, expiresIn },
  };
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwt.secret, {
      issuer: "autoops",
      audience: "autoops-web",
    }) as TokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Token expired — please sign in again");
    }
    throw new UnauthorizedError("Invalid token");
  }
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (!user) throw new NotFoundError("User", userId);
  return user;
}
