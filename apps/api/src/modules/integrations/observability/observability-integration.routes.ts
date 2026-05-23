import { Router, type RequestHandler } from 'express';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { observabilityIntegrationController } from './observability-integration.controller.js';

export const observabilityIntegrationRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// PROVIDER_STATUS — accessible to all authenticated users (sanitized, secret-free)
observabilityIntegrationRouter.get('/status', requireAuth, asyncHandler(observabilityIntegrationController.status as unknown as RequestHandler));

// PROVIDER_INVENTORY — restricted to OWNER/ADMIN (exposes internal URLs/targets)
observabilityIntegrationRouter.get('/prometheus', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(observabilityIntegrationController.prometheus as unknown as RequestHandler));
observabilityIntegrationRouter.get('/grafana', requireAuth, requireRole('OWNER', 'ADMIN'), asyncHandler(observabilityIntegrationController.grafana as unknown as RequestHandler));
