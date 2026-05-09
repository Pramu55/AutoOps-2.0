import type { Request, Response, NextFunction } from "express";
import { isAppError, logger } from "@autoops/shared";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (isAppError(err)) {
    logger.warn("Operational error", {
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
    });

    res.status(err.statusCode).json({
      success: false,
      error: err.code,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  logger.error("Unexpected error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
    timestamp: new Date().toISOString(),
  });
}
