'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type {
  AnsibleOperationResponse,
  AnsiblePlaybookSummary,
  InfrastructureAutomationSummaryResponse,
  InfrastructureProviderStatus,
  TerraformOperationResponse,
  TerraformWorkspaceSummary,
} from '@autoops/types';
import { AlertTriangle, ArrowLeft, FileCode2, PlayCircle, RefreshCw, ShieldCheck, Wrench, X } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type StatusApiResponse = { data: InfrastructureProviderStatus };
type SummaryApiResponse = { data: InfrastructureAutomationSummaryResponse };
type TerraformWorkspacesApiResponse = { data: { items: TerraformWorkspaceSummary[] } };
type AnsiblePlaybooksApiResponse = { data: { items: AnsiblePlaybookSummary[] } };
type TerraformOperationApiResponse = { data: TerraformOperationResponse };
type AnsibleOperationApiResponse = { data: AnsibleOperationResponse };

type PendingAction =
  | {
      kind: 'terraform';
      slug: string;
      label: string;
      token: 'VALIDATE' | 'PLAN' | 'APPLY';
      endpoint: string;
      approvalRequired: boolean;
    }
  | {
      kind: 'ansible';
      slug: string;
      label: string;
      token: 'SYNTAX' | 'CHECK' | 'RUN';
      endpoint: string;
      approvalRequired: boolean;
    };

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load infrastructure automation data.';
}

function tone(status: string): string {
  if (status === 'CONNECTED' || status === 'SUCCEEDED') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'NOT_INSTALLED' || status === 'NOT_CONFIGURED' || status === 'PENDING_APPROVAL') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (status === 'FAILED' || status === 'ERROR' || status === 'UNREACHABLE') return 'border-rose-300 bg-rose-50 text-rose-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone(value)}`}>{value}</span>;
}

function SummaryCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </section>
  );
}

