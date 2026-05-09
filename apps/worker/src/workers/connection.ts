import { Redis } from "ioredis";
import { config } from "@/config/index.js";
import { createLogger } from "@autoops/shared";

const logger = createLogger("Redis");

export const redisConnection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redisConnection.on("connect", () => {
  logger.info("Redis connected");
});

redisConnection.on("error", (err) => {
  logger.error("Redis connection error", { error: err.message });
});

redisConnection.on("close", () => {
  logger.warn("Redis connection closed");
});
