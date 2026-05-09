import express, { type Application } from "express";
import { createLogger } from "@autoops/shared";
import healthRouter from "./http/health.js";

const logger = createLogger("Worker/Server");

const HEALTH_PORT = parseInt(process.env["WORKER_HEALTH_PORT"] ?? "3002", 10);

export function createHealthServer(): Application {
  const app = express();
  app.use(express.json());

  // Worker health endpoint — used by Kubernetes liveness/readiness probes
  // and by the main API's service health aggregation
  app.use("/health", healthRouter);

  app.get("/", (_req, res) => {
    res.json({ service: "autoops-worker", version: "2.0.0", status: "running" });
  });

  return app;
}

export function startHealthServer(): void {
  const app = createHealthServer();

  app.listen(HEALTH_PORT, () => {
    logger.info("Worker health server listening", { port: HEALTH_PORT });
  });
}
