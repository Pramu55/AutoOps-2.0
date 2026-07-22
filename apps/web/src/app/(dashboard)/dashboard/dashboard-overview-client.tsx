'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type {
  Deployment,
  IncidentListResponse,
  IncidentSummary,
  OperationActivityItem,
  OperationActivityResponse,
  OpsObservabilityResponse,
  OpsSummary,
  Project,
  SignalReadinessResponse,
} from '@autoops/types';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  GitMerge,
  Network,
  RefreshCw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
  XCircle,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';

const POLL_INTERVAL_MS = 60_000;

type LoadKey =
  | 'projects'
  | 'deployments'
  | 'summary'
  | 'observability'
  | 'pendingApprovals'
  | 'recentOperations'
  | 'signals'
  | 'incidents';

type LoadErrors = Partial<Record<LoadKey, string>>;

type OverviewState = {
  projects: Project[];
  deployments: Deployment[];
  environmentCount: number | null;
  summary: OpsSummary | null;
  observability: OpsObservabilityResponse | null;
  pendingApprovals: OperationActivityItem[];
  recentOperations: OperationActivityItem[];
  signalReadiness: SignalReadinessResponse | null;
  incidents: IncidentSummary[];
};

const initialOverviewState: OverviewState = {
  projects: [],
  deployments: [],
  environmentCount: null,
  summary: null,
  observability: null,
  pendingApprovals: [],
  recentOperations: [],
  signalReadiness: null,
  incidents: [],
};

const routes = {
  projects: '/dashboard/projects',
  deployments: '/dashboard/deployments',
  operations: '/dashboard/operations',
  approvals: '/dashboard/operations#approvals',
  incidents: '/dashboard/incidents',
  integrations: '/dashboard/integrations',
  governance: '/dashboard/governance',
  resources: '/dashboard/resources',
};

const quickAccessItems: Array<[string, string, string, LucideIcon]> = [
  ['Projects', 'Application inventory and environments', routes.projects, Boxes],
  ['Deployments', 'Recent delivery activity', routes.deployments, GitMerge],
  ['Operations Hub', 'Runtime actions and approvals', routes.operations, Workflow],
  ['Integrations', 'Provider readiness', routes.integrations, Network],
  ['Incidents', 'Open and acknowledged incidents', routes.incidents, AlertTriangle],
  ['Governance', 'Policies and guarded operation evidence', routes.governance, SlidersHorizontal],
  ['Resource Graph', 'Environment and dependency map', routes.resources, Route],
];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unavailable';
}

function formatTime(value: Date | string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'No recent activity';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function resultData<T>(
  result: PromiseSettledResult<T>,
  key: LoadKey,
  errors: LoadErrors,
): T | null {
  if (result.status === 'fulfilled') return result.value;
  errors[key] = getErrorMessage(result.reason);
  return null;
}

function statusLabel(status: string | undefined | null): string {
  if (!status) return 'Unavailable';
  return status.replace(/_/g, ' ');
}

function platformState(data: OverviewState, errors: LoadErrors, isLoading: boolean) {
  if (isLoading) return { label: 'Loading', tone: 'slate' as const };
  if (Object.keys(errors).length > 0) return { label: 'Degraded', tone: 'rose' as const };
  if (
    data.incidents.length > 0 ||
    data.pendingApprovals.length > 0 ||
    (data.summary?.operations?.failed ?? 0) > 0 ||
    (data.signalReadiness?.criticalCount ?? 0) > 0 ||
    (data.signalReadiness?.errorCount ?? 0) > 0
  ) {
    return { label: 'Needs attention', tone: 'amber' as const };
  }
  return { label: 'Operational', tone: 'emerald' as const };
}

function countDeployments(deployments: Deployment[], statuses: string[]) {
  return deployments.filter((deployment) =>
    statuses.includes(String(deployment.status).toUpperCase()),
  ).length;
}

function latestDeployment(deployments: Deployment[]) {
  return (
    [...deployments].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0] ?? null
  );
}

