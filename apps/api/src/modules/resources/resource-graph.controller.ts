import type { Request, Response } from 'express';
import type {
  ResourceGraphListResponse,
  ResourceGraphNeighborResponse,
  ResourceGraphReadinessResponse,
  ResourceNodeDetail,
} from '@autoops/types';
import { resourceGraphFiltersSchema } from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { resourceGraphService } from './resource-graph.service.js';

type ResourceParams = {
  resourceId: string;
};

export class ResourceGraphController {
  readiness = async (
    req: Request,
    res: Response<{ data: ResourceGraphReadinessResponse }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    res.json({ data: await resourceGraphService.getResourceGraphReadiness(organizationId) });
  };

  listResources = async (
    req: Request,
    res: Response<{ data: ResourceGraphListResponse }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const filters = resourceGraphFiltersSchema.parse(req.query);
    res.json({ data: await resourceGraphService.listResourceNodes(organizationId, filters) });
  };

  getResource = async (
    req: Request<ResourceParams>,
    res: Response<{ data: ResourceNodeDetail }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    res.json({ data: await resourceGraphService.getResourceNode(organizationId, req.params.resourceId) });
  };

  getNeighbors = async (
    req: Request<ResourceParams>,
    res: Response<{ data: ResourceGraphNeighborResponse }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    res.json({ data: await resourceGraphService.getResourceNeighbors(organizationId, req.params.resourceId) });
  };

  private _requireOrganizationId(req: Request): string {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.orgId) throw new UnauthorizedError('Organization context is required');
    return req.auth.orgId;
  }
}

export const resourceGraphController = new ResourceGraphController();
