import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { awsController } from './aws.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const awsRouter: Router = Router();

awsRouter.get('/status', requireAuth, asyncHandler(awsController.status as unknown as RequestHandler));
awsRouter.get('/summary', requireAuth, asyncHandler(awsController.summary as unknown as RequestHandler));
awsRouter.get('/ec2/instances', requireAuth, asyncHandler(awsController.ec2Instances as unknown as RequestHandler));
awsRouter.get('/ecs/clusters', requireAuth, asyncHandler(awsController.ecsClusters as unknown as RequestHandler));
awsRouter.get('/ecs/services', requireAuth, asyncHandler(awsController.ecsServices as unknown as RequestHandler));
awsRouter.get('/ecr/repositories', requireAuth, asyncHandler(awsController.ecrRepositories as unknown as RequestHandler));
awsRouter.get('/identity', requireAuth, asyncHandler(awsController.identity as unknown as RequestHandler));
awsRouter.get('/deployment-targets', requireAuth, asyncHandler(awsController.deploymentTargets as unknown as RequestHandler));
awsRouter.get('/deployments', requireAuth, asyncHandler(awsController.deployments as unknown as RequestHandler));
awsRouter.post('/deployments/:targetSlug/plan', requireAuth, asyncHandler(awsController.planDeployment as unknown as RequestHandler));
awsRouter.post('/deployments/:targetSlug/apply', requireAuth, asyncHandler(awsController.applyDeployment as unknown as RequestHandler));