export function DashboardOverviewClient() {
  const [overview, setOverview] = useState<OverviewState>(initialOverviewState);
  const [loadErrors, setLoadErrors] = useState<LoadErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOverview = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);

    const errors: LoadErrors = {};

    const [
      projectsRes,
      deploymentsRes,
      summaryRes,
      obsRes,
      pendingOpsRes,
      recentOpsRes,
      signalsRes,
      openIncidentsRes,
      ackIncidentsRes,
    ] = await Promise.allSettled([
      api.get<{ data: Project[] }>('/v1/projects'),
      api.get<{ data: Deployment[] }>('/v1/deployments'),
      api.get<{ data: OpsSummary }>('/v1/ops/summary'),
      api.get<{ data: OpsObservabilityResponse }>('/v1/ops/observability'),
      api.get<{ data: OperationActivityResponse }>(
        '/v1/ops/activity?status=PENDING_APPROVAL&limit=5',
      ),
      api.get<{ data: OperationActivityResponse }>('/v1/ops/activity?limit=5'),
      api.get<{ data: SignalReadinessResponse }>('/v1/signals/readiness'),
      api.get<IncidentListResponse>('/v1/incidents?status=OPEN&limit=5'),
      api.get<IncidentListResponse>('/v1/incidents?status=ACKNOWLEDGED&limit=5'),
    ]);

    const projects = resultData(projectsRes, 'projects', errors)?.data ?? [];
    const deployments = resultData(deploymentsRes, 'deployments', errors)?.data ?? [];
    const summary = resultData(summaryRes, 'summary', errors)?.data ?? null;
    const observability = resultData(obsRes, 'observability', errors)?.data ?? null;
    const pendingApprovals =
      resultData(pendingOpsRes, 'pendingApprovals', errors)?.data.items ?? [];
    const recentOperations = resultData(recentOpsRes, 'recentOperations', errors)?.data.items ?? [];
    const signalReadiness = resultData(signalsRes, 'signals', errors)?.data ?? null;
    const openIncidents = resultData(openIncidentsRes, 'incidents', errors)?.data ?? [];
    const ackIncidents = resultData(ackIncidentsRes, 'incidents', errors)?.data ?? [];

    const incidents = [...openIncidents, ...ackIncidents]
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime(),
      )
      .slice(0, 5);

    setOverview({
      projects,
      deployments,
      environmentCount: summary?.resources.environments ?? null,
      summary,
      observability,
      pendingApprovals,
      recentOperations,
      signalReadiness,
      incidents,
    });
    setLoadErrors(errors);
    setLastUpdated(new Date());
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadOverview('initial');
  }, [loadOverview]);

  useEffect(() => {
    const intervalId = window.setInterval(() => void loadOverview('refresh'), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadOverview]);

  const state = platformState(overview, loadErrors, isLoading);
  const failedOperations =
    overview.summary?.operations?.failed ??
    overview.recentOperations.filter((op) => op.status === 'FAILED').length;
  const runningOperations =
    overview.summary?.operations?.running ??
    overview.recentOperations.filter((op) => op.status === 'RUNNING').length;
  const runningDeployments = countDeployments(overview.deployments, ['RUNNING', 'QUEUED']);
  const successfulDeployments = countDeployments(overview.deployments, ['SUCCEEDED']);
  const failedDeployments = countDeployments(overview.deployments, ['FAILED']);
  const latest = latestDeployment(overview.deployments);

  const connectedIntegrations = useMemo(() => {
    const integrations = overview.summary?.integrations;
    if (integrations)
      return integrations.filter((integration) => integration.status === 'CONNECTED').length;
    return Object.values(overview.observability?.providers ?? {}).filter(
      (provider) => provider.status === 'CONNECTED',
    ).length;
  }, [overview.summary?.integrations, overview.observability?.providers]);

  const summaryCards = [
    {
      label: 'Active projects',
      value: isLoading ? 'Loading' : String(overview.projects.length),
      context: loadErrors.projects
        ? 'Unavailable'
        : `${overview.environmentCount ?? 0} environments tracked`,
      status: loadErrors.projects
        ? 'UNAVAILABLE'
        : overview.projects.length > 0
          ? 'READY'
          : 'EMPTY',
      href: routes.projects,
      icon: Boxes,
    },
    {
      label: 'Recent deployments',
      value: isLoading ? 'Loading' : String(overview.deployments.length),
      context: loadErrors.deployments
        ? 'Unavailable'
        : `${runningDeployments} running, ${failedDeployments} failed`,
      status: loadErrors.deployments ? 'UNAVAILABLE' : failedDeployments > 0 ? 'WARNING' : 'READY',
      href: routes.deployments,
      icon: GitMerge,
    },
    {
      label: 'Pending approvals',
      value: isLoading ? 'Loading' : String(overview.pendingApprovals.length),
      context: loadErrors.pendingApprovals ? 'Unavailable' : 'Governed operations awaiting review',
      status: loadErrors.pendingApprovals
        ? 'UNAVAILABLE'
        : overview.pendingApprovals.length > 0
          ? 'PENDING_APPROVAL'
          : 'READY',
      href: routes.approvals,
      icon: ShieldCheck,
    },
    {
      label: 'Failed operations',
      value: isLoading ? 'Loading' : String(failedOperations),
      context:
        loadErrors.summary && loadErrors.recentOperations
          ? 'Unavailable'
          : 'Recent governed operation failures',
      status: failedOperations > 0 ? 'FAILED' : loadErrors.summary ? 'UNKNOWN' : 'READY',
      href: routes.operations,
      icon: XCircle,
    },
    {
      label: 'Connected integrations',
      value: isLoading ? 'Loading' : String(connectedIntegrations),
      context:
        loadErrors.summary && loadErrors.observability
          ? 'Unavailable'
          : 'Configured provider connections',
      status: connectedIntegrations > 0 ? 'CONNECTED' : 'NOT_CONFIGURED',
      href: routes.integrations,
      icon: Network,
    },
    {
      label: 'Worker and queues',
      value: isLoading
        ? 'Loading'
        : statusLabel(
            overview.observability?.workerRuntime.status ??
              overview.observability?.platform.worker.status,
          ),
      context: loadErrors.observability
        ? 'Unavailable'
        : `Deployments queue ${statusLabel(overview.observability?.queues.deployments.status)}`,
      status:
        overview.observability?.workerRuntime.status ??
        overview.observability?.platform.worker.status ??
        'UNKNOWN',
      href: `${routes.operations}#runtime-health`,
      icon: Activity,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <main
        className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8"
        aria-labelledby="console-home-title"
      >
        <StatusStrip overview={overview} errors={loadErrors} isLoading={isLoading} />

        <section className="rounded-lg border border-[#d7dde4] bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <nav
                className="flex items-center gap-2 text-xs font-semibold text-[#64748b]"
                aria-label="Breadcrumb"
              >
                <span>Dashboard</span>
                <span aria-hidden="true">/</span>
                <span className="text-[#101820]">Console Home</span>
              </nav>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#0066c0]">
                AutoOps Console
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1
                  id="console-home-title"
                  className="text-2xl font-semibold tracking-tight text-[#101820] sm:text-[28px]"
                >
                  AutoOps Console Home
                </h1>
                <StateIndicator label={state.label} tone={state.tone} />
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#334155]">
                Central visibility for deployments, runtime operations, governed approvals,
                incidents and platform integrations.
              </p>
              <p className="mt-2 text-xs text-[#64748b]">Updated {formatTime(lastUpdated)}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void loadOverview('refresh')}
                disabled={isLoading || isRefreshing}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d7dde4] bg-white px-3 text-sm font-semibold text-[#101820] hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                Refresh
              </button>
              <HeaderLink href={routes.operations}>Open Operations</HeaderLink>
              <HeaderLink href={routes.approvals}>Review approvals</HeaderLink>
              <HeaderLink href={routes.incidents}>View incidents</HeaderLink>
            </div>
          </div>
        </section>

        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
          aria-label="Executive summary"
        >
          {summaryCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-3" aria-label="Dashboard details">
          <ConsoleCard
            title="Quick access"
            action={
              <Link className="text-xs font-semibold text-[#0066c0]" href={routes.resources}>
                Open graph
              </Link>
            }
          >
            <div className="divide-y divide-slate-100">
              {quickAccessItems.map(([label, description, href, Icon]) => (
                <Link
                  key={String(label)}
                  href={String(href)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <Icon className="h-4 w-4 shrink-0 text-[#334155]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#101820]">{label}</span>
                    <span className="block truncate text-xs text-[#64748b]">{description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#64748b]" />
                </Link>
              ))}
            </div>
          </ConsoleCard>

          <ConsoleCard
            title="Operations and governance"
            action={
              <Link className="text-xs font-semibold text-[#0066c0]" href={routes.operations}>
                Operations Hub
              </Link>
            }
          >
            <MetricRows
              rows={[
                [
                  'Pending approvals',
                  overview.pendingApprovals.length,
                  loadErrors.pendingApprovals ? 'Unavailable' : 'Waiting for governed review',
                  overview.pendingApprovals.length > 0 ? 'PENDING_APPROVAL' : 'READY',
                ],
                [
                  'Running operations',
                  runningOperations,
                  loadErrors.summary ? 'Unavailable' : 'Currently active operations',
                  runningOperations > 0 ? 'RUNNING' : 'READY',
                ],
                [
                  'Failed operations',
                  failedOperations,
                  loadErrors.summary && loadErrors.recentOperations
                    ? 'Unavailable'
                    : 'Recent failures needing review',
                  failedOperations > 0 ? 'FAILED' : 'READY',
                ],
                [
                  'Latest governed activity',
                  overview.recentOperations[0]?.title ?? 'No recent activity',
                  formatDateTime(overview.recentOperations[0]?.createdAt),
                  overview.recentOperations[0]?.status ?? 'EMPTY',
                ],
              ]}
            />
          </ConsoleCard>

          <ConsoleCard
            title="Deployment snapshot"
            action={
              <Link className="text-xs font-semibold text-[#0066c0]" href={routes.deployments}>
                Deployments
              </Link>
            }
          >
            <MetricRows
              rows={[
                [
                  'Recent deployments',
                  overview.deployments.length,
                  loadErrors.deployments ? 'Unavailable' : 'Loaded from deployment history',
                  overview.deployments.length > 0 ? 'READY' : 'EMPTY',
                ],
                [
                  'Running deployments',
                  runningDeployments,
                  'Queued or running deployments',
                  runningDeployments > 0 ? 'RUNNING' : 'READY',
                ],
                [
                  'Successful deployments',
                  successfulDeployments,
                  'Completed deployment records',
                  'SUCCEEDED',
                ],
                [
                  'Failed deployments',
                  failedDeployments,
                  'Failed deployment records',
                  failedDeployments > 0 ? 'FAILED' : 'READY',
                ],
                [
                  'Latest deployment',
                  latest?.branch ?? latest?.imageTag ?? 'No recent activity',
                  formatDateTime(latest?.updatedAt),
                  latest?.status ?? 'EMPTY',
                ],
              ]}
            />
          </ConsoleCard>
        </section>

        <section
          className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3"
          aria-label="Runtime and integration details"
        >
          <ConsoleCard
            title="Runtime health"
            action={
              <Link
                className="text-xs font-semibold text-[#0066c0]"
                href={`${routes.operations}#runtime-health`}
              >
                Runtime
              </Link>
            }
          >
            <MetricRows
              rows={[
                [
                  'API',
                  statusLabel(overview.observability?.platform.api.status),
                  loadErrors.observability
                    ? 'Unavailable'
                    : (overview.observability?.platform.api.message ??
                      'Loaded from runtime health'),
                  overview.observability?.platform.api.status ?? 'UNKNOWN',
                ],
                [
                  'Worker',
                  statusLabel(overview.observability?.platform.worker.status),
                  loadErrors.observability
                    ? 'Unavailable'
                    : (overview.observability?.platform.worker.message ??
                      'Loaded from runtime health'),
                  overview.observability?.platform.worker.status ?? 'UNKNOWN',
                ],
                [
                  'PostgreSQL',
                  statusLabel(overview.observability?.platform.database.status),
                  loadErrors.observability
                    ? 'Unavailable'
                    : (overview.observability?.platform.database.message ??
                      'Loaded from runtime health'),
                  overview.observability?.platform.database.status ?? 'UNKNOWN',
                ],
                [
                  'Redis',
                  statusLabel(overview.observability?.platform.redis.status),
                  loadErrors.observability
                    ? 'Unavailable'
                    : (overview.observability?.platform.redis.message ??
                      'Loaded from runtime health'),
                  overview.observability?.platform.redis.status ?? 'UNKNOWN',
                ],
              ]}
            />
          </ConsoleCard>

          <ConsoleCard
            title="Integration readiness"
            action={
              <Link className="text-xs font-semibold text-[#0066c0]" href={routes.integrations}>
                Integrations
              </Link>
            }
          >
            <MetricRows
              rows={[
                [
                  'Docker',
                  statusLabel(overview.observability?.providers.docker.status),
                  overview.observability?.providers.docker.message ?? 'Unavailable',
                  overview.observability?.providers.docker.status ?? 'UNKNOWN',
                ],
                [
                  'Kubernetes',
                  statusLabel(overview.observability?.providers.kubernetes.status),
                  overview.observability?.providers.kubernetes.message ??
                    'Unavailable or not configured',
                  overview.observability?.providers.kubernetes.status ?? 'NOT_CONFIGURED',
                ],
                [
                  'Jenkins',
                  statusLabel(overview.observability?.providers.jenkins.status),
                  overview.observability?.providers.jenkins.message ??
                    'Unavailable or not configured',
                  overview.observability?.providers.jenkins.status ?? 'NOT_CONFIGURED',
                ],
                [
                  'Infrastructure',
                  statusLabel(overview.observability?.providers.infrastructure?.status),
                  overview.observability?.providers.infrastructure?.message ?? 'Not configured',
                  overview.observability?.providers.infrastructure?.status ?? 'NOT_CONFIGURED',
                ],
              ]}
            />
          </ConsoleCard>

          <ConsoleCard
            title="Incident summary"
            action={
              <Link className="text-xs font-semibold text-[#0066c0]" href={routes.incidents}>
                Incidents
              </Link>
            }
          >
            {overview.incidents.length === 0 ? (
              <EmptyState
                title={loadErrors.incidents ? 'Incidents unavailable' : 'No active incidents'}
                description={loadErrors.incidents ?? 'No OPEN or ACKNOWLEDGED incidents.'}
                variant="compact"
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {overview.incidents.map((incident) => (
                  <Link
                    key={incident.id}
                    href={`/dashboard/incidents/${incident.id}`}
                    className="block px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-[#101820]">
                        {incident.title}
                      </span>
                      <StatusBadge status={incident.severity} className="min-h-6" />
                    </div>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {incident.status} · {incident.signalCount} signals ·{' '}
                      {formatDateTime(incident.updatedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </ConsoleCard>
        </section>

        {Object.keys(loadErrors).length > 0 && (
          <section
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Some dashboard sources are unavailable.</p>
                <p className="mt-1 text-xs">
                  {Object.entries(loadErrors)
                    .map(([key, message]) => `${key}: ${message}`)
                    .join(' · ')}
                </p>
                <button
                  onClick={() => void loadOverview('refresh')}
                  className="mt-3 text-xs font-bold text-amber-950 underline"
                >
                  Retry unavailable sources
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatusStrip({
  overview,
  errors,
  isLoading,
}: {
  overview: OverviewState;
  errors: LoadErrors;
  isLoading: boolean;
}) {
  const items = [
    [
      'API',
      overview.observability?.platform.api.status ??
        (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
    ],
    [
      'Worker',
      overview.observability?.platform.worker.status ??
        (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
    ],
    [
      'Queues',
      overview.observability?.queues.operations.status ??
        (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
    ],
    [
      'Connector readiness',
      `${Object.values(overview.observability?.providers ?? {}).filter((provider) => provider.status === 'CONNECTED').length} connected`,
    ],
    ['Pending approvals', isLoading ? 'Loading' : String(overview.pendingApprovals.length)],
    [
      'Failed operations',
      isLoading
        ? 'Loading'
        : String(
            overview.summary?.operations?.failed ??
              overview.recentOperations.filter((op) => op.status === 'FAILED').length,
          ),
    ],
  ];

  return (
    <section
      className="rounded-lg border border-[#d7dde4] bg-white px-3 py-2 shadow-sm"
      aria-label="Platform status"
    >
      <div className="flex flex-wrap items-center gap-2">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="flex min-h-8 items-center gap-2 rounded-md border border-slate-200 bg-[#f8fafc] px-3 text-xs"
          >
            <span className="font-semibold text-[#334155]">{label}</span>
            <span className="text-[#64748b]">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StateIndicator({
  label,
  tone,
}: {
  label: string;
  tone: 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const colors = {
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-300 bg-amber-50 text-amber-800',
    rose: 'border-rose-300 bg-rose-50 text-rose-800',
    slate: 'border-slate-300 bg-slate-50 text-slate-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold',
        colors[tone],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center justify-center rounded-md border border-[#d7dde4] bg-[#f8fafc] px-3 text-sm font-semibold text-[#101820] hover:bg-white"
    >
      {children}
    </Link>
  );
}

function SummaryCard({
  label,
  value,
  context,
  status,
  href,
  icon: Icon,
}: {
  label: string;
  value: string;
  context: string;
  status: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[#d7dde4] bg-white p-4 shadow-sm hover:border-slate-400"
    >
      <div className="flex items-start justify-between gap-3">
        <Icon className="h-4 w-4 text-[#334155]" />
        <StatusBadge status={status} className="min-h-6 px-2 text-[10px]" />
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#64748b]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#101820]">{value}</p>
      <p className="mt-1 min-h-8 text-xs leading-4 text-[#64748b]">{context}</p>
    </Link>
  );
}

function ConsoleCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#d7dde4] bg-white shadow-sm">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-[#101820]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricRows({ rows }: { rows: Array<[string, string | number, string, string]> }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map(([label, value, context, status]) => (
        <div key={label} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#101820]">{label}</p>
            <p className="mt-1 truncate text-xs text-[#64748b]">{context}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-[#334155]">{value}</p>
            <StatusBadge status={status} className="mt-1 min-h-6 px-2 text-[10px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
