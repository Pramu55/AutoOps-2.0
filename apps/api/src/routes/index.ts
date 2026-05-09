import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import incidentsRouter from "./incidents.js";
import servicesRouter from "./services.js";
import workflowsRouter from "./workflows.js";
import alertsRouter from "./alerts.js";

const router: IRouter = Router();

router.use("/health", healthRouter);
router.use("/incidents", incidentsRouter);
router.use("/services", servicesRouter);
router.use("/workflows", workflowsRouter);
router.use("/alerts", alertsRouter);

export default router;
