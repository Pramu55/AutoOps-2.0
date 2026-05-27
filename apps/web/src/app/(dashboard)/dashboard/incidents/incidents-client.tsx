'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IncidentListResponse, IncidentReadinessResponse } from '@autoops/types';
import { AlertTriangle, CheckCircle2, Zap, RefreshCw, Filter, Search } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/layout/empty-state';

type IncidentsApiResponse = IncidentListResponse;
type ReadinessApiResponse = { data: IncidentReadinessResponse };

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') return 'Session expired. Please sign in again.';
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load incidents.';
}

export function IncidentsClient() {
  const [response, setResponse] = useState<IncidentListResponse | null>(null);
  const [readiness, setReadiness] = useState<IncidentReadinessResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCorrelating, setIsCorrelating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadIncidents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (severityFilter !== 'ALL') params.set('severity', severityFilter);
      const suffix = params.toString() ? `?${params.toString()}` : '';

      const [listResult, readinessResult] = await Promise.all([
        api.get<IncidentsApiResponse>(`/v1/incidents${suffix}`),
        api.get<ReadinessApiResponse>('/v1/incidents/readiness')
      ]);

      setResponse(listResult);
      setReadiness(readinessResult.data);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [severityFilter, statusFilter]);

  const handleCorrelate = async () => {
    setIsCorrelating(true);
    try {
      await api.post('/v1/incidents/correlate', {});
      await loadIncidents();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsCorrelating(false);
    }
  };

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  const items = useMemo(() => response?.data ?? [], [response]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((incident) =>
      [incident.title, incident.summary, incident.correlationKey]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [items, query]);

  const activeIncidents = filteredItems.filter(i => ['OPEN', 'ACKNOWLEDGED'].includes(i.status));
  const otherIncidents = filteredItems.filter(i => !['OPEN', 'ACKNOWLEDGED'].includes(i.status));

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Incident Workspace"
        purpose="Deterministic correlation of signals into incidents."
        icon={<AlertTriangle className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Command', href: '/dashboard' }, { label: 'Incidents' }]}
        statusSummary={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCorrelate}
              disabled={isCorrelating || isLoading}
              className="bg-white"
            >
              <Zap className={cn("h-4 w-4 mr-2", isCorrelating && "animate-pulse")} />
              {isCorrelating ? 'Correlating...' : 'Run Correlation'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadIncidents()}
              disabled={isLoading}
              className="text-slate-600"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ['Open', readiness?.openIncidents ?? 0],
            ['Acknowledged', readiness?.acknowledgedIncidents ?? 0],
            ['Critical Open', readiness?.criticalOpenCount ?? 0],
            ['Error Open', readiness?.errorOpenCount ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search incidents..."
              className="w-full rounded-md border border-slate-200 pl-9 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ARCHIVED'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {['ALL', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Active Incidents Queue */}
        <WorkQueue
          title="Active Incidents"
          description="Incidents requiring triage and resolution."
          isEmpty={activeIncidents.length === 0}
          emptyState={
            <EmptyState 
              title="No active incidents" 
              description="Run correlation to group active signals into incidents." 
              icon={<CheckCircle2 className="text-emerald-500" />} 
              variant="compact" 
            />
          }
        >
          {activeIncidents.map(inc => (
            <div key={inc.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <StatusBadge status={inc.status} />
                  <StatusBadge status={inc.severity} />
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded capitalize">
                    {inc.source.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 truncate">{inc.title}</h3>
                <p className="mt-1 text-sm text-slate-600 line-clamp-1">{inc.summary}</p>
                <div className="mt-2 text-xs text-slate-500">
                  {inc.signalCount} correlated signals
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href={`/dashboard/incidents/${inc.id}`}>Details</Link>
              </Button>
            </div>
          ))}
        </WorkQueue>

        {/* Historical/Resolved Incidents */}
        {otherIncidents.length > 0 && (
          <WorkQueue
            title="Archived & Resolved"
            description="Historical incident records."
            isEmpty={false}
            emptyState={<div className="text-sm text-slate-500 py-4 text-center">No historical incidents found.</div>}
          >
            {otherIncidents.map(inc => (
               <div key={inc.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition border-b border-slate-100 last:border-0 opacity-75 hover:opacity-100">
               <div className="flex-1 min-w-0 pr-4">
                 <div className="flex flex-wrap items-center gap-2 mb-1">
                   <StatusBadge status={inc.status} />
                   <StatusBadge status={inc.severity} />
                 </div>
                 <h3 className="text-sm font-medium text-slate-900 truncate">{inc.title}</h3>
               </div>
               <Button asChild variant="ghost" size="sm" className="shrink-0">
                 <Link href={`/dashboard/incidents/${inc.id}`}>View</Link>
               </Button>
             </div>
            ))}
          </WorkQueue>
        )}

      </div>
    </div>
  );
}
