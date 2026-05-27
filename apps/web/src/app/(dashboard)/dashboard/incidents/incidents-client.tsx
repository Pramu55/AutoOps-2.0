'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  IncidentListResponse,
  IncidentReadinessResponse,
  IncidentSummary,
} from '@autoops/types';
import {
  ArrowLeft,
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

function IncidentTable({ incidents }: { incidents: IncidentSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Severity</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Incident</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Signals</th>
            <th className="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 bg-slate-50">
          {incidents.map((incident) => (
            <tr key={incident.id} className="align-top transition hover:bg-slate-50">
              <td className="px-4 py-3">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityTone(incident.severity)}`}>
                  {incident.severity}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(incident.status)}`}>
                  {incident.status}
                </span>
              </td>
              <td className="max-w-[26rem] px-4 py-3">
                <p className="font-medium text-slate-900">{incident.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{incident.summary}</p>
              </td>
              <td className="px-4 py-3 text-slate-700 text-xs uppercase tracking-tight">{incident.source.replace('_', ' ')}</td>
              <td className="px-4 py-3 text-slate-600">{incident.signalCount}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Link
                    href={`/dashboard/incidents/${incident.id}`}
                    className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-cyan-300/45 hover:bg-cyan-300/15"
                  >
                    Details
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50">
        <Link href="/dashboard/operations">
          <ArrowLeft className="h-4 w-4" />
          Back to Ops Hub
        </Link>
      </Button>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1.5 text-xs font-medium text-rose-800">
              <Zap className="h-3.5 w-3.5" />
              Incident correlation
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">Incidents</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Deterministic incident correlation from real signals and resource graph context. No AI summaries yet.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCorrelate}
              disabled={isCorrelating || isLoading}
              className="rounded-full bg-cyan-50 border-cyan-200 text-blue-700 hover:bg-cyan-100"
            >
              <Zap className={isCorrelating ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
              {isCorrelating ? 'Correlating...' : 'Run Correlation'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void loadIncidents()} disabled={isLoading} className="rounded-full text-slate-600 hover:bg-slate-100">
              <RefreshCw className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </Button>
          </div>
        </div>
      </section>

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
            <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          </section>
        ))}
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Incident Registry</h2>
            <p className="mt-1 text-sm text-slate-600">Showing {filteredItems.length} correlated incidents.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or summary"
                className="h-9 w-56 rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
              />
            </label>
            <Filter className="mt-2 h-4 w-4 text-slate-500" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
              {['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ARCHIVED'].map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
              {['ALL', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">Loading incidents...</div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-700" />
              <p className="mt-2 text-sm font-medium text-slate-900">No incidents found.</p>
              <p className="mt-1 text-sm text-slate-500">Run correlation to group active signals into incidents.</p>
            </div>
          ) : (
            <IncidentTable incidents={filteredItems} />
          )}
        </div>
      </section>
    </div>
  );
}
