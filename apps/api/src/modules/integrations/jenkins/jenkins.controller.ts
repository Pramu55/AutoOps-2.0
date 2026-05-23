import type { Request, Response } from 'express';
import {
  jenkinsTriggerBuildInputSchema,
  type JenkinsBuild,
  type JenkinsJob,
  type JenkinsListResponse,
  type JenkinsOperationListResponse,
  type JenkinsOperationsQuery,
  type JenkinsStatusResponse,
  type JenkinsSummaryResponse,
  type JenkinsTriggerBuildResponse,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { jenkinsService } from './jenkins.service.js';
import { requireProviderInventoryAccess } from '../integration-access.service.js';

type BuildParams = { jobName: string };

export class JenkinsController {
  status = async (_req: Request, res: Response<{ data: JenkinsStatusResponse }>): Promise<void> => {
    const raw = await jenkinsService.getStatus();
    // PROVIDER_STATUS: strict sanitization for zero-trust (no secrets, URLs, or inventory details)
    const safeStatus = {
      status: raw.status,
      configured: raw.configured,
      version: raw.version,
      triggerEnabled: raw.triggerEnabled,
      message: raw.message,
      checkedAt: raw.checkedAt,
    };
    res.json({ data: safeStatus as unknown as JenkinsStatusResponse });
  };

  summary = async (req: Request, res: Response<{ data: JenkinsSummaryResponse }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await jenkinsService.getSummary() });
  };

  jobs = async (req: Request, res: Response<{ data: JenkinsListResponse<JenkinsJob> }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await jenkinsService.listJobs() });
  };

  builds = async (req: Request, res: Response<{ data: JenkinsListResponse<JenkinsBuild> }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await jenkinsService.listBuilds() });
  };

  operations = async (req: Request, res: Response<{ data: JenkinsOperationListResponse }>): Promise<void> => {
    const auth = this._requireAuth(req);
    res.json({ data: await jenkinsService.listOperations(auth.orgId, req.query as unknown as JenkinsOperationsQuery) });
  };

  triggerBuild = async (
    req: Request<BuildParams>,
    res: Response<{ data: JenkinsTriggerBuildResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const input = jenkinsTriggerBuildInputSchema.parse(req.body);
    const result = await jenkinsService.triggerBuild(
      decodeURIComponent(req.params.jobName),
      auth.orgId,
      auth.userId,
      auth.role,
      input,
      { ipAddress: req.ip, userAgent: req.header('user-agent') },
    );
    res.status(202).json({ data: result });
  };

  private _requireAuth(req: Request): { userId: string; orgId: string; role?: string } {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.orgId) throw new UnauthorizedError('Organization context is required');
    return { userId: req.auth.userId, orgId: req.auth.orgId, role: req.auth.role };
  }
}

export const jenkinsController = new JenkinsController();
