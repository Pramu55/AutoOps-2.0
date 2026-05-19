'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DockerActionName,
  DockerActionResponse,
  DockerContainer,
  DockerImage,
  DockerListResponse,
  DockerLogsResponse,
  DockerNetwork,
  DockerStatusResponse,
  DockerVolume,
  OperationActivityItem,
  OperationActivityResponse,
} from '@autoops/types';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  CheckCircle2,
  Container,
  Database,
  FileText,
  HardDrive,
  Network,
  PlayCircle,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  Square,
  TerminalSquare,
  X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

type DockerStatusApiResponse = { data: DockerStatusResponse };
type DockerContainersApiResponse = { data: DockerListResponse<DockerContainer> };
type DockerImagesApiResponse = { data: DockerListResponse<DockerImage> };
type DockerNetworksApiResponse = { data: DockerListResponse<DockerNetwork> };
type DockerVolumesApiResponse = { data: DockerListResponse<DockerVolume> };
type DockerLogsApiResponse = { data: DockerLogsResponse };
type DockerActionApiResponse = { data: DockerActionResponse };
type DockerActivityApiResponse = { data: OperationActivityResponse };
type DockerActionToken = 'START' | 'STOP' | 'RESTART';

type PendingAction = {
  action: DockerActionName;
  token: DockerActionToken;
  container: DockerContainer;
};

const MISSING_VALUE = '-';
const LOG_TAIL_OPTIONS = [20, 50, 100, 200] as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load Docker data.';
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (
    status === 'CONNECTED' ||
    status === 'SUCCEEDED' ||
    normalized === 'running' ||
    normalized === 'healthy' ||
    normalized === 'completed'
  ) {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  }
  if (
    status === 'FAILED' ||
    status === 'AUTH_FAILED' ||
    status === 'UNKNOWN_ERROR' ||
    normalized === 'dead' ||
    normalized === 'unhealthy'
  ) {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  }
  if (status === 'UNREACHABLE' || status === 'NOT_CONFIGURED' || normalized === 'restarting') {
    return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  }
  return 'border-slate-400/25 bg-slate-500/10 text-slate-700';
}

function riskTone(riskLevel: string): string {
  if (riskLevel === 'LOW') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  if (riskLevel === 'MEDIUM') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  if (riskLevel === 'HIGH') return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  return 'border-slate-400/25 bg-slate-500/10 text-slate-700';
}

function formatTime(value?: string | null): string {
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

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return MISSING_VALUE;
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function shortId(value: string): string {
  return value.length > 12 ? value.slice(0, 12) : value;
}

function portLabel(container: DockerContainer): string {
  if (container.ports.length === 0) return MISSING_VALUE;
  return container.ports
    .map((port) =>
      port.publicPort
        ? `${port.publicPort}:${port.privatePort}/${port.type}`
        : `${port.privatePort}/${port.type}`,
    )
    .join(', ');
}

function isRunning(container: DockerContainer): boolean {
  return container.state.toLowerCase() === 'running';
}

function canStart(container: DockerContainer): boolean {
  const state = container.state.toLowerCase();
  return state === 'exited' || state === 'created' || state === 'dead';
}

function actorLabel(actor: OperationActivityItem['actor']): string {
  if (!actor) return MISSING_VALUE;
  return actor.name ?? actor.email ?? actor.id;
}

function approvalStatusLabel(status: string): string {
  if (status === 'NOT_REQUIRED') return 'Approval not required';
  if (status === 'PENDING') return 'Approval pending';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  return status;
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
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#5f6b7a]">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className="rounded bg-[#f1f3f3] p-2 text-[#0972d3]">{icon}</div>
      </div>
    </section>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-5">
      <p className="text-sm font-medium text-rose-800">{message}</p>
      <Button
        type="button"
        size="sm"
        onClick={onRetry}
        className="mt-4 rounded-full bg-white text-slate-950 hover:bg-slate-200"
      >
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <p className="text-sm font-medium text-slate-900">{message}</p>
      <p className="mt-2 text-sm text-slate-500">No fake Docker data is shown.</p>
    </div>
  );
}

