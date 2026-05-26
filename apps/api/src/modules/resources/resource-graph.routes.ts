import { Router } from 'express';
import { z } from 'zod';
import { idSchema } from '@autoops/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { resourceGraphController } from './resource-graph.controller.js';

const resourceParamsSchema = z.object({
  resourceId: idSchema,
});

export const resourceGraphRouter: Router = Router();

resourceGraphRouter.get('/readiness', requireAuth, resourceGraphController.readiness);
resourceGraphRouter.get('/', requireAuth, resourceGraphController.listResources);
resourceGraphRouter.get(
  '/:resourceId/neighbors',
  requireAuth,
  validate({ params: resourceParamsSchema }),
  resourceGraphController.getNeighbors,
);
resourceGraphRouter.get(
  '/:resourceId',
  requireAuth,
  validate({ params: resourceParamsSchema }),
  resourceGraphController.getResource,
);
