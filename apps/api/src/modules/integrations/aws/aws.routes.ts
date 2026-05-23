import { Router, type RequestHandler } from 'express';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { awsController } from './aws.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const awsRouter: Router = Router();

// PROVIDER_STATUS — accessible to all authenticated users (sanitized, secret-free)
awsRouter.get('/status', requireAuth, asyncHandler(awsController.status as unknown as RequestHandler));

// PROVIDER_INVENTORY — restricted to OWNER/ADMIN
awsRouter.get('/summary', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.summary as unknown as RequestHandler));
awsRouter.get('/ec2/instances', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.ec2Instances as unknown as RequestHandler));
awsRouter.get('/ecs/clusters', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.ecsClusters as unknown as RequestHandler));
awsRouter.get('/ecs/services', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.ecsServices as unknown as RequestHandler));
awsRouter.get('/ecr/repositories', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.ecrRepositories as unknown as RequestHandler));
awsRouter.get('/identity', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.identity as unknown as RequestHandler));
awsRouter.get('/deployment-targets', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.deploymentTargets as unknown as RequestHandler));

// TENANT_DATA — organization-scoped deployment operations
awsRouter.get('/deployments', requireAuth, asyncHandler(awsController.deployments as unknown as RequestHandler));
awsRouter.post('/deployments/:targetSlug/plan', requireAuth, asyncHandler(awsController.planDeployment as unknown as RequestHandler));
awsRouter.post('/deployments/:targetSlug/apply', requireAuth, asyncHandler(awsController.applyDeployment as unknown as RequestHandler));
