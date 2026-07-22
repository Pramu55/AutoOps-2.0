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
        className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8"
        aria-labelledby="console-home-title"
      >
        <StatusStrip overview={overview} errors={loadErrors} isLoading={isLoading} />

        <section className="rounded-lg border border-[#d7dde4] bg-white shadow-[0_1px_2px_rgba(16,24,32,0.04)]">
          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
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
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
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

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:flex-nowrap lg:justify-end">
              <button
                onClick={() => void loadOverview('refresh')}
                disabled={isLoading || isRefreshing}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d7dde4] bg-white px-3 text-sm font-semibold text-[#101820] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066c0] focus-visible:ring-offset-2 disabled:opacity-50"
                aria-label="Refresh dashboard data"
              >
                <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                Refresh
              </button>
              <HeaderLink href={routes.operations} variant="primary">
                Open Operations
              </HeaderLink>
              <HeaderLink href={routes.approvals}>Review approvals</HeaderLink>
              <HeaderLink href={routes.incidents}>View incidents</HeaderLink>
            </div>
          </div>
        </section>

        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
          aria-label="Executive summary"
        >
          {summaryCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </section>

        <section
          className="grid gap-4 xl:grid-cols-[1.05fr_1.1fr_1.1fr]"
          aria-label="Dashboard details"
        >
          <ConsoleCard
            title="Quick access"
            action={<InlineAction href={routes.resources}>Open graph</InlineAction>}
          >
            <div className="divide-y divide-slate-100">
              {quickAccessItems.map(([label, description, href, Icon]) => (
                <Link
                  key={String(label)}
                  href={String(href)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0066c0]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                    <Icon className="h-4 w-4 text-[#334155]" />
                  </span>
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
            action={<InlineAction href={routes.operations}>Operations Hub</InlineAction>}
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
            action={<InlineAction href={routes.deployments}>Deployments</InlineAction>}
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
          className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3"
          aria-label="Runtime and integration details"
        >
          <ConsoleCard
            title="Runtime health"
            action={
              <InlineAction href={`${routes.operations}#runtime-health`}>Runtime</InlineAction>
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
            action={<InlineAction href={routes.integrations}>Integrations</InlineAction>}
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
            action={<InlineAction href={routes.incidents}>Incidents</InlineAction>}
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
                    className="block px-4 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0066c0]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-[#101820]">
                        {incident.title}
                      </span>
                      <StatusBadge status={incident.severity} className="min-h-6" />
                    </div>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {incident.status} - {incident.signalCount} signals -{' '}
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
                    .join(' - ')}
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
  const failedOperations =
    overview.summary?.operations?.failed ??
    overview.recentOperations.filter((op) => op.status === 'FAILED').length;
  const connectedProviders = Object.values(overview.observability?.providers ?? {}).filter(
    (provider) => provider.status === 'CONNECTED',
  ).length;
  const items = [
    {
      label: 'API',
      value: statusLabel(
        overview.observability?.platform.api.status ??
          (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
      ),
      status:
        overview.observability?.platform.api.status ??
        (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
    },
    {
      label: 'Worker',
      value: statusLabel(
        overview.observability?.platform.worker.status ??
          (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
      ),
      status:
        overview.observability?.platform.worker.status ??
        (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
    },
    {
      label: 'Queues',
      value: statusLabel(
        overview.observability?.queues.operations.status ??
          (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
      ),
      status:
        overview.observability?.queues.operations.status ??
        (errors.observability ? 'UNAVAILABLE' : 'UNKNOWN'),
    },
    {
      label: 'Connector readiness',
      value: isLoading ? 'Loading' : `${connectedProviders} connected`,
      status: errors.observability
        ? 'UNAVAILABLE'
        : connectedProviders > 0
          ? 'CONNECTED'
          : 'NOT_CONFIGURED',
    },
    {
      label: 'Pending approvals',
      value: isLoading ? 'Loading' : String(overview.pendingApprovals.length),
      status: errors.pendingApprovals
        ? 'UNAVAILABLE'
        : overview.pendingApprovals.length > 0
          ? 'PENDING_APPROVAL'
          : 'READY',
    },
    {
      label: 'Failed operations',
      value: isLoading ? 'Loading' : String(failedOperations),
      status:
        errors.summary && errors.recentOperations
          ? 'UNAVAILABLE'
          : failedOperations > 0
            ? 'FAILED'
            : 'READY',
    },
  ];

  return (
    <section
      className="rounded-lg border border-[#d7dde4] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(16,24,32,0.04)]"
      aria-label="Platform status"
      aria-busy={isLoading}
    >
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-slate-200 bg-[#f8fafc] px-3 text-xs"
          >
            <span className="min-w-0 truncate font-semibold text-[#334155]">{item.label}</span>
            <StatusPill status={item.status} text={item.value} />
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

function HeaderLink({
  href,
  children,
  variant = 'secondary',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066c0] focus-visible:ring-offset-2',
        variant === 'primary'
          ? 'border-[#101820] bg-[#101820] text-white hover:bg-[#1f2933]'
          : 'border-[#d7dde4] bg-[#f8fafc] text-[#101820] hover:bg-white',
      )}
    >
      {children}
    </Link>
  );
}

function InlineAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0066c0] hover:text-[#004b8d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066c0] focus-visible:ring-offset-2"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function StatusPill({ status, text }: { status: string; text: string }) {
  const normStatus = status.toUpperCase();
  const toneClass = [
    'CONNECTED',
    'RESOLVED',
    'SUCCEEDED',
    'APPROVED',
    'READY',
    'HEALTHY',
    'RUNNING',
  ].includes(normStatus)
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700'
    : ['WARNING', 'ACKNOWLEDGED', 'NOT_CONFIGURED', 'PENDING_APPROVAL', 'QUEUED'].includes(
          normStatus,
        )
      ? 'border-amber-400/25 bg-amber-400/10 text-amber-700'
      : ['ERROR', 'CRITICAL', 'FAILED', 'REJECTED', 'UNREACHABLE', 'AUTH_FAILED', 'OPEN'].includes(
            normStatus,
          )
        ? 'border-rose-400/30 bg-rose-500/10 text-rose-700'
        : 'border-slate-300/60 bg-slate-100/50 text-slate-600';

  return (
    <span
      className={cn(
        'inline-flex min-h-6 shrink-0 items-center rounded-full border px-2 text-[10px] font-bold uppercase',
        toneClass,
      )}
    >
      {text}
    </span>
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
      className="group flex min-h-[142px] flex-col rounded-lg border border-[#d7dde4] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,32,0.04)] transition hover:border-slate-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066c0] focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
          <Icon className="h-4 w-4 text-[#334155]" />
        </span>
        <StatusBadge status={status} className="min-h-6 px-2 text-[10px]" />
      </div>
      <p className="mt-3 truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
        {label}
      </p>
      <p className="mt-1 truncate text-[26px] font-semibold leading-8 text-[#101820]">{value}</p>
      <p className="mt-auto line-clamp-2 pt-2 text-xs leading-4 text-[#64748b]">{context}</p>
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
    <section className="overflow-hidden rounded-lg border border-[#d7dde4] bg-white shadow-[0_1px_2px_rgba(16,24,32,0.04)]">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
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
        <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
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
