import type { Request, Response } from 'express';
import {
  IncidentActionResponse,
  IncidentCorrelationResponse,
  IncidentDetail,
  IncidentListResponse,
  IncidentReadinessResponse,
  incidentFilterSchema,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { incidentService } from './incident.service.js';

export class IncidentController {
  list = async (req: Request, res: Response<IncidentListResponse>): Promise<void> => {
    const auth = this._requireAuth(req);
    const filter = incidentFilterSchema.parse(req.query);
    const data = await incidentService.listIncidents(auth.organizationId, auth.userId, filter);
    res.json(data);
  };

  readiness = async (req: Request, res: Response<{ data: IncidentReadinessResponse }>): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await incidentService.getIncidentReadiness(auth.organizationId);
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

  correlate = async (req: Request, res: Response<{ data: IncidentCorrelationResponse }>): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await incidentService.correlateSignalsForOrg(auth.organizationId);
    res.json({ data });
  };

  acknowledge = async (
    req: Request<{ incidentId: string }>,
    res: Response<IncidentActionResponse>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const incident = await incidentService.acknowledgeIncident(
      auth.organizationId,
      auth.userId,
      req.params.incidentId,
    );
    res.json({ incident });
  };

  resolve = async (
    req: Request<{ incidentId: string }>,
    res: Response<IncidentActionResponse>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const incident = await incidentService.resolveIncident(
      auth.organizationId,
      auth.userId,
      req.params.incidentId,
    );
    res.json({ incident });
  };

  archive = async (
    req: Request<{ incidentId: string }>,
    res: Response<IncidentActionResponse>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const incident = await incidentService.archiveIncident(
      auth.organizationId,
      auth.userId,
      req.params.incidentId,
    );
    res.json({ incident });
  };

  private _requireAuth(req: Request): { organizationId: string; userId: string } {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.orgId) throw new UnauthorizedError('Organization context is required');
    return { organizationId: req.auth.orgId, userId: req.auth.userId };
  }
}

export const incidentController = new IncidentController();
