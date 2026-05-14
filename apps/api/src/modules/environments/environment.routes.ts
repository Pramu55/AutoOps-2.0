import { Router } from 'express';
import {
  createEnvironmentSchema,
  environmentParamsSchema,
  projectEnvironmentParamsSchema,
  updateEnvironmentSchema,
} from '@autoops/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { environmentController } from './environment.controller.js';

export const environmentRouter: Router = Router({ mergeParams: true });

environmentRouter.get(
  '/',
  requireAuth,
  validate({ params: projectEnvironmentParamsSchema }),
  environmentController.listEnvironments,
);

environmentRouter.post(
  '/',
  requireAuth,
  validate({
    params: projectEnvironmentParamsSchema,
    body: createEnvironmentSchema,
  }),
  environmentController.createEnvironment,
);

environmentRouter.get(
  '/:environmentId',
  requireAuth,
  validate({ params: environmentParamsSchema }),
  environmentController.getEnvironment,
);

environmentRouter.patch(
  '/:environmentId',
  requireAuth,
  validate({
    params: environmentParamsSchema,
    body: updateEnvironmentSchema,
  }),
  environmentController.updateEnvironment,
);

environmentRouter.delete(
  '/:environmentId',
  requireAuth,
  validate({ params: environmentParamsSchema }),
  environmentController.archiveEnvironment,
);
