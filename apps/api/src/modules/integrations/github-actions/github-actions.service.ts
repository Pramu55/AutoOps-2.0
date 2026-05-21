import type {
  GitHubActionsListResponse,
  GitHubActionsStatusResponse,
  GitHubWorkflowJobSummary,
  GitHubWorkflowRunSummary,
  GitHubWorkflowSummary,
} from '@autoops/types';
import { GitHubActionsConnectionStatus } from '@autoops/types';

type GitHubConfig = {
  enabled: boolean;
  owner: string;
  repo: string;
  token: string | null;
  allowedWorkflows: string[];
};

type GitHubWorkflowApi = {
  id: number;
  name?: string;
  path?: string;
  state?: string;
  html_url?: string;
  badge_url?: string;
};

type GitHubRunApi = {
  id: number;
  name?: string | null;
  display_title?: string | null;
  workflow_name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  head_branch?: string | null;
  event?: string | null;
  head_sha?: string | null;
  run_number?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  html_url?: string | null;
};

type GitHubJobApi = {
  id: number;
  name?: string;
  status?: string | null;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  html_url?: string | null;
};

function getConfig(): GitHubConfig {
  return {
    enabled: process.env.GITHUB_ACTIONS_ENABLED === 'true',
    owner: process.env.GITHUB_REPOSITORY_OWNER?.trim() || 'Pramu55',
    repo: process.env.GITHUB_REPOSITORY_NAME?.trim() || 'AutoOps-2.0',
    token: process.env.GITHUB_ACTIONS_TOKEN?.trim() || null,
    allowedWorkflows: (process.env.GITHUB_ACTIONS_ALLOWED_WORKFLOWS ?? 'ci.yml')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

export class GitHubActionsService {
  async getStatus(): Promise<GitHubActionsStatusResponse> {
    const config = getConfig();
    const checkedAt = new Date().toISOString();
    if (!config.enabled || !config.token) {
      return {
        status: GitHubActionsConnectionStatus.NOT_CONFIGURED,
        configured: false,
        repository: `${config.owner}/${config.repo}`,
        allowedWorkflows: config.allowedWorkflows,
        checkedAt,
        message: 'Set GITHUB_ACTIONS_ENABLED=true and GITHUB_ACTIONS_TOKEN to enable read-only workflow status.',
      };
    }

    const result = await this._request<{ total_count?: number }>('actions/workflows?per_page=1', config);
    return {
      status: result.status,
      configured: true,
      repository: `${config.owner}/${config.repo}`,
      allowedWorkflows: config.allowedWorkflows,
      checkedAt,
      message: result.message,
    };
  }

  async listWorkflows(): Promise<GitHubActionsListResponse<GitHubWorkflowSummary>> {
    const config = getConfig();
    const base = await this._emptyIfNotConfigured<GitHubWorkflowSummary>(config);
    if (base) return base;

    const response = await this._request<{ workflows?: GitHubWorkflowApi[] }>('actions/workflows?per_page=50', config);
    return {
      status: response.status,
      configured: true,
      repository: `${config.owner}/${config.repo}`,
      checkedAt: new Date().toISOString(),
      message: response.message,
      items: (response.data?.workflows ?? [])
        .filter((workflow) => config.allowedWorkflows.length === 0 || config.allowedWorkflows.includes(workflow.path ?? ''))
        .map((workflow) => ({
          id: workflow.id,
          name: workflow.name ?? workflow.path ?? 'Workflow',
          path: workflow.path ?? '-',
          state: workflow.state ?? 'unknown',
          url: workflow.html_url ?? null,
          badgeUrl: workflow.badge_url ?? null,
        })),
    };
  }

  async listRuns(): Promise<GitHubActionsListResponse<GitHubWorkflowRunSummary>> {
    const config = getConfig();
    const base = await this._emptyIfNotConfigured<GitHubWorkflowRunSummary>(config);
    if (base) return base;

    const response = await this._request<{ workflow_runs?: GitHubRunApi[] }>('actions/runs?per_page=20', config);
    return {
      status: response.status,
      configured: true,
      repository: `${config.owner}/${config.repo}`,
      checkedAt: new Date().toISOString(),
      message: response.message,
      items: (response.data?.workflow_runs ?? []).map((run) => ({
        id: run.id,
        name: run.display_title ?? run.name ?? null,
        workflowName: run.workflow_name ?? null,
        status: run.status ?? null,
        conclusion: run.conclusion ?? null,
        branch: run.head_branch ?? null,
        event: run.event ?? null,
        commitSha: run.head_sha ? run.head_sha.slice(0, 12) : null,
        runNumber: run.run_number ?? null,
        createdAt: run.created_at ?? null,
        updatedAt: run.updated_at ?? null,
        htmlUrl: run.html_url ?? null,
      })),
    };
  }

  async listJobs(runId: string): Promise<GitHubActionsListResponse<GitHubWorkflowJobSummary>> {
    const config = getConfig();
    const base = await this._emptyIfNotConfigured<GitHubWorkflowJobSummary>(config);
    if (base) return base;

    const response = await this._request<{ jobs?: GitHubJobApi[] }>(`actions/runs/${runId}/jobs?per_page=50`, config);
    return {
      status: response.status,
      configured: true,
      repository: `${config.owner}/${config.repo}`,
      checkedAt: new Date().toISOString(),
      message: response.message,
      items: (response.data?.jobs ?? []).map((job) => ({
        id: job.id,
        name: job.name ?? 'Job',
        status: job.status ?? null,
        conclusion: job.conclusion ?? null,
        startedAt: job.started_at ?? null,
        completedAt: job.completed_at ?? null,
        htmlUrl: job.html_url ?? null,
      })),
    };
  }

  private async _emptyIfNotConfigured<T>(config: GitHubConfig): Promise<GitHubActionsListResponse<T> | null> {
    if (config.enabled && config.token) return null;
    return {
      status: GitHubActionsConnectionStatus.NOT_CONFIGURED,
      configured: false,
      repository: `${config.owner}/${config.repo}`,
      checkedAt: new Date().toISOString(),
      message: 'GitHub Actions token is not configured.',
      items: [],
    };
  }

  private async _request<T>(
    path: string,
    config: GitHubConfig,
  ): Promise<{ status: GitHubActionsStatusResponse['status']; message: string; data?: T }> {
    try {
      const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.token}`,
          'User-Agent': 'AutoOps-Control-Plane',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (response.status === 401 || response.status === 403) {
        return { status: GitHubActionsConnectionStatus.AUTH_FAILED, message: 'GitHub token was rejected or lacks repository Actions read access.' };
      }
      if (!response.ok) {
        return { status: GitHubActionsConnectionStatus.UNREACHABLE, message: `GitHub API returned HTTP ${response.status}.` };
      }
      return {
        status: GitHubActionsConnectionStatus.CONNECTED,
        message: 'GitHub Actions API is reachable.',
        data: (await response.json()) as T,
      };
    } catch {
      return { status: GitHubActionsConnectionStatus.UNREACHABLE, message: 'GitHub Actions API is unreachable.' };
    }
  }
}

export const githubActionsService = new GitHubActionsService();
