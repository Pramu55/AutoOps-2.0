import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { opsController } from './ops.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const opsRouter: Router = Router();

opsRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(opsController.summary as unknown as RequestHandler),
);
