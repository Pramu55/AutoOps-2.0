import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { db } from "@autoops/database";
import { createLogger } from "@autoops/shared";

const logger = createLogger("Worker/Health");

const router: IRouter = Router();

router.get("/", async (_req: Request, res: Response) => {
  const start = Date.now();
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs = 0;

  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
  } catch (err) {
    dbStatus = "error";
    logger.warn("DB health check failed", { error: String(err) });
  }

  const status = dbStatus === "ok" ? "healthy" : "degraded";

  res.status(dbStatus === "ok" ? 200 : 503).json({
    status,
    service: "worker",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: { status: dbStatus, latencyMs: dbLatencyMs },
    },
    responseTimeMs: Date.now() - start,
  });
});

export default router;
