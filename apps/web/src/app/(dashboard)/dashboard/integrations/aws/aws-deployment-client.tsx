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
  // targets unused right now but we use it via items[0] for readiness
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [idRes, readRes, permRes, rsRes, tRes] = await Promise.all([
        api.get<{ data: AwsIdentityResponse }>('/v1/integrations/aws/identity').catch(() => null),
        api.get<{ data: AwsReadinessResponse }>('/v1/integrations/aws/readiness').catch(() => null),
        api.get<{ data: AwsPermissionsResponse }>('/v1/integrations/aws/permissions').catch(() => null),
        api.get<{ data: AwsRemoteStateReadinessResponse }>('/v1/integrations/aws/remote-state').catch(() => null),
        api.get<{ data: AwsListResponse<AwsDeploymentTarget> }>('/v1/integrations/aws/deployment-targets').catch(() => null),
      ]);
      setIdentity(idRes?.data ?? null);
      setReadiness(readRes?.data ?? null);
      setPermissions(permRes?.data ?? null);
      setRemoteState(rsRes?.data ?? null);
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
    </div>
  );
}
