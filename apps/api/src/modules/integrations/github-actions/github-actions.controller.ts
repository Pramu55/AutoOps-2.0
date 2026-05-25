import type { Request, Response } from 'express';
import type {
  GitHubActionsListResponse,
  GitHubActionsStatusResponse,
  GitHubWorkflowJobSummary,
  GitHubWorkflowRunSummary,
  GitHubWorkflowSummary,
} from '@autoops/types';
import { githubActionsService } from './github-actions.service.js';
import { getProviderInventoryBlockedStatus, requireProviderInventoryAccess } from '../integration-access.service.js';

export class GitHubActionsController {
  status = async (req: Request, res: Response<{ data: GitHubActionsStatusResponse }>): Promise<void> => {
    const blocked = await getProviderInventoryBlockedStatus(req.auth);
    if (blocked) {
      res.json({ data: blocked as unknown as GitHubActionsStatusResponse });
      return;
    }

    const raw = await githubActionsService.getStatus();
    const safeStatus = {
      status: raw.status,
      configured: raw.configured,
      checkedAt: raw.checkedAt,
      message: raw.message,
    };
    res.json({ data: safeStatus as unknown as GitHubActionsStatusResponse });
  };

  workflows = async (req: Request, res: Response<{ data: GitHubActionsListResponse<GitHubWorkflowSummary> }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await githubActionsService.listWorkflows() });
  };

  runs = async (req: Request, res: Response<{ data: GitHubActionsListResponse<GitHubWorkflowRunSummary> }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await githubActionsService.listRuns() });
  };

  jobs = async (
    req: Request<{ runId: string }>,
    res: Response<{ data: GitHubActionsListResponse<GitHubWorkflowJobSummary> }>,
  ): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await githubActionsService.listJobs(req.params.runId) });
  };
}

export const githubActionsController = new GitHubActionsController();
