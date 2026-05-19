'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  KubernetesActionResponse,
  KubernetesListResponse,
  KubernetesNamespace,
  KubernetesNode,
  KubernetesPod,
  KubernetesRolloutStatus,
  KubernetesService,
  KubernetesStatus,
  KubernetesSummary,
  KubernetesWorkload,
  OperationActivityItem,
  OperationActivityResponse,
} from '@autoops/types';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Container,
  Database,
  Layers,
  Network,
  PlayCircle,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  ShieldCheck,
  UserCircle,
  X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

type KubernetesStatusResponse = { data: KubernetesStatus };
type KubernetesSummaryResponse = { data: KubernetesSummary };
type NamespaceResponse = { data: KubernetesListResponse<KubernetesNamespace> };
type WorkloadResponse = { data: KubernetesListResponse<KubernetesWorkload> };
type PodResponse = { data: KubernetesListResponse<KubernetesPod> };
type ServiceResponse = { data: KubernetesListResponse<KubernetesService> };
type NodeResponse = { data: KubernetesListResponse<KubernetesNode> };
type KubernetesActionApiResponse = { data: KubernetesActionResponse };
type KubernetesRolloutStatusResponse = { data: KubernetesRolloutStatus };
type KubernetesActivityResponse = { data: OperationActivityResponse };
type Tab = 'namespaces' | 'workloads' | 'pods' | 'services' | 'nodes';
type PendingKubernetesAction =
  | { type: 'scale'; workload: KubernetesWorkload }
  | { type: 'rollout'; workload: KubernetesWorkload };

const MISSING_VALUE = '-';
const PROTECTED_NAMESPACES = new Set([
  'kube-system',
  'kube-public',
  'kube-node-lease',
  'local-path-storage',
]);

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load Kubernetes data.';
}

function statusTone(status: string): string {
  if (status === 'CONNECTED') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  if (status === 'UNREACHABLE') return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
}

function formatTime(value: string | undefined): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string | null | undefined): string {
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

function metricsApiValue(summary: KubernetesSummary | null): string {
  if (summary?.metricsApi.status !== 'CONNECTED') return 'Not connected yet';
  return `CONNECTED (${summary.metricsApi.nodeMetricsCount} nodes / ${summary.metricsApi.podMetricsCount} pods)`;
}

function riskTone(riskLevel: string): string {
  if (riskLevel === 'LOW') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  if (riskLevel === 'MEDIUM') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  if (riskLevel === 'HIGH') return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  return 'border-slate-400/25 bg-slate-500/10 text-slate-700';
}

function approvalStatusLabel(status: string): string {
  if (status === 'NOT_REQUIRED') return 'Approval not required';
  if (status === 'PENDING') return 'Approval pending';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  return status;
}

function actorLabel(actor: OperationActivityItem['actor']): string {
  if (!actor) return MISSING_VALUE;
  return actor.name ?? actor.email ?? actor.id;
}

function isProtectedNamespace(namespace: string): boolean {
  return PROTECTED_NAMESPACES.has(namespace);
}

function rolloutTone(status: KubernetesRolloutStatus): string {
  if (status.status === 'HEALTHY' && status.available >= status.desired) {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  }
  if (status.available === 0 && status.desired > 0) {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  }
  return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#5f6b7a]">{label}</p>
          <p className="mt-2 truncate text-xl font-bold text-[#16191f]">{value}</p>
        </div>
        <div className="rounded bg-[#f1f3f3] p-2 text-[#0972d3]">{icon}</div>
      </div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <p className="text-sm font-medium text-slate-900">{message}</p>
      <p className="mt-2 text-sm text-slate-500">No fake Kubernetes data is shown.</p>
    </div>
  );
}

