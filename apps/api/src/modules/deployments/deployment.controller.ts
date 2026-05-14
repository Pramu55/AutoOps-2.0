import type { Request, Response } from 'express';
import type { Deployment, DeploymentEvent, TriggerDeploymentInput } from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { deploymentService } from './deployment.service.js';

type DeploymentParams = {
  deploymentId: string;
};

type EnvironmentDeploymentParams = {
  projectId: string;
  environmentId: string;
};

export class DeploymentController {
  listDeployments = async (
    req: Request,
    res: Response<{ data: Deployment[] }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const deployments = await deploymentService.listDeployments(organizationId);
    res.json({ data: deployments });
  };

  listEnvironmentDeployments = async (
    req: Request<EnvironmentDeploymentParams>,
    res: Response<{ data: Deployment[] }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const deployments = await deploymentService.listEnvironmentDeployments(
      req.params.projectId,
      req.params.environmentId,
      organizationId,
    );
    res.json({ data: deployments });
  };

  triggerDeployment = async (
    req: Request<EnvironmentDeploymentParams, unknown, TriggerDeploymentInput>,
    res: Response<{ data: Deployment }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const userId = this._requireUserId(req);
    const deployment = await deploymentService.triggerDeployment(
      req.params.projectId,
      req.params.environmentId,
      organizationId,
      userId,
      req.body,
    );
    res.status(201).json({ data: deployment });
  };

  getDeployment = async (
    req: Request<DeploymentParams>,
    res: Response<{ data: Deployment }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const deployment = await deploymentService.getDeployment(req.params.deploymentId, organizationId);
    res.json({ data: deployment });
  };

  listDeploymentEvents = async (
    req: Request<DeploymentParams>,
    res: Response<{ data: DeploymentEvent[] }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const events = await deploymentService.listDeploymentEvents(
      req.params.deploymentId,
      organizationId,
    );
    res.json({ data: events });
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

  private _requireUserId(req: Request): string {
    if (!req.auth) {
      throw new UnauthenticatedError();
    }

    return req.auth.userId;
  }
}

export const deploymentController = new DeploymentController();
