'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DockerActionResponse,
  JenkinsTriggerBuildResponse,
  KubernetesActionResponse,
  OperationDetailResponse,
  OpsObservabilityResponse,
} from '@autoops/types';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Timer,
  UserCircle,
  X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type DetailApiResponse = { data: OperationDetailResponse };
type JenkinsRetryResponse = { data: JenkinsTriggerBuildResponse };
type DockerRetryResponse = { data: DockerActionResponse };
type KubernetesRetryResponse = { data: KubernetesActionResponse };
type ObservabilityApiResponse = { data: OpsObservabilityResponse };
type RetryAction = {
  token: string;
  label: string;
  endpoint: string;
  body: Record<string, string | number>;
  target: string;
  scaleReplicas: number | null;
};
type ApprovalDecision = 'approve' | 'reject';

const MISSING_VALUE = '-';
const DETAIL_POLL_INTERVAL_MS = 7_000;
const ACTIVE_OPERATION_STATUSES = new Set(['QUEUED', 'RUNNING', 'PENDING_APPROVAL']);

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load operation detail.';
}

function statusTone(status: string): string {
  if (status === 'SUCCEEDED' || status === 'CONNECTED' || status === 'completed') {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  }
  if (status === 'FAILED' || status === 'REJECTED' || status === 'CANCELLED' || status === 'failed') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  }
  if (status === 'RUNNING' || status === 'QUEUED' || status === 'PENDING_APPROVAL' || status === 'active') {
    return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  }
  return 'border-slate-500/25 bg-slate-500/10 text-slate-300';
}

function riskTone(riskLevel: string): string {
  if (riskLevel === 'LOW') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (riskLevel === 'MEDIUM') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  if (riskLevel === 'HIGH') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  return 'border-slate-500/25 bg-slate-500/10 text-slate-300';
}

function formatDate(value: string | null): string {
  if (!value) return MISSING_VALUE;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
}

function shortId(value: string): string {
  return value.length > 12 ? value.slice(0, 12) : value;
}

function actorLabel(actor: OperationDetailResponse['actor']): string {
  if (!actor) return MISSING_VALUE;
  return actor.name ?? actor.email ?? actor.id;
}

function approvalLabel(status: string): string {
  if (status === 'NOT_REQUIRED') return 'Approval not required';
  if (status === 'PENDING') return 'Approval pending';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  return status;
}

function detailRows(detail: OperationDetailResponse): Array<[string, string | number | null]> {
  const provider = detail.providerDetails;
  return [
    ['Provider', provider.provider],
    ['Operation type', provider.operationType],
    ['Target kind', provider.targetKind],
    ['Target name', provider.targetName],
    ['Namespace', provider.namespace],
    ['Container', provider.containerName],
    ['Container ID', provider.containerId ? shortId(provider.containerId) : null],
    ['Jenkins job', provider.jobName],
    ['Build number', provider.buildNumber],
    ['Action', provider.action],
    ['Replicas', provider.replicas],
  ];
}

function buildRetryAction(detail: OperationDetailResponse): RetryAction | null {
  if (!detail.retry.supported || !detail.retry.confirmationTokenLabel || !detail.retry.actionLabel) {
    return null;
  }

  const provider = detail.providerDetails;
  const token = detail.retry.confirmationTokenLabel;
  if (detail.type === 'JENKINS_BUILD_TRIGGER' && provider.jobName) {
    return {
      token,
      label: detail.retry.actionLabel,
      endpoint: `/v1/integrations/jenkins/jobs/${encodeURIComponent(provider.jobName)}/trigger`,
      body: { confirmationToken: token, reason: `Recovery from operation ${shortId(detail.id)}` },
      target: provider.jobName,
      scaleReplicas: null,
    };
  }

  const dockerAction =
    provider.action === 'start' || provider.action === 'stop' || provider.action === 'restart'
      ? provider.action
      : null;

  if (detail.source === 'docker' && provider.containerId && dockerAction) {
    return {
      token,
      label: detail.retry.actionLabel,
      endpoint: `/v1/integrations/docker/containers/${encodeURIComponent(provider.containerId)}/${dockerAction}`,
      body: { confirmationToken: token },
      target: provider.containerName ?? shortId(provider.containerId),
      scaleReplicas: null,
    };
  }

  if (detail.type === 'KUBERNETES_DEPLOYMENT_SCALE' && provider.namespace && provider.targetName && provider.replicas !== null) {
    return {
      token,
      label: detail.retry.actionLabel,
      endpoint: `/v1/integrations/kubernetes/workloads/${encodeURIComponent(provider.namespace)}/deployments/${encodeURIComponent(provider.targetName)}/scale`,
      body: { replicas: provider.replicas, confirmationToken: token },
      target: `${provider.namespace}/${provider.targetName}`,
      scaleReplicas: provider.replicas,
    };
  }

  if (detail.type === 'KUBERNETES_DEPLOYMENT_RESTART' && provider.namespace && provider.targetName) {
    return {
      token,
      label: detail.retry.actionLabel,
      endpoint: `/v1/integrations/kubernetes/workloads/${encodeURIComponent(provider.namespace)}/deployments/${encodeURIComponent(provider.targetName)}/rollout-restart`,
      body: { confirmationToken: token },
      target: `${provider.namespace}/${provider.targetName}`,
      scaleReplicas: null,
    };
  }

  return null;
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 truncate text-sm font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl bg-cyan-300/10 p-2 text-cyan-300">{icon}</div>
      </div>
    </section>
  );
}

