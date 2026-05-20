'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  Operation,
  OperationActivityItem,
  OperationActivityResponse,
  OperationObservabilityItem,
  OpsObservabilityResponse,
  OpsQueueHealthSummary,
} from '@autoops/types';
import {
  Database,
  ExternalLink,
  RadioTower,
  RefreshCw,
  Server,
  ShieldCheck,
  UserCircle,
  Wrench,
  X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type OpsObservabilityApiResponse = { data: OpsObservabilityResponse };
type OperationActivityApiResponse = { data: OperationActivityResponse };
type ApprovalDecision = 'approve' | 'reject';
type PendingApprovalDecision = {
  operation: OperationActivityItem;
  decision: ApprovalDecision;
};

const POLL_INTERVAL_MS = 5_000;
const MISSING_VALUE = '-';

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

function formatHeartbeatAge(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  if (value < 1_000) return `${value} ms`;
  const seconds = Math.round(value / 1_000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function shortOperationId(value: string): string {
  return value.length > 12 ? value.slice(0, 8) : value;
}

function statusTone(status: string): string {
  if (
    status === 'READY' ||
    status === 'SUCCEEDED' ||
    status === 'CONNECTED' ||
    status === 'HEALTHY' ||
    status === 'RUNNING' ||
    status === 'RESOLVED'
  ) {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  }
  if (status === 'UNKNOWN' || status === 'DEGRADED') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  if (status === 'UNREACHABLE' || status === 'UNAVAILABLE' || status === 'OFFLINE') return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  if (status === 'NOT_CONFIGURED') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  if (status === 'FAILED' || status === 'OPEN' || status === 'TRIGGERED') return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  if (status === 'ACKNOWLEDGED' || status === 'MITIGATED') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  if (status === 'NOT_CONNECTED') return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
  return 'border-cyan-300/25 bg-cyan-300/10 text-blue-700';
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

function riskTone(riskLevel: string): string {
  if (riskLevel === 'LOW' || riskLevel === 'SEV4') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  if (riskLevel === 'MEDIUM' || riskLevel === 'SEV3') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL' || riskLevel === 'SEV1' || riskLevel === 'SEV2') return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
}

function approvalStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    NOT_REQUIRED: 'Approval not required',
    PENDING: 'Approval pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  };

  return labels[status] ?? status;
}

function governanceSummary(governance: OperationActivityItem['governance'] | undefined): string {
  if (!governance) return MISSING_VALUE;
  const confirmation = governance.confirmationRequired
    ? `Confirmation ${governance.confirmationTokenLabel ?? MISSING_VALUE}`
    : 'No confirmation required';

  return `${governance.riskLevel} risk | ${confirmation} | ${approvalStatusLabel(governance.approvalStatus)}`;
}

function HealthCheckCard({
  title,
  status,
  message,
  icon,
}: {
  title: string;
  status: string;
  message: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(status)}`}>
            {status}
          </span>
        </div>
        <div className="rounded-xl bg-cyan-300/10 p-2 text-blue-600">{icon}</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{message}</p>
    </section>
  );
}

function WorkerRuntimeCard({
  worker,
}: {
  worker: OpsObservabilityResponse['workerRuntime'] | undefined;
}) {
  const queueCoverage = worker?.queueCoverage;
  const workers = worker?.workers ?? [];

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Worker Runtime</h3>
          <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(worker?.status ?? 'UNKNOWN')}`}>
            {worker?.status ?? 'UNKNOWN'}
          </span>
        </div>
        <div className="rounded-xl bg-cyan-300/10 p-2 text-blue-600">
          <Wrench className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        {worker?.message ?? 'Worker heartbeat status unavailable.'}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Active', worker?.activeCount ?? 0],
          ['Stale', worker?.staleCount ?? 0],
          ['Offline', worker?.offlineCount ?? 0],
          ['Last seen', worker?.lastSeenAt ? formatDate(worker.lastSeenAt) : 'Never'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {([
          ['Operations', queueCoverage?.operations ?? 'UNKNOWN'],
          ['Deployments', queueCoverage?.deployments ?? 'UNKNOWN'],
          ['System', queueCoverage?.system ?? 'UNKNOWN'],
        ] satisfies Array<[string, string]>).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs text-slate-600">{label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(value)}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Runtime registry</h4>
        <div className="mt-3 space-y-2">
          {workers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No worker heartbeat rows have been received.
            </div>
          ) : (
            workers.map((item) => (
              <div key={item.workerId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.service}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      PID {item.runtime.processId ?? MISSING_VALUE} | {item.runtime.environment ?? MISSING_VALUE}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                  <p>Queues: {item.queues.length > 0 ? item.queues.join(', ') : MISSING_VALUE}</p>
                  <p>Last seen: {formatHeartbeatAge(item.heartbeatAgeMs)}</p>
                  <p>Started: {formatTimelineDate(item.startedAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function QueueHealthCard({ title, queue }: { title: string; queue: OpsQueueHealthSummary | undefined }) {
  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(queue?.status ?? 'UNKNOWN')}`}>
          {queue?.status ?? 'UNKNOWN'}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{queue?.message ?? 'Queue status unavailable.'}</p>
      {queue?.status === 'READY' ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Waiting', queue.waiting ?? 0],
            ['Active', queue.active ?? 0],
            ['Completed', queue.completed ?? 0],
            ['Failed', queue.failed ?? 0],
            ['Delayed', queue.delayed ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProviderHealthCard({
  label,
  provider,
}: {
  label: string;
  provider: OpsObservabilityResponse['providers'][keyof OpsObservabilityResponse['providers']] | undefined;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
          <p className="mt-1 text-xs text-slate-500">Checked {formatTimelineDate(provider?.checkedAt ?? null)}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(provider?.status ?? 'UNKNOWN')}`}>
          {provider?.status ?? 'UNKNOWN'}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{provider?.message ?? 'Provider health unavailable.'}</p>
      {provider?.metricsApiStatus ? (
        <p className="mt-2 text-xs text-slate-500">Metrics API: {provider.metricsApiStatus}</p>
      ) : null}
      {provider?.triggerEnabled !== undefined ? (
        <p className="mt-2 text-xs text-slate-500">Trigger enabled: {provider.triggerEnabled ? 'Yes' : 'No'}</p>
      ) : null}
      {provider?.href ? (
        <Link
          href={provider.href}
          className="mt-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-cyan-300/45 hover:bg-cyan-300/15"
        >
          Open connector
        </Link>
      ) : null}
    </section>
  );
}

function OperationMiniList({
  title,
  items,
  emptyMessage,
  showError,
}: {
  title: string;
  items: OperationObservabilityItem[];
  emptyMessage: string;
  showError?: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">Tenant-scoped operation records from AutoOps.</p>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700">
          {items.length}
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            {emptyMessage}
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>
                      {item.status}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {sourceLabel(item.source)}
                    </span>
                    {item.retry.supported ? (
                      <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        Recovery available
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 truncate text-sm text-slate-600">{item.targetLabel ?? MISSING_VALUE}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Actor {actorLabel(item.actor)} | Created {formatTimelineDate(item.createdAt)}
                  </p>
                  {showError && item.errorMessage ? (
                    <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-800">
                      {item.errorMessage}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/dashboard/operations/${item.id}`}
                  className="inline-flex w-fit shrink-0 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-cyan-300/45 hover:bg-cyan-300/15"
                >
                  View details
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function OperationsClient() {
  const [observability, setObservability] = useState<OpsObservabilityResponse | null>(null);
  const [activityItems, setActivityItems] = useState<OperationActivityItem[]>([]);
  const [pendingApprovalItems, setPendingApprovalItems] = useState<OperationActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDecidingApproval, setIsDecidingApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<PendingApprovalDecision | null>(null);
  const [decisionConfirmation, setDecisionConfirmation] = useState('');

  const loadSummary = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    setActivityError(null);

    try {
      const [
        observabilityResponse,
        pendingApprovalResponse,
      ] = await Promise.all([
        api.get<OpsObservabilityApiResponse>('/v1/ops/observability'),
        api.get<OperationActivityApiResponse>('/v1/ops/activity?status=PENDING_APPROVAL&limit=20'),
      ]);
      setObservability(observabilityResponse.data);
      setPendingApprovalItems(pendingApprovalResponse.data.items);

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

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        void loadSummary();
      }
    }

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadSummary]);

  useEffect(() => {
    if (!pendingDecision) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDecidingApproval) {
        setPendingDecision(null);
        setDecisionConfirmation('');
        setDecisionError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDecidingApproval, pendingDecision]);

  const platform = observability?.platform;
  const queueHealth = observability?.queues;
  const providerHealth = observability?.providers;
  const operationObservability = observability?.operations;
  const incidentSummary = observability?.incidents;
  const pendingApprovals = useMemo(() => pendingApprovalItems, [pendingApprovalItems]);
  const importantIncidents = useMemo(
    () =>
      (incidentSummary?.latest ?? [])
        .filter((incident) => incident.status === 'OPEN' || incident.status === 'ACKNOWLEDGED')
        .filter((incident) => incident.severity === 'CRITICAL' || incident.severity === 'HIGH' || incident.severity === 'MEDIUM')
        .slice(0, 3),
    [incidentSummary?.latest],
  );

  const openDecisionModal = (operation: OperationActivityItem, decision: ApprovalDecision) => {
    const allowed = decision === 'approve' ? operation.permissions.canApprove : operation.permissions.canReject;
    if (!allowed) {
      setDecisionError(operation.permissions.reason ?? 'You do not have permission to decide this operation.');
      return;
    }
    setPendingDecision({ operation, decision });
    setDecisionConfirmation('');
    setDecisionError(null);
  };

  const decideOperation = async () => {
    if (!pendingDecision) return;
    const expectedToken = pendingDecision.decision === 'approve' ? 'APPROVE' : 'REJECT';
    if (decisionConfirmation !== expectedToken) return;
    setIsDecidingApproval(true);
    setDecisionError(null);
    try {
      await api.post<{ data: Operation }>(`/v1/operations/${pendingDecision.operation.id}/${pendingDecision.decision}`, {
        reason:
          pendingDecision.decision === 'approve'
            ? 'Approved from Operations Hub'
            : 'Rejected from Operations Hub',
      });
      setPendingDecision(null);
      setDecisionConfirmation('');
      await loadSummary();
    } catch (decisionError) {
      setDecisionError(getErrorMessage(decisionError));
    } finally {
      setIsDecidingApproval(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Command Center
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">Operations Hub</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Monitor runtime health, approvals, incidents, failures, and controlled operation activity from one console.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              Updated {formatTime(observability?.generatedAt ?? null)}
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
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          ['Platform', platform?.api.status ?? 'UNKNOWN', 'API readiness'],
          ['Providers', providerHealth ? 'LIVE' : 'UNKNOWN', 'Connector checks'],
          ['Active operations', operationObservability?.active.length ?? 0, 'Queued/running/pending'],
          ['Pending approvals', pendingApprovals.length, 'Need decision'],
          ['Open incidents', incidentSummary?.open ?? 0, 'Failure response'],
        ].map(([label, value, caption]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{caption}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#ff9900]">
              {importantIncidents.length > 0 ? 'Action required' : 'No incident action required'}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Important incidents</h2>
            <p className="mt-1 text-sm text-slate-600">
              Open and acknowledged incidents appear here automatically. Resolved incidents leave this danger view on refresh.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50">
            <Link href="/dashboard/incidents">Open incident register</Link>
          </Button>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {importantIncidents.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 lg:col-span-3">
              No open important incidents. Resolved incidents remain in the incident register for audit history.
            </div>
          ) : (
            importantIncidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/dashboard/incidents/${incident.id}`}
                className="rounded-md border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskTone(incident.severity)}`}>
                    {incident.severity}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(incident.status)}`}>
                    {incident.status}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm font-semibold text-slate-950">{incident.title}</p>
                <p className="mt-1 truncate text-xs text-slate-600">{incident.targetLabel ?? MISSING_VALUE}</p>
                {incident.safeErrorMessage ? (
                  <p className="mt-3 line-clamp-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                    {incident.safeErrorMessage}
                  </p>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </section>

      <section id="runtime-health" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Platform Health</h2>
            <p className="mt-1 text-sm text-slate-600">
              Real readiness signals from API, PostgreSQL, Redis, and persisted worker heartbeats.
            </p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700">
            Generated {formatTime(observability?.generatedAt ?? null)}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <HealthCheckCard title="API" status={platform?.api.status ?? 'UNKNOWN'} message={platform?.api.message ?? 'API health unavailable.'} icon={<Server className="h-5 w-5" />} />
          <HealthCheckCard title="PostgreSQL" status={platform?.database.status ?? 'UNKNOWN'} message={platform?.database.message ?? 'Database health unavailable.'} icon={<Database className="h-5 w-5" />} />
          <HealthCheckCard title="Redis" status={platform?.redis.status ?? 'UNKNOWN'} message={platform?.redis.message ?? 'Redis health unavailable.'} icon={<RadioTower className="h-5 w-5" />} />
          <WorkerRuntimeCard worker={observability?.workerRuntime} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section id="provider-health" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Provider Health</h2>
            <p className="mt-1 text-sm text-slate-600">Connector status comes from the real provider checks.</p>
          </div>
          <div className="mt-5 grid gap-4">
            <ProviderHealthCard label="Jenkins" provider={providerHealth?.jenkins} />
            <ProviderHealthCard label="Docker" provider={providerHealth?.docker} />
            <ProviderHealthCard label="Kubernetes" provider={providerHealth?.kubernetes} />
          </div>
        </section>

        <section id="queue-health" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Queue Health</h2>
            <p className="mt-1 text-sm text-slate-600">BullMQ counts are shown only when safely readable.</p>
          </div>
          <div className="mt-5 space-y-4">
            <QueueHealthCard title="Deployments Queue" queue={queueHealth?.deployments} />
            <QueueHealthCard title="Operations Queue" queue={queueHealth?.operations} />
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Operation Status Breakdown</h2>
            <p className="mt-1 text-sm text-slate-600">
              {operationObservability?.recentWindowLabel ?? 'Latest tenant operations'}.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
            {operationObservability?.totalRecent ?? 0} recent
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {[
            ['Queued', operationObservability?.statusBreakdown.queued ?? 0],
            ['Running', operationObservability?.statusBreakdown.running ?? 0],
            ['Succeeded', operationObservability?.statusBreakdown.succeeded ?? 0],
            ['Failed', operationObservability?.statusBreakdown.failed ?? 0],
            ['Rejected', operationObservability?.statusBreakdown.rejected ?? 0],
            ['Cancelled', operationObservability?.statusBreakdown.cancelled ?? 0],
            ['Pending approval', operationObservability?.statusBreakdown.pendingApproval ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <OperationMiniList
          title="Active Operations"
          items={operationObservability?.active ?? []}
          emptyMessage="No active queued, running, or pending approval operations."
        />
        <OperationMiniList
          title="Recent Failures"
          items={operationObservability?.recentFailures ?? []}
          emptyMessage="No recent failed operations."
          showError
        />
      </div>

      <div
        id="approvals"
        className={
          pendingApprovals.length > 0
            ? 'grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]'
            : 'grid grid-cols-1 gap-4'
        }
      >
        {pendingApprovals.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Policy Holds</h2>
              <p className="mt-1 text-sm text-slate-600">Only operations already held by policy appear here.</p>
            </div>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-800">
              {pendingApprovals.length} pending
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {pendingApprovals.map((operation) => (
                <div key={operation.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskTone(operation.governance.riskLevel)}`}>
                          {operation.governance.riskLevel} risk
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {sourceLabel(operation.source)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">{operation.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{operation.targetLabel ?? MISSING_VALUE}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Requester {actorLabel(operation.actor)} | Created {formatDate(operation.createdAt)}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">{governanceSummary(operation.governance)}</p>
                      {operation.governance.approvalReason ? (
                        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-800">
                          {operation.governance.approvalReason}
                        </p>
                      ) : null}
                      {!operation.permissions.canApprove || !operation.permissions.canReject ? (
                        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                          {operation.permissions.reason ?? 'You do not have permission to decide this operation.'}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Link
                        href={`/dashboard/operations/${operation.id}`}
                        className="inline-flex items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-cyan-300/45 hover:bg-cyan-300/15"
                      >
                        View details
                      </Link>
                      <Button
                        size="sm"
                        className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => openDecisionModal(operation, 'approve')}
                        disabled={!operation.permissions.canApprove}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-rose-200 bg-white text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => openDecisionModal(operation, 'reject')}
                        disabled={!operation.permissions.canReject}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
        ) : null}

        <section id="activity" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Operations Activity Timeline</h2>
              <p className="mt-1 text-sm text-slate-600">Real operation activity from worker-backed AutoOps records.</p>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700">
              {activityItems.length} shown
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                Loading operation activity...
              </div>
            ) : activityError ? (
              <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-5">
                <p className="text-sm font-medium text-rose-800">Unable to load operation activity.</p>
                <p className="mt-2 text-sm text-slate-600">{activityError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full border-slate-200 bg-slate-50"
                  onClick={() => void loadSummary()}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  Retry
                </Button>
              </div>
            ) : activityItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                <p className="font-medium text-slate-900">No operations have been recorded yet.</p>
                <p className="mt-2 text-slate-500">Trigger a Jenkins job or deployment to see activity here.</p>
              </div>
            ) : (
              activityItems.map((item, index) => (
                <article
                  key={item.id}
                  className="relative rounded-md border border-slate-200 bg-slate-50 p-4 pl-11 transition hover:border-cyan-300/30 hover:bg-slate-50"
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
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {sourceLabel(item.source)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>
                          {item.status}
                        </span>
                        {item.governance ? (
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskTone(item.governance.riskLevel)}`}>
                            {item.governance.riskLevel} risk
                          </span>
                        ) : null}
                        {item.result ? (
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.result)}`}>
                            {item.result}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-slate-900">{item.title}</h3>
                      <p className="mt-1 truncate text-sm text-slate-600">{item.targetLabel ?? MISSING_VALUE}</p>
                      <p className="mt-2 text-xs text-slate-500">{governanceSummary(item.governance)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/operations/${item.id}`}
                        className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-cyan-300/45 hover:bg-cyan-300/15"
                      >
                        View details
                      </Link>
                      {item.externalUrl ? (
                        <a
                          href={item.externalUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
                        >
                          Open related resource
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-1 text-slate-700">{formatTimelineDate(item.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Duration</p>
                      <p className="mt-1 text-slate-700">{formatTimelineDuration(item.durationMs)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Actor</p>
                      <p className="mt-1 flex items-center gap-2 text-slate-700">
                        <UserCircle className="h-3.5 w-3.5 text-slate-500" />
                        {actorLabel(item.actor)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Operation</p>
                      <p className="mt-1 font-mono text-slate-700">{shortOperationId(item.id)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Started</p>
                      <p className="mt-1 text-slate-700">{formatTimelineDate(item.startedAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Completed</p>
                      <p className="mt-1 text-slate-700">{formatTimelineDate(item.completedAt)}</p>
                    </div>
                  </div>
                  {item.errorMessage ? (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      {item.errorMessage}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {pendingDecision ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approval-decision-title"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  {pendingDecision.operation.governance.riskLevel} risk | {approvalStatusLabel(pendingDecision.operation.governance.approvalStatus)}
                </p>
                <h2 id="approval-decision-title" className="mt-2 text-xl font-semibold text-slate-900">
                  {pendingDecision.decision === 'approve' ? 'Approve operation' : 'Reject operation'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingDecision(null);
                  setDecisionConfirmation('');
                  setDecisionError(null);
                }}
                disabled={isDecidingApproval}
                className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-700 transition hover:bg-blue-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close approval decision"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-slate-900">{pendingDecision.operation.title}</p>
              <p>Target: {pendingDecision.operation.targetLabel ?? MISSING_VALUE}</p>
              <p>
                {pendingDecision.decision === 'approve'
                  ? 'Approving this operation will queue it for worker execution.'
                  : 'Rejecting this operation prevents worker execution.'}
              </p>
              {pendingDecision.operation.governance.approvalReason ? (
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-800">
                  {pendingDecision.operation.governance.approvalReason}
                </p>
              ) : null}
              <p>
                Type{' '}
                <span className="font-semibold text-amber-800">
                  {pendingDecision.decision === 'approve' ? 'APPROVE' : 'REJECT'}
                </span>{' '}
                to continue.
              </p>
            </div>

            {decisionError ? (
              <div className="mt-4 rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-800">
                {decisionError}
              </div>
            ) : null}

            <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="approval-decision-token">
              Required decision token
            </label>
            <input
              id="approval-decision-token"
              value={decisionConfirmation}
              onChange={(event) => setDecisionConfirmation(event.target.value)}
              placeholder={`Type ${pendingDecision.decision === 'approve' ? 'APPROVE' : 'REJECT'} to confirm`}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
              autoFocus
            />

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingDecision(null);
                  setDecisionConfirmation('');
                  setDecisionError(null);
                }}
                disabled={isDecidingApproval}
                className="rounded-full border-slate-200 bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void decideOperation()}
                disabled={
                  decisionConfirmation !==
                    (pendingDecision.decision === 'approve' ? 'APPROVE' : 'REJECT') ||
                  isDecidingApproval
                }
                className={
                  pendingDecision.decision === 'approve'
                    ? 'rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                    : 'rounded-full bg-rose-400 text-slate-950 hover:bg-rose-300'
                }
              >
                {isDecidingApproval
                  ? 'Submitting...'
                  : pendingDecision.decision === 'approve'
                    ? 'Approve and queue'
                    : 'Reject operation'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
