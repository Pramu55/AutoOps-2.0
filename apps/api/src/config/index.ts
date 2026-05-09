import "dotenv/config";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  port: parseInt(process.env["PORT"] ?? "3001", 10),
  apiPrefix: "/api/v1",
  cors: {
    origins: (process.env["CORS_ORIGINS"] ?? "http://localhost:3000").split(","),
  },
  database: {
    url: process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/autoops",
  },
  redis: {
    url: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  },
  jwt: {
    secret: process.env["JWT_SECRET"] ?? "dev-secret-change-in-production",
    expiresIn: process.env["JWT_EXPIRES_IN"] ?? "7d",
  },
  isProduction: process.env["NODE_ENV"] === "production",
  isDevelopment: process.env["NODE_ENV"] === "development",
} as const;
