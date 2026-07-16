'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  IncidentListResponse,
  IncidentReadinessResponse,
  IncidentSummary,
} from '@autoops/types';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { EmptyState } from '@/components/layout/empty-state';
import {
  CheckCircle2,
  Filter,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type IncidentsApiResponse = IncidentListResponse;
type ReadinessApiResponse = { data: IncidentReadinessResponse };

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED')
    return 'Session expired. Please sign in again.';
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load incidents.';
}

function statusTone(status: string): string {
  if (status === 'RESOLVED') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  if (status === 'ACKNOWLEDGED') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  if (status === 'OPEN') return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  if (status === 'ARCHIVED') return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
  return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
}

function severityTone(severity: string): string {
  if (severity === 'CRITICAL' || severity === 'ERROR') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  }
  if (severity === 'WARNING') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
}

function IncidentRow({ incident }: { incident: IncidentSummary }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-4">
        <div className="mt-0.5 flex flex-col gap-1.5 shrink-0">
          <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${severityTone(incident.severity)}`}>
            {incident.severity}
          </span>
          <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${statusTone(incident.status)}`}>
            {incident.status}
          </span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{incident.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600 max-w-3xl">{incident.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
            <span className="uppercase tracking-tight text-slate-700">
              {incident.source.replace('_', ' ')}
            </span>
            <span>•</span>
            <span>{incident.signalCount} Linked Signal{incident.signalCount !== 1 && 's'}</span>
            {incident.correlationKey && (
              <>
                <span>•</span>
                <span className="truncate max-w-[200px]" title={incident.correlationKey}>Key: {incident.correlationKey}</span>
              </>
            )}
            <span>•</span>
            <span>Updated: {new Date(incident.updatedAt || incident.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 mt-3 sm:mt-0">
        <Button asChild variant="outline" size="sm" className="rounded-full bg-white hover:bg-slate-100">
          <Link href={`/dashboard/incidents/${incident.id}`}>
            View Record
          </Link>
        </Button>
      </div>
    </div>
  );
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

  return (
    <div className="space-y-6 animate-fade-in">
      <WorkspaceHeader
        title="Incident Workspace"
        purpose="Review active incidents, correlate related signals, and track lifecycle evidence."
        backLink={{ href: '/dashboard', label: 'Back to Command Workspace' }}
        icon={<Zap className="h-5 w-5" />}
        primaryAction={
          <Button
            type="button"
            onClick={handleCorrelate}
            disabled={isCorrelating || isLoading}
            className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            <Zap className={isCorrelating ? 'mr-2 h-4 w-4 animate-pulse' : 'mr-2 h-4 w-4'} />
            {isCorrelating ? 'Correlating...' : 'Run Correlation'}
          </Button>
        }
        secondaryAction={
          <Button type="button" variant="outline" onClick={() => void loadIncidents()} disabled={isLoading} className="rounded-full bg-white text-slate-900 hover:bg-slate-100">
            <RefreshCw className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        }
      />



      {error ? (
        <section className="rounded-md border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-800">{error}</section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Open', readiness?.openIncidents ?? 0],
          ['Acknowledged', readiness?.acknowledgedIncidents ?? 0],
          ['Critical Open', readiness?.criticalOpenCount ?? 0],
          ['Error Open', readiness?.errorOpenCount ?? 0],
        ].map(([label, value]) => (
          <section key={label} className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          </section>
        ))}
      </div>

      <WorkQueue
        title="Needs Attention"
        description="Active incidents requiring operator triage or mitigation."
        count={filteredItems.filter((i) => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED').length}
        isEmpty={filteredItems.filter((i) => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED').length === 0}
        emptyState={
          <EmptyState
            title="No active incidents"
            description="Review signals or run correlation if new warnings exist."
            icon={<CheckCircle2 className="h-5 w-5" />}
            variant="compact"
            action={
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href="/dashboard/signals">Review Signals</Link>
              </Button>
            }
          />
        }
      >
        {filteredItems
          .filter((i) => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED')
          .map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
      </WorkQueue>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Incident Registry</h2>
            <p className="mt-1 text-sm text-slate-600">Showing {filteredItems.length} matching incidents.</p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search incidents..."
                className="h-9 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-slate-300 focus:ring-1 focus:ring-slate-200 sm:w-64"
              />
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 outline-none focus:border-slate-300 sm:flex-none">
                {['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ARCHIVED'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className="h-9 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 outline-none focus:border-slate-300 sm:flex-none">
                {['ALL', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-5">
          {isLoading ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Loading incidents...</div>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="No incidents match"
              description="No incidents match the selected filters."
              icon={<Search className="h-5 w-5" />}
              variant="card"
            />
          ) : (
            <div className="rounded-md border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {filteredItems.map((incident) => (
                <IncidentRow key={incident.id} incident={incident} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