export function KubernetesClient() {
  const [status, setStatus] = useState<KubernetesStatus | null>(null);
  const [summary, setSummary] = useState<KubernetesSummary | null>(null);
  const [namespaces, setNamespaces] = useState<KubernetesNamespace[]>([]);
  const [workloads, setWorkloads] = useState<KubernetesWorkload[]>([]);
  const [pods, setPods] = useState<KubernetesPod[]>([]);
  const [services, setServices] = useState<KubernetesService[]>([]);
  const [nodes, setNodes] = useState<KubernetesNode[]>([]);
  const [activity, setActivity] = useState<OperationActivityItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('namespaces');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingOperation, setIsSubmittingOperation] = useState(false);
  const [isLoadingRollout, setIsLoadingRollout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [rolloutError, setRolloutError] = useState<string | null>(null);
  const [rolloutStatus, setRolloutStatus] = useState<KubernetesRolloutStatus | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingKubernetesAction | null>(null);
  const [desiredReplicas, setDesiredReplicas] = useState('');
  const [confirmationValue, setConfirmationValue] = useState('');

  const loadKubernetes = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    setActivityError(null);

    try {
      const [statusResponse, summaryResponse] = await Promise.all([
        api.get<KubernetesStatusResponse>('/v1/integrations/kubernetes/status'),
        api.get<KubernetesSummaryResponse>('/v1/integrations/kubernetes/summary'),
      ]);

      setStatus(statusResponse.data);
      setSummary(summaryResponse.data);

      if (summaryResponse.data.status === 'CONNECTED') {
        const [namespaceResponse, workloadResponse, podResponse, serviceResponse, nodeResponse] = await Promise.all([
          api.get<NamespaceResponse>('/v1/integrations/kubernetes/namespaces'),
          api.get<WorkloadResponse>('/v1/integrations/kubernetes/workloads'),
          api.get<PodResponse>('/v1/integrations/kubernetes/pods'),
          api.get<ServiceResponse>('/v1/integrations/kubernetes/services'),
          api.get<NodeResponse>('/v1/integrations/kubernetes/nodes'),
        ]);
        setNamespaces(namespaceResponse.data.items);
        setWorkloads(workloadResponse.data.items);
        setPods(podResponse.data.items);
        setServices(serviceResponse.data.items);
        setNodes(nodeResponse.data.items);
      } else {
        setNamespaces([]);
        setWorkloads([]);
        setPods([]);
        setServices([]);
        setNodes([]);
      }

      try {
        const activityResponse = await api.get<KubernetesActivityResponse>('/v1/ops/activity?source=kubernetes&limit=10');
        setActivity(activityResponse.data.items);
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
    void loadKubernetes('initial');
  }, [loadKubernetes]);

  useEffect(() => {
    if (!pendingAction) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingOperation) {
        setPendingAction(null);
        setDesiredReplicas('');
        setConfirmationValue('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmittingOperation, pendingAction]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const source = {
      namespaces,
      workloads,
      pods,
      services,
      nodes,
    }[activeTab];

    if (!normalizedQuery) return source;
    return source.filter((item) =>
      Object.values(item).some((value) =>
        String(value ?? '').toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [activeTab, namespaces, nodes, pods, query, services, workloads]);

  const deployments = useMemo(
    () => workloads.filter((workload) => workload.kind === 'Deployment'),
    [workloads],
  );

  const desiredReplicaValue = Number(desiredReplicas);
  const desiredReplicasValid =
    desiredReplicas.trim() !== '' &&
    Number.isInteger(desiredReplicaValue) &&
    desiredReplicaValue >= 0 &&
    desiredReplicaValue <= 10;
  const requiredToken = pendingAction?.type === 'scale' ? 'SCALE' : pendingAction?.type === 'rollout' ? 'ROLLOUT' : '';
  const canQueueOperation =
    pendingAction?.type === 'scale'
      ? desiredReplicasValid && confirmationValue === 'SCALE' && !isSubmittingOperation
      : pendingAction?.type === 'rollout'
        ? confirmationValue === 'ROLLOUT' && !isSubmittingOperation
        : false;
  const currentStatus = status?.status ?? summary?.status ?? 'NOT_CONFIGURED';

  const openScaleModal = (workload: KubernetesWorkload) => {
    setPendingAction({ type: 'scale', workload });
    setDesiredReplicas(String(workload.desired));
    setConfirmationValue('');
    setActionMessage(null);
  };

  const openRolloutModal = (workload: KubernetesWorkload) => {
    setPendingAction({ type: 'rollout', workload });
    setDesiredReplicas('');
    setConfirmationValue('');
    setActionMessage(null);
  };

  const loadRolloutStatus = async (workload: KubernetesWorkload) => {
    setIsLoadingRollout(true);
    setRolloutError(null);
    try {
      const response = await api.get<KubernetesRolloutStatusResponse>(
        `/v1/integrations/kubernetes/workloads/${encodeURIComponent(workload.namespace)}/deployments/${encodeURIComponent(workload.name)}/rollout-status`,
      );
      setRolloutStatus(response.data);
    } catch (loadError) {
      setRolloutError(getErrorMessage(loadError));
    } finally {
      setIsLoadingRollout(false);
    }
  };

  const queueKubernetesOperation = async () => {
    if (!pendingAction || !canQueueOperation) return;
    setIsSubmittingOperation(true);
    setActionMessage(null);
    try {
      const { namespace, name } = pendingAction.workload;
      const endpoint =
        pendingAction.type === 'scale'
          ? `/v1/integrations/kubernetes/workloads/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(name)}/scale`
          : `/v1/integrations/kubernetes/workloads/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(name)}/rollout-restart`;
      const body =
        pendingAction.type === 'scale'
          ? { replicas: desiredReplicaValue, confirmationToken: 'SCALE' }
          : { confirmationToken: 'ROLLOUT' };
      const response = await api.post<KubernetesActionApiResponse>(endpoint, body);
      setActionMessage(
        response.data.approvalRequired
          ? `${response.data.message} Approval required: ${response.data.approvalReason ?? 'Policy requires approval before worker execution.'} Operation ${response.data.operationId}.`
          : `${response.data.message} Operation ${response.data.operationId}.`,
      );
      setPendingAction(null);
      setDesiredReplicas('');
      setConfirmationValue('');
      await loadKubernetes();
      await loadRolloutStatus(pendingAction.workload);
    } catch (actionError) {
      setActionMessage(getErrorMessage(actionError));
    } finally {
      setIsSubmittingOperation(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="rounded-full border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50"
      >
        <Link href="/dashboard/operations">
          <ArrowLeft className="h-4 w-4" />
          Back to Ops Hub
        </Link>
      </Button>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(currentStatus)}`}>
              {currentStatus}
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">
              Kubernetes Control Connector
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Cluster visibility, metrics, and confirmation-protected workload operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              Checked {formatTime(status?.checkedAt ?? summary?.checkedAt)}
            </span>
            <Button
              type="button"
              onClick={() => void loadKubernetes()}
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

      {currentStatus !== 'CONNECTED' ? (
        <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {currentStatus === 'NOT_CONFIGURED' ? 'Kubernetes is not configured' : 'Kubernetes is unreachable'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-800/80">
                {status?.message ??
                  'Set KUBECONFIG for the API container to enable Kubernetes discovery.'}
              </p>
              {currentStatus === 'NOT_CONFIGURED' ? (
                <div className="mt-4 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">Windows Docker Desktop setup</p>
                  <p>1. Enable Kubernetes in Docker Desktop.</p>
                  <p>2. Run: kubectl config current-context</p>
                  <p>3. Run: kubectl get nodes</p>
                  <p>4. Set KUBECONFIG_HOST_PATH to your host kubeconfig file.</p>
                  <p>5. Start with docker-compose.k8s.yml to mount it into the API container.</p>
                </div>
              ) : null}
              <p className="mt-3 text-sm text-slate-700">
                No kubeconfig content, tokens, certs, Secret resources, or user-specific paths are exposed in the UI.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-emerald-300/15 bg-emerald-300/10 p-4">
        <div className="flex items-center gap-3 text-sm font-medium text-emerald-700">
          <ShieldCheck className="h-4 w-4" />
          Controlled Kubernetes actions are worker-executed and audited. Protected namespaces and unsafe actions are blocked.
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Context" value={summary?.cluster?.context ?? status?.context ?? 'Not connected'} icon={<Server className="h-5 w-5" />} />
        <SummaryCard label="Server" value={summary?.cluster?.server ?? status?.server ?? 'Not connected'} icon={<Network className="h-5 w-5" />} />
        <SummaryCard label="Version" value={summary?.cluster?.version ?? status?.version ?? 'Unknown'} icon={<CheckCircle2 className="h-5 w-5" />} />
        <SummaryCard label="Metrics API" value={metricsApiValue(summary)} icon={<Database className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        {[
          ['Namespaces', summary?.namespaces.total ?? 0, <Layers key="namespaces" className="h-5 w-5" />],
          ['Nodes', `${summary?.nodes.ready ?? 0}/${summary?.nodes.total ?? 0}`, <Server key="nodes" className="h-5 w-5" />],
          ['Pods', summary?.pods.total ?? 0, <Container key="pods" className="h-5 w-5" />],
          ['Services', summary?.services.total ?? 0, <Network key="services" className="h-5 w-5" />],
          ['Deployments', summary?.workloads.deployments ?? 0, <Boxes key="deployments" className="h-5 w-5" />],
          ['Health', summary?.health.clusterHealth ?? 'UNKNOWN', <CheckCircle2 key="health" className="h-5 w-5" />],
          ['Running Pods', summary?.pods.running ?? 0, <CheckCircle2 key="running" className="h-5 w-5" />],
          ['Failed Pods', summary?.pods.failed ?? 0, <AlertTriangle key="failed" className="h-5 w-5" />],
        ].map(([label, value, icon]) => (
          <SummaryCard key={String(label)} label={String(label)} value={String(value)} icon={icon} />
        ))}
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Controlled deployment operations</h2>
            <p className="mt-1 text-sm text-slate-600">
              Scale and rollout restart deployments through confirmation-gated, audited worker execution.
            </p>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-800">
            No delete, exec, apply, or Secret access
          </span>
        </div>

        {actionMessage ? (
          <div className="mt-5 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-blue-700">
            {actionMessage} The worker will execute this Kubernetes operation and update the activity timeline.
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              Loading deployments...
            </div>
          ) : deployments.length === 0 ? (
            <EmptyState message="No deployments returned by the Kubernetes API." />
          ) : (
            deployments.map((deployment) => {
              const protectedNamespace = isProtectedNamespace(deployment.namespace);
              return (
                <article
                  key={`${deployment.namespace}-${deployment.name}`}
                  className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[1.1fr_0.8fr_0.65fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(deployment.status)}`}>
                        {deployment.status}
                      </span>
                      {protectedNamespace ? (
                        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                          Protected namespace
                        </span>
                      ) : (
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                          Controls enabled
                        </span>
                      )}
                    </div>
                    <p className="mt-3 truncate text-sm font-semibold text-slate-900">{deployment.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {deployment.namespace} | Deployment | {deployment.age ?? 'age unknown'}
                    </p>
                    <p className="mt-2 truncate text-xs text-slate-600">
                      {deployment.containerImages.length > 0 ? deployment.containerImages.join(', ') : MISSING_VALUE}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Replicas</p>
                      <p className="mt-1 text-slate-700">{deployment.ready}/{deployment.desired} ready</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Available</p>
                      <p className="mt-1 text-slate-700">{deployment.available ?? MISSING_VALUE}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Updated</p>
                      <p className="mt-1 text-slate-700">{deployment.updated ?? MISSING_VALUE}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-1 text-slate-700">{formatDate(deployment.createdAt)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Safety</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {protectedNamespace ? 'Mutation blocked' : 'SCALE / ROLLOUT required'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void loadRolloutStatus(deployment)}
                      disabled={isLoadingRollout}
                      className="rounded-full border-slate-200 bg-slate-50"
                    >
                      <Activity className="h-4 w-4" />
                      Rollout status
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openScaleModal(deployment)}
                      disabled={protectedNamespace}
                      title={protectedNamespace ? 'Protected namespace: mutation blocked' : 'Scale deployment'}
                      className="rounded-full bg-white text-slate-950 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <PlayCircle className="h-4 w-4" />
                      Scale
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openRolloutModal(deployment)}
                      disabled={protectedNamespace}
                      title={protectedNamespace ? 'Protected namespace: mutation blocked' : 'Queue rollout restart'}
                      className="rounded-full border-amber-300/30 bg-amber-300/10 text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCw className="h-4 w-4" />
                      Rollout restart
                    </Button>
                    {protectedNamespace ? (
                      <p className="basis-full text-xs text-amber-800">Protected namespace: mutation blocked.</p>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Deployment rollout status</h2>
            <p className="mt-1 text-sm text-slate-600">Non-mutating rollout state from the Kubernetes API.</p>
          </div>
          {rolloutStatus ? (
            <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${rolloutTone(rolloutStatus)}`}>
              {rolloutStatus.status === 'HEALTHY' ? 'Healthy' : rolloutStatus.available > 0 ? 'Progressing' : 'Unavailable'}
            </span>
          ) : null}
        </div>
        <div className="mt-5">
          {rolloutError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
              {rolloutError}
            </div>
          ) : isLoadingRollout ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              Loading rollout status...
            </div>
          ) : !rolloutStatus ? (
            <EmptyState message="Select a deployment to view rollout status." />
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{rolloutStatus.namespace}/{rolloutStatus.name}</p>
                <p className="mt-1 text-sm text-slate-600">{rolloutStatus.message}</p>
              </div>
              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Generation', rolloutStatus.generation ?? MISSING_VALUE],
                  ['Observed', rolloutStatus.observedGeneration ?? MISSING_VALUE],
                  ['Replicas', rolloutStatus.desired],
                  ['Updated', rolloutStatus.updated],
                  ['Ready', rolloutStatus.ready],
                  ['Available', rolloutStatus.available],
                  ['Unavailable', Math.max(rolloutStatus.desired - rolloutStatus.available, 0)],
                  ['Checked', formatDate(rolloutStatus.checkedAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 text-slate-700">{value}</p>
                  </div>
                ))}
              </div>
              {rolloutStatus.conditions.length > 0 ? (
                <div className="mt-5 space-y-2">
                  {rolloutStatus.conditions.map((condition) => (
                    <div key={`${condition.type}-${condition.reason ?? condition.status}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                      <p className="font-medium text-slate-900">{condition.type}: {condition.status}</p>
                      <p className="mt-1 text-slate-600">{condition.message ?? condition.reason ?? MISSING_VALUE}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Kubernetes Operations</h2>
            <p className="mt-1 text-sm text-slate-600">Real worker-backed Kubernetes activity.</p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700">
            {activity.length} shown
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {activityError ? (
            <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-5">
              <p className="text-sm font-medium text-rose-800">Unable to load Kubernetes operations.</p>
              <p className="mt-2 text-sm text-slate-600">{activityError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadKubernetes()}
                className="mt-4 rounded-full border-slate-200 bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : activity.length === 0 ? (
            <EmptyState message="No Kubernetes operations recorded yet." />
          ) : (
            activity.map((item) => (
              <article key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>
                      {item.status}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskTone(item.governance.riskLevel)}`}>
                      {item.governance.riskLevel} risk
                    </span>
                    {item.result ? (
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.result)}`}>
                        {item.result}
                      </span>
                    ) : null}
                  </div>
                  <Button asChild size="sm" variant="outline" className="w-fit rounded-full border-cyan-300/25 bg-cyan-300/10 text-blue-700">
                    <Link href={`/dashboard/operations/${item.id}`}>View details</Link>
                  </Button>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.targetLabel ?? MISSING_VALUE}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {item.governance.riskLevel} risk | Confirmation {item.governance.confirmationTokenLabel ?? MISSING_VALUE} | {approvalStatusLabel(item.governance.approvalStatus)}
                </p>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                    <p className="mt-1 text-slate-700">{formatDate(item.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Duration</p>
                    <p className="mt-1 text-slate-700">{formatDuration(item.durationMs)}</p>
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
                    <p className="mt-1 font-mono text-slate-700">{item.id.slice(0, 8)}</p>
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Cluster inventory</h2>
            <p className="mt-1 text-sm text-slate-600">Real Kubernetes API objects only. Secret resources are never listed.</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cluster objects..."
              className="h-10 w-full rounded-full border-slate-200 bg-white pl-9 sm:w-72"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ['namespaces', 'Namespaces'],
            ['workloads', 'Workloads'],
            ['pods', 'Pods'],
            ['services', 'Services'],
            ['nodes', 'Nodes'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value as Tab)}
              className={cn(
                'rounded-full border px-3 py-2 text-xs font-medium transition',
                activeTab === value
                  ? 'border-cyan-300/40 bg-cyan-300/10 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-slate-900',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {filteredItems.length === 0 ? (
            <EmptyState message={currentStatus === 'CONNECTED' ? 'No matching Kubernetes objects' : 'Kubernetes data is not configured'} />
          ) : (
            filteredItems.map((item, index) => (
              <div key={`${activeTab}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                {'roles' in item ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.7fr_0.7fr]">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.roles.join(', ')} | {item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-700">{item.ready ? 'Ready' : 'Not ready'}</p>
                    <p className="text-sm text-slate-600">{item.kubeletVersion ?? 'version unknown'}</p>
                  </div>
                ) : 'kind' in item ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.6fr_0.5fr]">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.namespace} | {item.kind} | {item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-700">Ready {item.ready}/{item.desired}</p>
                    <p className="text-sm text-slate-600">Updated {item.updated ?? 'n/a'}</p>
                  </div>
                ) : 'phase' in item ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.6fr_0.5fr]">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.namespace} | {item.nodeName ?? 'node unknown'} | {item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-700">{item.phase}</p>
                    <p className="text-sm text-slate-600">Ready {item.readyContainers}/{item.totalContainers} | Restarts {item.restarts}</p>
                  </div>
                ) : 'ports' in item ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.6fr_0.7fr]">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.namespace} | {item.type} | {item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-700">{item.clusterIP ?? 'No cluster IP'}</p>
                    <p className="text-sm text-slate-600">
                      {item.ports.map((port) => `${port.port}${port.nodePort ? `:${port.nodePort}` : ''}/${port.protocol ?? 'TCP'}`).join(', ') || 'No ports'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.5fr]">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-700">{item.status ?? 'Unknown'}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {pendingAction ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kubernetes-confirmation-title"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  MEDIUM risk | Approval not required
                </p>
                <h2 id="kubernetes-confirmation-title" className="mt-2 text-xl font-semibold text-slate-900">
                  {pendingAction.type === 'scale' ? 'Confirm Kubernetes scale' : 'Confirm rollout restart'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  setDesiredReplicas('');
                  setConfirmationValue('');
                }}
                disabled={isSubmittingOperation}
                className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-700 transition hover:bg-blue-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
              <p>
                You are about to {pendingAction.type === 'scale' ? 'scale' : 'rollout restart'} deployment{' '}
                <span className="font-semibold text-slate-900">
                  {pendingAction.workload.namespace}/{pendingAction.workload.name}
                </span>.
              </p>
              <p>
                Type <span className="font-semibold text-amber-800">{requiredToken}</span> to queue
                the worker-executed and audited operation.
              </p>
              <p className="text-xs text-slate-500">
                Current replicas: {pendingAction.workload.ready}/{pendingAction.workload.desired} ready
              </p>
            </div>

            {pendingAction.type === 'scale' ? (
              <>
                <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="kubernetes-desired-replicas">
                  Desired replicas
                </label>
                <Input
                  id="kubernetes-desired-replicas"
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={desiredReplicas}
                  onChange={(event) => setDesiredReplicas(event.target.value)}
                  className="mt-2 border-slate-200 bg-white"
                  autoFocus
                />
                <p className="mt-2 text-xs text-slate-500">Must be an integer from 0 to 10.</p>
              </>
            ) : null}

            <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="kubernetes-confirmation-token">
              Required confirmation token
            </label>
            <Input
              id="kubernetes-confirmation-token"
              value={confirmationValue}
              onChange={(event) => setConfirmationValue(event.target.value)}
              placeholder={`Type ${requiredToken} to confirm`}
              className="mt-2 border-slate-200 bg-white"
              autoFocus={pendingAction.type === 'rollout'}
            />

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingAction(null);
                  setDesiredReplicas('');
                  setConfirmationValue('');
                }}
                disabled={isSubmittingOperation}
                className="rounded-full border-slate-200 bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void queueKubernetesOperation()}
                disabled={!canQueueOperation}
                className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
              >
                {isSubmittingOperation ? 'Queueing...' : 'Queue operation'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
