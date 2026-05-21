import { Router, type RequestHandler } from 'express';
import {
  ansiblePlaybookParamsSchema,
  infrastructureConfirmationSchema,
  terraformWorkspaceParamsSchema,
} from '@autoops/types';
import { requireAuth } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { infrastructureController } from './infrastructure.controller.js';

export const infrastructureRouter: Router = Router();

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

infrastructureRouter.get('/status', requireAuth, asyncHandler(infrastructureController.status as unknown as RequestHandler));
infrastructureRouter.get('/summary', requireAuth, asyncHandler(infrastructureController.summary as unknown as RequestHandler));
infrastructureRouter.get('/terraform/workspaces', requireAuth, asyncHandler(infrastructureController.terraformWorkspaces as unknown as RequestHandler));
infrastructureRouter.post(
  '/terraform/:workspaceSlug/validate',
  requireAuth,
  validate({ params: terraformWorkspaceParamsSchema, body: infrastructureConfirmationSchema }),
  asyncHandler(infrastructureController.terraformValidate as unknown as RequestHandler),
);
infrastructureRouter.post(
  '/terraform/:workspaceSlug/plan',
  requireAuth,
  validate({ params: terraformWorkspaceParamsSchema, body: infrastructureConfirmationSchema }),
  asyncHandler(infrastructureController.terraformPlan as unknown as RequestHandler),
);
infrastructureRouter.post(
  '/terraform/:workspaceSlug/apply',
  requireAuth,
  validate({ params: terraformWorkspaceParamsSchema, body: infrastructureConfirmationSchema }),
  asyncHandler(infrastructureController.terraformApply as unknown as RequestHandler),
);
infrastructureRouter.get('/ansible/playbooks', requireAuth, asyncHandler(infrastructureController.ansiblePlaybooks as unknown as RequestHandler));
infrastructureRouter.post(
  '/ansible/:playbookSlug/syntax-check',
  requireAuth,
  validate({ params: ansiblePlaybookParamsSchema, body: infrastructureConfirmationSchema }),
  asyncHandler(infrastructureController.ansibleSyntaxCheck as unknown as RequestHandler),
);
infrastructureRouter.post(
  '/ansible/:playbookSlug/check',
  requireAuth,
  validate({ params: ansiblePlaybookParamsSchema, body: infrastructureConfirmationSchema }),
  asyncHandler(infrastructureController.ansibleCheck as unknown as RequestHandler),
);
infrastructureRouter.post(
  '/ansible/:playbookSlug/run',
  requireAuth,
  validate({ params: ansiblePlaybookParamsSchema, body: infrastructureConfirmationSchema }),
  asyncHandler(infrastructureController.ansibleRun as unknown as RequestHandler),
);
