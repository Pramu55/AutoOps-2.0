import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getIncidents,
  getIncidentById,
  createIncident,
  updateIncident,
  deleteIncident,
} from "@/services/incidentService.js";
import { validateBody, validateQuery, PaginationSchema } from "@/middleware/validate.js";
import { formatApiResponse } from "@autoops/shared";

const router: IRouter = Router();

const CreateIncidentSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  serviceId: z.string().cuid(),
  assigneeId: z.string().cuid().optional(),
});

const UpdateIncidentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]).optional(),
  assigneeId: z.string().cuid().nullable().optional(),
});

const IncidentQuerySchema = PaginationSchema.extend({
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  serviceId: z.string().optional(),
});

router.get(
  "/",
  validateQuery(IncidentQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, status, severity, serviceId } =
        IncidentQuerySchema.parse(req.query);

      const result = await getIncidents({
        page,
        pageSize,
        status,
        severity,
        serviceId,
      });

      res.json({
        success: true,
        data: result.incidents,
        pagination: result.pagination,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incident = await getIncidentById(req.params["id"] as string);
      res.json(formatApiResponse(incident));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/",
  validateBody(CreateIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incident = await createIncident(req.body as z.infer<typeof CreateIncidentSchema>);
      res.status(201).json(formatApiResponse(incident, "Incident created successfully"));
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id",
  validateBody(UpdateIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incident = await updateIncident(
        req.params["id"] as string,
        req.body as z.infer<typeof UpdateIncidentSchema>
      );
      res.json(formatApiResponse(incident, "Incident updated successfully"));
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteIncident(req.params["id"] as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
