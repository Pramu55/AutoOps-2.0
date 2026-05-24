'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  AwsIdentityResponse,
  AwsReadinessResponse,
  AwsPermissionsResponse,
  AwsRemoteStateReadinessResponse,
  AwsWorkspaceReadinessResponse,
  AwsDeploymentTarget,
  AwsListResponse,
  AwsEcrReadinessResponse,
  AwsEcrRepository,
  AwsEcrImageMetadata,
} from '@autoops/types';
import { ArrowLeft, Cloud, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function AwsDeploymentClient() {
  const [identity, setIdentity] = useState<AwsIdentityResponse | null>(null);
  const [readiness, setReadiness] = useState<AwsReadinessResponse | null>(null);
  const [permissions, setPermissions] = useState<AwsPermissionsResponse | null>(null);
  const [remoteState, setRemoteState] = useState<AwsRemoteStateReadinessResponse | null>(null);
  const [workspaceRes, setWorkspaceRes] = useState<AwsWorkspaceReadinessResponse | null>(null);
  const [ecrReadiness, setEcrReadiness] = useState<AwsEcrReadinessResponse | null>(null);
  const [ecrRepositories, setEcrRepositories] = useState<AwsEcrRepository[]>([]);
  const [ecrImages, setEcrImages] = useState<AwsEcrImageMetadata[]>([]);
  const [ecrMessage, setEcrMessage] = useState<string | null>(null);
  const [inventoryDenied, setInventoryDenied] = useState(false);
  // targets unused right now but we use it via items[0] for readiness
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [idRes, readRes, permRes, rsRes, tRes, ecrReadyRes, ecrRepoRes, ecrImagesRes] = await Promise.all([
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
      ]);
      setIdentity(idRes?.data ?? null);
      setReadiness(readRes?.data ?? null);
      setPermissions(permRes?.data ?? null);
      setRemoteState(rsRes?.data ?? null);
      setEcrReadiness(ecrReadyRes?.data ?? null);
      setEcrRepositories(ecrRepoRes?.data?.items ?? []);
      setEcrImages(ecrImagesRes?.data?.items ?? []);
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

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'PASS' || status === 'READY' || status === 'CONNECTED') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (status === 'ERROR' || status === 'FAIL' || status === 'AUTH_FAILED') return <XCircle className="h-4 w-4 text-red-500" />;
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50 text-slate-700">
        <Link href="/dashboard/operations"><ArrowLeft className="h-4 w-4" /> Back to Ops Hub</Link>
      </Button>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-950"><Cloud className="h-6 w-6" /> AWS Diagnostics</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">AWS Day 1 Deployment Foundation Readiness Checklist</p>
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        </div>
      </section>

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
          You do not have access to AWS provider inventory. Contact an organization admin.
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
