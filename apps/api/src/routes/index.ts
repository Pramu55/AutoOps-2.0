import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';

/**
 * Versioned API mount point. Mount Phase 2+ modules here as they land:
 *   v1.use('/projects', projectRouter);
 *   v1.use('/deployments', deploymentRouter);
 *   v1.use('/pipelines', pipelineRouter);
 */
export const v1Router: Router = Router();
v1Router.use('/auth', authRouter);
