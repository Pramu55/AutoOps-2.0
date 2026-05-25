'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { GitHubActionsListResponse, GitHubActionsStatusResponse, GitHubWorkflowRunSummary, GitHubWorkflowSummary } from '@autoops/types';
import { ArrowLeft, Github, RefreshCw } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type StatusResponse = { data: GitHubActionsStatusResponse };
type WorkflowsResponse = { data: GitHubActionsListResponse<GitHubWorkflowSummary> };
type RunsResponse = { data: GitHubActionsListResponse<GitHubWorkflowRunSummary> };

function badge(status?: string) {
  if (status === 'BLOCKED_BY_ORG_POLICY') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (status === 'CONNECTED' || status === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'NOT_CONFIGURED' || status === 'queued' || status === 'in_progress') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (status === 'failure' || status === 'AUTH_FAILED' || status === 'UNREACHABLE' || status === 'ERROR') return 'border-rose-300 bg-rose-50 text-rose-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load GitHub Actions status.';
}

export function GitHubActionsClient() {
  const [status, setStatus] = useState<GitHubActionsStatusResponse | null>(null);
  const [workflows, setWorkflows] = useState<GitHubWorkflowSummary[]>([]);
  const [runs, setRuns] = useState<GitHubWorkflowRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusResponse = await api.get<StatusResponse>('/v1/integrations/github-actions/status');
      setStatus(statusResponse.data);
      if (statusResponse.data.status === 'BLOCKED_BY_ORG_POLICY') {
        setWorkflows([]);
        setRuns([]);
        return;
      }

      const [workflowsResponse, runsResponse] = await Promise.all([
        api.get<WorkflowsResponse>('/v1/integrations/github-actions/workflows'),
        api.get<RunsResponse>('/v1/integrations/github-actions/runs'),
      ]);
      setWorkflows(workflowsResponse.data.items);
      setRuns(runsResponse.data.items);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">
      <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50 text-slate-700">
        <Link href="/dashboard/operations"><ArrowLeft className="h-4 w-4" /> Back to Ops Hub</Link>
      </Button>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badge(status?.status)}`}>{status?.status ?? 'UNKNOWN'}</span>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold text-slate-950"><Github className="h-6 w-6" /> GitHub Actions</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Read-only workflow and run readiness for the configured repository. No arbitrary workflow dispatch or token exposure is implemented.</p>
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        </div>
      </section>
      {error ? <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</section> : null}
      {status?.status === 'BLOCKED_BY_ORG_POLICY' ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="text-base font-semibold text-slate-900">Provider access is disabled for this organization</h2>
          <p className="mt-2 leading-6">
            This workspace cannot view shared GitHub Actions inventory until provider access is enabled for this organization.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {(status.remediation ?? [
              'Use the demo/admin workspace for built-in local demo connectors.',
              'Ask a platform admin to add this organization slug to PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS.',
              "For production, configure this organization's own GitHub credentials through the approved deployment process.",
            ]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Repository</p>
          <p className="mt-2 font-semibold text-slate-950">{status?.repository ?? '-'}</p>
          <p className="mt-1 text-sm text-slate-600">{status?.message ?? 'Loading status...'}</p>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Allowed workflows</p>
          <p className="mt-2 font-semibold text-slate-950">{(status?.allowedWorkflows ?? []).join(', ') || '-'}</p>
          <p className="mt-1 text-sm text-slate-600">Configured by environment only.</p>
        </section>
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Workflow rerun is intentionally future scoped here. Day 20 adds visibility without adding repository mutation.
        </section>
      </div>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Workflows</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>{['Name', 'Path', 'State', 'Link'].map((h) => <th className="border-b bg-slate-50 px-3 py-3" key={h}>{h}</th>)}</tr></thead>
            <tbody>{workflows.length ? workflows.map((workflow) => (
              <tr key={workflow.id}><td className="border-b px-3 py-3 font-medium">{workflow.name}</td><td className="border-b px-3 py-3 font-mono text-xs">{workflow.path}</td><td className="border-b px-3 py-3">{workflow.state}</td><td className="border-b px-3 py-3">{workflow.url ? <a className="text-blue-700" href={workflow.url} target="_blank">Open</a> : '-'}</td></tr>
            )) : <tr><td className="px-3 py-6 text-slate-600" colSpan={4}>No workflow data. Configure a read-only GitHub Actions token to load real runs.</td></tr>}</tbody>
          </table>
        </div>
      </section>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Latest runs</h2>
        <div className="mt-4 space-y-3">{runs.length ? runs.map((run) => (
          <div key={run.id} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_0.5fr_0.5fr_auto]">
            <div><p className="font-medium text-slate-950">{run.name ?? run.workflowName ?? 'Workflow run'}</p><p className="font-mono text-xs text-slate-500">{run.commitSha ?? '-'} | #{run.runNumber ?? '-'}</p></div>
            <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badge(run.conclusion ?? run.status ?? undefined)}`}>{run.conclusion ?? run.status ?? '-'}</span>
            <p className="text-sm text-slate-600">{run.branch ?? '-'}</p>
            {run.htmlUrl ? <a className="text-sm font-medium text-blue-700" href={run.htmlUrl} target="_blank">Open run</a> : <span>-</span>}
          </div>
        )) : <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">No run data loaded.</div>}</div>
      </section>
    </div>
  );
}
