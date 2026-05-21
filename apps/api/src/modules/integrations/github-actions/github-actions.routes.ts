import { Router, type RequestHandler } from 'express';
import { githubActionsRunParamsSchema } from '@autoops/types';
import { requireAuth } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { githubActionsController } from './github-actions.controller.js';

export const githubActionsRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

githubActionsRouter.get('/status', requireAuth, asyncHandler(githubActionsController.status as unknown as RequestHandler));
githubActionsRouter.get('/workflows', requireAuth, asyncHandler(githubActionsController.workflows as unknown as RequestHandler));
githubActionsRouter.get('/runs', requireAuth, asyncHandler(githubActionsController.runs as unknown as RequestHandler));
githubActionsRouter.get(
  '/runs/:runId/jobs',
  requireAuth,
  validate({ params: githubActionsRunParamsSchema }),
  asyncHandler(githubActionsController.jobs as unknown as RequestHandler),
);
