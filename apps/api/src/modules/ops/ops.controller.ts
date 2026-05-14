import type { Request, Response } from 'express';
import type { OpsSummary } from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { opsService } from './ops.service.js';

export class OpsController {
  summary = async (req: Request, res: Response<{ data: OpsSummary }>): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);
    const summary = await opsService.getSummary(organizationId);
    res.json({ data: summary });
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
