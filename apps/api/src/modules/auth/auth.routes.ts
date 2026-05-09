import { Router } from 'express';
import { registerSchema, loginSchema, refreshSchema } from '@autoops/types';
import { validate } from './middleware/validate.js';
import { requireAuth } from './middleware/auth.js';
import { authRateLimiter } from './middleware/rate-limit.js';
import { authController } from './auth.controller.js';

export const authRouter: Router = Router();

authRouter.post('/register', authRateLimiter, validate({ body: registerSchema }), authController.register);
authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
authRouter.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.get('/me', requireAuth, authController.me);
