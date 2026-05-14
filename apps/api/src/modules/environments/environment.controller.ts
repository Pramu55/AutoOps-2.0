import type { Request, Response } from 'express';
import type {
  CreateEnvironmentInput,
  Environment,
  UpdateEnvironmentInput,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { environmentService } from './environment.service.js';

type ProjectEnvironmentParams = {
  projectId: string;
};

type EnvironmentParams = ProjectEnvironmentParams & {
  environmentId: string;
};

export class EnvironmentController {
  listEnvironments = async (
    req: Request<ProjectEnvironmentParams>,
    res: Response<{ data: Environment[] }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const environments = await environmentService.listEnvironments(req.params.projectId, organizationId);
    res.json({ data: environments });
  };

  createEnvironment = async (
    req: Request<ProjectEnvironmentParams, unknown, CreateEnvironmentInput>,
    res: Response<{ data: Environment }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const environment = await environmentService.createEnvironment(
      req.params.projectId,
      organizationId,
      req.body,
    );
    res.status(201).json({ data: environment });
  };

  getEnvironment = async (
    req: Request<EnvironmentParams>,
    res: Response<{ data: Environment }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const environment = await environmentService.getEnvironment(
      req.params.projectId,
      req.params.environmentId,
      organizationId,
    );
    res.json({ data: environment });
  };

  updateEnvironment = async (
    req: Request<EnvironmentParams, unknown, UpdateEnvironmentInput>,
    res: Response<{ data: Environment }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const environment = await environmentService.updateEnvironment(
      req.params.projectId,
      req.params.environmentId,
      organizationId,
      req.body,
    );
    res.json({ data: environment });
  };

  archiveEnvironment = async (
    req: Request<EnvironmentParams>,
    res: Response<{ data: Environment }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const environment = await environmentService.archiveEnvironment(
      req.params.projectId,
      req.params.environmentId,
      organizationId,
    );
    res.json({ data: environment });
  };

  private _requireOrganizationId(req: Request): string {
    if (!req.auth) {
      throw new UnauthenticatedError();
    }

    if (!req.auth.orgId) {
      throw new UnauthorizedError('Organization context is required');
    }

    return req.auth.orgId;
  }
}

export const environmentController = new EnvironmentController();
