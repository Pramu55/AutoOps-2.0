'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  ArgoCdApplicationSummary,
  ArgoCdApplicationsResponse,
  ArgoCdStatusResponse,
  ArgoCdSummaryResponse,
} from '@autoops/types';
import { GitBranch, RefreshCw } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { WorkspaceHeader } from '@/components/layout/workspace-header';

type StatusResponse = { data: ArgoCdStatusResponse };
type ApplicationsApiResponse = { data: ArgoCdApplicationsResponse };
type SummaryApiResponse = { data: ArgoCdSummaryResponse };

function badge(status?: string) {
  if (status === 'CONNECTED' || status === 'Synced' || status === 'Healthy') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
  if (status === 'OutOfSync' || status === 'Progressing' || status === 'NOT_CONFIGURED' || status === 'BLOCKED_BY_ORG_POLICY') {
    return 'border-amber-300 bg-amber-50 text-amber-800';
  }
  if (status === 'AUTH_FAILED' || status === 'UNREACHABLE' || status === 'ERROR' || status === 'Degraded' || status === 'Missing') {
    return 'border-rose-300 bg-rose-50 text-rose-700';
  }
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load Argo CD status.';
}

export function ArgoCdClient() {
  const [status, setStatus] = useState<ArgoCdStatusResponse | null>(null);
  const [summary, setSummary] = useState<ArgoCdSummaryResponse | null>(null);
  const [applications, setApplications] = useState<ArgoCdApplicationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusResponse = await api.get<StatusResponse>('/v1/integrations/argocd/status');
      setStatus(statusResponse.data);

      if (
        statusResponse.data.status === 'BLOCKED_BY_ORG_POLICY' ||
        statusResponse.data.status === 'NOT_CONFIGURED'
      ) {
        setSummary(null);
        setApplications([]);
        return;
      }

      const [summaryResponse, applicationsResponse] = await Promise.all([
        api.get<SummaryApiResponse>('/v1/integrations/argocd/summary'),
        api.get<ApplicationsApiResponse>('/v1/integrations/argocd/applications'),
      ]);
      setSummary(summaryResponse.data);
      setApplications(applicationsResponse.data.items);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = summary?.sync ?? { synced: 0, outOfSync: 0, unknown: 0 };
  const health = summary?.health ?? {
    healthy: 0,
    degraded: 0,
    progressing: 0,
    missing: 0,
    unknown: 0,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <WorkspaceHeader
        title="Argo CD GitOps Connector"
        purpose="Read-only GitOps application health, sync, and drift visibility for governed release operations."
        icon={<GitBranch className="h-6 w-6" />}
        backLink={{ href: '/dashboard/integrations', label: 'Back to Integrations' }}
        breadcrumbs={[{ label: 'AutoOps' }, { label: 'Integrations', href: '/dashboard/integrations' }, { label: 'Argo CD' }]}
        statusSummary={
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badge(status?.status)}`}>
            {status?.status ?? 'UNKNOWN'}
          </span>
        }
        primaryAction={
          <Button type="button" onClick={() => void load()} disabled={loading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200 shadow-sm border border-slate-200">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        }
      />

      {error ? <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</section> : null}

      {status?.status === 'NOT_CONFIGURED' ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="text-base font-semibold text-slate-900">Argo CD is not configured</h2>
          <p className="mt-2 leading-6">
            Configure `ARGOCD_URL` and either `ARGOCD_AUTH_TOKEN` or `ARGOCD_USERNAME`/`ARGOCD_PASSWORD` on the API service. AutoOps will only read application inventory and status.
          </p>
        </section>
      ) : null}

      {status?.status === 'BLOCKED_BY_ORG_POLICY' ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="text-base font-semibold text-slate-900">Provider access is disabled for this organization</h2>
          <p className="mt-2 leading-6">{status.message}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {(status.remediation ?? []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <Metric label="Server" value={status?.serverUrl ?? '-'} helper={status?.message ?? 'Loading status...'} />
        <Metric label="Applications" value={String(summary?.appCount ?? 0)} helper="Read-only inventory" />
        <Metric label="Drift" value={String(summary?.drift.outOfSync ?? 0)} helper="Out-of-sync applications" />
        <Metric label="Last observed" value={status?.checkedAt ? new Date(status.checkedAt).toLocaleString() : '-'} helper="API status check" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Sync Status</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <Metric label="Synced" value={String(sync.synced)} compact />
            <Metric label="Out of sync" value={String(sync.outOfSync)} compact />
            <Metric label="Unknown" value={String(sync.unknown)} compact />
          </div>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Health Status</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <Metric label="Healthy" value={String(health.healthy)} compact />
            <Metric label="Degraded" value={String(health.degraded)} compact />
            <Metric label="Progressing" value={String(health.progressing)} compact />
            <Metric label="Missing" value={String(health.missing)} compact />
            <Metric label="Unknown" value={String(health.unknown)} compact />
          </div>
        </section>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Applications</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>{['Application', 'Repository', 'Destination', 'Sync', 'Health', 'Observed'].map((h) => <th className="border-b bg-slate-50 px-3 py-3" key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {applications.length ? applications.map((app) => (
                <tr key={`${app.namespace ?? 'argocd'}:${app.name}`}>
                  <td className="border-b px-3 py-3">
                    <p className="font-medium text-slate-950">{app.name}</p>
                    <p className="text-xs text-slate-500">{app.project ?? 'default'}</p>
                  </td>
                  <td className="border-b px-3 py-3">
                    <p className="max-w-[280px] truncate font-mono text-xs text-slate-700">{app.repoUrl ?? '-'}</p>
                    <p className="text-xs text-slate-500">{app.targetRevision ?? '-'} {app.path ? `| ${app.path}` : ''}</p>
                  </td>
                  <td className="border-b px-3 py-3">
                    <p className="max-w-[240px] truncate font-mono text-xs text-slate-700">{app.destinationServer ?? '-'}</p>
                    <p className="text-xs text-slate-500">{app.destinationNamespace ?? '-'}</p>
                  </td>
                  <td className="border-b px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badge(app.syncStatus)}`}>{app.syncStatus}</span></td>
                  <td className="border-b px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badge(app.healthStatus)}`}>{app.healthStatus}</span></td>
                  <td className="border-b px-3 py-3 text-xs text-slate-600">{new Date(app.observedAt).toLocaleString()}</td>
                </tr>
              )) : (
                <tr><td className="px-3 py-6 text-slate-600" colSpan={6}>No Argo CD applications loaded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper, compact = false }: { label: string; value: string; helper?: string; compact?: boolean }) {
  return (
    <section className={`rounded-md border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4 shadow-sm'}`}>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 break-words font-semibold text-slate-950">{value}</p>
      {helper ? <p className="mt-1 text-sm text-slate-600">{helper}</p> : null}
    </section>
  );
}
