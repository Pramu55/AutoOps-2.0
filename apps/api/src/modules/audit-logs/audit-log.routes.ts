import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { auditLogController } from './audit-log.controller.js';

export const auditLogRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

auditLogRouter.get(
  '/',
  requireAuth,
  asyncHandler(auditLogController.list as unknown as RequestHandler),
);
