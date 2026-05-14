import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { jenkinsTriggerBuildInputSchema } from '@autoops/types';
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

jenkinsRouter.get('/status', requireAuth, asyncHandler(jenkinsController.status as unknown as RequestHandler));
jenkinsRouter.get('/summary', requireAuth, asyncHandler(jenkinsController.summary as unknown as RequestHandler));
jenkinsRouter.get('/jobs', requireAuth, asyncHandler(jenkinsController.jobs as unknown as RequestHandler));
jenkinsRouter.get('/builds', requireAuth, asyncHandler(jenkinsController.builds as unknown as RequestHandler));
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
