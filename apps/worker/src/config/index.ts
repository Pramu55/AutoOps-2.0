import "dotenv/config";

export const config = {
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  redis: {
    url: process.env["REDIS_URL"] ?? "redis://localhost:6379",
    host: process.env["REDIS_HOST"] ?? "localhost",
    port: parseInt(process.env["REDIS_PORT"] ?? "6379", 10),
    password: process.env["REDIS_PASSWORD"],
  },
  database: {
    url: process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/autoops",
  },
  worker: {
    concurrency: parseInt(process.env["WORKER_CONCURRENCY"] ?? "5", 10),
    maxRetries: parseInt(process.env["WORKER_MAX_RETRIES"] ?? "3", 10),
    backoffMs: parseInt(process.env["WORKER_BACKOFF_MS"] ?? "5000", 10),
  },
  isProduction: process.env["NODE_ENV"] === "production",
  isDevelopment: process.env["NODE_ENV"] === "development",
} as const;
