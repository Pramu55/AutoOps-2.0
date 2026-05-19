'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Deployment, Environment, Project } from '@autoops/types';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock3,
  Database,
  GitCommit,
  GitMerge,
  Layers,
  Network,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

type ProjectsResponse = { data: Project[] };
type DeploymentsResponse = { data: Deployment[] };
type EnvironmentsResponse = { data: Environment[] };
type DeploymentFilter = 'ALL' | 'ACTIVE' | 'SUCCEEDED' | 'FAILED';
type HealthState = 'checking' | 'online' | 'offline';

const ACTIVE_STATUSES = new Set(['QUEUED', 'BUILDING', 'DEPLOYING', 'RUNNING']);
const POLL_INTERVAL_MS = 15_000;

interface MetricCardProps {
  label: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
  active?: boolean;
  tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';
  onClick: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load dashboard data.';
}

function formatDate(value: string | null): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

function MetricCard({ label, value, caption, icon, active = false, tone = 'blue', onClick }: MetricCardProps) {
  const toneClass = {
    blue: 'from-blue-500/18 to-cyan-400/8 text-blue-300',
    emerald: 'from-emerald-500/18 to-cyan-400/8 text-emerald-700',
    amber: 'from-amber-500/18 to-orange-400/8 text-amber-700',
    rose: 'from-rose-500/18 to-red-400/8 text-rose-700',
    violet: 'from-violet-500/18 to-blue-400/8 text-violet-300',
    cyan: 'from-cyan-500/18 to-blue-400/8 text-blue-600',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group rounded-md border bg-gradient-to-br p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300/30',
        active ? 'border-cyan-300/45 from-cyan-300/12 to-violet-500/10' : 'border-slate-200 from-white/[0.08] to-white/[0.025]',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          <p className="mt-2 text-sm text-slate-600">{caption}</p>
        </div>
        <div className={`rounded-xl bg-gradient-to-br p-2 ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-4 flex items-center gap-1 text-xs font-medium text-blue-600 opacity-0 transition group-hover:opacity-100">
        Filter stream <ArrowRight className="h-3 w-3" />
      </p>
    </button>
  );
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

export function DashboardOverviewClient() {
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
      const [projectsResponse, deploymentsResponse, healthResponse] = await Promise.all([
        api.get<ProjectsResponse>('/v1/projects'),
        api.get<DeploymentsResponse>('/v1/deployments'),
        fetch('/api/health', { cache: 'no-store' }).then((response) => response.ok).catch(() => false),
      ]);

      const environmentResults = await Promise.allSettled(
        projectsResponse.data.map((project) => api.get<EnvironmentsResponse>(`/v1/projects/${project.id}/environments`)),
      );
      const loadedEnvironments = environmentResults.flatMap((result) => (result.status === 'fulfilled' ? result.value.data : []));

      setProjects(projectsResponse.data);
      setDeployments(deploymentsResponse.data);
      setEnvironments(loadedEnvironments);
      setHealthState(healthResponse ? 'online' : 'offline');
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

  const latestDeployment = deployments[0] ?? null;
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

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.28),transparent_34%),radial-gradient(circle_at_90%_10%,rgba(124,58,237,0.24),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.025))] p-6 shadow-sm lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
        <div className="relative grid grid-cols-1 gap-8 xl:grid-cols-[0.88fr_1.12fr] xl:items-stretch">
          <div className="flex flex-col justify-between">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  <span className={cn('h-2 w-2 rounded-full', isLive ? 'animate-pulse bg-emerald-300' : 'bg-slate-500')} />
                  {isLive ? 'Live API polling' : 'Live polling paused'}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                  Updated {formatTime(lastUpdated)}
                </span>
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 lg:text-5xl">
                AutoOps command overview
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                A live operator workspace backed by real projects, real environments, real
                deployment records, and API health checks. No fabricated operational records.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void loadOverview()}
                disabled={isLoading || isRefreshing}
                className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
              >
                <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                Refresh real data
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLive((value) => !value)}
                className="rounded-full border-slate-200 bg-white hover:bg-slate-50"
              >
                {isLive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isLive ? 'Pause live mode' : 'Resume live mode'}
              </Button>
              <Button asChild variant="outline" className="rounded-full border-cyan-300/20 bg-cyan-300/10 text-blue-700 hover:bg-cyan-300/15">
                <Link href="/dashboard/deployments">
                  Deployment console <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live control graph</p>
                <p className="mt-1 text-sm font-medium text-slate-900">Project inventory to deployment timeline</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">
                Polls every {POLL_INTERVAL_MS / 1_000}s
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { href: '/dashboard/projects', label: 'Projects', value: projects.length, caption: 'real services', icon: Layers },
                { href: '/dashboard/projects', label: 'Environments', value: environments.length, caption: 'real targets', icon: Network },
                { href: '/dashboard/deployments', label: 'Deployments', value: deploymentStats.total, caption: 'real records', icon: GitMerge },
                { href: '/dashboard/deployments', label: 'Active queue', value: deploymentStats.active, caption: 'current work', icon: RadioTower },
              ].map(({ href, label, value, caption, icon: Icon }, index) => (
                <Link key={label} href={href} className="group relative rounded-md border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-blue-50">
                  {index < 3 ? <span className="absolute -right-3 top-1/2 hidden h-px w-3 bg-cyan-300/40 lg:block" /> : null}
                  <Icon className="h-4 w-4 text-blue-600" />
                  <p className="mt-4 text-2xl font-semibold text-slate-900">{isLoading ? '...' : value}</p>
                  <p className="mt-1 text-xs font-medium text-slate-700">{label}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{caption}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Projects"
          value={isLoading ? '...' : String(projects.length)}
          caption="Click to inspect inventory."
          icon={<Layers className="h-5 w-5" />}
          tone="blue"
          onClick={() => setFilter('ALL')}
        />
        <MetricCard
          label="Deployments"
          value={isLoading ? '...' : String(deploymentStats.total)}
          caption="All deployment records."
          icon={<GitMerge className="h-5 w-5" />}
          tone="violet"
          active={filter === 'ALL'}
          onClick={() => setFilter('ALL')}
        />
        <MetricCard
          label="Active"
          value={isLoading ? '...' : String(deploymentStats.active)}
          caption="Queued, building, deploying, running."
          icon={<Rocket className="h-5 w-5" />}
          tone="amber"
          active={filter === 'ACTIVE'}
          onClick={() => setFilter('ACTIVE')}
        />
        <MetricCard
          label="Succeeded"
          value={isLoading ? '...' : String(deploymentStats.succeeded)}
          caption="Terminal successful deployments."
          icon={<TrendingUp className="h-5 w-5" />}
          tone="emerald"
          active={filter === 'SUCCEEDED'}
          onClick={() => setFilter('SUCCEEDED')}
        />
        <MetricCard
          label="Failed"
          value={isLoading ? '...' : String(deploymentStats.failed)}
          caption="Terminal failed deployments."
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="rose"
          active={filter === 'FAILED'}
          onClick={() => setFilter('FAILED')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.45fr_0.95fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Deployment operations stream</h2>
              <p className="mt-1 text-sm text-slate-600">
                Filtered from real deployment records. Click any row for its event timeline.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search status, SHA, project..."
                  className="h-10 w-full rounded-full border-slate-200 bg-white pl-9 sm:w-72"
                />
              </div>
              <Button asChild className="rounded-full bg-gradient-to-r from-blue-500 to-violet-500 text-slate-900 hover:opacity-90">
                <Link href="/dashboard/deployments">
                  Open release ops <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                  'rounded-full border px-3 py-2 text-xs font-medium transition',
                  filter === item.value
                    ? 'border-cyan-300/40 bg-cyan-300/10 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-slate-900',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {filteredDeployments.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-sm font-medium text-slate-900">No matching deployment records</p>
                <p className="mt-2 text-sm text-slate-500">Adjust the filter/search, or trigger a deployment from Release Ops.</p>
              </div>
            ) : (
              filteredDeployments.map((deployment) => {
                const project = projectById.get(deployment.projectId);
                const environment = environmentById.get(deployment.environmentId);

                return (
                  <Link
                    key={deployment.id}
                    href={`/dashboard/deployments/${deployment.id}`}
                    className="group grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 transition hover:border-cyan-300/35 hover:bg-slate-100 lg:grid-cols-[1.15fr_0.9fr_0.7fr_0.45fr]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(deployment.status)}`}>
                          {deployment.status}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                          {deployment.trigger}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-sm font-medium text-slate-900">{project?.name ?? `Project ${deployment.projectId}`}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{environment?.name ?? `Environment ${deployment.environmentId}`}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                        <GitCommit className="h-3.5 w-3.5" />
                        Commit
                      </p>
                      <p className="mt-2 truncate font-mono text-sm text-slate-700">{shortSha(deployment.commitSha)}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{deployment.branch ?? 'Branch not provided'}</p>
                    </div>

                    <div>
                      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                        <Timer className="h-3.5 w-3.5" />
                        Duration
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-700">{formatDuration(deployment.durationMs)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(deployment.createdAt)}</p>
                    </div>

                    <div className="flex items-center justify-start lg:justify-end">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 opacity-100 transition group-hover:translate-x-0.5">
                        Details <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Platform readiness</h2>
                <p className="mt-1 text-sm text-slate-600">Only values backed by current endpoints are marked live.</p>
              </div>
              <RadioTower className="h-5 w-5 text-blue-600" />
            </div>
            <div className="mt-5">
              <ReadinessRow
                label="API health endpoint"
                value={healthState === 'checking' ? 'Checking' : healthState === 'online' ? 'Online' : 'Offline'}
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
          </section>

          <section className="rounded-lg border border-slate-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(124,58,237,0.08),rgba(255,255,255,0.035))] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Latest deployment</h2>
                <p className="mt-1 text-sm text-slate-600">Newest record returned by the deployment API.</p>
              </div>
              <Activity className="h-5 w-5 text-violet-300" />
            </div>
            {latestDeployment ? (
              <Link href={`/dashboard/deployments/${latestDeployment.id}`} className="mt-5 block rounded-md border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-300/35 hover:bg-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(latestDeployment.status)}`}>
                    {latestDeployment.status}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                    {latestDeployment.trigger}
                  </span>
                </div>
                <p className="mt-4 font-mono text-sm text-slate-900">{shortSha(latestDeployment.commitSha)}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {formatDate(latestDeployment.createdAt)} Ãƒâ€šÃ‚Â· {formatDuration(latestDeployment.durationMs)}
                </p>
              </Link>
            ) : (
              <div className="mt-5 rounded-md border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                No deployment has been triggered yet.
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Real-time controls</h2>
              <p className="mt-1 text-sm text-slate-600">Every action here reads, filters, refreshes, or navigates real platform data.</p>
            </div>
            <Zap className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" className="justify-between rounded-md border-slate-200 bg-slate-50 px-4 py-6 hover:bg-blue-50">
              <Link href="/dashboard/projects">
                Project inventory <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between rounded-md border-slate-200 bg-slate-50 px-4 py-6 hover:bg-blue-50">
              <Link href="/dashboard/deployments">
                Trigger deployment <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between rounded-md border-slate-200 bg-slate-50 px-4 py-6 hover:bg-blue-50">
              <Link href="/dashboard/observability">
                Observability readiness <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between rounded-md border-slate-200 bg-slate-50 px-4 py-6 hover:bg-blue-50">
              <Link href="/dashboard/settings">
                Governance settings <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Execution boundary</h2>
              <p className="mt-1 text-sm text-slate-600">Current records are real. Infrastructure mutation is not active.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { label: 'Persistence', value: 'PostgreSQL + Prisma', icon: Database },
              { label: 'Queue runtime', value: 'Redis + BullMQ', icon: RadioTower },
              { label: 'Executor', value: 'Safe simulation', icon: Sparkles },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <Icon className="h-4 w-4 text-blue-600" />
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Capability roadmap</h2>
            <p className="mt-1 text-sm text-slate-600">Shown as planned work only, not active platform telemetry.</p>
          </div>
          <Clock3 className="h-5 w-5 text-slate-500" />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          {['Docker executor', 'Terraform executor', 'Kubernetes executor', 'GitHub integration'].map((item) => (
            <div key={item} className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">{item}</p>
              <p className="mt-2 text-xs text-amber-700">Planned, not active</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
