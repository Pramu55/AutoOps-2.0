import type { Request, Response } from 'express';
import type {
  AcknowledgeIncidentResponse,
  IncidentDetail,
  IncidentListQuery,
  IncidentListResponse,
  ResolveIncidentResponse,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { incidentService } from './incident.service.js';

export class IncidentController {
  list = async (req: Request, res: Response<{ data: IncidentListResponse }>): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await incidentService.listIncidents(
      auth.organizationId,
      auth.userId,
      req.query as unknown as IncidentListQuery,
    );
    res.json({ data });
  };

  detail = async (
    req: Request<{ incidentId: string }>,
    res: Response<{ data: IncidentDetail }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await incidentService.getIncident(auth.organizationId, auth.userId, req.params.incidentId);
    res.json({ data });
  };

  acknowledge = async (
    req: Request<{ incidentId: string }>,
    res: Response<{ data: AcknowledgeIncidentResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const incident = await incidentService.acknowledgeIncident(
      auth.organizationId,
      auth.userId,
      req.params.incidentId,
    );
    res.json({ data: { incident } });
  };

  resolve = async (
    req: Request<{ incidentId: string }, unknown, { resolutionNote: string }>,
    res: Response<{ data: ResolveIncidentResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const incident = await incidentService.resolveIncident(
      auth.organizationId,
      auth.userId,
      req.params.incidentId,
      req.body.resolutionNote,
    );
    res.json({ data: { incident } });
  };

  private _requireAuth(req: Request): { organizationId: string; userId: string } {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.orgId) throw new UnauthorizedError('Organization context is required');
    return { organizationId: req.auth.orgId, userId: req.auth.userId };
  }
}

export const incidentController = new IncidentController();
