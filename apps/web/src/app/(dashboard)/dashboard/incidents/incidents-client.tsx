'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IncidentListItem, IncidentListResponse } from '@autoops/types';
import { AlertTriangle, ArrowLeft, CheckCircle2, Filter, RefreshCw } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type IncidentsApiResponse = { data: IncidentListResponse };

const MISSING_VALUE = '-';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') return 'Session expired. Please sign in again.';
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load incidents.';
}

function statusTone(status: string): string {
  if (status === 'RESOLVED') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (status === 'ACKNOWLEDGED' || status === 'MITIGATED') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  if (status === 'OPEN' || status === 'TRIGGERED') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  return 'border-slate-500/25 bg-slate-500/10 text-slate-300';
}

function severityTone(severity: string): string {
  if (severity === 'CRITICAL' || severity === 'HIGH' || severity === 'SEV1' || severity === 'SEV2') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  }
  if (severity === 'MEDIUM' || severity === 'SEV3') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
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

function providerLabel(value: string | null): string {
  if (!value) return 'AutoOps';
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function IncidentCard({ incident }: { incident: IncidentListItem }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 transition hover:border-cyan-300/35 hover:bg-white/[0.04]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityTone(incident.severity)}`}>
              {incident.severity}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(incident.status)}`}>
              {incident.status}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
              {providerLabel(incident.provider)}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-white">{incident.title}</h3>
          <p className="mt-1 text-sm text-slate-400">{incident.targetLabel ?? MISSING_VALUE}</p>
          <p className="mt-2 text-xs text-slate-500">Created {formatDate(incident.createdAt)}</p>
          {incident.safeErrorMessage ? (
            <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              {incident.safeErrorMessage}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/dashboard/incidents/${incident.id}`}
            className="inline-flex items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-300/15"
          >
            View details
          </Link>
          {incident.linkedOperationId ? (
            <Link
              href={`/dashboard/operations/${incident.linkedOperationId}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08]"
            >
              View operation
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function IncidentsClient() {
  const [response, setResponse] = useState<IncidentListResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (severityFilter !== 'ALL') params.set('severity', severityFilter);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const result = await api.get<IncidentsApiResponse>(`/v1/incidents${suffix}`);
      setResponse(result.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [severityFilter, statusFilter]);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  const items = useMemo(() => response?.items ?? [], [response]);
  const summary = response?.summary;

  return (
    <div className="space-y-6 animate-fade-in">
      <Button asChild variant="outline" size="sm" className="rounded-full border-white/10 bg-white/[0.04]">
        <Link href="/dashboard/operations">
          <ArrowLeft className="h-4 w-4" />
          Back to Ops Hub
        </Link>
      </Button>

      <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/25 lg:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1.5 text-xs font-medium text-rose-100">
              <AlertTriangle className="h-3.5 w-3.5" />
              Incident response
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">Incidents</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Tenant-scoped incidents created from real failed operations with safe runbooks and lifecycle tracking.
            </p>
          </div>
          <Button type="button" onClick={() => void loadIncidents()} disabled={isLoading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Open', summary?.open ?? 0],
          ['Acknowledged', summary?.acknowledged ?? 0],
          ['High/Critical', summary?.criticalOpen ?? 0],
          ['Resolved 24h', summary?.resolvedRecent ?? 0],
        ].map(([label, value]) => (
          <section key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </section>
        ))}
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Incident Register</h2>
            <p className="mt-1 text-sm text-slate-400">Filter real incident records by lifecycle and severity.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Filter className="mt-2 h-4 w-4 text-slate-500" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-full border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              {['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className="rounded-full border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              {['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center text-sm text-slate-400">Loading incidents...</div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center">
              <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-300" />
              <p className="mt-2 text-sm font-medium text-white">No incidents found.</p>
              <p className="mt-1 text-sm text-slate-500">Failed operations will create incident records automatically.</p>
            </div>
          ) : (
            items.map((incident) => <IncidentCard key={incident.id} incident={incident} />)
          )}
        </div>
      </section>
    </div>
  );
}
