import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { config } from "@/config/index.js";
import router from "@/routes/index.js";
import { errorHandler } from "@/middleware/errorHandler.js";

export function createApp(): Application {
  const app = express();

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, Postman)
        if (!origin) return callback(null, true);
        const allowed = config.cors.origins;
        if (allowed.includes(origin) || allowed.includes("*")) {
          return callback(null, true);
        }
        return callback(new Error(`CORS: origin '${origin}' not allowed`));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["Set-Cookie"],
    })
  );

  app.use(morgan(config.isProduction ? "combined" : "dev"));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.get("/", (_req, res) => {
    res.json({
      name: "AutoOps API",
      version: "2.0.0",
      status: "running",
      docs: `${config.apiPrefix}/health`,
    });
  });

  app.use(config.apiPrefix, router);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: "NOT_FOUND",
      message: "The requested resource was not found",
      timestamp: new Date().toISOString(),
    });
  });

  app.use(errorHandler);

  return app;
}
