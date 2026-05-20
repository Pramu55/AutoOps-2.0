'use client';

import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import Link from 'next/link';
import type { Deployment, Environment, Project } from '@autoops/types';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  GitMerge,
  Network,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { getPrimaryOrganizationRole, isAdminConsoleRole, type ConsoleRole } from '@/lib/role';

type ProjectsResponse = { data: Project[] };
type DeploymentsResponse = { data: Deployment[] };
type EnvironmentsResponse = { data: Environment[] };
type DeploymentFilter = 'ALL' | 'ACTIVE' | 'SUCCEEDED' | 'FAILED';
type HealthState = 'checking' | 'online' | 'offline';

const ACTIVE_STATUSES = new Set(['QUEUED', 'BUILDING', 'DEPLOYING', 'RUNNING']);
const POLL_INTERVAL_MS = 15_000;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load dashboard data.';
}

function formatTime(value: Date | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function formatDuration(value: number | null): string {
  if (value === null) return 'Pending';
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : 'No SHA';
}

function statusClass(status: string): string {
  if (status === 'SUCCEEDED') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  if (status === 'FAILED') return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  if (ACTIVE_STATUSES.has(status)) return 'border-cyan-300/25 bg-cyan-300/10 text-blue-700';
  return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
}

function ReadinessRow({ label, value, tone }: { label: string; value: string; tone: 'green' | 'amber' | 'rose' | 'blue' }) {
  const toneClass = {
    green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700',
    amber: 'border-amber-400/25 bg-amber-400/10 text-amber-700',
    rose: 'border-rose-400/25 bg-rose-400/10 text-rose-700',
    blue: 'border-cyan-400/25 bg-cyan-400/10 text-blue-700',
  }[tone];

  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-200 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-sm text-slate-700">{label}</span>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

function AdminOverview({
  role,
  projects,
  environments,
  deployments,
  healthState,
  environmentError,
  lastUpdated,
  isLoading,
  isRefreshing,
  onRefresh,
}: {
  role: ConsoleRole;
  projects: Project[];
  environments: Environment[];
  deployments: Deployment[];
  healthState: HealthState;
  environmentError: boolean;
  lastUpdated: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const activeDeployments = deployments.filter((deployment) => ACTIVE_STATUSES.has(deployment.status)).length;
  const failedDeployments = deployments.filter((deployment) => deployment.status === 'FAILED').length;
  const adminActions: Array<{
    title: string;
    description: string;
    href: string;
    icon: ElementType;
  }> = [
    {
      title: 'Approval queue',
      description: 'Approve or reject held Docker and Kubernetes operations.',
      href: '/dashboard/operations#approvals',
      icon: ShieldCheck,
    },
    {
      title: 'Incident command',
      description: 'Acknowledge and resolve failed-operation incidents.',
      href: '/dashboard/incidents',
      icon: AlertTriangle,
    },
    {
      title: 'Runtime health',
      description: 'Verify API, queue, provider, and worker readiness.',
      href: '/dashboard/operations#runtime-health',
      icon: RadioTower,
    },
    {
      title: 'Operator activity',
      description: 'Audit recent operation history and decisions.',
      href: '/dashboard/operations#activity',
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="overflow-hidden rounded-md border border-[#c7d2fe] bg-white shadow-sm">
        <div className="border-b border-[#d5dbdb] bg-[linear-gradient(90deg,#f7fbff,#eef6ff,#ffffff)] px-6 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#2563eb]">Admin control center</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#16191f] lg:text-4xl">
                AutoOps administration
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#414d5c]">
                This admin workspace controls the operator platform: approvals, incidents, runtime
                readiness, governance, and service access. Operators use the governed console; admins
                supervise and decide.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#2563eb]/20 bg-[#eff6ff] px-3 py-1.5 text-xs font-bold text-[#1d4ed8]">
                {role}
              </span>
              <span className="rounded-full border border-[#d5dbdb] bg-white px-3 py-1.5 text-xs text-[#5f6b7a]">
                Updated {formatTime(lastUpdated)}
              </span>
              <Button
                type="button"
                onClick={onRefresh}
                disabled={isLoading || isRefreshing}
                className="rounded bg-[#0078d4] text-white hover:bg-[#106ebe]"
              >
                <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-[#d5dbdb] md:grid-cols-4">
          {[
            ['Projects governed', projects.length],
            ['Environments', environments.length],
            ['Active deployments', activeDeployments],
            ['Failed deployments', failedDeployments],
          ].map(([label, value]) => (
            <div key={label} className="bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#5f6b7a]">{label}</p>
              <p className="mt-2 text-3xl font-bold text-[#16191f]">{isLoading ? '...' : value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-md border border-[#d5dbdb] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[#16191f]">Admin command actions</h2>
              <p className="mt-1 text-sm text-[#5f6b7a]">
                Review decisions, supervise incidents, and verify runtime health before operators continue.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#0078d4]" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {adminActions.map(({ title, description, href, icon: Icon }) => (
              <Link
                key={title}
                href={href}
                className="rounded-md border border-[#d5dbdb] bg-[#f8fafd] p-4 transition hover:border-[#0078d4] hover:bg-[#eef6ff]"
              >
                <Icon className="h-5 w-5 text-[#0078d4]" />
                <p className="mt-3 font-bold text-[#16191f]">{title}</p>
                <p className="mt-1 text-sm leading-6 text-[#5f6b7a]">{description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[#d5dbdb] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[#16191f]">Platform readiness</h2>
          <p className="mt-1 text-sm text-[#5f6b7a]">Admin-only summary of the operator platform boundary.</p>
          <div className="mt-5">
            <ReadinessRow
              label="API health"
              value={healthState === 'online' ? 'Online' : healthState === 'checking' ? 'Checking' : 'Offline'}
              tone={healthState === 'online' ? 'green' : healthState === 'checking' ? 'amber' : 'rose'}
            />
            <ReadinessRow label="Projects API" value={`${projects.length} records`} tone="blue" />
            <ReadinessRow
              label="Environment API"
              value={environmentError ? 'Partial' : `${environments.length} targets`}
              tone={environmentError ? 'amber' : 'blue'}
            />
            <ReadinessRow label="Deployment API" value={`${deployments.length} records`} tone="blue" />
          </div>
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Admins do not bypass RBAC. Requester self-approval remains blocked by the backend.
          </div>
        </section>
      </div>
    </div>
  );
}

export function DashboardOverviewClient() {
  const [consoleRole, setConsoleRole] = useState<ConsoleRole | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [filter, setFilter] = useState<DeploymentFilter>('ALL');
  const [query, setQuery] = useState('');
  const [healthState, setHealthState] = useState<HealthState>('checking');
  const [environmentError, setEnvironmentError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    setEnvironmentError(false);

    try {
      const [projectsResponse, deploymentsResponse] = await Promise.all([
        api.get<ProjectsResponse>('/v1/projects'),
        api.get<DeploymentsResponse>('/v1/deployments'),
      ]);

      const environmentResults = await Promise.allSettled(
        projectsResponse.data.map((project) => api.get<EnvironmentsResponse>(`/v1/projects/${project.id}/environments`)),
      );
      const loadedEnvironments = environmentResults.flatMap((result) => (result.status === 'fulfilled' ? result.value.data : []));

      setProjects(projectsResponse.data);
      setDeployments(deploymentsResponse.data);
      setEnvironments(loadedEnvironments);
      setHealthState('online');
      setEnvironmentError(environmentResults.some((result) => result.status === 'rejected'));
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setHealthState('offline');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview('initial');
  }, [loadOverview]);

  useEffect(() => {
    setConsoleRole(getPrimaryOrganizationRole());
  }, []);

  useEffect(() => {
    if (!isLive) return undefined;
    const intervalId = window.setInterval(() => {
      void loadOverview();
    }, POLL_INTERVAL_MS);

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        void loadOverview();
      }
    }

    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isLive, loadOverview]);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const environmentById = useMemo(() => new Map(environments.map((environment) => [environment.id, environment])), [environments]);

  const deploymentStats = useMemo(
    () => ({
      total: deployments.length,
      active: deployments.filter((deployment) => ACTIVE_STATUSES.has(deployment.status)).length,
      succeeded: deployments.filter((deployment) => deployment.status === 'SUCCEEDED').length,
      failed: deployments.filter((deployment) => deployment.status === 'FAILED').length,
      averageDuration:
        deployments.filter((deployment) => deployment.durationMs !== null).reduce((total, deployment) => total + (deployment.durationMs ?? 0), 0) /
        Math.max(1, deployments.filter((deployment) => deployment.durationMs !== null).length),
    }),
    [deployments],
  );

  const filteredDeployments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return deployments
      .filter((deployment) => {
        if (filter === 'ACTIVE') return ACTIVE_STATUSES.has(deployment.status);
        if (filter === 'SUCCEEDED') return deployment.status === 'SUCCEEDED';
        if (filter === 'FAILED') return deployment.status === 'FAILED';
        return true;
      })
      .filter((deployment) => {
        if (!normalizedQuery) return true;
        const project = projectById.get(deployment.projectId);
        const environment = environmentById.get(deployment.environmentId);
        return [
          deployment.id,
          deployment.status,
          deployment.trigger,
          deployment.commitSha,
          deployment.branch,
          project?.name,
          project?.slug,
          environment?.name,
          environment?.slug,
          environment?.kind,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      })
      .slice(0, 8);
  }, [deployments, environmentById, filter, projectById, query]);

  if (isAdminConsoleRole(consoleRole)) {
    return (
      <AdminOverview
        role={consoleRole ?? 'ADMIN'}
        projects={projects}
        environments={environments}
        deployments={deployments}
        healthState={healthState}
        environmentError={environmentError}
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        onRefresh={() => void loadOverview()}
      />
    );
  }

  const attentionItems = [
    deploymentStats.failed > 0
      ? {
          label: `${deploymentStats.failed} failed deployment${deploymentStats.failed === 1 ? '' : 's'}`,
          detail: 'Open deployments to inspect the failed record.',
          href: '/dashboard/deployments',
          tone: 'rose' as const,
        }
      : null,
    deploymentStats.active > 0
      ? {
          label: `${deploymentStats.active} active deployment${deploymentStats.active === 1 ? '' : 's'}`,
          detail: 'Deployment work is currently in flight.',
          href: '/dashboard/deployments',
          tone: 'amber' as const,
        }
      : null,
    healthState === 'offline'
      ? {
          label: 'API health check offline',
          detail: 'Refresh or inspect runtime health before operating.',
          href: '/dashboard/operations#runtime-health',
          tone: 'rose' as const,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; href: string; tone: 'rose' | 'amber' }>;

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="rounded-md border border-[#d5dbdb] bg-white shadow-sm">
        <div className="border-b border-[#d5dbdb] bg-[#f8fafd] px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#5f6b7a]">Console home</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#16191f] lg:text-3xl">
                AutoOps command overview
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#414d5c]">
                Start here to monitor what is running, open service connectors, inspect incidents,
                and review real deployment activity.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                <span className={cn('h-2 w-2 rounded-full', isLive ? 'animate-pulse bg-emerald-500' : 'bg-slate-400')} />
                {isLive ? 'Live' : 'Paused'}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
                Updated {formatTime(lastUpdated)}
              </span>
              <Button
                type="button"
                onClick={() => void loadOverview()}
                disabled={isLoading || isRefreshing}
                className="h-9 rounded bg-[#0972d3] text-white hover:bg-[#075eb0]"
              >
                <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLive((value) => !value)}
                className="h-9 rounded border-[#d5dbdb] bg-white"
              >
                {isLive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isLive ? 'Pause' : 'Resume'}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-[#d5dbdb] sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Projects', value: projects.length, href: '/dashboard/projects' },
            { label: 'Environments', value: environments.length, href: '/dashboard/projects' },
            { label: 'Deployments', value: deploymentStats.total, href: '/dashboard/deployments' },
            { label: 'Active', value: deploymentStats.active, href: '/dashboard/deployments' },
            { label: 'Failed', value: deploymentStats.failed, href: '/dashboard/deployments' },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="bg-white px-5 py-4 transition hover:bg-[#f7fbff]">
              <p className="text-xs font-bold uppercase tracking-wide text-[#5f6b7a]">{item.label}</p>
              <p className="mt-2 text-2xl font-bold text-[#16191f]">{isLoading ? '...' : item.value}</p>
            </Link>
          ))}
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-md border border-[#d5dbdb] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#16191f]">Start here</h2>
            <p className="mt-1 text-sm text-[#5f6b7a]">Common service paths, kept short like a cloud console home.</p>
          </div>
          <Button asChild variant="outline" className="h-9 rounded border-[#d5dbdb] bg-white">
            <Link href="/dashboard/operations">
              Open Operations Hub <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: 'Docker', body: 'Containers, logs, start/stop/restart controls.', href: '/dashboard/integrations/docker', icon: Database },
            { title: 'Kubernetes', body: 'Workloads, pods, services, scale and rollout.', href: '/dashboard/integrations/kubernetes', icon: Network },
            { title: 'Jenkins', body: 'Allowlisted build jobs and build activity.', href: '/dashboard/integrations/jenkins', icon: GitMerge },
            { title: 'Incidents', body: 'Failed operations, runbooks, acknowledge/resolve.', href: '/dashboard/incidents', icon: AlertTriangle },
          ].map(({ title, body, href, icon: Icon }) => (
            <Link
              key={title}
              href={href}
              className="rounded-md border border-[#d5dbdb] bg-[#f8fafd] p-4 transition hover:border-[#0972d3] hover:bg-[#eef6ff]"
            >
              <Icon className="h-5 w-5 text-[#0972d3]" />
              <p className="mt-3 font-bold text-[#16191f]">{title}</p>
              <p className="mt-1 text-sm leading-6 text-[#5f6b7a]">{body}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-md border border-[#d5dbdb] bg-white shadow-sm">
          <div className="border-b border-[#d5dbdb] px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#16191f]">Deployment activity</h2>
                <p className="mt-1 text-sm text-[#5f6b7a]">Real deployment records from the API.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search deployments"
                    className="h-9 w-full rounded border-[#d5dbdb] bg-white pl-9 sm:w-64"
                  />
                </div>
                <Button asChild className="h-9 rounded bg-[#ff9900] text-[#16191f] hover:bg-[#ec8b00]">
                  <Link href="/dashboard/deployments">
                    View all <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: 'ALL' as const, label: 'All' },
                { value: 'ACTIVE' as const, label: 'Active' },
                { value: 'SUCCEEDED' as const, label: 'Succeeded' },
                { value: 'FAILED' as const, label: 'Failed' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    'rounded border px-3 py-1.5 text-xs font-semibold transition',
                    filter === item.value
                      ? 'border-[#0972d3] bg-[#eef6ff] text-[#075eb0]'
                      : 'border-[#d5dbdb] bg-white text-[#414d5c] hover:bg-[#f8fafd]',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#d5dbdb] text-sm">
              <thead className="bg-[#f8fafd] text-left text-xs font-bold uppercase tracking-wide text-[#5f6b7a]">
                <tr>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Project</th>
                  <th className="px-5 py-3">Environment</th>
                  <th className="px-5 py-3">Commit</th>
                  <th className="px-5 py-3">Duration</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e7ecef] bg-white">
                {filteredDeployments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#5f6b7a]">
                      No deployment records match this view.
                    </td>
                  </tr>
                ) : (
                  filteredDeployments.map((deployment) => {
                    const project = projectById.get(deployment.projectId);
                    const environment = environmentById.get(deployment.environmentId);

                    return (
                      <tr key={deployment.id} className="hover:bg-[#f8fafd]">
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(deployment.status)}`}>
                            {deployment.status}
                          </span>
                        </td>
                        <td className="max-w-[14rem] truncate px-5 py-3 font-medium text-[#16191f]">
                          {project?.name ?? `Project ${deployment.projectId}`}
                        </td>
                        <td className="max-w-[12rem] truncate px-5 py-3 text-[#414d5c]">
                          {environment?.name ?? `Environment ${deployment.environmentId}`}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-[#414d5c]">
                          {shortSha(deployment.commitSha)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-[#414d5c]">
                          {formatDuration(deployment.durationMs)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <Link href={`/dashboard/deployments/${deployment.id}`} className="font-semibold text-[#0972d3] hover:underline">
                            Details
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-md border border-[#d5dbdb] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#16191f]">Needs attention</h2>
            <div className="mt-4 space-y-3">
              {attentionItems.length === 0 ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  No active deployment problems detected.
                </div>
              ) : (
                attentionItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      'block rounded-md border p-4 text-sm transition hover:bg-white',
                      item.tone === 'rose'
                        ? 'border-rose-200 bg-rose-50 text-rose-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900',
                    )}
                  >
                    <p className="font-bold">{item.label}</p>
                    <p className="mt-1 leading-6">{item.detail}</p>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="rounded-md border border-[#d5dbdb] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#16191f]">Platform readiness</h2>
            <div className="mt-4">
              <ReadinessRow
                label="API health"
                value={healthState === 'checking' ? 'Checking' : healthState === 'online' ? 'Online' : 'Offline'}
                tone={healthState === 'online' ? 'green' : healthState === 'checking' ? 'amber' : 'rose'}
              />
              <ReadinessRow label="Projects" value={`${projects.length} records`} tone="blue" />
              <ReadinessRow
                label="Environments"
                value={environmentError ? 'Partial' : `${environments.length} targets`}
                tone={environmentError ? 'amber' : 'blue'}
              />
              <ReadinessRow label="Deployments" value={`${deployments.length} records`} tone="blue" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
