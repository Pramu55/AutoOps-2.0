import type { Request, Response } from 'express';
import {
  jenkinsTriggerBuildInputSchema,
  type JenkinsBuild,
  type JenkinsJob,
  type JenkinsListResponse,
  type JenkinsStatusResponse,
  type JenkinsSummaryResponse,
  type JenkinsTriggerBuildResponse,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { jenkinsService } from './jenkins.service.js';

type BuildParams = { jobName: string };

export class JenkinsController {
  status = async (_req: Request, res: Response<{ data: JenkinsStatusResponse }>): Promise<void> => {
    res.json({ data: await jenkinsService.getStatus() });
  };

  summary = async (_req: Request, res: Response<{ data: JenkinsSummaryResponse }>): Promise<void> => {
    res.json({ data: await jenkinsService.getSummary() });
  };

  jobs = async (_req: Request, res: Response<{ data: JenkinsListResponse<JenkinsJob> }>): Promise<void> => {
    res.json({ data: await jenkinsService.listJobs() });
  };

  builds = async (_req: Request, res: Response<{ data: JenkinsListResponse<JenkinsBuild> }>): Promise<void> => {
    res.json({ data: await jenkinsService.listBuilds() });
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

