import type { Request, Response } from 'express';
import type {
  OperationActivityResponse,
  OperationDetailResponse,
  OpsActivityQuery,
  OpsObservabilityResponse,
  OpsSummary,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { opsService } from './ops.service.js';

export class OpsController {
  activity = async (req: Request, res: Response<{ data: OperationActivityResponse }>): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const activity = await opsService.listActivity(
      organizationId,
      req.query as unknown as OpsActivityQuery,
    );
    res.json({ data: activity });
  };

  activityDetail = async (
    req: Request<{ operationId: string }>,
    res: Response<{ data: OperationDetailResponse }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const detail = await opsService.getActivityDetail(organizationId, req.params.operationId);
    res.json({ data: detail });
  };

  summary = async (req: Request, res: Response<{ data: OpsSummary }>): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const summary = await opsService.getSummary(organizationId);
    res.json({ data: summary });
  };

  observability = async (
    req: Request,
    res: Response<{ data: OpsObservabilityResponse }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const observability = await opsService.getObservability(organizationId);
    res.json({ data: observability });
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

export const opsController = new OpsController();
