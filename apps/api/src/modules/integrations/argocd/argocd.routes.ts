import { Router, type RequestHandler } from 'express';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { argocdController } from './argocd.controller.js';

export const argocdRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

argocdRouter.get('/status', requireAuth, asyncHandler(argocdController.status as unknown as RequestHandler));
argocdRouter.get(
  '/applications',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(argocdController.applications as unknown as RequestHandler),
);
argocdRouter.get(
  '/summary',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(argocdController.summary as unknown as RequestHandler),
);
