'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { EmptyState } from '@/components/layout/empty-state';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import { cn } from '@/lib/cn';

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

function severityTone(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
    case 'ERROR':
      return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
    case 'WARNING':
      return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
    case 'INFO':
      return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
  }
}

export function SignalsClient() {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<SignalReadinessResponse | null>(null);
  const [signals, setSignals] = useState<SignalListResponse['items']>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadSignals = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const params = new URLSearchParams();
      if (severityFilter !== 'all') params.append('severity', severityFilter);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);
      if (search) params.append('search', search);
      params.append('archived', 'active');

      const [listRes, readRes] = await Promise.all([
        api.get<SignalListApiResponse>(`/v1/signals?${params.toString()}`),
        api.get<SignalReadinessApiResponse>('/v1/signals/readiness')
      ]);

      setSignals(listRes.data.items);
      setReadiness(readRes.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [search, severityFilter, sourceFilter]);

  useEffect(() => {
    void loadSignals('initial');
    const interval = window.setInterval(() => void loadSignals('refresh'), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadSignals]);

  const selectedSignal = useMemo(
    () => signals.find((s) => s.id === selectedSignalId) ?? null,
    [signals, selectedSignalId]
  );

  const resolveSignal = async (id: string) => {
    try {
      await api.post(`/v1/signals/${id}/resolve`, {});
      void loadSignals();
      if (selectedSignalId === id) setSelectedSignalId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const archiveSignal = async (id: string) => {
    try {
      await api.post(`/v1/signals/${id}/archive`, {});
      void loadSignals();
      if (selectedSignalId === id) setSelectedSignalId(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Signals Workspace"
        purpose="The raw observation layer. Signals are the un-correlated evidence that power incidents."
        icon={<Terminal className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Command', href: '/dashboard' }, { label: 'Signals' }]}
        statusSummary={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSignals()}
              disabled={isLoading || isRefreshing}
              className="bg-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center justify-center gap-1.5"><Terminal className="h-3.5 w-3.5" /> Active</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{readiness?.activeSignals ?? 0}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-rose-600 flex items-center justify-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Critical</p>
            <p className="mt-2 text-2xl font-semibold text-rose-900">{readiness?.criticalCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm text-center">
             <p className="text-xs uppercase tracking-wide text-rose-600 flex items-center justify-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Errors</p>
            <p className="mt-2 text-2xl font-semibold text-rose-900">{readiness?.errorCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-amber-600 flex items-center justify-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Warnings</p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">{readiness?.warningCount ?? 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Filters */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search signals..."
                  className="pl-9 bg-white border-slate-200 focus:border-blue-500 h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                >
                  <option value="all">All Severities</option>
                  {Object.values(SignalSeverity).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value="all">All Sources</option>
                  {Object.values(SignalSource).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <WorkQueue
              title="Observation Queue"
              description="Raw signals generated by integrations."
              isEmpty={signals.length === 0}
              emptyState={
                <EmptyState 
                  title="No active signals" 
                  description="No raw signals match the current filters." 
                  icon={<CheckCircle2 className="text-emerald-500" />} 
                  variant="compact" 
                />
              }
            >
              {signals.map((signal) => (
                 <button
                  key={signal.id}
                  onClick={() => setSelectedSignalId(signal.id)}
                  className={cn(
                    "flex w-full items-center justify-between p-4 text-left transition border-b border-slate-100 last:border-0",
                    selectedSignalId === signal.id ? "bg-blue-50/50" : "hover:bg-slate-50/50"
                  )}
                 >
                   <div className="flex-1 min-w-0 pr-4">
                     <div className="flex items-center gap-2 mb-2">
                       <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", severityTone(signal.severity))}>
                         {signal.severity}
                       </span>
                       <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded capitalize">
                         {signal.source}
                       </span>
                       {signal.count > 1 && (
                         <span className="text-[10px] font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                           {signal.count}x occurrences
                         </span>
                       )}
                     </div>
                     <h4 className="text-sm font-semibold text-slate-900 truncate">{signal.title}</h4>
                     <p className="mt-1 text-xs text-slate-500 truncate">{signal.message}</p>
                   </div>
                   <div className="shrink-0 text-right">
                      <span className="text-xs text-slate-400">{formatDateTime(signal.observedAt)}</span>
                   </div>
                 </button>
              ))}
            </WorkQueue>
          </div>

          <div className="flex flex-col gap-6">
            {selectedSignal ? (
              <EvidencePanel title="Signal Inspection" icon={<Info className="h-4 w-4" />}>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 leading-tight">{selectedSignal.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{selectedSignal.message}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded border border-slate-100 bg-slate-50 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Observed At</span>
                      <span className="font-medium text-slate-900">{formatDateTime(selectedSignal.observedAt)}</span>
                    </div>
                    <div className="rounded border border-slate-100 bg-slate-50 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Occurrences</span>
                      <span className="font-medium text-slate-900">{selectedSignal.count}</span>
                    </div>
                  </div>

                  {selectedSignal.metadataSummary && Object.keys(selectedSignal.metadataSummary).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Metadata</h4>
                      <div className="rounded-lg border border-slate-100 p-3 bg-slate-50 space-y-2 text-sm">
                        {Object.entries(selectedSignal.metadataSummary).map(([key, value]) => (
                          <div key={key} className="flex flex-col">
                            <span className="text-xs font-medium text-slate-500">{key}</span>
                            <span className="text-slate-900 break-all">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                     <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Context</h4>
                     <div className="space-y-2">
                       {selectedSignal.resourceNodeId && (
                         <a href={`/dashboard/resources?selected=${selectedSignal.resourceNodeId}`} className="flex items-center justify-between rounded border border-slate-100 p-3 text-sm transition hover:bg-slate-50">
                           <span className="font-medium text-slate-600">Resource Node</span>
                           <ExternalLink className="h-4 w-4 text-slate-400" />
                         </a>
                       )}
                       {selectedSignal.operationId && (
                         <a href={`/dashboard/operations/${selectedSignal.operationId}`} className="flex items-center justify-between rounded border border-slate-100 p-3 text-sm transition hover:bg-slate-50">
                           <span className="font-medium text-slate-600">Operation</span>
                           <ExternalLink className="h-4 w-4 text-slate-400" />
                         </a>
                       )}
                       {selectedSignal.deploymentId && (
                         <a href={`/dashboard/deployments/${selectedSignal.deploymentId}`} className="flex items-center justify-between rounded border border-slate-100 p-3 text-sm transition hover:bg-slate-50">
                           <span className="font-medium text-slate-600">Deployment</span>
                           <ExternalLink className="h-4 w-4 text-slate-400" />
                         </a>
                       )}
                     </div>
                  </div>

                  <div className="border-t border-slate-100 pt-5 space-y-2">
                    {selectedSignal.status === SignalStatus.ACTIVE && (
                      <Button className="w-full" onClick={() => void resolveSignal(selectedSignal.id)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Mark as Resolved
                      </Button>
                    )}
                    <Button variant="outline" className="w-full" onClick={() => void archiveSignal(selectedSignal.id)}>
                      <Archive className="mr-2 h-4 w-4" /> Archive Signal
                    </Button>
                  </div>
                </div>
              </EvidencePanel>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500 h-full flex flex-col items-center justify-center min-h-[300px]">
                <Info className="h-8 w-8 mb-4 text-slate-300" />
                <p className="text-sm">Select a signal to inspect its raw evidence.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
