import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getWorkflows,
  getWorkflowById,
  createWorkflow,
  triggerWorkflow,
  getWorkflowRuns,
} from "@/services/workflowService.js";
import { validateBody, validateQuery, PaginationSchema } from "@/middleware/validate.js";
import { formatApiResponse } from "@autoops/shared";

const router: IRouter = Router();

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  definition: z.record(z.unknown()),
  isActive: z.boolean().optional(),
});

const TriggerWorkflowSchema = z.object({
  input: z.record(z.unknown()).optional().default({}),
  userId: z.string().optional(),
});

const WorkflowQuerySchema = PaginationSchema.extend({
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
});

router.get(
  "/",
  validateQuery(WorkflowQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, isActive } = WorkflowQuerySchema.parse(req.query);
      const result = await getWorkflows({ page, pageSize, isActive });

      res.json({
        success: true,
        data: result.workflows,
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
    const workflow = await getWorkflowById(req.params["id"] as string);
    res.json(formatApiResponse(workflow));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  validateBody(CreateWorkflowSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workflow = await createWorkflow(req.body as z.infer<typeof CreateWorkflowSchema>);
      res.status(201).json(formatApiResponse(workflow, "Workflow created successfully"));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/trigger",
  validateBody(TriggerWorkflowSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { input, userId } = req.body as z.infer<typeof TriggerWorkflowSchema>;
      const run = await triggerWorkflow(
        req.params["id"] as string,
        input,
        userId
      );
      res.status(202).json(formatApiResponse(run, "Workflow triggered successfully"));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:id/runs",
  validateQuery(PaginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = PaginationSchema.parse(req.query);
      const result = await getWorkflowRuns(req.params["id"] as string, { page, pageSize });

      res.json({
        success: true,
        data: result.runs,
        pagination: result.pagination,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
