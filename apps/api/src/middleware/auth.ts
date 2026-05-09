import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "@autoops/shared";
import { verifyToken } from "@/services/authService.js";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  userEmail?: string;
}

export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  const cookieToken = (req.cookies as Record<string, string | undefined>)?.["autoops_token"];
  const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const token = cookieToken ?? headerToken;

  if (!token) {
    next(new UnauthorizedError("Authentication required"));
    return;
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.userRole = payload.role;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    next(err);
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
