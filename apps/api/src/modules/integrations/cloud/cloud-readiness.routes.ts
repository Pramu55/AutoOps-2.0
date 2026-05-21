import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { cloudReadinessController } from './cloud-readiness.controller.js';

export const cloudReadinessRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

cloudReadinessRouter.get('/status', requireAuth, asyncHandler(cloudReadinessController.status as unknown as RequestHandler));
cloudReadinessRouter.get('/aws/status', requireAuth, asyncHandler(cloudReadinessController.aws as unknown as RequestHandler));
cloudReadinessRouter.get('/azure/status', requireAuth, asyncHandler(cloudReadinessController.azure as unknown as RequestHandler));
cloudReadinessRouter.get('/gcp/status', requireAuth, asyncHandler(cloudReadinessController.gcp as unknown as RequestHandler));
