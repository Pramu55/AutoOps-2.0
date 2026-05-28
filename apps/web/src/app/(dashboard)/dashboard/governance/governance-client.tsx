'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  GovernanceEvidenceItem,
  GovernanceEvidenceResponse,
  GovernanceExportResponse,
  OperationApprovalStatus,
  OperationProvider,
  OperationRiskLevel,
  OperationStatus,
} from '@autoops/types';
import { AlertTriangle, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { EvidencePanel } from '@/components/layout/evidence-panel';

type GovernanceApiResponse = { data: GovernanceEvidenceResponse };
type GovernanceExportApiResponse = { data: GovernanceExportResponse };

const PROVIDERS: Array<OperationProvider | 'ALL'> = ['ALL', 'JENKINS', 'DOCKER', 'KUBERNETES', 'INFRASTRUCTURE', 'AWS', 'GITHUB'];
const STATUSES: Array<OperationStatus | 'ALL'> = [
  'ALL',
  'PENDING_APPROVAL',
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'REJECTED',
  'CANCELLED',
];
const RISKS: Array<OperationRiskLevel | 'ALL'> = ['ALL', 'LOW', 'MEDIUM', 'HIGH'];
const APPROVALS: Array<OperationApprovalStatus | 'ALL'> = ['ALL', 'NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load governance evidence.';
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null) return '-';
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
}

function actorLabel(actor: GovernanceEvidenceItem['requestedBy']): string {
  if (!actor) return '-';
  return actor.name ?? actor.email ?? actor.id;
}

