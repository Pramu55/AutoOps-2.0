import { Router } from 'express';
import { systemHealthcheckJobSchema } from '@autoops/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { systemController } from './system.controller.js';

export const systemRouter: Router = Router();

systemRouter.post(
  '/jobs/worker-healthcheck',
  requireAuth,
  validate({ body: systemHealthcheckJobSchema }),
  systemController.enqueueWorkerHealthcheck,
);
