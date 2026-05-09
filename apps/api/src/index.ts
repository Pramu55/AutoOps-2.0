import { createApp } from "@/app.js";
import { config } from "@/config/index.js";
import { createLogger } from "@autoops/shared";
import { prisma } from "@autoops/database";

const logger = createLogger("API");

async function main() {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info("AutoOps API server started", {
      port: config.port,
      env: config.nodeEnv,
      prefix: config.apiPrefix,
    });
  });

  async function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      logger.info("HTTP server closed");
      await prisma.$disconnect();
      logger.info("Database connection closed");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30_000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", {
      reason: String(reason),
    });
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
