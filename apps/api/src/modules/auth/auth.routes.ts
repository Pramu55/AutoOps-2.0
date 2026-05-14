import { Router, type RequestHandler } from 'express';
import { registerSchema, loginSchema, refreshSchema } from '@autoops/types';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rate-limit.js';
import { authController } from './auth.controller.js';

export const authRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

authRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register as RequestHandler),
);
authRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login as RequestHandler),
);
authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(authController.refresh as RequestHandler),
);
authRouter.post('/logout', requireAuth, asyncHandler(authController.logout as RequestHandler));
authRouter.get('/me', requireAuth, asyncHandler(authController.me as RequestHandler));
