import type { Request, Response } from 'express';
import type {
  GitHubActionsListResponse,
  GitHubActionsStatusResponse,
  GitHubWorkflowJobSummary,
  GitHubWorkflowRunSummary,
  GitHubWorkflowSummary,
} from '@autoops/types';
import { githubActionsService } from './github-actions.service.js';

export class GitHubActionsController {
  status = async (_req: Request, res: Response<{ data: GitHubActionsStatusResponse }>): Promise<void> => {
    res.json({ data: await githubActionsService.getStatus() });
  };

  workflows = async (_req: Request, res: Response<{ data: GitHubActionsListResponse<GitHubWorkflowSummary> }>): Promise<void> => {
    res.json({ data: await githubActionsService.listWorkflows() });
  };

  runs = async (_req: Request, res: Response<{ data: GitHubActionsListResponse<GitHubWorkflowRunSummary> }>): Promise<void> => {
    res.json({ data: await githubActionsService.listRuns() });
  };

  jobs = async (req: Request<{ runId: string }>, res: Response<{ data: GitHubActionsListResponse<GitHubWorkflowJobSummary> }>): Promise<void> => {
    res.json({ data: await githubActionsService.listJobs(req.params.runId) });
  };
}

export const githubActionsController = new GitHubActionsController();
