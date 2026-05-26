import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { SignalController } from './signal.controller.js';

export const signalRouter: Router = Router();
const controller = new SignalController();

signalRouter.get('/readiness', requireAuth, controller.getReadiness);
signalRouter.get('/', requireAuth, controller.listSignals);
signalRouter.get('/:signalId', requireAuth, controller.getSignal);
signalRouter.post('/:signalId/resolve', requireAuth, controller.resolveSignal);
signalRouter.post('/:signalId/archive', requireAuth, controller.archiveSignal);
