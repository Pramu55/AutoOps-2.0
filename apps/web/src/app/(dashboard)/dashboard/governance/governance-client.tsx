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
import { AlertTriangle, Download, ExternalLink, RefreshCw, ShieldCheck, Scale, FileText } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/layout/empty-state';

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
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Governance Workspace"
        purpose="Audit evidence, policy decisions, and tenant-scoped compliance."
        icon={<Scale className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Command', href: '/dashboard' }, { label: 'Governance' }]}
        statusSummary={
          <div className="flex items-center gap-3">
             <span className="text-xs text-slate-500">Updated {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : 'Never'}</span>
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadGovernance()}
                disabled={isLoading || isRefreshing}
                className="bg-white"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void exportEvidence()}
                disabled={isExporting}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                <Download className="h-4 w-4 mr-2" />
                {isExporting ? 'Exporting...' : 'Export JSON'}
              </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full space-y-6">
        
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}
        
        {exportError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {exportError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
           <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-center">
             <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Evidence Rows</p>
             <p className="text-xl font-semibold text-slate-900">{summary?.total ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-center">
             <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Pending Approvals</p>
             <p className="text-xl font-semibold text-blue-600">{summary?.pendingApprovals ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-center">
             <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Rejected</p>
             <p className="text-xl font-semibold text-rose-600">{summary?.rejected ?? 0}</p>
          </div>
           <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-center">
             <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Failed</p>
             <p className="text-xl font-semibold text-amber-600">{summary?.failed ?? 0}</p>
          </div>
           <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-center">
             <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Incident Linked</p>
             <p className="text-xl font-semibold text-purple-600">{summary?.incidentsLinked ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-center">
             <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Median Duration</p>
             <p className="text-xl font-semibold text-slate-900">{formatDuration(summary?.medianExecutionDurationMs ?? null)}</p>
          </div>
        </div>

        <EvidencePanel
           title="Audit Log Filters"
           icon={<FileText className="h-4 w-4 text-slate-600" />}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center p-2 text-sm">
             <div className="flex-1">
               <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search target, requester, incident, or operation ID..."
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 text-sm"
              />
             </div>
             <div className="flex flex-wrap gap-3">
               <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as any)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">All Providers</option>
                  {PROVIDERS.filter(p => p !== 'ALL').map(p => <option key={p} value={p}>{p}</option>)}
               </select>
               <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as any)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">All Statuses</option>
                  {STATUSES.filter(p => p !== 'ALL').map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
               </select>
                <select
                  value={risk}
                  onChange={(event) => setRisk(event.target.value as any)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">All Risks</option>
                  {RISKS.filter(p => p !== 'ALL').map(p => <option key={p} value={p}>{p}</option>)}
               </select>
                <select
                  value={approvalStatus}
                  onChange={(event) => setApprovalStatus(event.target.value as any)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">All Approvals</option>
                  {APPROVALS.filter(p => p !== 'ALL').map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
               </select>
             </div>
          </div>
        </EvidencePanel>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Governance Evidence Log</h3>
                <p className="text-xs text-slate-500 mt-1">Tenant-scoped requester, policy, approval, worker, and incident evidence.</p>
              </div>
            </div>
            
            <div className="overflow-x-auto min-h-[400px]">
              {isLoading ? (
                 <div className="p-12 text-center flex flex-col items-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-slate-300 mb-3" />
                    <p className="text-sm text-slate-500">Loading evidence log...</p>
                 </div>
              ) : evidence.length === 0 ? (
                 <div className="p-12 text-center">
                    <EmptyState
                       title="No evidence found"
                       description="No governance evidence matches the current filters."
                       icon={<ShieldCheck className="text-slate-300" />}
                    />
                 </div>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                   <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                        <th className="px-5 py-3 font-medium">Time</th>
                        <th className="px-5 py-3 font-medium">Operation</th>
                        <th className="px-5 py-3 font-medium">Requester</th>
                        <th className="px-5 py-3 font-medium">Risk / Policy</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium">Incident</th>
                        <th className="px-5 py-3 font-medium text-right">Details</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {evidence.map((item) => (
                         <tr key={item.operationId} className="hover:bg-slate-50/50 transition-colors">
                           <td className="px-5 py-4 text-slate-600 text-xs">
                             {formatDate(item.requestedAt)}
                           </td>
                           <td className="px-5 py-4">
                              <p className="font-semibold text-slate-900 max-w-[200px] truncate" title={item.title}>{item.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-medium uppercase text-slate-500 border border-slate-200 bg-slate-100 px-1.5 py-0.5 rounded">{item.provider}</span>
                                <span className="font-mono text-[10px] text-slate-400">{item.operationId.split('-')[0]}</span>
                              </div>
                           </td>
                           <td className="px-5 py-4">
                              <p className="text-slate-700 font-medium max-w-[150px] truncate" title={actorLabel(item.requestedBy)}>{actorLabel(item.requestedBy)}</p>
                           </td>
                           <td className="px-5 py-4">
                             <div className="flex items-center gap-2 mb-1.5">
                                <StatusBadge status={item.policy.riskLevel} />
                                <StatusBadge status={item.policy.approvalStatus} />
                             </div>
                             {item.policy.policyReason && (
                                <p className="text-[10px] text-slate-500 max-w-[200px] truncate" title={item.policy.policyReason}>{item.policy.policyReason}</p>
                             )}
                           </td>
                           <td className="px-5 py-4">
                              <StatusBadge status={item.status} />
                           </td>
                           <td className="px-5 py-4">
                              {item.incident ? (
                                <Link className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded" href={`/dashboard/incidents/${item.incident.id}`}>
                                  {item.incident.status}
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                           </td>
                           <td className="px-5 py-4 text-right">
                              <Button asChild variant="ghost" size="sm" className="h-8">
                                <Link href={`/dashboard/operations/${item.operationId}`}>Review</Link>
                              </Button>
                           </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
              )}
            </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3 items-start">
           <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
           <p className="leading-relaxed">
             Governance exports are audit-style evidence for review. They intentionally exclude raw operation input, raw provider result objects,
             stack traces, environment values, tokens, kubeconfig, and secret-like metadata to preserve tenant isolation and security.
           </p>
        </div>

      </div>
    </div>
  );
}
