import { Router, type RequestHandler } from 'express';
import { githubActionsRunParamsSchema } from '@autoops/types';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { githubActionsController } from './github-actions.controller.js';

export const githubActionsRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// PROVIDER_STATUS — accessible to all authenticated users (secret-free)
githubActionsRouter.get('/status', requireAuth, asyncHandler(githubActionsController.status as unknown as RequestHandler));

// PROVIDER_INVENTORY — restricted to OWNER/ADMIN
githubActionsRouter.get('/workflows', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(githubActionsController.workflows as unknown as RequestHandler));
githubActionsRouter.get('/runs', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(githubActionsController.runs as unknown as RequestHandler));
githubActionsRouter.get(
  '/runs/:runId/jobs',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  validate({ params: githubActionsRunParamsSchema }),
  asyncHandler(githubActionsController.jobs as unknown as RequestHandler),
);