export function InfrastructureClient() {
  const [status, setStatus] = useState<InfrastructureProviderStatus | null>(null);
  const [summary, setSummary] = useState<InfrastructureAutomationSummaryResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<TerraformWorkspaceSummary[]>([]);
  const [playbooks, setPlaybooks] = useState<AnsiblePlaybookSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmationValue, setConfirmationValue] = useState('');

  const loadInfrastructure = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const [statusResponse, summaryResponse, workspaceResponse, playbookResponse] = await Promise.all([
        api.get<StatusApiResponse>('/v1/integrations/infrastructure/status'),
        api.get<SummaryApiResponse>('/v1/integrations/infrastructure/summary'),
        api.get<TerraformWorkspacesApiResponse>('/v1/integrations/infrastructure/terraform/workspaces'),
        api.get<AnsiblePlaybooksApiResponse>('/v1/integrations/infrastructure/ansible/playbooks'),
      ]);
      setStatus(statusResponse.data);
      setSummary(summaryResponse.data);
      setWorkspaces(workspaceResponse.data.items);
      setPlaybooks(playbookResponse.data.items);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadInfrastructure('initial');
  }, [loadInfrastructure]);

  const terraformConnected = status?.terraform.status === 'CONNECTED';
  const ansibleConnected = status?.ansible.status === 'CONNECTED';

  async function queueAction() {
    if (!pendingAction || confirmationValue !== pendingAction.token) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response =
        pendingAction.kind === 'terraform'
          ? await api.post<TerraformOperationApiResponse>(pendingAction.endpoint, {
              confirmationToken: pendingAction.token,
            })
          : await api.post<AnsibleOperationApiResponse>(pendingAction.endpoint, {
              confirmationToken: pendingAction.token,
            });
      setMessage(
        `${response.data.message} Operation ${response.data.operationId}. ${
          response.data.approvalRequired ? `Approval required: ${response.data.approvalReason ?? 'Policy requires approval.'}` : ''
        }`,
      );
      setPendingAction(null);
      setConfirmationValue('');
      await loadInfrastructure();
    } catch (actionError) {
      setMessage(getErrorMessage(actionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50">
        <Link href="/dashboard/operations">
          <ArrowLeft className="h-4 w-4" />
          Back to Ops Hub
        </Link>
      </Button>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge value={status?.terraform.status ?? 'UNKNOWN'} />
              <StatusBadge value={status?.ansible.status ?? 'UNKNOWN'} />
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 lg:text-3xl">
              Infrastructure Automation Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Govern Terraform/OpenTofu and Ansible workflows through allowlisted files, exact confirmation tokens, approval gates, and worker-backed execution.
            </p>
          </div>
          <Button type="button" onClick={() => void loadInfrastructure()} disabled={isLoading || isRefreshing} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </section>

      {error ? <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</section> : null}
      {message ? <section className="rounded-md border border-cyan-200 bg-cyan-50 p-4 text-sm text-blue-800">{message}</section> : null}

      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>No arbitrary command execution is exposed. AutoOps runs only allowlisted workspace/playbook actions through fixed worker command definitions.</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Terraform/OpenTofu" value={status?.terraform.tool ?? 'Not installed'} helper={status?.terraform.version ?? status?.terraform.message ?? '-'} />
        <SummaryCard label="Ansible" value={status?.ansible.tool ?? 'Not installed'} helper={status?.ansible.version ?? status?.ansible.message ?? '-'} />
        <SummaryCard label="Workspaces" value={workspaces.length} helper="Allowlisted Terraform directories" />
        <SummaryCard label="Playbooks" value={playbooks.length} helper="Allowlisted Ansible playbooks" />
      </div>

      {!terraformConnected || !ansibleConnected ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              One or more infrastructure tools are not installed in this runtime. Discovery remains available, but actions are disabled until the API and worker containers have the required binaries.
            </p>
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Terraform/OpenTofu workspaces</h2>
            <p className="mt-1 text-sm text-slate-600">Workspace slugs are discovered from the configured allowlisted root only.</p>
          </div>
          <FileCode2 className="h-5 w-5 text-blue-600" />
        </div>
        <div className="mt-5 overflow-x-auto">
          {isLoading ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Loading workspaces...</div>
          ) : workspaces.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">No allowlisted Terraform workspaces found.</div>
          ) : (
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {['Workspace', 'Path', 'Tool', 'Status', 'Actions'].map((header) => (
                    <th key={header} className="border-b border-slate-200 bg-slate-50 px-3 py-3 font-semibold">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspaces.map((workspace) => (
                  <tr key={workspace.slug} className="hover:bg-blue-50/40">
                    <td className="border-b border-slate-100 px-3 py-4 font-medium text-slate-950">{workspace.displayName}</td>
                    <td className="border-b border-slate-100 px-3 py-4 font-mono text-xs text-slate-600">{workspace.relativePath}</td>
                    <td className="border-b border-slate-100 px-3 py-4 text-slate-700">{workspace.tool ?? '-'}</td>
                    <td className="border-b border-slate-100 px-3 py-4"><StatusBadge value={workspace.status} /></td>
                    <td className="border-b border-slate-100 px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['Validate', 'VALIDATE', 'validate', false],
                          ['Plan', 'PLAN', 'plan', false],
                          ['Apply', 'APPLY', 'apply', true],
                        ].map(([label, token, action, approvalRequired]) => (
                          <Button
                            key={String(action)}
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!terraformConnected}
                            onClick={() =>
                              setPendingAction({
                                kind: 'terraform',
                                slug: workspace.slug,
                                label: String(label),
                                token: token as PendingAction['token'],
                                endpoint: `/v1/integrations/infrastructure/terraform/${encodeURIComponent(workspace.slug)}/${action}`,
                                approvalRequired: Boolean(approvalRequired),
                              } as PendingAction)
                            }
                            className="rounded-full border-slate-200 bg-slate-50"
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Ansible playbooks</h2>
            <p className="mt-1 text-sm text-slate-600">Playbooks use the allowlisted local inventory only.</p>
          </div>
          <Wrench className="h-5 w-5 text-blue-600" />
        </div>
        <div className="mt-5 overflow-x-auto">
          {isLoading ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Loading playbooks...</div>
          ) : playbooks.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">No allowlisted Ansible playbooks found.</div>
          ) : (
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {['Playbook', 'Path', 'Inventory', 'Status', 'Actions'].map((header) => (
                    <th key={header} className="border-b border-slate-200 bg-slate-50 px-3 py-3 font-semibold">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playbooks.map((playbook) => (
                  <tr key={playbook.slug} className="hover:bg-blue-50/40">
                    <td className="border-b border-slate-100 px-3 py-4 font-medium text-slate-950">{playbook.displayName}</td>
                    <td className="border-b border-slate-100 px-3 py-4 font-mono text-xs text-slate-600">{playbook.relativePath}</td>
                    <td className="border-b border-slate-100 px-3 py-4 font-mono text-xs text-slate-600">{playbook.inventoryRelativePath}</td>
                    <td className="border-b border-slate-100 px-3 py-4"><StatusBadge value={playbook.status} /></td>
                    <td className="border-b border-slate-100 px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['Syntax', 'SYNTAX', 'syntax-check', false],
                          ['Check', 'CHECK', 'check', false],
                          ['Run', 'RUN', 'run', true],
                        ].map(([label, token, action, approvalRequired]) => (
                          <Button
                            key={String(action)}
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!ansibleConnected}
                            onClick={() =>
                              setPendingAction({
                                kind: 'ansible',
                                slug: playbook.slug,
                                label: String(label),
                                token: token as PendingAction['token'],
                                endpoint: `/v1/integrations/infrastructure/ansible/${encodeURIComponent(playbook.slug)}/${action}`,
                                approvalRequired: Boolean(approvalRequired),
                              } as PendingAction)
                            }
                            className="rounded-full border-slate-200 bg-slate-50"
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Recent infrastructure operations</h2>
            <p className="mt-1 text-sm text-slate-600">Real operation records created through the Infrastructure Automation Center.</p>
          </div>
          <Button asChild variant="outline" className="rounded-full border-cyan-200 bg-cyan-50 text-blue-700">
            <Link href="/dashboard/governance">Open Governance Center</Link>
          </Button>
        </div>
        <div className="mt-5 space-y-3">
          {(summary?.recentOperations ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">No infrastructure operations have been requested yet.</div>
          ) : (
            summary?.recentOperations.map((operation) => (
              <div key={operation.operationId} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_0.55fr_0.55fr_0.55fr_auto]">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{operation.kind}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{operation.operationId.slice(0, 8)} | {operation.target ?? '-'}</p>
                </div>
                <StatusBadge value={operation.status} />
                <StatusBadge value={operation.riskLevel} />
                <p className="text-sm text-slate-600">{formatDate(operation.createdAt)}</p>
                <Button asChild size="sm" variant="outline" className="rounded-full border-cyan-200 bg-cyan-50 text-blue-700">
                  <Link href={`/dashboard/operations/${operation.operationId}`}>Details</Link>
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  {pendingAction.approvalRequired ? 'Approval required' : 'Confirmation required'}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">{pendingAction.label} {pendingAction.slug}</h2>
              </div>
              <button type="button" onClick={() => setPendingAction(null)} disabled={isSubmitting} className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:bg-blue-50" aria-label="Close confirmation">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
              <p>This queues a worker-executed infrastructure operation for allowlisted target <span className="font-semibold text-slate-950">{pendingAction.slug}</span>.</p>
              {pendingAction.approvalRequired ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">This action will remain pending until a separate approver approves it.</p>
              ) : null}
              <p>Type <span className="font-semibold text-amber-800">{pendingAction.token}</span> to continue.</p>
            </div>
            <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="iac-confirmation-token">Required confirmation token</label>
            <Input id="iac-confirmation-token" value={confirmationValue} onChange={(event) => setConfirmationValue(event.target.value)} placeholder={`Type ${pendingAction.token} to confirm`} className="mt-2 border-slate-200 bg-white" autoFocus />
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={isSubmitting} className="rounded-full border-slate-200 bg-slate-50">Cancel</Button>
              <Button type="button" onClick={() => void queueAction()} disabled={confirmationValue !== pendingAction.token || isSubmitting} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
                <PlayCircle className="h-4 w-4" />
                {isSubmitting ? 'Queueing...' : 'Queue operation'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
