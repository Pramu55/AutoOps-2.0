import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { getDashboardStats } from "@/services/statsService.js";
import { formatApiResponse } from "@autoops/shared";

const router: IRouter = Router();

router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getDashboardStats();
    res.json(formatApiResponse(stats));
  } catch (err) {
    next(err);
  }
});

export default router;
