import { Router, type RequestHandler } from 'express';
import { approvalDecisionSchema, operationParamsSchema } from '@autoops/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { operationController } from './operation.controller.js';

export const operationRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

operationRouter.get(
  '/',
  requireAuth,
  asyncHandler(operationController.list as unknown as RequestHandler),
);
operationRouter.get(
  '/:operationId',
  requireAuth,
  validate({ params: operationParamsSchema }),
  asyncHandler(operationController.get as unknown as RequestHandler),
);
operationRouter.post(
  '/:operationId/approve',
  requireAuth,
  validate({ params: operationParamsSchema, body: approvalDecisionSchema }),
  asyncHandler(operationController.approve as unknown as RequestHandler),
);
operationRouter.post(
  '/:operationId/reject',
  requireAuth,
  validate({ params: operationParamsSchema, body: approvalDecisionSchema }),
  asyncHandler(operationController.reject as unknown as RequestHandler),
);
