import { Router } from 'express';
import { healthController } from './health.controller.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', healthController.health);
healthRouter.get('/ready', healthController.ready);