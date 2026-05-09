import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "@/config/index.js";
import router from "@/routes/index.js";
import { errorHandler } from "@/middleware/errorHandler.js";

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.cors.origins,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
  app.use(morgan(config.isProduction ? "combined" : "dev"));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

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
