'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SignalSeverity,
  SignalSource,
  SignalStatus,
  type SignalListResponse,
  type SignalReadinessResponse,
} from '@autoops/types';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ExternalLink,
  Filter,
  Info,
  RefreshCw,
  Search,
  Terminal,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

type SignalListApiResponse = { data: SignalListResponse };
type SignalReadinessApiResponse = { data: SignalReadinessResponse };

const POLL_INTERVAL_MS = 10_000;

function formatDateTime(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function severityTone(severity: SignalSeverity): string {
  switch (severity) {
    case SignalSeverity.CRITICAL:
      return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
    case SignalSeverity.ERROR:
      return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
    case SignalSeverity.WARNING:
      return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
    case SignalSeverity.INFO:
      return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
  }
}

function severityIcon(severity: SignalSeverity) {
  switch (severity) {
    case SignalSeverity.CRITICAL:
      return <AlertCircle className="h-4 w-4 text-rose-600" />;
    case SignalSeverity.ERROR:
      return <AlertCircle className="h-4 w-4 text-rose-500" />;
    case SignalSeverity.WARNING:
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case SignalSeverity.INFO:
      return <Info className="h-4 w-4 text-emerald-500" />;
    default:
      return <Terminal className="h-4 w-4 text-slate-500" />;
  }
}

export function SignalsClient() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);

  const { data: readinessData } = useQuery({
    queryKey: ['signals', 'readiness'],
    queryFn: () => api.get<SignalReadinessApiResponse>('/v1/signals/readiness'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const readiness = readinessData?.data ?? null;

  const { data: listData, isLoading: isListLoading, refetch } = useQuery({
    queryKey: ['signals', 'list', severityFilter, sourceFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (severityFilter !== 'all') params.append('severity', severityFilter);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);
      if (search) params.append('search', search);
      params.append('archived', 'active');
      return api.get<SignalListApiResponse>(`/v1/signals?${params.toString()}`);
    },
    refetchInterval: POLL_INTERVAL_MS,
  });

  const signals = listData?.data.items ?? [];
  const selectedSignal = useMemo(
    () => signals.find((s) => s.id === selectedSignalId) ?? null,
    [signals, selectedSignalId]
  );

  const resolveMutation = useMutation({
    mutationFn: (signalId: string) => api.post(`/v1/signals/${signalId}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (signalId: string) => api.post(`/v1/signals/${signalId}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      setSelectedSignalId(null);
    },
  });

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Signal Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time observations across infrastructure and operations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isListLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isListLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Signals"
          value={readiness?.activeSignals ?? 0}
          icon={<Terminal className="h-5 w-5" />}
        />
        <StatCard
          title="Critical"
          value={readiness?.criticalCount ?? 0}
          icon={<AlertCircle className="h-5 w-5 text-rose-600" />}
          tone="rose"
        />
        <StatCard
          title="Errors"
          value={readiness?.errorCount ?? 0}
          icon={<AlertCircle className="h-5 w-5 text-rose-500" />}
          tone="rose"
        />
        <StatCard
          title="Warnings"
          value={readiness?.warningCount ?? 0}
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          tone="amber"
        />
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Main List */}
        <div className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-4 border-b border-slate-100 p-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search signals..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <option value="all">All Severities</option>
                {Object.values(SignalSeverity).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="all">All Sources</option>
                {Object.values(SignalSource).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-slate-100">
              {signals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Terminal className="mb-4 h-12 w-12 opacity-20" />
                  <p>No signals found matching your filters.</p>
                </div>
              ) : (
                signals.map((signal) => (
                  <button
                    key={signal.id}
                    onClick={() => setSelectedSignalId(signal.id)}
                    className={`flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-slate-50 ${
                      selectedSignalId === signal.id ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div className="mt-1">{severityIcon(signal.severity as SignalSeverity)}</div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="truncate text-sm font-semibold text-slate-900">
                          {signal.title}
                        </h4>
                        <span className="shrink-0 text-[10px] font-medium text-slate-400">
                          {formatDateTime(signal.observedAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{signal.message}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {signal.source}
                        </span>
                        {signal.count > 1 && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            {signal.count} occurrences
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Detail Panel */}
        <aside
          className={`w-96 flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-all ${
            selectedSignal ? 'flex' : 'hidden'
          }`}
        >
          {selectedSignal && (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <h3 className="text-sm font-bold text-slate-900">Signal Details</h3>
                <Button variant="ghost" size="icon" onClick={() => setSelectedSignalId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                  <div>
                    <div
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${severityTone(
                        selectedSignal.severity as SignalSeverity
                      )}`}
                    >
                      {selectedSignal.severity}
                    </div>
                    <h2 className="mt-3 text-lg font-bold leading-tight text-slate-900">
                      {selectedSignal.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {selectedSignal.message}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-xs">
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Source
                      </span>
                      <span className="mt-1 block font-medium text-slate-900">
                        {selectedSignal.source}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Type
                      </span>
                      <span className="mt-1 block font-medium text-slate-900">
                        {selectedSignal.type}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Observed At
                      </span>
                      <span className="mt-1 block font-medium text-slate-900">
                        {formatDateTime(selectedSignal.observedAt)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Occurrences
                      </span>
                      <span className="mt-1 block font-medium text-slate-900">
                        {selectedSignal.count}
                      </span>
                    </div>
                  </div>

                  {/* Metadata */}
                  {selectedSignal.metadataSummary &&
                    Object.keys(selectedSignal.metadataSummary).length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Metadata
                        </h4>
                        <div className="rounded-lg border border-slate-100 p-3 space-y-2">
                          {Object.entries(selectedSignal.metadataSummary).map(([key, value]) => (
                            <div key={key} className="flex flex-col gap-0.5 text-xs">
                              <span className="font-semibold text-slate-500">{key}</span>
                              <span className="break-all text-slate-900">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Context Links */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Context
                    </h4>
                    <div className="space-y-2">
                      {selectedSignal.resourceNodeId && (
                        <ContextLink
                          label="Resource"
                          value={selectedSignal.resourceNodeId}
                          href={`/dashboard/resources?selected=${selectedSignal.resourceNodeId}`}
                        />
                      )}
                      {selectedSignal.operationId && (
                        <ContextLink
                          label="Operation"
                          value={selectedSignal.operationId}
                          href={`/dashboard/operations?selected=${selectedSignal.operationId}`}
                        />
                      )}
                      {selectedSignal.deploymentId && (
                        <ContextLink
                          label="Deployment"
                          value={selectedSignal.deploymentId}
                          href={`/dashboard/deployments?selected=${selectedSignal.deploymentId}`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
              <div className="border-t border-slate-100 p-4 space-y-2">
                {selectedSignal.status === SignalStatus.ACTIVE && (
                  <Button
                    className="w-full"
                    onClick={() => resolveMutation.mutate(selectedSignal.id)}
                    disabled={resolveMutation.isPending}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Mark as Resolved
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => archiveMutation.mutate(selectedSignal.id)}
                  disabled={archiveMutation.isPending}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive Signal
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  tone = 'slate',
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone?: 'rose' | 'amber' | 'emerald' | 'slate';
}) {
  const tones = {
    rose: 'text-rose-600 bg-rose-50',
    amber: 'text-amber-600 bg-amber-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    slate: 'text-slate-600 bg-slate-50',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 text-slate-500">
        <div className={`rounded-lg p-2 ${tones[tone]}`}>{icon}</div>
        <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
      </div>
      <div className="mt-3 text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function ContextLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-xs transition-colors hover:bg-slate-50"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-slate-500">{label}</span>
        <span className="font-mono text-[10px] text-slate-400">{value}</span>
      </div>
      <ExternalLink className="h-3 w-3 text-slate-400" />
    </a>
  );
}