export function DockerClient() {
  const [status, setStatus] = useState<DockerStatusResponse | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [activity, setActivity] = useState<OperationActivityItem[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [logs, setLogs] = useState<DockerLogsResponse | null>(null);
  const [logTail, setLogTail] = useState<number>(100);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containersError, setContainersError] = useState<string | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [networksError, setNetworksError] = useState<string | null>(null);
  const [volumesError, setVolumesError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmationValue, setConfirmationValue] = useState('');

  const loadDocker = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);

    setError(null);
    setContainersError(null);
    setImagesError(null);
    setNetworksError(null);
    setVolumesError(null);
    setActivityError(null);

    try {
      const statusResponse = await api.get<DockerStatusApiResponse>('/v1/integrations/docker/status');
      setStatus(statusResponse.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }

    const loadSection = async <T,>(
      loader: () => Promise<T>,
      setter: (value: T) => void,
      errorSetter: (value: string | null) => void,
    ) => {
      try {
        setter(await loader());
      } catch (loadError) {
        errorSetter(getErrorMessage(loadError));
      }
    };

    await Promise.all([
      loadSection(
        async () => (await api.get<DockerContainersApiResponse>('/v1/integrations/docker/containers')).data.items,
        setContainers,
        setContainersError,
      ),
      loadSection(
        async () => (await api.get<DockerImagesApiResponse>('/v1/integrations/docker/images')).data.items,
        setImages,
        setImagesError,
      ),
      loadSection(
        async () => (await api.get<DockerNetworksApiResponse>('/v1/integrations/docker/networks')).data.items,
        setNetworks,
        setNetworksError,
      ),
      loadSection(
        async () => (await api.get<DockerVolumesApiResponse>('/v1/integrations/docker/volumes')).data.items,
        setVolumes,
        setVolumesError,
      ),
      loadSection(
        async () => (await api.get<DockerActivityApiResponse>('/v1/ops/activity?source=docker&limit=10')).data.items,
        setActivity,
        setActivityError,
      ),
    ]);

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  const selectedContainer = useMemo(
    () => containers.find((container) => container.id === selectedContainerId) ?? null,
    [containers, selectedContainerId],
  );

  const runningContainers = useMemo(
    () => containers.filter((container) => isRunning(container)).length,
    [containers],
  );

  const stoppedContainers = useMemo(
    () => containers.filter((container) => canStart(container)).length,
    [containers],
  );

  const loadLogs = useCallback(
    async (container: DockerContainer, tail = logTail) => {
      setSelectedContainerId(container.id);
      setIsLoadingLogs(true);
      setLogsError(null);
      try {
        const response = await api.get<DockerLogsApiResponse>(
          `/v1/integrations/docker/containers/${encodeURIComponent(container.id)}/logs?tail=${tail}`,
        );
        setLogs(response.data);
      } catch (loadError) {
        setLogs(null);
        setLogsError(getErrorMessage(loadError));
      } finally {
        setIsLoadingLogs(false);
      }
    },
    [logTail],
  );

  useEffect(() => {
    void loadDocker('initial');
  }, [loadDocker]);

  useEffect(() => {
    if (!pendingAction) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        setPendingAction(null);
        setConfirmationValue('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, pendingAction]);

  const openConfirmation = (action: DockerActionName, container: DockerContainer) => {
    const token = action === 'start' ? 'START' : action === 'stop' ? 'STOP' : 'RESTART';
    setPendingAction({ action, token, container });
    setConfirmationValue('');
    setMessage(null);
  };

  const queueAction = async () => {
    if (!pendingAction || confirmationValue !== pendingAction.token) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await api.post<DockerActionApiResponse>(
        `/v1/integrations/docker/containers/${encodeURIComponent(pendingAction.container.id)}/${pendingAction.action}`,
        {
          confirmationToken: pendingAction.token,
        },
      );
      setMessage(
        response.data.approvalRequired
          ? `${response.data.message} Approval required: ${response.data.approvalReason ?? 'Policy requires approval before worker execution.'} Operation ${response.data.operationId}.`
          : `${response.data.message} Operation ${response.data.operationId}.`,
      );
      setPendingAction(null);
      setConfirmationValue('');
      await loadDocker();
      if (selectedContainerId === pendingAction.container.id) {
        await loadLogs(pendingAction.container);
      }
    } catch (actionError) {
      setMessage(getErrorMessage(actionError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStatus = status?.status ?? 'NOT_CONFIGURED';

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
              Docker Control Connector
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Real Docker engine visibility and confirmation-protected container operations.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void loadDocker()}
            disabled={isLoading || isRefreshing}
            className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
          >
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      ) : null}

      <section className="rounded-md border border-emerald-300/15 bg-emerald-300/10 p-4">
        <div className="flex items-start gap-3 text-sm font-medium text-emerald-700">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Controlled Docker operations require confirmation, audit logging, and worker execution.
            No shell, exec, delete, image push, or volume/network removal actions are exposed.
          </p>
        </div>
      </section>

      {currentStatus !== 'CONNECTED' ? (
        <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-6">
          <div className="flex gap-4">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Docker connector is not available</h2>
              <p className="mt-2 text-sm leading-6 text-amber-800/80">
                {status?.message ??
                  'Configure Docker Engine access to enable governed container operations.'}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Docker version" value={status?.version ?? MISSING_VALUE} icon={<Server className="h-5 w-5" />} />
        <SummaryCard label="API version" value={status?.apiVersion ?? MISSING_VALUE} icon={<TerminalSquare className="h-5 w-5" />} />
        <SummaryCard label="OS" value={status?.os ?? MISSING_VALUE} icon={<HardDrive className="h-5 w-5" />} />
        <SummaryCard label="Architecture" value={status?.architecture ?? MISSING_VALUE} icon={<Box className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <SummaryCard label="Containers" value={containers.length || status?.containers || 0} icon={<Container className="h-5 w-5" />} />
        <SummaryCard label="Running" value={runningContainers} icon={<CheckCircle2 className="h-5 w-5" />} />
        <SummaryCard label="Stopped" value={stoppedContainers} icon={<Square className="h-5 w-5" />} />
        <SummaryCard label="Images" value={images.length || status?.images || 0} icon={<Database className="h-5 w-5" />} />
        <SummaryCard label="Networks" value={networks.length} icon={<Network className="h-5 w-5" />} />
        <SummaryCard label="Volumes" value={volumes.length} icon={<HardDrive className="h-5 w-5" />} />
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Containers</h2>
            <p className="mt-1 text-sm text-slate-600">
              Real Docker containers with worker-executed start, stop, and restart controls.
            </p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700">
            {containers.length} shown
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              Loading Docker containers...
            </div>
          ) : containersError ? (
            <SectionError message={containersError} onRetry={() => void loadDocker()} />
          ) : containers.length === 0 ? (
            <EmptyState message="No containers found." />
          ) : (
            containers.map((container) => (
              <article
                key={container.id}
                className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[1.1fr_0.55fr_0.6fr_0.65fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(container.state)}`}>
                      {container.state}
                    </span>
                    {container.health ? (
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(container.health)}`}>
                        {container.health}
                      </span>
                    ) : null}
                    {container.isAutoOpsManaged ? (
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        AutoOps
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-slate-900">{container.name}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{shortId(container.id)}</p>
                  <p className="mt-2 truncate text-xs text-slate-600">{container.image}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-sm text-slate-700">{container.status}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Ports</p>
                  <p className="mt-1 text-sm text-slate-700">{portLabel(container)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                  <p className="mt-1 text-sm text-slate-700">{formatTime(container.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadLogs(container)}
                    className="rounded-full border-slate-200 bg-slate-50"
                  >
                    <FileText className="h-4 w-4" />
                    Logs
                  </Button>
                  {isRunning(container) ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openConfirmation('restart', container)}
                        className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
                      >
                        <RotateCw className="h-4 w-4" />
                        Restart
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openConfirmation('stop', container)}
                        className="rounded-full border-amber-300/30 bg-amber-300/10 text-amber-800"
                      >
                        <Square className="h-4 w-4" />
                        Stop
                      </Button>
                    </>
                  ) : canStart(container) ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openConfirmation('start', container)}
                      className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
                    >
                      <PlayCircle className="h-4 w-4" />
                      Start
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled
                      variant="outline"
                      className="rounded-full border-slate-200 bg-slate-50"
                      title="Container state does not support a safe action from AutoOps."
                    >
                      Action unavailable
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Container logs</h2>
              <p className="mt-1 text-sm text-slate-600">Capped logs for the selected container.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {LOG_TAIL_OPTIONS.map((tail) => (
                <button
                  key={tail}
                  type="button"
                  onClick={() => {
                    setLogTail(tail);
                    if (selectedContainer) void loadLogs(selectedContainer, tail);
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium',
                    logTail === tail
                      ? 'border-cyan-300/40 bg-cyan-300/10 text-blue-700'
                      : 'border-slate-200 text-slate-600',
                  )}
                >
                  {tail}
                </button>
              ))}
              <Button
                type="button"
                size="sm"
                disabled={!selectedContainer || isLoadingLogs}
                onClick={() => selectedContainer && void loadLogs(selectedContainer)}
                className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
              >
                <RefreshCw className={isLoadingLogs ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                Refresh logs
              </Button>
            </div>
          </div>
          <div className="mt-5">
            {logsError ? (
              <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-5 text-sm text-rose-800">
                {logsError}
              </div>
            ) : !selectedContainer ? (
              <EmptyState message="Select a container to view logs." />
            ) : isLoadingLogs ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                Loading logs...
              </div>
            ) : logs?.lines.length === 0 ? (
              <EmptyState message="No logs returned for this container." />
            ) : (
              <pre className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700">
                {logs?.lines.join('\n')}
              </pre>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recent Docker Operations</h2>
              <p className="mt-1 text-sm text-slate-600">Real worker-backed Docker activity.</p>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700">
              {activity.length} shown
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {activityError ? (
              <SectionError message={activityError} onRetry={() => void loadDocker()} />
            ) : activity.length === 0 ? (
              <EmptyState message="No Docker operations recorded yet." />
            ) : (
              activity.map((item) => (
                <article key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
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
                    <Button asChild size="sm" variant="outline" className="w-fit rounded-full border-cyan-300/25 bg-cyan-300/10 text-blue-700">
                      <Link href={`/dashboard/operations/${item.id}`}>View details</Link>
                    </Button>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{item.targetLabel ?? MISSING_VALUE}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {item.governance
                      ? `${item.governance.riskLevel} risk | Confirmation ${item.governance.confirmationTokenLabel ?? MISSING_VALUE} | ${approvalStatusLabel(item.governance.approvalStatus)}`
                      : MISSING_VALUE}
                  </p>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-1 text-slate-700">{formatTime(item.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Duration</p>
                      <p className="mt-1 text-slate-700">{formatDuration(item.durationMs)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Actor</p>
                      <p className="mt-1 text-slate-700">{actorLabel(item.actor)}</p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AssetSection
          title="Images"
          error={imagesError}
          emptyMessage="No images found."
          onRetry={() => void loadDocker()}
          items={images.slice(0, 12).map((image) => ({
            id: image.id,
            title: image.repoTags.length ? image.repoTags.join(', ') : '<none>',
            detail: shortId(image.id),
            meta: `${formatBytes(image.size)} | ${formatTime(image.createdAt)}`,
          }))}
        />
        <AssetSection
          title="Networks"
          error={networksError}
          emptyMessage="No networks found."
          onRetry={() => void loadDocker()}
          items={networks.map((network) => ({
            id: network.id,
            title: network.name,
            detail: `${network.driver} | ${network.scope}`,
            meta: shortId(network.id),
          }))}
        />
        <AssetSection
          title="Volumes"
          error={volumesError}
          emptyMessage="No volumes found."
          onRetry={() => void loadDocker()}
          items={volumes.map((volume) => ({
            id: volume.name,
            title: volume.name,
            detail: volume.driver,
            meta: formatTime(volume.createdAt),
          }))}
        />
      </div>

      {pendingAction ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="docker-confirmation-title"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  MEDIUM risk | Approval not required
                </p>
                <h2 id="docker-confirmation-title" className="mt-2 text-xl font-semibold text-slate-900">
                  Confirm Docker {pendingAction.action}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  setConfirmationValue('');
                }}
                disabled={isSubmitting}
                className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-700 transition hover:bg-blue-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
              <p>
                You are about to {pendingAction.action} container{' '}
                <span className="font-semibold text-slate-900">{pendingAction.container.name}</span>.
              </p>
              <p>
                Type <span className="font-semibold text-amber-800">{pendingAction.token}</span> to
                queue the worker-executed and audited operation.
              </p>
              <p className="font-mono text-xs text-slate-500">
                Container ID: {shortId(pendingAction.container.id)}
              </p>
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="docker-confirmation-token">
              Required confirmation token
            </label>
            <Input
              id="docker-confirmation-token"
              value={confirmationValue}
              onChange={(event) => setConfirmationValue(event.target.value)}
              placeholder={`Type ${pendingAction.token} to confirm`}
              className="mt-2 border-slate-200 bg-white"
              autoFocus
            />

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingAction(null);
                  setConfirmationValue('');
                }}
                disabled={isSubmitting}
                className="rounded-full border-slate-200 bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void queueAction()}
                disabled={confirmationValue !== pendingAction.token || isSubmitting}
                className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
              >
                {isSubmitting ? 'Queueing...' : 'Queue operation'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AssetSection({
  title,
  items,
  error,
  emptyMessage,
  onRetry,
}: {
  title: string;
  items: Array<{ id: string; title: string; detail: string; meta: string }>;
  error: string | null;
  emptyMessage: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-5 space-y-3">
        {error ? (
          <SectionError message={`${title} unavailable: ${error}`} onRetry={onRetry} />
        ) : items.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{item.detail}</p>
              <p className="mt-2 text-sm text-slate-600">{item.meta}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
