import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} from "@/services/serviceService.js";
import { validateBody, validateQuery, PaginationSchema } from "@/middleware/validate.js";
import { formatApiResponse } from "@autoops/shared";

const router: IRouter = Router();

const CreateServiceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(["OPERATIONAL", "DEGRADED", "OUTAGE", "MAINTENANCE"]).optional(),
  url: z.string().url().optional(),
});

const UpdateServiceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(["OPERATIONAL", "DEGRADED", "OUTAGE", "MAINTENANCE"]).optional(),
  url: z.string().url().nullable().optional(),
});

const ServiceQuerySchema = PaginationSchema.extend({
  status: z
    .enum(["OPERATIONAL", "DEGRADED", "OUTAGE", "MAINTENANCE"])
    .optional(),
});

router.get(
  "/",
  validateQuery(ServiceQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, status } = ServiceQuerySchema.parse(req.query);
      const result = await getServices({ page, pageSize, status });

      res.json({
        success: true,
        data: result.services,
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
    const service = await getServiceById(req.params["id"] as string);
    res.json(formatApiResponse(service));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  validateBody(CreateServiceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await createService(req.body as z.infer<typeof CreateServiceSchema>);
      res.status(201).json(formatApiResponse(service, "Service created successfully"));
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id",
  validateBody(UpdateServiceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await updateService(
        req.params["id"] as string,
        req.body as z.infer<typeof UpdateServiceSchema>
      );
      res.json(formatApiResponse(service, "Service updated successfully"));
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteService(req.params["id"] as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