export function OperationDetailClient({ operationId }: { operationId: string }) {
  const [detail, setDetail] = useState<OperationDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [confirmationValue, setConfirmationValue] = useState('');
  const [decisionConfirmationValue, setDecisionConfirmationValue] = useState('');
  const [pendingRetry, setPendingRetry] = useState<RetryAction | null>(null);
  const [pendingDecision, setPendingDecision] = useState<ApprovalDecision | null>(null);
  const [queuedOperationId, setQueuedOperationId] = useState<string | null>(null);
  const [providerHealth, setProviderHealth] = useState<
    OpsObservabilityResponse['providers'][keyof OpsObservabilityResponse['providers']] | null
  >(null);
  const [workerRuntime, setWorkerRuntime] = useState<OpsObservabilityResponse['workerRuntime'] | null>(null);

  const loadDetail = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (mode === 'initial') setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);
      try {
        const response = await api.get<DetailApiResponse>(`/v1/ops/activity/${encodeURIComponent(operationId)}`);
        setDetail(response.data);
        try {
          const observability = await api.get<ObservabilityApiResponse>('/v1/ops/observability');
          setWorkerRuntime(observability.data.workerRuntime);
          if (
            response.data.source === 'jenkins' ||
            response.data.source === 'docker' ||
            response.data.source === 'kubernetes'
          ) {
            setProviderHealth(observability.data.providers[response.data.source]);
          } else {
            setProviderHealth(null);
          }
        } catch {
          setProviderHealth(null);
          setWorkerRuntime(null);
        }
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [operationId],
  );

  useEffect(() => {
    void loadDetail('initial');
  }, [loadDetail]);

  const isActiveOperation = detail ? ACTIVE_OPERATION_STATUSES.has(detail.status) : false;
  const workerUnavailableForActiveOperation =
    isActiveOperation && workerRuntime !== null && workerRuntime.status !== 'RUNNING';

  useEffect(() => {
    if (!isActiveOperation || pendingRetry) return;
    const intervalId = window.setInterval(() => {
      void loadDetail();
    }, DETAIL_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [isActiveOperation, loadDetail, pendingRetry]);

  useEffect(() => {
    if (!pendingRetry && !pendingDecision) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        setPendingRetry(null);
        setPendingDecision(null);
        setConfirmationValue('');
        setDecisionConfirmationValue('');
        setRetryError(null);
        setDecisionError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, pendingDecision, pendingRetry]);

  const retryAction = useMemo(
    () => (detail && !isActiveOperation ? buildRetryAction(detail) : null),
    [detail, isActiveOperation],
  );
  const isPendingApproval = detail?.status === 'PENDING_APPROVAL';
  const canApprove = detail?.permissions.canApprove ?? false;
  const canReject = detail?.permissions.canReject ?? false;
  const canTriggerRecovery = detail?.permissions.canTriggerRecovery ?? false;

  const queueRetry = async () => {
    if (!pendingRetry || confirmationValue !== pendingRetry.token) return;
    if (!detail?.permissions.canTriggerRecovery) {
      setRetryError(detail?.permissions.reason ?? 'You do not have permission to trigger recovery for this operation.');
      return;
    }
    setIsSubmitting(true);
    setRetryError(null);
    setQueuedOperationId(null);
    try {
      const response =
        detail?.source === 'jenkins'
          ? await api.post<JenkinsRetryResponse>(pendingRetry.endpoint, pendingRetry.body)
          : detail?.source === 'docker'
            ? await api.post<DockerRetryResponse>(pendingRetry.endpoint, pendingRetry.body)
            : await api.post<KubernetesRetryResponse>(pendingRetry.endpoint, pendingRetry.body);
      setQueuedOperationId(response.data.operationId);
      setPendingRetry(null);
      setConfirmationValue('');
      await loadDetail();
    } catch (retryActionError) {
      setRetryError(getErrorMessage(retryActionError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitApprovalDecision = async () => {
    if (!pendingDecision || !detail) return;
    if (pendingDecision === 'approve' && !detail.permissions.canApprove) {
      setDecisionError(detail.permissions.reason ?? 'You do not have permission to approve this operation.');
      return;
    }
    if (pendingDecision === 'reject' && !detail.permissions.canReject) {
      setDecisionError(detail.permissions.reason ?? 'You do not have permission to reject this operation.');
      return;
    }
    const expectedToken = pendingDecision === 'approve' ? 'APPROVE' : 'REJECT';
    if (decisionConfirmationValue !== expectedToken) return;
    setIsSubmitting(true);
    setDecisionError(null);
    try {
      await api.post<{ data: unknown }>(`/v1/operations/${detail.id}/${pendingDecision}`, {
        reason:
          pendingDecision === 'approve'
            ? 'Approved from operation detail'
            : 'Rejected from operation detail',
      });
      setPendingDecision(null);
      setDecisionConfirmationValue('');
      await loadDetail();
    } catch (approvalError) {
      setDecisionError(getErrorMessage(approvalError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-8 text-sm text-slate-300">
        Loading operation detail...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Button asChild variant="outline" size="sm" className="rounded-full border-white/10 bg-white/[0.04]">
          <Link href="/dashboard/operations">
            <ArrowLeft className="h-4 w-4" />
            Back to Ops Hub
          </Link>
        </Button>
        <section className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-100">
          {error ?? 'Operation detail was not found.'}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Button asChild variant="outline" size="sm" className="rounded-full border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]">
        <Link href="/dashboard/operations">
          <ArrowLeft className="h-4 w-4" />
          Back to Ops Hub
        </Link>
      </Button>

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.24),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(124,58,237,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/25 lg:p-8">
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(detail.status)}`}>
                {detail.status}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-slate-300">
                {detail.source}
              </span>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${riskTone(detail.governance.riskLevel)}`}>
                {detail.governance.riskLevel} risk
              </span>
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white lg:text-5xl">{detail.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Safe operation detail for {detail.targetLabel ?? 'an AutoOps operation'}. Raw provider input, result, and error blobs are not exposed.
            </p>
          </div>
          <Button type="button" onClick={() => void loadDetail()} disabled={isRefreshing} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </section>

      {queuedOperationId ? (
        <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-100">
          Operation queued successfully.{' '}
          <Link className="font-semibold underline decoration-cyan-200/50 underline-offset-4" href={`/dashboard/operations/${queuedOperationId}`}>
            View new operation {shortId(queuedOperationId)}
          </Link>
        </section>
      ) : null}

      {isActiveOperation ? (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          This operation is still active. AutoOps is refreshing this detail view every {DETAIL_POLL_INTERVAL_MS / 1_000} seconds until it reaches a terminal state.
        </section>
      ) : null}

      {workerUnavailableForActiveOperation ? (
        <section className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          No fresh worker heartbeat detected. This operation may remain queued until a worker is available.
          <span className="mt-2 block text-rose-200/80">Worker status: {workerRuntime.status}. {workerRuntime.message}</span>
        </section>
      ) : null}

      {providerHealth && providerHealth.status !== 'CONNECTED' ? (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          Current provider health: {providerHealth.status}. {providerHealth.message}
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Status" value={detail.status} icon={<Activity className="h-5 w-5" />} />
        <SummaryCard label="Source" value={detail.source} icon={<ShieldCheck className="h-5 w-5" />} />
        <SummaryCard label="Target" value={detail.targetLabel ?? MISSING_VALUE} icon={<CheckCircle2 className="h-5 w-5" />} />
        <SummaryCard label="Actor" value={actorLabel(detail.actor)} icon={<UserCircle className="h-5 w-5" />} />
        <SummaryCard label="Duration" value={formatDuration(detail.durationMs)} icon={<Timer className="h-5 w-5" />} />
        <SummaryCard label="Created" value={formatDate(detail.createdAt)} icon={<Activity className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <h2 className="text-base font-semibold text-white">Governance</h2>
          <div className="mt-5 grid gap-3 text-sm">
            {[
              ['Risk level', detail.governance.riskLevel],
              ['Confirmation required', detail.governance.confirmationRequired ? 'Yes' : 'No'],
              ['Confirmation label', detail.governance.confirmationTokenLabel ?? MISSING_VALUE],
              ['Confirmation satisfied', detail.governance.confirmationSatisfied ? 'Yes' : 'No'],
              ['Approval required', detail.governance.approvalRequired ? 'Yes' : 'No'],
              ['Approval status', approvalLabel(detail.governance.approvalStatus)],
              ['Policy', detail.governance.policyName ?? MISSING_VALUE],
              ['Policy reason', detail.governance.approvalReason ?? MISSING_VALUE],
              ['Approved at', formatDate(detail.governance.approvedAt)],
              ['Approved by', actorLabel(detail.governance.approvedBy ?? null)],
              ['Rejected at', formatDate(detail.governance.rejectedAt)],
              ['Rejected by', actorLabel(detail.governance.rejectedBy ?? null)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                <span className="text-slate-500">{label}</span>
                <span className="text-right font-medium text-slate-200">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <h2 className="text-base font-semibold text-white">Lifecycle</h2>
          <div className="mt-5 space-y-3">
            {detail.lifecycle.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.description}</p>
                <p className="mt-2 text-xs text-slate-500">{formatDate(item.timestamp)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {isPendingApproval ? (
        <section className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 shadow-xl shadow-black/10">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Approval decision</h2>
              <p className="mt-1 text-sm text-amber-100">
                This operation will not execute until an authenticated approver approves it.
              </p>
              <div className="mt-4 grid gap-2 text-sm text-amber-50">
                <p>Requester: {actorLabel(detail.actor)}</p>
                <p>Requested: {formatDate(detail.createdAt)}</p>
                <p>Policy: {detail.governance.policyName ?? MISSING_VALUE}</p>
                <p>Reason: {detail.governance.approvalReason ?? 'Policy requires approval before worker execution.'}</p>
              </div>
              {!canApprove || !canReject ? (
                <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-sm text-amber-50">
                  {detail.permissions.reason ?? 'You do not have permission to decide this operation.'}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => setPendingDecision('approve')}
                disabled={!canApprove}
                className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingDecision('reject')}
                disabled={!canReject}
                className="rounded-full border-rose-300/30 text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reject
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-white">Provider details</h2>
            {detail.externalUrl ? (
              <Button asChild size="sm" variant="outline" className="rounded-full border-white/10 bg-white/[0.04]">
                <a href={detail.externalUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="h-4 w-4" />
                  Open related resource
                </a>
              </Button>
            ) : null}
          </div>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            {detailRows(detail).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 break-words text-slate-300">{value ?? MISSING_VALUE}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2">
            {detail.providerDetails.safeSummary.map((item) => (
              <p key={item} className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-300">
                {item}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <h2 className="text-base font-semibold text-white">Safe result</h2>
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            {detail.errorMessage ? (
              <div className="flex gap-3 text-sm text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <p>{detail.errorMessage}</p>
              </div>
            ) : detail.result ? (
              <p className="text-sm text-slate-300">{detail.result}</p>
            ) : (
              <p className="text-sm text-slate-400">
                {isActiveOperation
                  ? 'Operation is still in progress. This view will refresh while the operation remains active.'
                  : 'No safe result summary is available yet.'}
              </p>
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-4 text-sm text-cyan-100">
            Raw operation input, result, and error metadata are intentionally hidden from this view.
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Recovery</h2>
            <p className="mt-1 text-sm text-slate-400">
              Recovery uses provider-specific controlled endpoints with the same confirmation model.
            </p>
          </div>
          {retryAction ? (
            <Button
              type="button"
              onClick={() => setPendingRetry(retryAction)}
              disabled={!canTriggerRecovery}
              className="rounded-full bg-white text-slate-950 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCw className="h-4 w-4" />
              {retryAction.label}
            </Button>
          ) : null}
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300">
          {isActiveOperation
            ? 'Recovery is disabled while the operation is queued, running, or pending approval.'
            : retryAction
            ? canTriggerRecovery
              ? `${retryAction.label} is available for ${retryAction.target}. Confirmation ${retryAction.token} is required.`
              : detail.permissions.reason ?? 'You do not have permission to trigger recovery for this operation.'
            : detail.retry.reason ?? 'Recovery action is not available for this operation.'}
        </div>
      </section>

      {pendingRetry ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="operation-retry-title"
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                  {detail.governance.riskLevel} risk | {approvalLabel(detail.governance.approvalStatus)}
                </p>
                <h2 id="operation-retry-title" className="mt-2 text-xl font-semibold text-white">
                  {pendingRetry.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingRetry(null);
                  setConfirmationValue('');
                  setRetryError(null);
                }}
                disabled={isSubmitting}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close recovery confirmation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
              <p>
                You are about to queue <span className="font-semibold text-white">{pendingRetry.label}</span> for{' '}
                <span className="font-semibold text-white">{pendingRetry.target}</span>.
              </p>
              {pendingRetry.scaleReplicas !== null ? (
                <p>Replica target: {pendingRetry.scaleReplicas}</p>
              ) : null}
              <p>
                Type <span className="font-semibold text-amber-200">{pendingRetry.token}</span> to queue the worker-executed recovery operation.
              </p>
            </div>

            {retryError ? (
              <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                {retryError}
              </div>
            ) : null}

            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="operation-retry-token">
              Required confirmation token
            </label>
            <Input
              id="operation-retry-token"
              value={confirmationValue}
              onChange={(event) => setConfirmationValue(event.target.value)}
              placeholder={`Type ${pendingRetry.token} to confirm`}
              className="mt-2 border-white/10 bg-slate-900/80"
              autoFocus
            />

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingRetry(null);
                  setConfirmationValue('');
                  setRetryError(null);
                }}
                disabled={isSubmitting}
                className="rounded-full border-white/10 bg-white/[0.04]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void queueRetry()}
                disabled={confirmationValue !== pendingRetry.token || isSubmitting}
                className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
              >
                {isSubmitting ? 'Queueing...' : 'Queue recovery operation'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDecision ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="operation-approval-title"
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                  {detail.governance.riskLevel} risk | {approvalLabel(detail.governance.approvalStatus)}
                </p>
                <h2 id="operation-approval-title" className="mt-2 text-xl font-semibold text-white">
                  {pendingDecision === 'approve' ? 'Approve operation' : 'Reject operation'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingDecision(null);
                  setDecisionConfirmationValue('');
                  setDecisionError(null);
                }}
                disabled={isSubmitting}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close approval decision"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
              <p>
                {pendingDecision === 'approve'
                  ? 'Approving this operation will queue it for worker execution.'
                  : 'Rejecting this operation prevents worker execution.'}
              </p>
              <p>Target: {detail.targetLabel ?? MISSING_VALUE}</p>
              {detail.governance.approvalReason ? (
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                  {detail.governance.approvalReason}
                </p>
              ) : null}
              <p>
                Type{' '}
                <span className="font-semibold text-amber-200">
                  {pendingDecision === 'approve' ? 'APPROVE' : 'REJECT'}
                </span>{' '}
                to continue.
              </p>
            </div>

            {decisionError ? (
              <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                {decisionError}
              </div>
            ) : null}

            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="operation-approval-token">
              Required decision token
            </label>
            <Input
              id="operation-approval-token"
              value={decisionConfirmationValue}
              onChange={(event) => setDecisionConfirmationValue(event.target.value)}
              placeholder={`Type ${pendingDecision === 'approve' ? 'APPROVE' : 'REJECT'} to confirm`}
              className="mt-2 border-white/10 bg-slate-900/80"
              autoFocus
            />

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingDecision(null);
                  setDecisionConfirmationValue('');
                  setDecisionError(null);
                }}
                disabled={isSubmitting}
                className="rounded-full border-white/10 bg-white/[0.04]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submitApprovalDecision()}
                disabled={decisionConfirmationValue !== (pendingDecision === 'approve' ? 'APPROVE' : 'REJECT') || isSubmitting}
                className={
                  pendingDecision === 'approve'
                    ? 'rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                    : 'rounded-full bg-rose-400 text-slate-950 hover:bg-rose-300'
                }
              >
                {isSubmitting
                  ? 'Submitting...'
                  : pendingDecision === 'approve'
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
