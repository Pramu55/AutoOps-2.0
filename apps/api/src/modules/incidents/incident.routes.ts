import { Router, type RequestHandler } from 'express';
import {
  acknowledgeIncidentSchema,
  incidentListQuerySchema,
  incidentParamsSchema,
  resolveIncidentSchema,
} from '@autoops/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { incidentController } from './incident.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const incidentRouter: Router = Router();

incidentRouter.get(
  '/',
  requireAuth,
  validate({ query: incidentListQuerySchema }),
  asyncHandler(incidentController.list as unknown as RequestHandler),
);

incidentRouter.get(
  '/:incidentId',
  requireAuth,
  validate({ params: incidentParamsSchema }),
  asyncHandler(incidentController.detail as unknown as RequestHandler),
);

incidentRouter.post(
  '/:incidentId/acknowledge',
  requireAuth,
  validate({ params: incidentParamsSchema, body: acknowledgeIncidentSchema }),
  asyncHandler(incidentController.acknowledge as unknown as RequestHandler),
);

incidentRouter.post(
  '/:incidentId/resolve',
  requireAuth,
  validate({ params: incidentParamsSchema, body: resolveIncidentSchema }),
  asyncHandler(incidentController.resolve as unknown as RequestHandler),
);
