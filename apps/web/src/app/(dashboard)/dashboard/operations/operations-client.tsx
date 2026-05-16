'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  AuditLog,
  IntegrationProvider,
  Operation,
  OperationActivityItem,
  OperationActivityResponse,
  OpsIntegrationReadiness,
  OpsQueueSummary,
  OpsSummary,
} from '@autoops/types';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cloud,
  Code2,
  Container,
  Database,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitMerge,
  Hammer,
  Layers,
  Network,
  PlayCircle,
  RadioTower,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
  Timer,
  UserCircle,
  Workflow,
  Wrench,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type OpsSummaryResponse = { data: OpsSummary };
type ProvidersResponse = { data: IntegrationProvider[] };
type OperationsResponse = { data: Operation[] };
type OperationActivityApiResponse = { data: OperationActivityResponse };
type AuditLogsResponse = { data: AuditLog[] };

const POLL_INTERVAL_MS = 15_000;
const MISSING_VALUE = '—';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load operations summary.';
}

function formatTime(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
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

function formatDuration(value: number | null): string {
  if (value === null) return 'Pending';
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}

function formatTimelineDate(value: string | null): string {
  return value ? formatDate(value) : MISSING_VALUE;
}

function formatTimelineDuration(value: number | null): string {
  return value === null ? MISSING_VALUE : formatDuration(value);
}

function shortOperationId(value: string): string {
  return value.length > 12 ? value.slice(0, 8) : value;
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : 'No SHA';
}

function statusTone(status: string): string {
  if (status === 'READY' || status === 'SUCCEEDED' || status === 'CONNECTED') {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  }
  if (status === 'UNKNOWN') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  if (status === 'UNREACHABLE') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  if (status === 'NOT_CONFIGURED') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  if (status === 'FAILED') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  if (status === 'NOT_CONNECTED') return 'border-slate-500/25 bg-slate-500/10 text-slate-300';
  return 'border-cyan-300/25 bg-cyan-300/10 text-cyan-200';
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    jenkins: 'Jenkins',
    kubernetes: 'Kubernetes',
    docker: 'Docker',
    github: 'GitHub',
    aws: 'AWS',
    deployment: 'Deployment',
    system: 'System',
  };

  return labels[source] ?? source;
}

function actorLabel(actor: OperationActivityItem['actor']): string {
  if (!actor) return MISSING_VALUE;
  return actor.name ?? actor.email ?? actor.id;
}

function integrationIcon(key: string) {
  const icons: Record<string, React.ElementType> = {
    kubernetes: Boxes,
    jenkins: Hammer,
    ansible: TerminalSquare,
    terraform: Workflow,
    'github-actions': GitBranch,
    docker: Container,
    aws: Cloud,
    azure: Cloud,
    gcp: Cloud,
  };

  return icons[key] ?? Wrench;
}

function SummaryCard({
  label,
  value,
  caption,
  icon,
  tone = 'cyan',
}: {
  label: string;
  value: string | number;
  caption: string;
  icon: React.ReactNode;
  tone?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet';
}) {
  const toneClass = {
    cyan: 'from-cyan-500/16 to-blue-500/6 text-cyan-300',
    emerald: 'from-emerald-500/16 to-cyan-500/6 text-emerald-300',
    amber: 'from-amber-500/16 to-orange-500/6 text-amber-300',
    rose: 'from-rose-500/16 to-red-500/6 text-rose-300',
    violet: 'from-violet-500/16 to-blue-500/6 text-violet-300',
  }[tone];

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-5 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          <p className="mt-2 text-sm text-slate-400">{caption}</p>
        </div>
        <div className={`rounded-xl bg-gradient-to-br p-2 ${toneClass}`}>{icon}</div>
      </div>
    </section>
  );
}

