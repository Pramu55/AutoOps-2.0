import { z } from 'zod';

export const githubActionsRunParamsSchema = z.object({
  runId: z.string().trim().regex(/^\d+$/),
});

export const GitHubActionsConnectionStatus = {
  CONNECTED: 'CONNECTED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTH_FAILED: 'AUTH_FAILED',
  UNREACHABLE: 'UNREACHABLE',
  ERROR: 'ERROR',
} as const;
export type GitHubActionsConnectionStatus =
  (typeof GitHubActionsConnectionStatus)[keyof typeof GitHubActionsConnectionStatus];

export interface GitHubActionsStatusResponse {
  status: GitHubActionsConnectionStatus;
  configured: boolean;
  repository?: string;
  allowedWorkflows?: string[];
  checkedAt: string;
  message: string;
}

export interface GitHubWorkflowSummary {
  id: number;
  name: string;
  path: string;
  state: string;
  url: string | null;
  badgeUrl: string | null;
}

export interface GitHubWorkflowRunSummary {
  id: number;
  name: string | null;
  workflowName: string | null;
  status: string | null;
  conclusion: string | null;
  branch: string | null;
  event: string | null;
  commitSha: string | null;
  runNumber: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  htmlUrl: string | null;
}

export interface GitHubWorkflowJobSummary {
  id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string | null;
}

export interface GitHubActionsListResponse<T> {
  status: GitHubActionsConnectionStatus;
  configured: boolean;
  repository: string;
  checkedAt: string;
  message?: string;
  items: T[];
}
