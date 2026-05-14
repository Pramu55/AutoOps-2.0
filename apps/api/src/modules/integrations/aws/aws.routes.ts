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
awsRouter.get('/cloudwatch/alarms', requireAuth, asyncHandler(awsController.cloudWatchAlarms as unknown as RequestHandler));
