import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getAlerts,
  getAlertById,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
} from "@/services/alertService.js";
import { validateBody, validateQuery, PaginationSchema } from "@/middleware/validate.js";
import { formatApiResponse } from "@autoops/shared";

const router: IRouter = Router();

const CreateAlertSchema = z.object({
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  source: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
});

const AlertQuerySchema = PaginationSchema.extend({
  status: z.enum(["ACTIVE", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  source: z.string().optional(),
});

router.get(
  "/",
  validateQuery(AlertQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, status, severity, source } =
        AlertQuerySchema.parse(req.query);

      const result = await getAlerts({ page, pageSize, status, severity, source });

      res.json({
        success: true,
        data: result.alerts,
        pagination: result.pagination,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await getAlertById(req.params["id"] as string);
    res.json(formatApiResponse(alert));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  validateBody(CreateAlertSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await createAlert(req.body as z.infer<typeof CreateAlertSchema>);
      res.status(201).json(formatApiResponse(alert, "Alert created successfully"));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/acknowledge",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await acknowledgeAlert(req.params["id"] as string);
      res.json(formatApiResponse(alert, "Alert acknowledged"));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/resolve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await resolveAlert(req.params["id"] as string);
      res.json(formatApiResponse(alert, "Alert resolved"));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
