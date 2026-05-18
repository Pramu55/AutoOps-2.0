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
    const auth = this._requireAuth(req);
    const activity = await opsService.listActivity(
      auth.organizationId,
      auth.userId,
      req.query as unknown as OpsActivityQuery,
    );
    res.json({ data: activity });
  };

  activityDetail = async (
    req: Request<{ operationId: string }>,
    res: Response<{ data: OperationDetailResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const detail = await opsService.getActivityDetail(auth.organizationId, auth.userId, req.params.operationId);
    res.json({ data: detail });
  };

  summary = async (req: Request, res: Response<{ data: OpsSummary }>): Promise<void> => {
    const auth = this._requireAuth(req);
    const summary = await opsService.getSummary(auth.organizationId);
    res.json({ data: summary });
  };

  observability = async (
    req: Request,
    res: Response<{ data: OpsObservabilityResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const observability = await opsService.getObservability(auth.organizationId, auth.userId);
    res.json({ data: observability });
  };

  private _requireAuth(req: Request): { organizationId: string; userId: string } {
    if (!req.auth) {
      throw new UnauthenticatedError();
    }

    if (!req.auth.orgId) {
      throw new UnauthorizedError('Organization context is required');
    }

    return { organizationId: req.auth.orgId, userId: req.auth.userId };
  }
}

export const opsController = new OpsController();
