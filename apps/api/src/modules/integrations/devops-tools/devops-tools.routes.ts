import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { devOpsToolsController } from './devops-tools.controller.js';

export const devOpsToolsRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

devOpsToolsRouter.get('/status', requireAuth, asyncHandler(devOpsToolsController.status as unknown as RequestHandler));
