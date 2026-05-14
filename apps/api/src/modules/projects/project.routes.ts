import { Router } from 'express';
import { z } from 'zod';
import { createProjectSchema, idSchema, updateProjectSchema } from '@autoops/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { environmentDeploymentRouter } from '../deployments/deployment.routes.js';
import { environmentRouter } from '../environments/environment.routes.js';
import { projectController } from './project.controller.js';

const projectParamsSchema = z.object({
  projectId: idSchema,
});

export const projectRouter: Router = Router();

projectRouter.use('/:projectId/environments/:environmentId/deployments', environmentDeploymentRouter);
projectRouter.use('/:projectId/environments', environmentRouter);

projectRouter.get('/', requireAuth, projectController.listProjects);

projectRouter.post(
  '/',
  requireAuth,
  validate({ body: createProjectSchema }),
  projectController.createProject,
);

projectRouter.get(
  '/:projectId',
  requireAuth,
  validate({ params: projectParamsSchema }),
  projectController.getProject,
);

projectRouter.patch(
  '/:projectId',
  requireAuth,
  validate({
    params: projectParamsSchema,
    body: updateProjectSchema,
  }),
  projectController.updateProject,
);

projectRouter.delete(
  '/:projectId',
  requireAuth,
  validate({ params: projectParamsSchema }),
  projectController.archiveProject,
);
