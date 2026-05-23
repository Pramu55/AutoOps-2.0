import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { jenkinsOperationsQuerySchema, jenkinsTriggerBuildInputSchema } from '@autoops/types';
import { jenkinsController } from './jenkins.controller.js';

export const jenkinsRouter: Router = Router();

const jobParamsSchema = z.object({
  jobName: z.string().trim().min(1).max(500),
});

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// PROVIDER_STATUS — accessible to all authenticated users (secret-free)
jenkinsRouter.get('/status', requireAuth, asyncHandler(jenkinsController.status as unknown as RequestHandler));

// PROVIDER_INVENTORY — restricted to OWNER/ADMIN
jenkinsRouter.get('/summary', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(jenkinsController.summary as unknown as RequestHandler));
jenkinsRouter.get('/jobs', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(jenkinsController.jobs as unknown as RequestHandler));
jenkinsRouter.get('/builds', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(jenkinsController.builds as unknown as RequestHandler));

// TENANT_DATA — organization-scoped operation history
jenkinsRouter.get(
  '/operations',
  requireAuth,
  validate({ query: jenkinsOperationsQuerySchema }),
  asyncHandler(jenkinsController.operations as unknown as RequestHandler),
);

// MUTATION — governed build trigger (creates org-scoped operation)
jenkinsRouter.post(
  '/jobs/:jobName/build',
  requireAuth,
  validate({ params: jobParamsSchema, body: jenkinsTriggerBuildInputSchema }),
  asyncHandler(jenkinsController.triggerBuild as unknown as RequestHandler),
);
jenkinsRouter.post(
  '/jobs/:jobName/trigger',
  requireAuth,
  validate({ params: jobParamsSchema, body: jenkinsTriggerBuildInputSchema }),
  asyncHandler(jenkinsController.triggerBuild as unknown as RequestHandler),
);
