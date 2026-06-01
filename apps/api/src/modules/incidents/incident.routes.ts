import { Router, type Router as ExpressRouter } from 'express';
import { incidentController } from './incident.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router: ExpressRouter = Router();

router.use(requireAuth);

router.get('/', incidentController.list);
router.get('/readiness', incidentController.readiness);
router.post('/correlate', incidentController.correlate);

router.get('/:incidentId', incidentController.detail);
router.get('/:incidentId/timeline', incidentController.timeline);
router.get('/:incidentId/remediation-recommendations', incidentController.remediationRecommendations);
router.post('/:incidentId/notes', incidentController.addNote);
router.post('/:incidentId/acknowledge', incidentController.acknowledge);
router.post('/:incidentId/resolve', incidentController.resolve);
router.post('/:incidentId/archive', incidentController.archive);

export const incidentRouter: ExpressRouter = router;
