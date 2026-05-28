'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  AwsIdentityResponse,
  AwsStatusResponse,
  AwsReadinessResponse,
  AwsPermissionsResponse,
  AwsRemoteStateReadinessResponse,
  AwsWorkspaceReadinessResponse,
  AwsDeploymentTarget,
  AwsListResponse,
  AwsEcrReadinessResponse,
  AwsEcrRepository,
  AwsEcrImageMetadata,
  AwsTerraformPlanReadinessResponse,
  AwsTerraformApplyReadinessResponse,
  AwsGuardrailReadinessResponse,
  AwsGuardrailEvaluationSummary,
  AwsGuardrailEvaluationResponse,
  AwsDeploymentSummary,
  AwsReleaseSummary,
  AwsReleaseHistoryResponse,
  AwsReleaseReadinessResponse,
} from '@autoops/types';
import { AwsReleaseStatus } from '@autoops/types';
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Play, ShieldAlert, FileText, Activity, TrendingUp, RotateCcw, Clock, ArrowRight, History, UserCheck } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { WorkspaceHeader } from '@/components/layout/workspace-header';

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function AwsDeploymentClient() {
  const [identity, setIdentity] = useState<AwsIdentityResponse | null>(null);
  const [status, setStatus] = useState<AwsStatusResponse | null>(null);
  const [readiness, setReadiness] = useState<AwsReadinessResponse | null>(null);
  const [permissions, setPermissions] = useState<AwsPermissionsResponse | null>(null);
  const [remoteState, setRemoteState] = useState<AwsRemoteStateReadinessResponse | null>(null);
  const [workspaceRes, setWorkspaceRes] = useState<AwsWorkspaceReadinessResponse | null>(null);
  const [ecrReadiness, setEcrReadiness] = useState<AwsEcrReadinessResponse | null>(null);
  const [ecrRepositories, setEcrRepositories] = useState<AwsEcrRepository[]>([]);
  const [ecrImages, setEcrImages] = useState<AwsEcrImageMetadata[]>([]);
  const [ecrMessage, setEcrMessage] = useState<string | null>(null);
  const [planReadiness, setPlanReadiness] = useState<AwsTerraformPlanReadinessResponse | null>(null);
  const [applyReadiness, setApplyReadiness] = useState<AwsTerraformApplyReadinessResponse | null>(null);
  const [guardrailReadiness, setGuardrailReadiness] = useState<AwsGuardrailReadinessResponse | null>(null);
  const [guardrailEvaluations, setGuardrailEvaluations] = useState<AwsGuardrailEvaluationSummary[]>([]);
  const [deployments, setDeployments] = useState<AwsDeploymentSummary[]>([]);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [inventoryDenied, setInventoryDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  // New releases state
  const [releases, setReleases] = useState<AwsReleaseSummary[]>([]);
  const [releaseReadiness, setReleaseReadiness] = useState<AwsReleaseReadinessResponse | null>(null);
  const [promoteMessage, setPromoteMessage] = useState<string | null>(null);
  const [rollbackMessage, setRollbackMessage] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackConfirmText, setRollbackConfirmText] = useState('');
  const [selectedRollbackReleaseId, setSelectedRollbackReleaseId] = useState<string>('');

  async function load() {
    setLoading(true);
    setInventoryDenied(false);
    try {
      const statusRes = await api.get<{ data: AwsStatusResponse }>('/v1/integrations/aws/status');
      setStatus(statusRes.data);
      if (statusRes.data.status === 'BLOCKED_BY_ORG_POLICY') {
        setInventoryDenied(true);
        setIdentity(null);
        setReadiness(null);
        setPermissions(null);
        setRemoteState(null);
        setWorkspaceRes(null);
        setEcrReadiness(null);
        setEcrRepositories([]);
        setEcrImages([]);
        setPlanReadiness(null);
        setApplyReadiness(null);
        setGuardrailReadiness(null);
        setGuardrailEvaluations([]);
        setDeployments([]);
        setReleases([]);
        setReleaseReadiness(null);
        return;
      }

      const [idRes, readRes, permRes, rsRes, tRes, ecrReadyRes, ecrRepoRes, ecrImagesRes, planReadyRes, applyReadyRes, guardrailReadyRes, guardrailEvalRes, deploymentsRes, releasesRes, releaseReadyRes] = await Promise.all([
        api.get<{ data: AwsIdentityResponse }>('/v1/integrations/aws/identity').catch((error) => {
          if (error?.status === 403) setInventoryDenied(true);
          return null;
        }),
        api.get<{ data: AwsReadinessResponse }>('/v1/integrations/aws/readiness').catch(() => null),
        api.get<{ data: AwsPermissionsResponse }>('/v1/integrations/aws/permissions').catch(() => null),
        api.get<{ data: AwsRemoteStateReadinessResponse }>('/v1/integrations/aws/remote-state').catch(() => null),
        api.get<{ data: AwsListResponse<AwsDeploymentTarget> }>('/v1/integrations/aws/deployment-targets').catch(() => null),
        api.get<{ data: AwsEcrReadinessResponse }>('/v1/integrations/aws/ecr/readiness').catch(() => null),
        api.get<{ data: AwsListResponse<AwsEcrRepository> }>('/v1/integrations/aws/ecr/repositories').catch(() => null),
        api.get<{ data: AwsListResponse<AwsEcrImageMetadata> }>('/v1/integrations/aws/ecr/images').catch(() => null),
        api.get<{ data: AwsTerraformPlanReadinessResponse }>('/v1/integrations/aws/terraform/plan-readiness').catch(() => null),
        api.get<{ data: AwsTerraformApplyReadinessResponse }>('/v1/integrations/aws/apply-readiness').catch(() => null),
        api.get<{ data: AwsGuardrailReadinessResponse }>('/v1/integrations/aws/guardrails/readiness').catch(() => null),
        api.get<{ data: AwsGuardrailEvaluationResponse }>('/v1/integrations/aws/guardrails/evaluations').catch(() => null),
        api.get<{ data: AwsListResponse<AwsDeploymentSummary> }>('/v1/integrations/aws/deployments').catch(() => null),
        api.get<{ data: AwsReleaseHistoryResponse }>('/v1/integrations/aws/releases/history').catch(() => null),
        api.get<{ data: AwsReleaseReadinessResponse }>('/v1/integrations/aws/release-readiness').catch(() => null),
      ]);
      setIdentity(idRes?.data ?? null);
      setReadiness(readRes?.data ?? null);
      setPermissions(permRes?.data ?? null);
      setRemoteState(rsRes?.data ?? null);
      setEcrReadiness(ecrReadyRes?.data ?? null);
      setEcrRepositories(repoRes => ecrRepoRes?.data?.items ?? repoRes);
      setEcrImages(ecrImagesRes?.data?.items ?? []);
      setPlanReadiness(planReadyRes?.data ?? null);
      setApplyReadiness(applyReadyRes?.data ?? null);
      setGuardrailReadiness(guardrailReadyRes?.data ?? null);
      setGuardrailEvaluations(guardrailEvalRes?.data?.items ?? []);
      setDeployments(deploymentsRes?.data?.items ?? []);
      setReleases(releasesRes?.data?.items ?? []);
      setReleaseReadiness(releaseReadyRes?.data ?? null);
      const items = tRes?.data?.items ?? [];
      
      if (items.length > 0 && items[0]) {
        const wsRes = await api.get<{ data: AwsWorkspaceReadinessResponse }>(`/v1/integrations/aws/workspace-readiness/${items[0].slug}`).catch(() => null);
        setWorkspaceRes(wsRes?.data ?? null);
      } else {
        setWorkspaceRes(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function requestEcrBuild(targetSlug: string, environmentSlug: string) {
    setEcrMessage(null);
    const response = await api.post<{ data: { operationId: string; status: string } }>('/v1/integrations/aws/ecr/images/build', {
      targetSlug,
      environmentSlug,
      confirmationToken: 'BUILD',
    });
    setEcrMessage(`Build operation ${response.data.operationId} is ${response.data.status}.`);
    await load();
  }

  async function requestEcrPush(image: AwsEcrImageMetadata) {
    setEcrMessage(null);
    const response = await api.post<{ data: { operationId: string; status: string } }>('/v1/integrations/aws/ecr/images/push', {
      targetSlug: image.targetSlug,
      repositoryName: image.repositoryName,
      environmentSlug: image.environmentSlug,
      imageTag: image.imageTag,
      confirmationToken: 'PUSH',
    });
    setEcrMessage(`Push operation ${response.data.operationId} is ${response.data.status}.`);
    await load();
  }

  async function requestTerraformPlan(image: AwsEcrImageMetadata) {
    setPlanMessage(null);
    const response = await api.post<{ data: { operationId: string; status: string } }>(
      `/v1/integrations/aws/deployments/${encodeURIComponent(image.targetSlug)}/plan`,
      {
        targetSlug: image.targetSlug,
        environmentSlug: image.environmentSlug,
        imageOperationId: image.operationId,
        confirmationToken: 'PLAN',
      },
    );
    setPlanMessage(`Terraform/OpenTofu ECS plan operation ${response.data.operationId} is ${response.data.status}.`);
    await load();
  }

  async function requestTerraformApply(targetSlug: string, environmentSlug: string) {
    setApplyMessage(null);
    setApplying(true);
    try {
      const response = await api.post<{ data: { operationId: string; status: string } }>(
        `/v1/integrations/aws/deployments/${encodeURIComponent(targetSlug)}/apply`,
        {
          confirmationToken: 'APPLY',
          environmentSlug,
        },
      );
      setApplyMessage(`Terraform/OpenTofu ECS apply operation ${response.data.operationId} is ${response.data.status} (Pending Approval).`);
      await load();
    } catch (err: unknown) {
      setApplyMessage(apiErrorMessage(err, 'Failed to request apply.'));
    } finally {
      setApplying(false);
    }
  }

  async function requestPromote(releaseId: string, targetSlug: string, targetEnvironmentSlug: string) {
    setPromoteMessage(null);
    setPromoting(true);
    try {
      const response = await api.post<{ data: { operationId: string; status: string } }>(
        `/v1/integrations/aws/releases/${encodeURIComponent(releaseId)}/promote`,
        {
          targetSlug,
          targetEnvironmentSlug,
          confirmationToken: 'PROMOTE',
        },
      );
      setPromoteMessage(`Promotion operation ${response.data.operationId} is ${response.data.status} (Pending Approval if target is Production).`);
      await load();
    } catch (err: unknown) {
      setPromoteMessage(apiErrorMessage(err, 'Failed to request promotion.'));
    } finally {
      setPromoting(false);
    }
  }

  async function requestRollback(releaseId: string) {
    setRollbackMessage(null);
    setRollingBack(true);
    try {
      const response = await api.post<{ data: { operationId: string; status: string } }>(
        `/v1/integrations/aws/releases/${encodeURIComponent(releaseId)}/rollback`,
        {
          confirmationToken: 'ROLLBACK',
        },
      );
      setRollbackMessage(`Rollback operation ${response.data.operationId} is ${response.data.status} (Pending Approval).`);
      await load();
    } catch (err: unknown) {
      setRollbackMessage(apiErrorMessage(err, 'Failed to request rollback.'));
    } finally {
      setRollingBack(false);
      setRollbackConfirmText('');
    }
  }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'PASS' || status === 'READY' || status === 'CONNECTED') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (status === 'ERROR' || status === 'FAIL' || status === 'AUTH_FAILED') return <XCircle className="h-4 w-4 text-red-500" />;
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  };

  const pushedImages = ecrImages.filter((image) => image.action === 'push' && image.status === 'SUCCEEDED');
  const latestGuardrail = guardrailEvaluations[0] ?? null;
  const guardrailsBlocked =
    guardrailReadiness?.status === 'BLOCKED' ||
    latestGuardrail?.status === 'BLOCKED' ||
    latestGuardrail?.riskLevel === 'BLOCKED';

  return (
    <div className="space-y-6 animate-fade-in">
      <WorkspaceHeader
        title="AWS Provider Record"
        purpose="AWS Day 1 Deployment Foundation Readiness Checklist and ECS Fargate release gate state."
        backLink={{ href: '/dashboard/integrations', label: 'Back to Integrations' }}
        breadcrumbs={[{ label: 'AutoOps' }, { label: 'Integrations', href: '/dashboard/integrations' }, { label: 'AWS' }]}
        statusSummary={
          status && (
            <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${
              status.status === 'CONNECTED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
              status.status === 'AUTH_FAILED' || status.status === 'BLOCKED_BY_ORG_POLICY' || status.status === 'ERROR' ? 'bg-rose-50 border-rose-200 text-rose-700' :
              'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              {status.status}
            </span>
          )
        }
        primaryAction={
          <Button type="button" onClick={() => void load()} disabled={loading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200 shadow-sm border border-slate-200">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        }
      />

      {identity && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <StatusIcon status={identity.status} /> AWS Identity
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-slate-500">Account ID</p>
              <p className="text-sm font-mono text-slate-700">{identity.accountId || '-'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">ARN</p>
              <p className="text-sm font-mono text-slate-700">{identity.arn || '-'}</p>
            </div>
          </div>
        </section>
      )}

      {inventoryDenied && (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h2 className="text-base font-semibold text-slate-900">Provider access is disabled for this organization</h2>
          <p className="mt-2 leading-6">
            This workspace cannot view shared AWS inventory until provider access is enabled for this organization.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {(status?.remediation ?? [
              'Use the demo/admin workspace for built-in local demo connectors.',
              'Ask a platform admin to add this organization slug to PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS.',
              "For production, configure this organization's own AWS credentials through the approved deployment process.",
            ]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {readiness && (
          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <StatusIcon status={readiness.status} /> Configuration Check
            </h2>
            <ul className="mt-4 space-y-3">
              <li className="flex items-center justify-between text-sm">
                <span className="text-slate-600">AWS Region</span>
                <StatusIcon status={readiness.regionConfigured ? 'PASS' : 'FAIL'} />
              </li>
              <li className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Access Key</span>
                <StatusIcon status={readiness.accessKeyConfigured ? 'PASS' : 'FAIL'} />
              </li>
              <li className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Secret Key</span>
                <StatusIcon status={readiness.secretKeyConfigured ? 'PASS' : 'FAIL'} />
              </li>
              <li className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Target Account ID</span>
                <StatusIcon status={readiness.accountIdConfigured ? 'PASS' : 'FAIL'} />
              </li>
              <li className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Allowlisted Workspaces</span>
                <StatusIcon status={readiness.allowedWorkspacesConfigured ? 'PASS' : 'FAIL'} />
              </li>
            </ul>
          </section>
        )}

        {remoteState && (
          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <StatusIcon status={remoteState.status} /> Remote State Storage
            </h2>
            <ul className="mt-4 space-y-3">
              {remoteState.checks.map(c => (
                <li key={c.name} className="flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="text-slate-900 font-medium">{c.name}</span>
                    <span className="text-slate-500 text-xs">{c.message}</span>
                  </div>
                  <StatusIcon status={c.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {permissions && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <StatusIcon status={permissions.status} /> IAM Permission Diagnostics
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                  <th className="px-4 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permissions.diagnostics.map((d, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium text-slate-900">{d.service}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.action}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                        <StatusIcon status={d.status} /> {d.status}
                      </div>
                    </td>
                    <td className="px-4 py-3 truncate max-w-xs" title={d.message}>{d.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {workspaceRes && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <StatusIcon status={workspaceRes.status} /> Allowlisted Workspace ({workspaceRes.targetSlug})
          </h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-slate-900 mb-2">Required Files</h3>
              <ul className="space-y-2">
                {workspaceRes.requiredFiles.map(f => (
                  <li key={f.path} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-slate-600">{f.path}</span>
                    <StatusIcon status={f.present ? 'PASS' : 'FAIL'} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
               <h3 className="text-sm font-medium text-slate-900 mb-2">Security & Tooling Checks</h3>
               <ul className="space-y-3">
                {workspaceRes.checks.map(c => (
                  <li key={c.name} className="flex items-start justify-between text-sm">
                    <div className="flex flex-col pr-4">
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <span className="text-slate-500 text-xs">{c.message}</span>
                    </div>
                    <div className="mt-0.5">
                      <StatusIcon status={c.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {ecrReadiness && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <StatusIcon status={ecrReadiness.status} /> ECR Image Build & Push
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Build and push are separate governed operations. Production pushes require approval.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Push enabled: <span className="font-medium text-slate-900">{ecrReadiness.pushEnabled ? 'yes' : 'no'}</span>
            </div>
          </div>
          {ecrMessage && <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ecrMessage}</p>}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Allowlisted build targets</h3>
              <div className="mt-3 space-y-3">
                {ecrReadiness.buildTargets.length === 0 && <p className="text-sm text-slate-500">No ECR build targets are allowlisted.</p>}
                {ecrReadiness.buildTargets.map((target) => (
                  <div key={target.targetSlug} className="rounded-md bg-slate-50 p-3 text-sm">
                    <div className="font-medium text-slate-950">{target.displayName}</div>
                    <div className="mt-1 font-mono text-xs text-slate-500">{target.contextPath}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => void requestEcrBuild(target.targetSlug, 'staging')}>
                        Build staging
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void requestEcrBuild(target.targetSlug, 'production')}>
                        Build production
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Allowlisted repositories</h3>
              <div className="mt-3 space-y-2">
                {ecrRepositories.length === 0 && <p className="text-sm text-slate-500">No allowlisted ECR repositories are available.</p>}
                {ecrRepositories.map((repo) => (
                  <div key={repo.repositoryName} className="rounded-md bg-slate-50 p-3 text-sm">
                    <div className="font-medium text-slate-950">{repo.repositoryName}</div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-500">{repo.repositoryUri ?? 'Repository URI unavailable'}</div>
                    <div className="mt-2 text-xs text-slate-500">Scan on push: {repo.scanOnPush === null ? '-' : repo.scanOnPush ? 'enabled' : 'disabled'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {planReadiness && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <StatusIcon status={planReadiness.status} /> Terraform ECS Plan
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Plan-only review uses remote state and a tenant-scoped ECR push image. Apply and destroy are not available here.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/governance">Governance Evidence</Link>
            </Button>
          </div>
          {planMessage && <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{planMessage}</p>}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Remote state</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-center justify-between">S3 bucket <StatusIcon status={planReadiness.remoteStateBucketConfigured ? 'PASS' : 'FAIL'} /></li>
                <li className="flex items-center justify-between">DynamoDB lock table <StatusIcon status={planReadiness.remoteStateLockTableConfigured ? 'PASS' : 'FAIL'} /></li>
                <li className="flex items-center justify-between">State region <StatusIcon status={planReadiness.remoteStateRegionConfigured ? 'PASS' : 'FAIL'} /></li>
              </ul>
            </div>
            <div className="rounded-md border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Workspace and image</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-center justify-between">Allowlisted workspace <StatusIcon status={planReadiness.allowedWorkspaceConfigured ? 'PASS' : 'FAIL'} /></li>
                <li className="flex items-center justify-between">Workspace exists <StatusIcon status={planReadiness.workspaceExists ? 'PASS' : 'FAIL'} /></li>
                <li className="flex items-center justify-between">Pushed image metadata <StatusIcon status={planReadiness.safeImageAvailable ? 'PASS' : 'FAIL'} /></li>
              </ul>
            </div>
            <div className="rounded-md border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Plan blockers</h3>
              {planReadiness.missing.length === 0 && planReadiness.blockedReasons.length === 0 ? (
                <p className="mt-3 text-sm text-emerald-700">Plan prerequisites are ready.</p>
              ) : (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {[...planReadiness.missing, ...planReadiness.blockedReasons].map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Pushed image</th>
                  <th className="px-4 py-2 font-medium">Environment</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pushedImages.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">No successful tenant-scoped ECR pushes are available for ECS planning.</td></tr>
                )}
                {pushedImages.map((image) => (
                  <tr key={`plan-${image.operationId}`}>
                    <td className="px-4 py-3 font-mono text-xs">{image.imageUri ?? `${image.repositoryName}:${image.imageTag}`}</td>
                    <td className="px-4 py-3">{image.environmentSlug}</td>
                    <td className="px-4 py-3">
                      <Button type="button" size="sm" onClick={() => void requestTerraformPlan(image)} disabled={planReadiness.status !== 'READY' || guardrailsBlocked}>
                        Plan
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {deployments.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Recent AWS deployment operations</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {deployments.map((deployment) => (
                  <div key={deployment.workspaceSlug} className="rounded-md border border-slate-100 p-3 text-sm">
                    <div className="font-medium text-slate-950">{deployment.workspaceSlug}</div>
                    <div className="mt-1 text-slate-500">{deployment.status} {deployment.lastOperationType ? `(${deployment.lastOperationType})` : ''}</div>
                    {deployment.lastOperationId && (
                      <Link className="mt-2 inline-block text-xs font-medium text-slate-900 underline" href={`/dashboard/operations/${deployment.lastOperationId}`}>Open operation detail</Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {guardrailReadiness && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <StatusIcon status={guardrailReadiness.status} /> AWS Cost & Blast-Radius Guardrails
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Estimated monthly cost and blast-radius checks run before plan evidence and immediately before mutation.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Conservative estimate. Not a billing guarantee.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/governance">Governance Evidence</Link>
            </Button>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Account and region</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-center justify-between">
                  <span>Account allowlist</span>
                  <StatusIcon status={guardrailReadiness.config.allowedAccountIdsConfigured ? 'PASS' : 'FAIL'} />
                </li>
                <li className="flex items-center justify-between">
                  <span>Region allowlist</span>
                  <StatusIcon status={guardrailReadiness.config.allowedRegionsConfigured ? 'PASS' : 'FAIL'} />
                </li>
                <li className="flex items-center justify-between">
                  <span>Public load balancer default deny</span>
                  <StatusIcon status={guardrailReadiness.config.blockPublicLoadBalancerByDefault && !guardrailReadiness.config.allowPublicLoadBalancer ? 'PASS' : 'FAIL'} />
                </li>
              </ul>
              {guardrailReadiness.config.missing.length > 0 && (
                <p className="mt-3 text-xs text-amber-800">
                  Missing: {guardrailReadiness.config.missing.join(', ')}
                </p>
              )}
            </div>

            <div className="rounded-md border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Cost guardrails</h3>
              <dl className="mt-3 space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <dt>Enabled</dt>
                  <dd>{guardrailReadiness.config.costGuardrailsEnabled ? 'yes' : 'no'}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Estimated monthly cost limit</dt>
                  <dd>${guardrailReadiness.config.maxMonthlyCostDeltaUsd}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Max desired count</dt>
                  <dd>{guardrailReadiness.config.maxDesiredCount}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-md border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Latest guardrail evidence</h3>
              {latestGuardrail ? (
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="font-semibold text-slate-950">{latestGuardrail.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Risk</span>
                    <span className="font-semibold text-slate-950">{latestGuardrail.riskLevel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Estimated monthly cost</span>
                    <span className="font-semibold text-slate-950">${latestGuardrail.costEstimate.estimatedMonthlyDeltaUsd}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    +{latestGuardrail.blastRadius.addCount} / ~{latestGuardrail.blastRadius.changeCount} / -{latestGuardrail.blastRadius.destroyCount}
                  </div>
                  {latestGuardrail.blockedReasons.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-red-700">
                      {latestGuardrail.blockedReasons.slice(0, 3).map((reason) => <li key={reason.code}>{reason.message}</li>)}
                    </ul>
                  )}
                  {latestGuardrail.warnings.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700">
                      {latestGuardrail.warnings.slice(0, 3).map((warning) => <li key={warning.code}>{warning.message}</li>)}
                    </ul>
                  )}
                  <Link className="text-xs font-medium text-slate-900 underline" href={`/dashboard/operations/${latestGuardrail.operationId}`}>
                    Open operation evidence
                  </Link>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No tenant-scoped guardrail evaluations yet.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {applyReadiness && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <StatusIcon status={applyReadiness.status} /> Terraform ECS Apply Control Plane
              </h2>
              <p className="mt-1 text-sm text-slate-600 font-normal">
                Gated deployment execution using the approved plans. All apply actions require explicit approval.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Apply state:</span>
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${applyReadiness.applyEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {applyReadiness.applyEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
          </div>

          {applyMessage && (
            <div className={`rounded-md border p-3 text-sm ${applyMessage.includes('failed') || applyMessage.includes('Failed') ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              {applyMessage}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* Apply Readiness Card */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-600" /> Apply Readiness Checks
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="flex items-center justify-between">
                  <span>AWS apply enabled</span>
                  <StatusIcon status={applyReadiness.applyEnabled ? 'PASS' : 'FAIL'} />
                </li>
                <li className="flex items-center justify-between">
                  <span>Remote state storage</span>
                  <StatusIcon status={applyReadiness.remoteStateBucketConfigured && applyReadiness.remoteStateLockTableConfigured ? 'PASS' : 'FAIL'} />
                </li>
                <li className="flex items-center justify-between">
                  <span>Terraform/OpenTofu tool</span>
                  <StatusIcon status={applyReadiness.terraformToolAvailable ? 'PASS' : 'FAIL'} />
                </li>
                <li className="flex items-center justify-between">
                  <span>Latest plan available</span>
                  <StatusIcon status={applyReadiness.latestPlanAvailable ? 'PASS' : 'FAIL'} />
                </li>
              </ul>
              {applyReadiness.blockedReasons.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="flex gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-semibold text-amber-900">Apply is currently blocked</h4>
                      <ul className="mt-1 list-disc pl-4 text-xs text-amber-800 space-y-1">
                        {applyReadiness.blockedReasons.map(r => <li key={r}>{r}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Latest Plan Card */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-600" /> Latest Approved Plan
                </h3>
                {applyReadiness.latestPlanAvailable ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded bg-emerald-50/50 p-2 border border-emerald-100">
                        <div className="text-lg font-semibold text-emerald-700">+{applyReadiness.addCount}</div>
                        <div className="text-xs text-slate-500">To Add</div>
                      </div>
                      <div className="rounded bg-amber-50/50 p-2 border border-amber-100">
                        <div className="text-lg font-semibold text-amber-700">~{applyReadiness.changeCount}</div>
                        <div className="text-xs text-slate-500">To Change</div>
                      </div>
                      <div className="rounded bg-red-50/50 p-2 border border-red-100">
                        <div className="text-lg font-semibold text-red-700">-{applyReadiness.destroyCount}</div>
                        <div className="text-xs text-slate-500">To Destroy</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1">
                      <div>Plan ID: <span className="font-mono text-slate-700">{applyReadiness.latestPlanOperationId}</span></div>
                      <div>Risk level: <span className={`font-semibold ${applyReadiness.riskLevel === 'HIGH' ? 'text-red-600' : 'text-emerald-600'}`}>{applyReadiness.riskLevel}</span></div>
                      <div>Age: <span className="text-slate-700">{applyReadiness.latestPlanAgeSeconds ? `${Math.floor(applyReadiness.latestPlanAgeSeconds / 60)}m ago` : 'just now'}</span></div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">No successful plan is currently available to apply.</p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  onClick={() => {
                    if (applyReadiness.targetSlug && applyReadiness.environmentSlug) {
                      void requestTerraformApply(applyReadiness.targetSlug, applyReadiness.environmentSlug);
                    }
                  }}
                  disabled={applyReadiness.status !== 'READY' || applying || guardrailsBlocked || !applyReadiness.targetSlug || !applyReadiness.environmentSlug}
                  className="w-full bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 flex items-center justify-center gap-2 rounded-full"
                >
                  <Play className="h-4 w-4" /> Request Gated Apply
                </Button>
                <p className="mt-2 text-center text-[10px] text-slate-500">
                  Submits a PENDING_APPROVAL operation. Self-approval is blocked.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {releaseReadiness && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <TrendingUp className="h-5 w-5 text-indigo-500" /> AWS ECS Release Promotion & Rollback Engine
              </h2>
              <p className="mt-1 text-sm text-slate-600 font-normal">
                Manage safe environment promotion pipelines and governed rollbacks using Day 3 plan evidence and Day 4 apply gates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Pipeline status:</span>
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${releaseReadiness.status === 'READY' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {releaseReadiness.status === 'READY' ? 'PIPELINE READY' : 'PIPELINE BLOCKED'}
              </span>
            </div>
          </div>

          {promoteMessage && (
            <div className={`rounded-md border p-3 text-sm ${promoteMessage.includes('failed') || promoteMessage.includes('Failed') ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              {promoteMessage}
            </div>
          )}

          {rollbackMessage && (
            <div className={`rounded-md border p-3 text-sm ${rollbackMessage.includes('failed') || rollbackMessage.includes('Failed') ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              {rollbackMessage}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* STAGING ENVIRONMENT CARD */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Staging Environment</h3>
                {releases.find(r => r.environmentSlug === 'staging' && r.status === AwsReleaseStatus.ACTIVE) ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                    ACTIVE RELEASE: v{releases.find(r => r.environmentSlug === 'staging' && r.status === AwsReleaseStatus.ACTIVE)?.releaseVersion}
                  </span>
                ) : (
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">
                    NO ACTIVE RELEASE
                  </span>
                )}
              </div>

              {(() => {
                const activeStaging = releases.find(r => r.environmentSlug === 'staging' && r.status === AwsReleaseStatus.ACTIVE);
                const prevStaging = releases.filter(r => r.environmentSlug === 'staging' && r.status !== AwsReleaseStatus.ACTIVE);

                return (
                  <>
                    {activeStaging ? (
                      <div className="space-y-3 text-xs text-slate-600">
                        <div>
                          <span className="font-semibold block text-slate-700">Image URI:</span>
                          <span className="font-mono break-all">{activeStaging.imageUri}</span>
                        </div>
                        {activeStaging.imageDigest && (
                          <div>
                            <span className="font-semibold block text-slate-700">Image Digest:</span>
                            <span className="font-mono break-all">{activeStaging.imageDigest}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <span className="font-semibold block text-slate-700">Created:</span>
                            <span>{new Date(activeStaging.createdAt).toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="font-semibold block text-slate-700">Deployer:</span>
                            <span className="font-mono text-[10px]">{activeStaging.createdByUserId || 'System'}</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                              <UserCheck className="h-3 w-3 text-amber-500" /> Promote to Production (Approval Required)
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void requestPromote(activeStaging.id, activeStaging.targetSlug, 'production')}
                            disabled={releaseReadiness.status !== 'READY' || promoting || guardrailsBlocked}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center gap-1 text-xs"
                          >
                            <ArrowRight className="h-3 w-3" /> Request Production Promotion
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 py-6 text-center">No active release deployed to staging yet.</p>
                    )}

                    {prevStaging.length > 0 && (
                      <div className="pt-4 border-t border-slate-200 space-y-2">
                        <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <RotateCcw className="h-3 w-3 text-slate-500" /> Rollback Staging (Requires Approval)
                        </h4>
                        <div className="flex flex-col gap-2">
                          <select
                            className="w-full text-xs rounded border border-slate-300 bg-white p-2 text-slate-700"
                            onChange={(e) => setSelectedRollbackReleaseId(e.target.value)}
                            value={selectedRollbackReleaseId}
                          >
                            <option value="">Select a previous release to roll back to...</option>
                            {prevStaging.map(r => (
                              <option key={r.id} value={r.id}>
                                v{r.releaseVersion} - {r.imageUri.substring(r.imageUri.lastIndexOf('/') + 1)} ({new Date(r.createdAt).toLocaleDateString()})
                              </option>
                            ))}
                          </select>

                          {selectedRollbackReleaseId && prevStaging.some(r => r.id === selectedRollbackReleaseId) && (
                            <div className="bg-slate-100 p-2 rounded space-y-2">
                              <p className="text-[10px] text-amber-800 font-medium">
                                Warning: This will create an approval-gated rollback operation.
                              </p>
                              <input
                                type="text"
                                placeholder="Type 'ROLLBACK' to confirm"
                                className="w-full text-xs p-1.5 border border-slate-300 rounded font-mono"
                                value={rollbackConfirmText}
                                onChange={(e) => setRollbackConfirmText(e.target.value)}
                              />
                              <Button
                                type="button"
                                size="sm"
                                disabled={rollbackConfirmText !== 'ROLLBACK' || rollingBack || releaseReadiness.status !== 'READY' || guardrailsBlocked}
                                onClick={() => void requestRollback(selectedRollbackReleaseId)}
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded text-xs"
                              >
                                Confirm Staging Rollback
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* PRODUCTION ENVIRONMENT CARD */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Production Environment</h3>
                {releases.find(r => r.environmentSlug === 'production' && r.status === AwsReleaseStatus.ACTIVE) ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                    ACTIVE RELEASE: v{releases.find(r => r.environmentSlug === 'production' && r.status === AwsReleaseStatus.ACTIVE)?.releaseVersion}
                  </span>
                ) : (
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">
                    NO ACTIVE RELEASE
                  </span>
                )}
              </div>

              {(() => {
                const activeProduction = releases.find(r => r.environmentSlug === 'production' && r.status === AwsReleaseStatus.ACTIVE);
                const prevProduction = releases.filter(r => r.environmentSlug === 'production' && r.status !== AwsReleaseStatus.ACTIVE);

                return (
                  <>
                    {activeProduction ? (
                      <div className="space-y-3 text-xs text-slate-600">
                        <div>
                          <span className="font-semibold block text-slate-700">Image URI:</span>
                          <span className="font-mono break-all">{activeProduction.imageUri}</span>
                        </div>
                        {activeProduction.imageDigest && (
                          <div>
                            <span className="font-semibold block text-slate-700">Image Digest:</span>
                            <span className="font-mono break-all">{activeProduction.imageDigest}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <span className="font-semibold block text-slate-700">Created:</span>
                            <span>{new Date(activeProduction.createdAt).toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="font-semibold block text-slate-700">Deployer:</span>
                            <span className="font-mono text-[10px]">{activeProduction.createdByUserId || 'System'}</span>
                          </div>
                        </div>
                        {activeProduction.approvedByUserId && (
                          <div>
                            <span className="font-semibold block text-slate-700">Approved By:</span>
                            <span className="font-mono text-[10px]">{activeProduction.approvedByUserId}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 py-6 text-center">No active release deployed to production yet.</p>
                    )}

                    {prevProduction.length > 0 && (
                      <div className="pt-4 border-t border-slate-200 space-y-2">
                        <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <RotateCcw className="h-3 w-3 text-slate-500" /> Rollback Production (Requires Approval)
                        </h4>
                        <div className="flex flex-col gap-2">
                          <select
                            className="w-full text-xs rounded border border-slate-300 bg-white p-2 text-slate-700"
                            onChange={(e) => setSelectedRollbackReleaseId(e.target.value)}
                            value={selectedRollbackReleaseId}
                          >
                            <option value="">Select a previous release to roll back to...</option>
                            {prevProduction.map(r => (
                              <option key={r.id} value={r.id}>
                                v{r.releaseVersion} - {r.imageUri.substring(r.imageUri.lastIndexOf('/') + 1)} ({new Date(r.createdAt).toLocaleDateString()})
                              </option>
                            ))}
                          </select>

                          {selectedRollbackReleaseId && prevProduction.some(r => r.id === selectedRollbackReleaseId) && (
                            <div className="bg-slate-100 p-2 rounded space-y-2">
                              <p className="text-[10px] text-amber-800 font-medium">
                                Warning: This will create an approval-gated rollback operation.
                              </p>
                              <input
                                type="text"
                                placeholder="Type 'ROLLBACK' to confirm"
                                className="w-full text-xs p-1.5 border border-slate-300 rounded font-mono"
                                value={rollbackConfirmText}
                                onChange={(e) => setRollbackConfirmText(e.target.value)}
                              />
                              <Button
                                type="button"
                                size="sm"
                                disabled={rollbackConfirmText !== 'ROLLBACK' || rollingBack || releaseReadiness.status !== 'READY' || guardrailsBlocked}
                                onClick={() => void requestRollback(selectedRollbackReleaseId)}
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded text-xs"
                              >
                                Confirm Production Rollback
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* RELEASE TIMELINE LOG */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-950 flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-indigo-500" /> Governing Release Timeline Log
            </h3>
            {releases.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No releases recorded yet. Only successful apply operations or promotions write release history.</p>
            ) : (
              <div className="relative border-l border-slate-200 ml-3 pl-6 space-y-6">
                {releases.map((release) => {
                  let badgeColor = 'bg-slate-100 text-slate-800';
                  if (release.status === AwsReleaseStatus.ACTIVE) badgeColor = 'bg-emerald-100 text-emerald-800';
                  if (release.status === AwsReleaseStatus.ROLLED_BACK) badgeColor = 'bg-amber-100 text-amber-800';
                  if (release.status === AwsReleaseStatus.FAILED) badgeColor = 'bg-red-100 text-red-800';

                  return (
                    <div key={release.id} className="relative">
                      {/* Timeline dot */}
                      <span className={`absolute -left-[30px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-white ${release.status === AwsReleaseStatus.ACTIVE ? 'bg-emerald-500' : 'bg-slate-400'}`} />

                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 text-sm">
                            Release v{release.releaseVersion} ({release.targetSlug})
                          </span>
                          <div className="flex gap-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeColor}`}>
                              {release.status}
                            </span>
                            <span className="bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5 text-[10px] uppercase font-semibold">
                              {release.environmentSlug}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 font-mono text-[10px] text-slate-500">
                          <div className="break-all">Image: {release.imageUri}</div>
                          {release.imageDigest && <div className="break-all">Digest: {release.imageDigest}</div>}
                          {release.promotedFromReleaseId && (
                            <div className="text-indigo-600 font-medium">Promoted from release ID: {release.promotedFromReleaseId}</div>
                          )}
                          {release.rolledBackFromReleaseId && (
                            <div className="text-amber-600 font-medium">Rolled back from release ID: {release.rolledBackFromReleaseId}</div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-200/50 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 justify-between items-center">
                          <div className="flex gap-2">
                            {release.planOperationId && (
                              <Link href={`/dashboard/operations/${release.planOperationId}`} className="underline text-indigo-600 hover:text-indigo-800">
                                Plan Evidence
                              </Link>
                            )}
                            <Link href={`/dashboard/operations/${release.applyOperationId}`} className="underline text-indigo-600 hover:text-indigo-800">
                              Apply Evidence
                            </Link>
                          </div>
                          <div className="flex gap-2 items-center">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(release.createdAt).toLocaleString()}</span>
                            <span>| Created by: {release.createdByUserId || 'System'}</span>
                            {release.approvedByUserId && <span>| Approved by: {release.approvedByUserId}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Recent ECR Image Operations</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Image</th>
                <th className="px-4 py-2 font-medium">Environment</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ecrImages.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No tenant-scoped ECR image operations yet.</td></tr>
              )}
              {ecrImages.map((image) => (
                <tr key={image.operationId}>
                  <td className="px-4 py-3 font-medium text-slate-900">{image.action}</td>
                  <td className="px-4 py-3 font-mono text-xs">{image.repositoryName}:{image.imageTag}</td>
                  <td className="px-4 py-3">{image.environmentSlug}</td>
                  <td className="px-4 py-3">{image.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/operations/${image.operationId}`}>Details</Link>
                      </Button>
                      {image.action === 'build' && image.status === 'SUCCEEDED' && (
                        <Button type="button" size="sm" onClick={() => void requestEcrPush(image)}>
                          Push
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