function GovernanceBadge({ type, value }: { type: 'approval' | 'operation' | 'risk', value: string }) {
  const normValue = (value || 'UNKNOWN').toUpperCase();

  let toneClass = 'border-slate-300 bg-slate-50 text-slate-700';

  if (type === 'approval') {
    if (['PENDING', 'PENDING_APPROVAL', 'REQUIRED'].includes(normValue)) {
      toneClass = 'border-amber-300 bg-amber-50 text-amber-800';
    } else if (normValue === 'APPROVED') {
      toneClass = 'border-emerald-300 bg-emerald-50 text-emerald-700';
    } else if (normValue === 'REJECTED') {
      toneClass = 'border-rose-300 bg-rose-50 text-rose-700';
    } else if (normValue === 'NOT_REQUIRED') {
      toneClass = 'border-slate-300 bg-slate-50 text-slate-700';
    }
  } else if (type === 'operation') {
    if (['RUNNING', 'QUEUED', 'PENDING_APPROVAL'].includes(normValue)) {
      toneClass = 'border-amber-300 bg-amber-50 text-amber-800';
    } else if (['SUCCEEDED', 'COMPLETED'].includes(normValue)) {
      toneClass = 'border-emerald-300 bg-emerald-50 text-emerald-700';
    } else if (['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(normValue)) {
      toneClass = 'border-rose-300 bg-rose-50 text-rose-700';
    }
  } else if (type === 'risk') {
    if (normValue === 'LOW') {
      toneClass = 'border-emerald-300 bg-emerald-50 text-emerald-700';
    } else if (normValue === 'MEDIUM') {
      toneClass = 'border-amber-300 bg-amber-50 text-amber-800';
    } else if (normValue === 'HIGH') {
      toneClass = 'border-rose-300 bg-rose-50 text-rose-700';
    }
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      {value}
    </span>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </section>
  );
}

export function GovernanceClient() {
  const [data, setData] = useState<GovernanceEvidenceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>('ALL');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('ALL');
  const [risk, setRisk] = useState<(typeof RISKS)[number]>('ALL');
  const [approvalStatus, setApprovalStatus] = useState<(typeof APPROVALS)[number]>('ALL');
  const [search, setSearch] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '75' });
    if (provider !== 'ALL') params.set('provider', provider);
    if (status !== 'ALL') params.set('status', status);
    if (risk !== 'ALL') params.set('risk', risk);
    if (approvalStatus !== 'ALL') params.set('approvalStatus', approvalStatus);
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [approvalStatus, provider, risk, search, status]);

  const loadGovernance = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (mode === 'initial') setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);
      try {
        const response = await api.get<GovernanceApiResponse>(`/v1/ops/governance?${query}`);
        setData(response.data);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [query],
  );

  useEffect(() => {
    void loadGovernance('initial');
  }, [loadGovernance]);

  async function exportEvidence() {
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await api.get<GovernanceExportApiResponse>(`/v1/ops/governance/export?${query}`);
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `autoops-governance-evidence-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setExportError(getErrorMessage(downloadError));
    } finally {
      setIsExporting(false);
    }
  }

  const summary = data?.summary;
  const evidence = data?.evidence ?? [];

  return (
    <div className="animate-fade-in flex flex-col min-h-screen">
      <WorkspaceHeader
        title="Governance Workspace"
        purpose="Audit evidence and approval governance for controlled operations."
        breadcrumbs={[
          { label: 'AutoOps', href: '/dashboard' },
          { label: 'Governance', href: '/dashboard/governance' }
        ]}
        primaryAction={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void exportEvidence()} disabled={isExporting} className="bg-white">
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export JSON'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadGovernance()} disabled={isRefreshing} className="bg-white">
              <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
          </div>
        }
      />
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {error ? (
        <section className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</section>
      ) : null}
      {exportError ? (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{exportError}</section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Evidence rows" value={summary?.total ?? 0} helper="Filtered operation evidence" />
        <SummaryCard label="Pending approvals" value={summary?.pendingApprovals ?? 0} helper="Awaiting decision" />
        <SummaryCard label="Rejected" value={summary?.rejected ?? 0} helper="Denied before execution" />
        <SummaryCard label="Failed" value={summary?.failed ?? 0} helper="Worker/provider failures" />
        <SummaryCard label="Incident linked" value={summary?.incidentsLinked ?? 0} helper="Failure response evidence" />
        <SummaryCard label="Median duration" value={formatDuration(summary?.medianExecutionDurationMs ?? null)} helper="Execution window" />
      </div>

      <EvidencePanel title="Governance Evidence" description="Tenant-scoped requester, policy, approval, worker, and incident evidence for controlled operations.">
        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center flex-1">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search target, requester, incident, or operation ID"
                className="min-h-9 w-full xl:max-w-md rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex flex-wrap gap-3">
                {[
                  ['Provider', provider, setProvider, PROVIDERS],
                  ['Status', status, setStatus, STATUSES],
                  ['Risk', risk, setRisk, RISKS],
                  ['Approval', approvalStatus, setApprovalStatus, APPROVALS],
                ].map(([label, value, setter, options]) => (
                  <label key={label as string} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    {label as string}:
                    <select
                      value={value as string}
                      onChange={(event) => (setter as (next: string) => void)(event.target.value)}
                      className="h-8 rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {(options as string[]).map((option) => (
                        <option key={option} value={option}>
                          {option === 'ALL' ? 'All' : option}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            {data?.generatedAt ? (
              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                Generated {formatDate(data.generatedAt)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          {isLoading ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
              Loading governance evidence...
            </div>
          ) : evidence.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
              No governance evidence matches the current filters.
            </div>
          ) : (
            <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  {['Time', 'Provider', 'Operation', 'Target', 'Requested by', 'Risk', 'Approval', 'Status', 'Incident', 'Details'].map((header) => (
                    <th key={header} className="border-b border-slate-200 bg-slate-50 px-3 py-3 font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidence.map((item) => (
                  <tr key={item.operationId} className="align-top hover:bg-blue-50/40">
                    <td className="border-b border-slate-100 px-3 py-4 text-slate-700">{formatDate(item.requestedAt)}</td>
                    <td className="border-b border-slate-100 px-3 py-4 text-slate-700">{item.provider}</td>
                    <td className="border-b border-slate-100 px-3 py-4">
                      <p className="font-medium text-slate-950">{item.title}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{item.operationId.slice(0, 8)}</p>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4 text-slate-700">{item.targetDisplayName ?? '-'}</td>
                    <td className="border-b border-slate-100 px-3 py-4 text-slate-700">{actorLabel(item.requestedBy)}</td>
                    <td className="border-b border-slate-100 px-3 py-4"><GovernanceBadge type="risk" value={item.policy.riskLevel} /></td>
                    <td className="border-b border-slate-100 px-3 py-4">
                      <GovernanceBadge type="approval" value={item.policy.approvalStatus} />
                      {item.policy.policyReason ? <p className="mt-2 max-w-72 text-xs text-slate-500">{item.policy.policyReason}</p> : null}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4"><GovernanceBadge type="operation" value={item.status} /></td>
                    <td className="border-b border-slate-100 px-3 py-4">
                      {item.incident ? (
                        <Link className="inline-flex items-center gap-1 text-blue-700 hover:underline" href={`/dashboard/incidents/${item.incident.id}`}>
                          {item.incident.status}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4">
                      <Link className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100" href={`/dashboard/operations/${item.operationId}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </EvidencePanel>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Governance records explain what was requested, approved, confirmed, and executed. They do not grant provider access or bypass approval policy. Governance exports are audit-style evidence for review. They intentionally exclude raw operation input, raw provider result objects, stack traces, environment values, tokens, kubeconfig, and secret-like metadata.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
