import { Router, type RequestHandler } from 'express';
import {
  kubernetesRolloutRestartDeploymentSchema,
  kubernetesScaleDeploymentSchema,
  kubernetesRestartDeploymentSchema,
  kubernetesWorkloadParamsSchema,
} from '@autoops/types';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { kubernetesController } from './kubernetes.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const kubernetesRouter: Router = Router();

// PROVIDER_STATUS — accessible to all authenticated users (sanitized, secret-free)
kubernetesRouter.get(
  '/status',
  requireAuth,
  asyncHandler(kubernetesController.status as unknown as RequestHandler),
);

// PROVIDER_INVENTORY — restricted to OWNER/ADMIN
kubernetesRouter.get(
  '/summary',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(kubernetesController.summary as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/namespaces',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(kubernetesController.namespaces as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/workloads',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(kubernetesController.workloads as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/pods',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(kubernetesController.pods as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/services',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(kubernetesController.services as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/nodes',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(kubernetesController.nodes as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/workloads/:namespace/deployments/:name/rollout-status',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  validate({ params: kubernetesWorkloadParamsSchema }),
  asyncHandler(kubernetesController.rolloutStatus as unknown as RequestHandler),
);

// MUTATIONS — governed deployment actions (creates org-scoped operations)
kubernetesRouter.post(
  '/workloads/:namespace/deployments/:name/scale',
  requireAuth,
  validate({
    params: kubernetesWorkloadParamsSchema,
    body: kubernetesScaleDeploymentSchema,
  }),
  asyncHandler(kubernetesController.scaleDeployment as unknown as RequestHandler),
);
kubernetesRouter.post(
  '/workloads/:namespace/deployments/:name/rollout-restart',
  requireAuth,
  validate({
    params: kubernetesWorkloadParamsSchema,
    body: kubernetesRolloutRestartDeploymentSchema,
  }),
  asyncHandler(kubernetesController.rolloutRestartDeployment as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/deployments/:namespace/:name/rollout-status',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  validate({ params: kubernetesWorkloadParamsSchema }),
  asyncHandler(kubernetesController.rolloutStatus as unknown as RequestHandler),
);
kubernetesRouter.post(
  '/deployments/:namespace/:name/restart',
  requireAuth,
  validate({
    params: kubernetesWorkloadParamsSchema,
    body: kubernetesRestartDeploymentSchema,
  }),
  asyncHandler(kubernetesController.restartDeployment as unknown as RequestHandler),
);
