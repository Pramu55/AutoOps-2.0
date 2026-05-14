'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { Deployment, Environment, Project, TriggerDeploymentInput } from '@autoops/types';
import { DeploymentTrigger } from '@autoops/types';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  GitBranch,
  GitCommit,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Timer,
  Zap,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type DeploymentsResponse = {
  data: Deployment[];
};

type DeploymentResponse = {
  data: Deployment;
};

type ProjectsResponse = {
  data: Project[];
};

type EnvironmentsResponse = {
  data: Environment[];
};

const terminalStatuses = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'ROLLED_BACK']);
const gitShaPattern = /^[a-f0-9]{7,40}$/i;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong while loading deployments.';
}

function formatDate(value: string | null): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null) return 'Pending';
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : 'Not provided';
}

function statusClass(status: string): string {
  if (status === 'SUCCEEDED') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
  if (status === 'FAILED') return 'border-destructive/40 bg-destructive/10 text-destructive';
  if (status === 'RUNNING' || status === 'DEPLOYING' || status === 'BUILDING') {
    return 'border-primary/25 bg-primary/10 text-primary';
  }
  if (status === 'QUEUED') return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
  return 'border-border bg-muted text-muted-foreground';
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <section className="glass rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
    </section>
  );
}

export function DeploymentsClient() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingEnvironments, setIsLoadingEnvironments] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [showTriggerForm, setShowTriggerForm] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerSuccess, setTriggerSuccess] = useState<Deployment | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [branch, setBranch] = useState('');

  const loadDeployments = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setLoadError(null);

    try {
      const response = await api.get<DeploymentsResponse>('/v1/deployments');
      setDeployments(response.data);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDeployments('initial');
  }, [loadDeployments]);

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setTriggerError(null);

    try {
      const response = await api.get<ProjectsResponse>('/v1/projects');
      setProjects(response.data);
      const firstProject = response.data[0]?.id ?? '';
      setSelectedProjectId((current) => current || firstProject);
    } catch (error) {
      setTriggerError(getErrorMessage(error));
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadEnvironments = useCallback(async (projectId: string) => {
    if (!projectId) {
      setEnvironments([]);
      setSelectedEnvironmentId('');
      return;
    }

    setIsLoadingEnvironments(true);
    setTriggerError(null);

    try {
      const response = await api.get<EnvironmentsResponse>(`/v1/projects/${projectId}/environments`);
      setEnvironments(response.data);
      setSelectedEnvironmentId(response.data[0]?.id ?? '');
    } catch (error) {
      setEnvironments([]);
      setSelectedEnvironmentId('');
      setTriggerError(getErrorMessage(error));
    } finally {
      setIsLoadingEnvironments(false);
    }
  }, []);

  useEffect(() => {
    void loadEnvironments(selectedProjectId);
  }, [loadEnvironments, selectedProjectId]);

  const stats = useMemo(() => {
    const active = deployments.filter((deployment) => !terminalStatuses.has(deployment.status)).length;
    const succeeded = deployments.filter((deployment) => deployment.status === 'SUCCEEDED').length;
    const failed = deployments.filter((deployment) => deployment.status === 'FAILED').length;

    return { active, succeeded, failed, total: deployments.length };
  }, [deployments]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedEnvironment = environments.find((environment) => environment.id === selectedEnvironmentId);
  const canSubmit =
    Boolean(selectedProjectId) &&
    Boolean(selectedEnvironmentId) &&
    gitShaPattern.test(commitSha.trim()) &&
    !isTriggering &&
    !isLoadingProjects &&
    !isLoadingEnvironments;

  async function handleTriggerDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTriggerError(null);
    setTriggerSuccess(null);

    const normalizedCommitSha = commitSha.trim();
    const normalizedBranch = branch.trim();

    if (!selectedProjectId || !selectedEnvironmentId) {
      setTriggerError('Select a project and environment before triggering a deployment.');
      return;
    }

    if (!gitShaPattern.test(normalizedCommitSha)) {
      setTriggerError('Commit SHA must be 7 to 40 hexadecimal characters.');
      return;
    }

    const payload: TriggerDeploymentInput = {
      commitSha: normalizedCommitSha,
      branch: normalizedBranch || undefined,
      trigger: DeploymentTrigger.MANUAL,
    };

    setIsTriggering(true);

    try {
      const response = await api.post<DeploymentResponse>(
        `/v1/projects/${selectedProjectId}/environments/${selectedEnvironmentId}/deployments`,
        payload,
      );
      setTriggerSuccess(response.data);
      await loadDeployments();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setTriggerError('An active deployment already exists for this environment.');
      } else {
        setTriggerError(getErrorMessage(error));
      }
    } finally {
      setIsTriggering(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.20),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/20">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Release Operations</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Deployments</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Real deployment records from the AutoOps API, including queue production,
              worker lifecycle state, simulation execution metadata, and terminal outcomes.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadDeployments()}
              disabled={isLoading || isRefreshing}
              className="border-white/10 bg-white/5 hover:bg-white/10"
            >
              <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
            <Button
              type="button"
              onClick={() => setShowTriggerForm((value) => !value)}
              className="bg-gradient-to-r from-blue-600 to-violet-600 shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-violet-500"
            >
              <Plus className="h-4 w-4" />
              New Deployment
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Records" value={String(stats.total)} icon={<History className="h-5 w-5" />} />
        <StatCard label="Active" value={String(stats.active)} icon={<Zap className="h-5 w-5" />} />
        <StatCard label="Succeeded" value={String(stats.succeeded)} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Failed" value={String(stats.failed)} icon={<AlertCircle className="h-5 w-5" />} />
      </div>

      {showTriggerForm ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Trigger Deployment</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Creates a real deployment record and queues the worker simulation executor. No real
                infrastructure execution is active.
              </p>
            </div>
            <Rocket className="h-5 w-5 text-primary" />
          </div>

          <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200">
            Deployments currently run through the safe simulation executor. No real Docker,
            Terraform, Kubernetes, or cloud execution is active.
          </div>

          <form className="mt-5 space-y-5" onSubmit={handleTriggerDeployment}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deployment-project">Project</Label>
                <select
                  id="deployment-project"
                  required
                  value={selectedProjectId}
                  disabled={isLoadingProjects || isTriggering}
                  onChange={(event) => {
                    setSelectedProjectId(event.target.value);
                    setTriggerSuccess(null);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-input px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-ring"
                >
                  <option value="" disabled>
                    {isLoadingProjects ? 'Loading projects...' : 'Select project'}
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {selectedProject ? (
                  <p className="text-xs text-muted-foreground">/{selectedProject.slug}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="deployment-environment">Environment</Label>
                <select
                  id="deployment-environment"
                  required
                  value={selectedEnvironmentId}
                  disabled={!selectedProjectId || isLoadingEnvironments || isTriggering || environments.length === 0}
                  onChange={(event) => {
                    setSelectedEnvironmentId(event.target.value);
                    setTriggerSuccess(null);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-input px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-ring"
                >
                  <option value="" disabled>
                    {isLoadingEnvironments ? 'Loading environments...' : 'Select environment'}
                  </option>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name} ({environment.kind})
                    </option>
                  ))}
                </select>
                {selectedProjectId && !isLoadingEnvironments && environments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Create an environment before triggering a deployment.
                  </p>
                ) : selectedEnvironment ? (
                  <p className="text-xs text-muted-foreground">/{selectedEnvironment.slug}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="deployment-commit">Commit SHA</Label>
                <Input
                  id="deployment-commit"
                  required
                  value={commitSha}
                  placeholder="7777777777777777777777777777777777777777"
                  pattern="[A-Fa-f0-9]{7,40}"
                  disabled={isTriggering}
                  onChange={(event) => {
                    setCommitSha(event.target.value);
                    setTriggerSuccess(null);
                  }}
                />
                <p className="text-xs text-muted-foreground">Must be 7 to 40 hexadecimal characters.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deployment-branch">Branch</Label>
                <Input
                  id="deployment-branch"
                  value={branch}
                  maxLength={255}
                  placeholder={selectedProject?.defaultBranch ?? 'main'}
                  disabled={isTriggering}
                  onChange={(event) => setBranch(event.target.value)}
                />
              </div>
            </div>

            {triggerSuccess ? (
              <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 sm:flex-row sm:items-center sm:justify-between">
                <span>Deployment created and queued for simulation.</span>
                <Button asChild type="button" variant="outline" size="sm">
                  <Link href={`/dashboard/deployments/${triggerSuccess.id}`}>View Details</Link>
                </Button>
              </div>
            ) : null}

            {triggerError ? (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {triggerError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!canSubmit}>
                {isTriggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {isTriggering ? 'Triggering...' : 'Trigger Deployment'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isTriggering}
                onClick={() => {
                  setShowTriggerForm(false);
                  setTriggerError(null);
                }}
              >
                Close
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Deployment Records</h2>
            <p className="mt-1 text-sm text-muted-foreground">Real data from GET /api/v1/deployments.</p>
          </div>
          <History className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="mt-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-background/30 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading deployments from the API...
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">Unable to load deployments</p>
                  <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
                </div>
              </div>
            </div>
          ) : deployments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/30 p-8 text-center">
              <p className="text-sm font-medium text-foreground">No deployments yet</p>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                Deployment records will appear after a project environment deployment is triggered
                through the existing API.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="hidden grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr_0.8fr] gap-4 border-b border-white/10 bg-white/[0.045] px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground xl:grid">
                <span>Status</span>
                <span>Project / Environment</span>
                <span>Source</span>
                <span>Timing</span>
                <span>Created</span>
                <span>Action</span>
              </div>
              <div className="divide-y divide-border">
                {deployments.map((deployment) => (
                  <article
                    key={deployment.id}
                    className="grid grid-cols-1 gap-4 bg-background/25 p-4 transition hover:bg-white/[0.035] xl:grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr_0.8fr] xl:items-center"
                  >
                    <div>
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${statusClass(deployment.status)}`}>
                        {deployment.status}
                      </span>
                      <p className="mt-2 break-all text-xs text-muted-foreground">{deployment.id}</p>
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="truncate text-foreground">Project {deployment.projectId}</p>
                      <p className="mt-1 truncate text-muted-foreground">Environment {deployment.environmentId}</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="flex items-center gap-2 text-foreground">
                        <GitCommit className="h-4 w-4 text-muted-foreground" />
                        {shortSha(deployment.commitSha)}
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <GitBranch className="h-4 w-4" />
                        {deployment.branch ?? 'No branch'}
                      </p>
                      <p className="text-xs text-muted-foreground">{deployment.trigger}</p>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4" />
                        Started {formatDate(deployment.startedAt)}
                      </p>
                      <p className="flex items-center gap-2">
                        <Timer className="h-4 w-4" />
                        {formatDuration(deployment.durationMs)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatDate(deployment.createdAt)}</p>
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link href={`/dashboard/deployments/${deployment.id}`}>View Details</Link>
                    </Button>
                    {deployment.errorMessage ? (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive xl:col-span-6">
                        {deployment.errorMessage}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
