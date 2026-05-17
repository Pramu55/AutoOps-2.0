import { Router, type RequestHandler } from 'express';
import { operationParamsSchema, opsActivityQuerySchema } from '@autoops/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { opsController } from './ops.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const opsRouter: Router = Router();

opsRouter.get(
  '/observability',
  requireAuth,
  asyncHandler(opsController.observability as unknown as RequestHandler),
);

opsRouter.get(
  '/activity',
  requireAuth,
  validate({ query: opsActivityQuerySchema }),
  asyncHandler(opsController.activity as unknown as RequestHandler),
);

opsRouter.get(
  '/activity/:operationId',
  requireAuth,
  validate({ params: operationParamsSchema }),
  asyncHandler(opsController.activityDetail as unknown as RequestHandler),
);

opsRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(opsController.summary as unknown as RequestHandler),
);
