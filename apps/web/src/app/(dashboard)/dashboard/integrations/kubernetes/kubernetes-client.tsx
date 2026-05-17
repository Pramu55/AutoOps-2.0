'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  KubernetesListResponse,
  KubernetesNamespace,
  KubernetesNode,
  KubernetesPod,
  KubernetesService,
  KubernetesStatus,
  KubernetesSummary,
  KubernetesWorkload,
} from '@autoops/types';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Container,
  Database,
  Layers,
  Network,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
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
type Tab = 'namespaces' | 'workloads' | 'pods' | 'services' | 'nodes';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load Kubernetes data.';
}

function statusTone(status: string): string {
  if (status === 'CONNECTED') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (status === 'UNREACHABLE') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
}

function formatTime(value: string | undefined): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function metricsApiValue(summary: KubernetesSummary | null): string {
  if (summary?.metricsApi.status !== 'CONNECTED') return 'Not connected yet';
  return `CONNECTED (${summary.metricsApi.nodeMetricsCount} nodes / ${summary.metricsApi.podMetricsCount} pods)`;
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
    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl bg-cyan-300/10 p-2 text-cyan-300">{icon}</div>
      </div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-8 text-center">
      <p className="text-sm font-medium text-white">{message}</p>
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
  const [activeTab, setActiveTab] = useState<Tab>('namespaces');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKubernetes = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

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

  const currentStatus = status?.status ?? summary?.status ?? 'NOT_CONFIGURED';

  return (
    <div className="space-y-6 animate-fade-in">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="rounded-full border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
      >
        <Link href="/dashboard/operations">
          <ArrowLeft className="h-4 w-4" />
          Back to Ops Hub
        </Link>
      </Button>

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.26),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(124,58,237,0.24),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/25 lg:p-8">
        <div className="absolute inset-0 bg-grid opacity-45" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(currentStatus)}`}>
              {currentStatus}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white lg:text-5xl">
              Kubernetes Control Connector
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Cluster visibility is connected. Controlled Kubernetes actions such as scale and rollout
              restart will be enabled through confirmation, audit, and approval gates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300">
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
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {currentStatus !== 'CONNECTED' ? (
        <section className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h2 className="text-base font-semibold text-white">
                {currentStatus === 'NOT_CONFIGURED' ? 'Kubernetes is not configured' : 'Kubernetes is unreachable'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-100/80">
                {status?.message ??
                  'Set KUBECONFIG for the API container to enable Kubernetes discovery.'}
              </p>
              {currentStatus === 'NOT_CONFIGURED' ? (
                <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300">
                  <p className="font-medium text-white">Windows Docker Desktop setup</p>
                  <p>1. Enable Kubernetes in Docker Desktop.</p>
                  <p>2. Run: kubectl config current-context</p>
                  <p>3. Run: kubectl get nodes</p>
                  <p>4. Set KUBECONFIG_HOST_PATH to your host kubeconfig file.</p>
                  <p>5. Start with docker-compose.k8s.yml to mount it into the API container.</p>
                </div>
              ) : null}
              <p className="mt-3 text-sm text-slate-300">
                No kubeconfig content, tokens, certs, Secret resources, or user-specific paths are exposed in the UI.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-4">
        <div className="flex items-center gap-3 text-sm font-medium text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          Controlled operations mode is being prepared. Kubernetes actions must pass confirmation, audit, and approval policies before execution.
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

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Controlled operations</h2>
            <p className="mt-1 text-sm text-slate-400">
              Real Kubernetes mutations require confirmation, audit logging, and approval for production environments.
            </p>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-200">
            No delete, exec, apply, or Secret access
          </span>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <h3 className="text-sm font-semibold text-white">Backend controls are ready for Day 7 UI</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Scale and rollout restart APIs are available through confirmation-gated, audited worker
            execution. This page is intentionally keeping Kubernetes mutations out of the UI until
            the dedicated Day 7 control experience is implemented.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Cluster inventory</h2>
            <p className="mt-1 text-sm text-slate-400">Real Kubernetes API objects only. Secret resources are never listed.</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cluster objects..."
              className="h-10 w-full rounded-full border-white/10 bg-slate-950/55 pl-9 sm:w-72"
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
                  ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.07] hover:text-white',
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
              <div key={`${activeTab}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                {'roles' in item ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.7fr_0.7fr]">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.roles.join(', ')} | {item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-300">{item.ready ? 'Ready' : 'Not ready'}</p>
                    <p className="text-sm text-slate-400">{item.kubeletVersion ?? 'version unknown'}</p>
                  </div>
                ) : 'kind' in item ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.6fr_0.5fr]">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.namespace} | {item.kind} | {item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-300">Ready {item.ready}/{item.desired}</p>
                    <p className="text-sm text-slate-400">Updated {item.updated ?? 'n/a'}</p>
                  </div>
                ) : 'phase' in item ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.6fr_0.5fr]">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.namespace} | {item.nodeName ?? 'node unknown'} | {item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-300">{item.phase}</p>
                    <p className="text-sm text-slate-400">Ready {item.readyContainers}/{item.totalContainers} | Restarts {item.restarts}</p>
                  </div>
                ) : 'ports' in item ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.6fr_0.7fr]">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.namespace} | {item.type} | {item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-300">{item.clusterIP ?? 'No cluster IP'}</p>
                    <p className="text-sm text-slate-400">
                      {item.ports.map((port) => `${port.port}${port.nodePort ? `:${port.nodePort}` : ''}/${port.protocol ?? 'TCP'}`).join(', ') || 'No ports'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-[1fr_0.5fr]">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.age ?? 'age unknown'}</p>
                    </div>
                    <p className="text-sm text-slate-300">{item.status ?? 'Unknown'}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