function RuntimeCard({
  title,
  status,
  icon,
  description,
}: {
  title: string;
  status: string;
  icon: React.ReactNode;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(status)}`}>
            {status}
          </span>
        </div>
        <div className="rounded-xl bg-cyan-300/10 p-2 text-cyan-300">{icon}</div>
      </div>
      <p className="mt-4 text-sm text-slate-400">{description}</p>
    </section>
  );
}

function QueueCounts({ queue }: { queue: OpsQueueSummary }) {
  if (queue.status !== 'READY') {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center">
        <p className="text-sm font-medium text-white">Queue counts are not exposed yet.</p>
        <p className="mt-2 text-sm text-slate-500">The operations API could not safely read BullMQ counts for this request.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {[
        ['Waiting', queue.waiting ?? 0],
        ['Active', queue.active ?? 0],
        ['Completed', queue.completed ?? 0],
        ['Failed', queue.failed ?? 0],
        ['Delayed', queue.delayed ?? 0],
      ].map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

function IntegrationCard({ integration }: { integration: OpsIntegrationReadiness }) {
  const Icon = integrationIcon(integration.key);
  const href =
    integration.key === 'kubernetes'
      ? '/dashboard/integrations/kubernetes'
      : integration.key === 'jenkins'
        ? '/dashboard/integrations/jenkins'
        : undefined;
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl bg-white/[0.065] p-2 text-cyan-300">
          <Icon className="h-5 w-5" />
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(integration.status)}`}>
          {integration.status}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white">{integration.name}</h3>
      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{integration.category}</p>
      <p className="mt-3 min-h-16 text-sm leading-6 text-slate-400">{integration.description}</p>
      <button
        type="button"
        disabled={!href}
        className="mt-4 w-full rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs font-medium text-slate-500"
      >
        {href ? 'Open connector view' : 'Connect later'}
      </button>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:border-cyan-300/30"
      >
        {content}
      </Link>
    );
  }

  return (
    <section className="group rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:border-cyan-300/30">
      {content}
    </section>
  );
}

