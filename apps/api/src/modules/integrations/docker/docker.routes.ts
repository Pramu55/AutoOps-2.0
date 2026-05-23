import { Router, type RequestHandler } from 'express';
import {
  dockerContainerParamsSchema,
  dockerLogsQuerySchema,
  dockerRestartContainerSchema,
  dockerStartContainerSchema,
  dockerStopContainerSchema,
} from '@autoops/types';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { dockerController } from './docker.controller.js';

export const dockerRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// PROVIDER_STATUS — accessible to all authenticated users (secret-free)
dockerRouter.get('/status', requireAuth, asyncHandler(dockerController.status as unknown as RequestHandler));

// PROVIDER_INVENTORY — restricted to OWNER/ADMIN
dockerRouter.get('/containers', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(dockerController.containers as unknown as RequestHandler));
dockerRouter.get('/images', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(dockerController.images as unknown as RequestHandler));
dockerRouter.get('/networks', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(dockerController.networks as unknown as RequestHandler));
dockerRouter.get('/volumes', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(dockerController.volumes as unknown as RequestHandler));
dockerRouter.get(
  '/containers/:containerId/logs',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  validate({ params: dockerContainerParamsSchema, query: dockerLogsQuerySchema }),
  asyncHandler(dockerController.logs as unknown as RequestHandler),
);

// MUTATIONS — governed container actions (creates org-scoped operations)
dockerRouter.post(
  '/containers/:containerId/start',
  requireAuth,
  validate({ params: dockerContainerParamsSchema, body: dockerStartContainerSchema }),
  asyncHandler(dockerController.start as unknown as RequestHandler),
);
dockerRouter.post(
  '/containers/:containerId/stop',
  requireAuth,
  validate({ params: dockerContainerParamsSchema, body: dockerStopContainerSchema }),
  asyncHandler(dockerController.stop as unknown as RequestHandler),
);
dockerRouter.post(
  '/containers/:containerId/restart',
  requireAuth,
  validate({ params: dockerContainerParamsSchema, body: dockerRestartContainerSchema }),
  asyncHandler(dockerController.restart as unknown as RequestHandler),
);
