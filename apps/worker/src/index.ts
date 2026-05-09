import { createLogger } from "@autoops/shared";
import { prisma } from "@autoops/database";
import { createWorkers } from "@/workers/index.js";
import { redisConnection } from "@/workers/connection.js";
import { config } from "@/config/index.js";

const logger = createLogger("Worker");

async function main() {
  logger.info("Starting AutoOps Worker", {
    env: config.nodeEnv,
    concurrency: config.worker.concurrency,
  });

  await redisConnection.connect();
  logger.info("Redis connection established");

  const workers = createWorkers();

  logger.info("AutoOps Worker started successfully");

  async function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    await Promise.all([
      workers.incidentWorker.close(),
      workers.workflowWorker.close(),
      workers.alertWorker.close(),
    ]);

    logger.info("All workers closed");

    await redisConnection.quit();
    logger.info("Redis connection closed");

    await prisma.$disconnect();
    logger.info("Database connection closed");

    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: String(reason) });
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