export function OperationsClient() {
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [activityItems, setActivityItems] = useState<OperationActivityItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const loadSummary = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    setActivityError(null);

    try {
      const [summaryResponse, providersResponse, operationsResponse, auditResponse] = await Promise.all([
        api.get<OpsSummaryResponse>('/v1/ops/summary'),
        api.get<ProvidersResponse>('/v1/integrations/providers'),
        api.get<OperationsResponse>('/v1/operations'),
        api.get<AuditLogsResponse>('/v1/audit-logs'),
      ]);
      setSummary(summaryResponse.data);
      setProviders(providersResponse.data);
      setOperations(operationsResponse.data);
      setAuditLogs(auditResponse.data);

      try {
        const activityResponse = await api.get<OperationActivityApiResponse>('/v1/ops/activity');
        setActivityItems(activityResponse.data.items);
      } catch (activityLoadError) {
        setActivityError(getErrorMessage(activityLoadError));
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary('initial');
  }, [loadSummary]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadSummary();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadSummary]);

  const runtime = summary?.runtime;
  const resources = summary?.resources;
  const deployments = summary?.deployments;
  const latestDeployments = useMemo(() => deployments?.latest ?? [], [deployments]);
  const pendingApprovals = useMemo(
    () => operations.filter((operation) => operation.status === 'PENDING_APPROVAL'),
    [operations],
  );

  const decideOperation = async (operationId: string, decision: 'approve' | 'reject') => {
    try {
      await api.post<{ data: Operation }>(`/v1/operations/${operationId}/${decision}`, {
        reason: decision === 'approve' ? 'Approved from Operations Hub' : 'Rejected from Operations Hub',
      });
      await loadSummary();
    } catch (decisionError) {
      setError(getErrorMessage(decisionError));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.26),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(124,58,237,0.24),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/25 lg:p-8">
        <div className="absolute inset-0 bg-grid opacity-45" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Governed operations foundation
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">Operations Hub</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Real AutoOps runtime, deployment queue, and integration readiness from one control plane.
              Future tools are shown as disconnected until real connectors exist.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300">
              Updated {formatTime(runtime?.generatedAt ?? null)}
            </span>
            <Button
              type="button"
              onClick={() => void loadSummary()}
              disabled={isLoading || isRefreshing}
              className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
            >
              <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <RuntimeCard title="API" status={runtime?.api.status ?? 'UNKNOWN'} icon={<Server className="h-5 w-5" />} description="Authenticated API route is responding." />
        <RuntimeCard title="Database" status={runtime?.database.status ?? 'UNKNOWN'} icon={<Database className="h-5 w-5" />} description="Checked through a safe database ping." />
        <RuntimeCard title="Redis" status={runtime?.redis.status ?? 'UNKNOWN'} icon={<RadioTower className="h-5 w-5" />} description="Checked through Redis PING from API." />
        <RuntimeCard title="Worker" status={runtime?.worker.status ?? 'UNKNOWN'} icon={<Wrench className="h-5 w-5" />} description="No safe heartbeat endpoint is exposed yet." />
        <RuntimeCard title="Deployment Queue" status={summary?.queues.deployments.status ?? 'UNKNOWN'} icon={<Activity className="h-5 w-5" />} description="BullMQ counts if safely readable." />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Projects" value={isLoading ? '...' : resources?.projects ?? 0} caption="Current organization." icon={<Layers className="h-5 w-5" />} />
        <SummaryCard label="Environments" value={isLoading ? '...' : resources?.environments ?? 0} caption="Project deploy targets." icon={<Network className="h-5 w-5" />} tone="violet" />
        <SummaryCard label="Deployments" value={isLoading ? '...' : resources?.deployments ?? 0} caption="Stored records." icon={<GitMerge className="h-5 w-5" />} tone="cyan" />
        <SummaryCard label="Active" value={isLoading ? '...' : deployments?.active ?? 0} caption="Queued/building/deploying/running." icon={<PlayCircle className="h-5 w-5" />} tone="amber" />
        <SummaryCard label="Succeeded" value={isLoading ? '...' : deployments?.succeeded ?? 0} caption="Terminal success." icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
        <SummaryCard label="Failed" value={isLoading ? '...' : deployments?.failed ?? 0} caption="Terminal failure." icon={<AlertTriangle className="h-5 w-5" />} tone="rose" />
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Provider Registry</h2>
            <p className="mt-1 text-sm text-slate-400">
              Runtime provider status from real connector checks. Write capabilities stay hidden until the provider is configured and connected.
            </p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
            Live registry
          </span>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => (
            <section key={provider.key} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">{provider.displayName}</h3>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{provider.category}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(provider.status)}`}>
                  {provider.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">{provider.message}</p>
              <div className="mt-4 grid gap-2 text-xs text-slate-400">
                <p>Read: {provider.readCapabilities.length}</p>
                <p>Write: {provider.writeCapabilities.length}</p>
                <p>Dangerous: {provider.dangerousCapabilities.length}</p>
              </div>
            </section>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">Approval Gates</h2>
              <p className="mt-1 text-sm text-slate-400">Production operations pause here before worker execution.</p>
            </div>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-200">
              {pendingApprovals.length} pending
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {pendingApprovals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center text-sm text-slate-400">
                No pending approvals.
              </div>
            ) : (
              pendingApprovals.map((operation) => (
                <div key={operation.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{operation.operationType}</p>
                      <p className="mt-1 text-xs text-slate-500">{operation.provider} | {formatDate(operation.createdAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300" onClick={() => void decideOperation(operation.id, 'approve')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-full border-rose-300/30 text-rose-200" onClick={() => void decideOperation(operation.id, 'reject')}>
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">Operations Activity Timeline</h2>
              <p className="mt-1 text-sm text-slate-400">Real operation activity from worker-backed AutoOps records.</p>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
              {activityItems.length} shown
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center text-sm text-slate-400">
                Loading operation activity...
              </div>
            ) : activityError ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-5">
                <p className="text-sm font-medium text-rose-200">Unable to load operation activity.</p>
                <p className="mt-2 text-sm text-slate-400">{activityError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full border-white/10 bg-white/[0.04]"
                  onClick={() => void loadSummary()}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  Retry
                </Button>
              </div>
            ) : activityItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center text-sm text-slate-400">
                <p className="font-medium text-white">No operations have been recorded yet.</p>
                <p className="mt-2 text-slate-500">Trigger a Jenkins job or deployment to see activity here.</p>
              </div>
            ) : (
              activityItems.map((item, index) => (
                <article
                  key={item.id}
                  className="relative rounded-2xl border border-white/10 bg-slate-950/35 p-4 pl-11 transition hover:border-cyan-300/30 hover:bg-white/[0.04]"
                >
                  <div className="absolute left-4 top-5 flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/15">
                    <span className="h-2 w-2 rounded-full bg-cyan-300" />
                  </div>
                  {index < activityItems.length - 1 ? (
                    <span className="absolute bottom-[-0.85rem] left-[1.62rem] top-10 w-px bg-white/10" />
                  ) : null}
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                          {sourceLabel(item.source)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>
                          {item.status}
                        </span>
                        {item.result ? (
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.result)}`}>
                            {item.result}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
                      <p className="mt-1 truncate text-sm text-slate-400">{item.targetLabel ?? MISSING_VALUE}</p>
                    </div>
                    {item.externalUrl ? (
                      <a
                        href={item.externalUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
                      >
                        Open related resource
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-1 text-slate-300">{formatTimelineDate(item.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Duration</p>
                      <p className="mt-1 text-slate-300">{formatTimelineDuration(item.durationMs)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Actor</p>
                      <p className="mt-1 flex items-center gap-2 text-slate-300">
                        <UserCircle className="h-3.5 w-3.5 text-slate-500" />
                        {actorLabel(item.actor)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Operation</p>
                      <p className="mt-1 font-mono text-slate-300">{shortOperationId(item.id)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Started</p>
                      <p className="mt-1 text-slate-300">{formatTimelineDate(item.startedAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Completed</p>
                      <p className="mt-1 text-slate-300">{formatTimelineDate(item.completedAt)}</p>
                    </div>
                  </div>
                  {item.errorMessage ? (
                    <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                      {item.errorMessage}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">Deployment Queue</h2>
              <p className="mt-1 text-sm text-slate-400">Real BullMQ counts from the deployments queue when available.</p>
            </div>
            <RadioTower className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-5">
            <QueueCounts queue={summary?.queues.deployments ?? { status: 'UNKNOWN' }} />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">Latest Deployments</h2>
              <p className="mt-1 text-sm text-slate-400">Newest real deployment records for this organization.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-full border-white/10 bg-white/[0.04]">
              <Link href="/dashboard/deployments">View all</Link>
            </Button>
          </div>
          <div className="mt-5 space-y-3">
            {latestDeployments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center">
                <p className="text-sm font-medium text-white">No deployment records yet</p>
                <p className="mt-2 text-sm text-slate-500">Trigger a deployment to populate this read model.</p>
              </div>
            ) : (
              latestDeployments.slice(0, 5).map((deployment) => (
                <Link
                  key={deployment.id}
                  href={`/dashboard/deployments/${deployment.id}`}
                  className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 transition hover:border-cyan-300/35 hover:bg-white/[0.06] md:grid-cols-[1fr_0.9fr_0.5fr]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(deployment.status)}`}>
                        {deployment.status}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] text-slate-400">
                        {deployment.trigger}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-xs text-slate-500">{formatDate(deployment.createdAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                      <GitCommit className="h-3.5 w-3.5" />
                      Commit
                    </p>
                    <p className="mt-1 truncate font-mono text-sm text-slate-200">{shortSha(deployment.commitSha)}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                      <Timer className="h-3.5 w-3.5" />
                      Duration
                    </p>
                    <p className="mt-1 text-sm text-slate-200">{formatDuration(deployment.durationMs)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Integration Readiness</h2>
            <p className="mt-1 text-sm text-slate-400">
              Explicit disconnected states for future DevOps tools. No fake pods, builds, playbooks, cloud assets, or Terraform resources.
            </p>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-200">
            Governed controls foundation
          </span>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(summary?.integrations ?? []).map((integration) => (
            <IntegrationCard key={integration.key} integration={integration} />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
        <h2 className="text-base font-semibold text-white">Audit Trail</h2>
        <p className="mt-1 text-sm text-slate-400">Tenant-scoped audit records for real operation requests and approvals.</p>
        <div className="mt-5 space-y-3">
          {auditLogs.slice(0, 8).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center text-sm text-slate-400">
              No audit records returned for this organization.
            </div>
          ) : (
            auditLogs.slice(0, 8).map((log) => (
              <div key={log.id} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 md:grid-cols-[1fr_0.5fr_0.45fr]">
                <div>
                  <p className="text-sm font-semibold text-white">{log.action}</p>
                  <p className="mt-1 text-xs text-slate-500">{log.resourceType} | {log.resourceId ?? 'no target'}</p>
                </div>
                <p className="text-sm text-slate-300">{log.provider ?? 'platform'}</p>
                <p className="text-xs text-slate-500">{formatDate(log.occurredAt)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(124,58,237,0.08),rgba(255,255,255,0.035))] p-6 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Next milestone</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Kubernetes control connector</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              AutoOps keeps real cluster visibility connected while controlled actions move through
              confirmation, audit, and approval gates.
            </p>
          </div>
          <Code2 className="h-10 w-10 text-cyan-300" />
        </div>
      </section>
    </div>
  );
}
