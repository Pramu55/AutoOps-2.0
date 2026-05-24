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
awsRouter.get('/ecr/readiness', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.ecrReadiness as unknown as RequestHandler));
awsRouter.get('/ecr/repositories', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.ecrRepositories as unknown as RequestHandler));
awsRouter.get('/identity', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.identity as unknown as RequestHandler));
awsRouter.get('/readiness', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.readiness as unknown as RequestHandler));
awsRouter.get('/permissions', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.permissions as unknown as RequestHandler));
awsRouter.get('/remote-state', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.remoteState as unknown as RequestHandler));
awsRouter.get('/deployment-targets', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.deploymentTargets as unknown as RequestHandler));
awsRouter.get('/workspace-readiness/:targetSlug', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.workspaceReadiness as unknown as RequestHandler));
awsRouter.get('/terraform/plan-readiness', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(awsController.terraformPlanReadiness as unknown as RequestHandler));

// TENANT_DATA — organization-scoped deployment operations
awsRouter.get('/apply-readiness', requireAuth, asyncHandler(awsController.applyReadiness as unknown as RequestHandler));
awsRouter.get('/deployments', requireAuth, asyncHandler(awsController.deployments as unknown as RequestHandler));
awsRouter.post('/deployments/:targetSlug/plan', requireAuth, asyncHandler(awsController.planDeployment as unknown as RequestHandler));
awsRouter.post('/deployments/:targetSlug/apply', requireAuth, asyncHandler(awsController.applyDeployment as unknown as RequestHandler));
awsRouter.get('/ecr/images', requireAuth, asyncHandler(awsController.ecrImages as unknown as RequestHandler));
awsRouter.post('/ecr/images/build', requireAuth, asyncHandler(awsController.buildEcrImage as unknown as RequestHandler));
awsRouter.post('/ecr/images/push', requireAuth, asyncHandler(awsController.pushEcrImage as unknown as RequestHandler));
