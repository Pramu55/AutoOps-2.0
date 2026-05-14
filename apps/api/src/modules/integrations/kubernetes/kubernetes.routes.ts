import { Router, type RequestHandler } from 'express';
import {
  kubernetesApplyManifestSchema,
  kubernetesRestartDeploymentSchema,
  kubernetesWorkloadParamsSchema,
} from '@autoops/types';
import { requireAuth } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { kubernetesController } from './kubernetes.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const kubernetesRouter: Router = Router();

kubernetesRouter.get(
  '/status',
  requireAuth,
  asyncHandler(kubernetesController.status as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(kubernetesController.summary as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/namespaces',
  requireAuth,
  asyncHandler(kubernetesController.namespaces as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/workloads',
  requireAuth,
  asyncHandler(kubernetesController.workloads as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/pods',
  requireAuth,
  asyncHandler(kubernetesController.pods as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/services',
  requireAuth,
  asyncHandler(kubernetesController.services as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/nodes',
  requireAuth,
  asyncHandler(kubernetesController.nodes as unknown as RequestHandler),
);
kubernetesRouter.get(
  '/deployments/:namespace/:name/rollout-status',
  requireAuth,
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
kubernetesRouter.post(
  '/apply',
  requireAuth,
  validate({ body: kubernetesApplyManifestSchema }),
  asyncHandler(kubernetesController.applyManifest as unknown as RequestHandler),
);
