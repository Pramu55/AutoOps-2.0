import type { Request, Response } from 'express';
import { signalFilterSchema } from '@autoops/types';
import { UnauthorizedError } from '@autoops/utils';
import { SignalService } from './signal.service.js';

const signalService = new SignalService();

export class SignalController {
  getReadiness = async (req: Request, res: Response): Promise<void> => {
    const orgId = this._requireOrgId(req);
    const data = await signalService.getSignalReadiness(orgId);
    res.json({ data });
  };

  listSignals = async (req: Request, res: Response): Promise<void> => {
    const orgId = this._requireOrgId(req);
    const filters = signalFilterSchema.parse(req.query);
    const data = await signalService.listSignals(orgId, filters);
    res.json({ data });
  };

  getSignal = async (req: Request, res: Response): Promise<void> => {
    const orgId = this._requireOrgId(req);
    const data = await signalService.getSignal(orgId, req.params.signalId!);
    res.json({ data });
  };

  resolveSignal = async (req: Request, res: Response): Promise<void> => {
    const orgId = this._requireOrgId(req);
    const data = await signalService.resolveSignal(orgId, req.params.signalId!);
    res.json({ data });
  };

  archiveSignal = async (req: Request, res: Response): Promise<void> => {
    const orgId = this._requireOrgId(req);
    const data = await signalService.archiveSignal(orgId, req.params.signalId!);
    res.json({ data });
  };

  private _requireOrgId(req: Request): string {
    if (!req.auth?.orgId) {
      throw new UnauthorizedError('Organization context is required');
    }
    return req.auth.orgId;
  }
}
