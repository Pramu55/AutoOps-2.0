import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { providerRegistryController } from './provider-registry.controller.js';

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const providerRegistryRouter: Router = Router();

providerRegistryRouter.get(
  '/',
  requireAuth,
  asyncHandler(providerRegistryController.list as unknown as RequestHandler),
);
