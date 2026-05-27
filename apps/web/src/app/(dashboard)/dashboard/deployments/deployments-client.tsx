'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { Deployment, Environment, Project, TriggerDeploymentInput } from '@autoops/types';
import { DeploymentTrigger } from '@autoops/types';
import {
  AlertCircle,
  Clock3,
  GitBranch,
  GitCommit,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Timer,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';

type DeploymentsResponse = { data: Deployment[] };
type DeploymentResponse = { data: Deployment };
type ProjectsResponse = { data: Project[] };
type EnvironmentsResponse = { data: Environment[] };

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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDeployments = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    setLoadError(null);

    try {
      const response = await api.get<DeploymentsResponse>('/v1/deployments');
      setDeployments(response.data);
      setLastUpdated(new Date());
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
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Deployments Workspace"
        purpose="Orchestrate release operations mapped to your configured projects."
        icon={<Rocket className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Command', href: '/dashboard' }, { label: 'Deployments' }]}
        statusSummary={
          <div className="flex items-center gap-3">
             <span className="text-xs text-slate-500">Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadDeployments()}
                disabled={isLoading || isRefreshing}
                className="bg-white"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowTriggerForm(!showTriggerForm)}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Deployment
              </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
             <p className="text-xs uppercase tracking-wide text-slate-500">Total Records</p>
             <p className="mt-2 text-2xl font-semibold text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
             <p className="text-xs uppercase tracking-wide text-slate-500">Active</p>
             <p className="mt-2 text-2xl font-semibold text-blue-600">{stats.active}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
             <p className="text-xs uppercase tracking-wide text-slate-500">Succeeded</p>
             <p className="mt-2 text-2xl font-semibold text-emerald-600">{stats.succeeded}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
             <p className="text-xs uppercase tracking-wide text-slate-500">Failed</p>
             <p className="mt-2 text-2xl font-semibold text-rose-600">{stats.failed}</p>
          </div>
        </div>

        {showTriggerForm && (
          <EvidencePanel title="Trigger Deployment" icon={<Rocket className="h-4 w-4 text-blue-600" />}>
             <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-blue-700 mb-5">
              Deployments currently run through the safe simulation executor. No real Docker,
              Terraform, Kubernetes, or cloud execution is active.
            </div>

            <form className="space-y-5" onSubmit={handleTriggerDeployment}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-sm">
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
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="" disabled>{isLoadingProjects ? 'Loading projects...' : 'Select project'}</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  {selectedProject && <p className="text-xs text-slate-500 font-mono">/{selectedProject.slug}</p>}
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
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="" disabled>{isLoadingEnvironments ? 'Loading environments...' : 'Select environment'}</option>
                    {environments.map((env) => <option key={env.id} value={env.id}>{env.name} ({env.kind})</option>)}
                  </select>
                  {selectedProjectId && !isLoadingEnvironments && environments.length === 0 ? (
                    <p className="text-xs text-slate-500">Create an environment before triggering a deployment.</p>
                  ) : selectedEnvironment ? (
                    <p className="text-xs text-slate-500 font-mono">/{selectedEnvironment.slug}</p>
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
                    className="border-slate-200"
                  />
                  <p className="text-xs text-slate-500">Must be 7 to 40 hexadecimal characters.</p>
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
                    className="border-slate-200"
                  />
                </div>
              </div>

              {triggerSuccess && (
                <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 sm:flex-row sm:items-center sm:justify-between">
                  <span>Deployment created and queued for simulation.</span>
                  <Button asChild type="button" variant="outline" size="sm" className="bg-white">
                    <Link href={`/dashboard/deployments/${triggerSuccess.id}`}>View Details</Link>
                  </Button>
                </div>
              )}

              {triggerError && (
                <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <AlertCircle className="h-4 w-4" />
                  {triggerError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" disabled={isTriggering} onClick={() => { setShowTriggerForm(false); setTriggerError(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit} className="bg-slate-900 text-white hover:bg-slate-800">
                  {isTriggering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}
                  {isTriggering ? 'Triggering...' : 'Trigger Deployment'}
                </Button>
              </div>
            </form>
          </EvidencePanel>
        )}

        {loadError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 text-rose-600" />
              <div>
                <p className="text-sm font-medium text-rose-900">Unable to load deployments</p>
                <p className="mt-1 text-sm text-rose-700">{loadError}</p>
              </div>
            </div>
          </div>
        )}

        <WorkQueue
          title="Deployment History"
          description="Real deployment records from the AutoOps API."
          isEmpty={deployments.length === 0}
          emptyState={
            <EmptyState 
              title="No deployments yet" 
              description="Deployment records will appear after a project environment deployment is triggered." 
              icon={<History className="text-slate-400" />} 
              variant="compact" 
            />
          }
        >
          {deployments.map((deployment) => (
            <div key={deployment.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1 items-center mr-4">
                
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                     <StatusBadge status={deployment.status} />
                     <span className="text-xs text-slate-500 font-mono">{deployment.id.split('-')[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Project {deployment.projectId}</p>
                    <p className="text-xs text-slate-500">Env {deployment.environmentId}</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                   <p className="flex items-center gap-2">
                    <GitCommit className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-mono">{shortSha(deployment.commitSha)}</span>
                  </p>
                  <p className="flex items-center gap-2 text-slate-500">
                    <GitBranch className="h-3.5 w-3.5 text-slate-400" />
                    {deployment.branch ?? 'No branch'}
                  </p>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px]">{deployment.trigger}</p>
                </div>

                <div className="space-y-1.5 text-xs text-slate-500">
                  <p className="flex items-center gap-2">
                    <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                    {formatDate(deployment.startedAt)}
                  </p>
                  <p className="flex items-center gap-2">
                    <Timer className="h-3.5 w-3.5 text-slate-400" />
                    {formatDuration(deployment.durationMs)}
                  </p>
                </div>

              </div>

              <div className="mt-4 sm:mt-0 shrink-0 flex flex-col items-end gap-2">
                <Button asChild variant="outline" size="sm" className="bg-white">
                  <Link href={`/dashboard/deployments/${deployment.id}`}>View Details</Link>
                </Button>
              </div>

              {deployment.errorMessage && (
                 <div className="w-full mt-3 rounded border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                   {deployment.errorMessage}
                 </div>
              )}
            </div>
          ))}
        </WorkQueue>

      </div>
    </div>
  );
}
