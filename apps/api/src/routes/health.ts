import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { prisma } from "@autoops/database";

const router: IRouter = Router();

router.get("/", async (_req: Request, res: Response) => {
  const startTime = Date.now();

  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs = 0;

  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "healthy" : "degraded";
  const httpStatus = status === "healthy" ? 200 : 503;

  res.status(httpStatus).json({
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env["npm_package_version"] ?? "0.0.1",
    services: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
    },
    responseTimeMs: Date.now() - startTime,
  });
});

export default router;
