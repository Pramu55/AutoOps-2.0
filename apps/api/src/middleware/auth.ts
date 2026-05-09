import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "@autoops/shared";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    next(new UnauthorizedError("Missing or invalid authorization header"));
    return;
  }

  const token = authHeader.slice(7);

  if (!token) {
    next(new UnauthorizedError("Missing token"));
    return;
  }

  // In a real implementation, verify the JWT token here
  // For now, we'll decode a simple payload
  try {
    // Placeholder: assume token is a base64-encoded JSON for dev
    const payload = JSON.parse(Buffer.from(token, "base64").toString("utf-8")) as {
      userId: string;
      role: string;
    };
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch {
    next(new UnauthorizedError("Invalid token"));
  }
}

export function requireRole(...roles: string[]) {
  return function (req: AuthRequest, _res: Response, next: NextFunction): void {
    if (!req.userRole) {
      next(new UnauthorizedError("Not authenticated"));
      return;
    }
    if (!roles.includes(req.userRole)) {
      next(new UnauthorizedError("Insufficient permissions"));
      return;
    }
    next();
  };
}
