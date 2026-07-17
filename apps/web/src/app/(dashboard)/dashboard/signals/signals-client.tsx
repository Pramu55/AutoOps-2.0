'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SignalListResponse, SignalReadinessResponse } from '@autoops/types';
import { SignalSeverity, SignalSource, SignalStatus } from '@autoops/types';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import { ContextPanel } from '@/components/layout/context-panel';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Filter,
  Info,
  RefreshCw,
  Search,
  Terminal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';


type SignalListApiResponse = { data: SignalListResponse };
type SignalReadinessApiResponse = { data: SignalReadinessResponse };

const POLL_INTERVAL_MS = 30_000;

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


function ContextLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="font-semibold text-slate-500">{label}</span>
      <Link href={href} className="truncate text-blue-600 hover:underline">
        {value}
      </Link>
    </div>
  );
}

export function SignalsClient() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);

  const {
    data: listData,
    isLoading,
    isRefetching,
    refetch: loadSignals,
  } = useQuery<SignalListApiResponse>({
    queryKey: ['signals', { search, severity: severityFilter, source: sourceFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (severityFilter && severityFilter !== 'all') params.append('severity', severityFilter);
      if (sourceFilter && sourceFilter !== 'all') params.append('source', sourceFilter);

      return await api.get<SignalListApiResponse>(`/v1/signals?${params.toString()}`);
    },
    refetchInterval: POLL_INTERVAL_MS,
  });

  const {
    data: readinessData,
    isLoading: isLoadingReadiness,
    isRefetching: isRefetchingReadiness,
    refetch: loadReadiness,
  } = useQuery<SignalReadinessApiResponse>({
    queryKey: ['signals', 'readiness'],
    queryFn: async () => {
      return await api.get<SignalReadinessApiResponse>('/v1/signals/readiness');
    },
    refetchInterval: POLL_INTERVAL_MS,
  });

  const resolveMutation = useMutation({
    mutationFn: async (signalId: string) => {
      await api.post(`/v1/signals/${signalId}/resolve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      setSelectedSignalId(null);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (signalId: string) => {
      await api.post(`/v1/signals/${signalId}/archive`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      setSelectedSignalId(null);
    },
  });

  const signals = listData?.data.items ?? [];
  const readiness = readinessData?.data;

  const highPrioritySignals = useMemo(
    () => signals.filter(s => s.status === SignalStatus.ACTIVE && ['CRITICAL', 'ERROR', 'WARNING'].includes(s.severity)),
    [signals]
  );

  const selectedSignal = signals.find((s) => s.id === selectedSignalId);

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader
        title="Signals Workspace"
        purpose="Evidence view of normalized observations from provider monitoring."
        secondaryAction={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/incidents">Incidents</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/resources">Resources</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard">Command Workspace</Link></Button>
          </div>
        }
        primaryAction={
          <Button
            type="button"
            onClick={() => {
              void loadSignals();
              void loadReadiness();
            }}
            disabled={isLoading || isRefetching || isLoadingReadiness || isRefetchingReadiness}
            className="rounded-full bg-white text-slate-950 hover:bg-slate-200 border border-slate-200 shadow-sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching || isRefetchingReadiness ? 'animate-spin' : ''}`} />
            Refresh Signals
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Signals" value={readiness?.activeSignals ?? 0} icon={<Terminal className="h-5 w-5 text-slate-600" />} />
        <StatCard title="Critical" value={readiness?.criticalCount ?? 0} icon={<AlertCircle className="h-5 w-5 text-rose-600" />} tone="rose" />
        <StatCard title="Errors" value={readiness?.errorCount ?? 0} icon={<AlertCircle className="h-5 w-5 text-rose-500" />} tone="rose" />
        <StatCard title="Warnings" value={readiness?.warningCount ?? 0} icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} tone="amber" />
      </div>

      <div className="mt-6 flex flex-1 gap-6 overflow-hidden">
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto pr-2">
          {highPrioritySignals.length > 0 && (
            <WorkQueue
              title="Needs Review"
              description="Unique active warning, error, and critical conditions requiring attention."
              count={highPrioritySignals.length}
              isEmpty={false}
              emptyState={null}
            >
              <div className="divide-y divide-slate-100">
                {highPrioritySignals.slice(0, 5).map(signal => (
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
                    </div>
                  </button>
                ))}
              </div>
            </WorkQueue>
          )}

          <WorkQueue
            title="Signal Evidence"
            description="Historical and active normalized observations. Occurrences count repeated sightings of the same condition."
            isEmpty={signals.length === 0}
            className="flex-1 min-h-[500px]"
            emptyState={
              <EmptyState
                icon={<Terminal />}
                title="No signals found"
                description="Signals become incidents only after deterministic correlation."
                action={<Button variant="outline" asChild><Link href="/dashboard/integrations">View Integrations</Link></Button>}
              />
            }
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:gap-4">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search signals..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <select
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 sm:flex-none"
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
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 sm:flex-none"
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
                {signals.map((signal) => (
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
                ))}
              </div>
            </ScrollArea>
          </WorkQueue>
        </div>

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
                    <StatusBadge status={selectedSignal.severity} className="mb-3" />
                    <h2 className="text-lg font-bold leading-tight text-slate-900">
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

                  {selectedSignal.metadataSummary && Object.keys(selectedSignal.metadataSummary).length > 0 && (
                    <EvidencePanel title="Safe Metadata" className="border-slate-100">
                      <div className="space-y-2 p-3">
                        {Object.entries(selectedSignal.metadataSummary).map(([key, value]) => (
                          <div key={key} className="flex flex-col gap-0.5 text-xs">
                            <span className="font-semibold text-slate-500">{key}</span>
                            <span className="break-all text-slate-900">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </EvidencePanel>
                  )}

                  <ContextPanel title="Context" actions={[
                    selectedSignal.resourceNodeId ? (
                      <ContextLink
                        key="resource"
                        label="Resource"
                        value={selectedSignal.resourceNodeId}
                        href={`/dashboard/resources?selected=${selectedSignal.resourceNodeId}`}
                      />
                    ) : null,
                    selectedSignal.operationId ? (
                      <ContextLink
                        key="operation"
                        label="Operation"
                        value={selectedSignal.operationId}
                        href={`/dashboard/operations?selected=${selectedSignal.operationId}`}
                      />
                    ) : null,
                    selectedSignal.deploymentId ? (
                      <ContextLink
                        key="deployment"
                        label="Deployment"
                        value={selectedSignal.deploymentId}
                        href={`/dashboard/deployments?selected=${selectedSignal.deploymentId}`}
                      />
                    ) : null
                  ].filter(Boolean)} />
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
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-bold leading-none tracking-tight text-slate-900">
          {value}
        </p>
      </div>
    </div>
  );
}
