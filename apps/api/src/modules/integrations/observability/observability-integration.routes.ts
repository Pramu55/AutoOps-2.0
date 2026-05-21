import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { observabilityIntegrationController } from './observability-integration.controller.js';

export const observabilityIntegrationRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

observabilityIntegrationRouter.get('/status', requireAuth, asyncHandler(observabilityIntegrationController.status as unknown as RequestHandler));
observabilityIntegrationRouter.get('/prometheus', requireAuth, asyncHandler(observabilityIntegrationController.prometheus as unknown as RequestHandler));
observabilityIntegrationRouter.get('/grafana', requireAuth, asyncHandler(observabilityIntegrationController.grafana as unknown as RequestHandler));
