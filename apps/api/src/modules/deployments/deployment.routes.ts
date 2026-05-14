import { Router, type RequestHandler } from 'express';
import {
  deploymentParamsSchema,
  environmentDeploymentParamsSchema,
  triggerDeploymentSchema,
} from '@autoops/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { deploymentController } from './deployment.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const deploymentRouter: Router = Router();

deploymentRouter.get(
  '/',
  requireAuth,
  asyncHandler(deploymentController.listDeployments as unknown as RequestHandler),
);

deploymentRouter.get(
  '/:deploymentId',
  requireAuth,
  validate({ params: deploymentParamsSchema }),
  asyncHandler(deploymentController.getDeployment as unknown as RequestHandler),
);

deploymentRouter.get(
  '/:deploymentId/events',
  requireAuth,
  validate({ params: deploymentParamsSchema }),
  asyncHandler(deploymentController.listDeploymentEvents as unknown as RequestHandler),
);

export const environmentDeploymentRouter: Router = Router({ mergeParams: true });

environmentDeploymentRouter.get(
  '/',
  requireAuth,
  validate({ params: environmentDeploymentParamsSchema }),
  asyncHandler(deploymentController.listEnvironmentDeployments as unknown as RequestHandler),
);

environmentDeploymentRouter.post(
  '/',
  requireAuth,
  validate({
    params: environmentDeploymentParamsSchema,
    body: triggerDeploymentSchema,
  }),
  asyncHandler(deploymentController.triggerDeployment as unknown as RequestHandler),
);
