'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AwsStatus, AwsDeploymentSummary, AwsListResponse } from '@autoops/types';
import { ArrowLeft, Cloud, RefreshCw, Play, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function AwsDeploymentClient() {
  const [identity, setIdentity] = useState<AwsStatus | null>(null);
  const [deployments, setDeployments] = useState<AwsDeploymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [idRes, depRes] = await Promise.all([
        api.get<{ data: AwsStatus }>('/v1/integrations/aws/identity'),
        api.get<{ data: AwsListResponse<AwsDeploymentSummary> }>('/v1/integrations/aws/deployments'),
      ]);
      setIdentity(idRes.data);
      setDeployments(depRes.data.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handlePlan(slug: string) {
    if (!window.confirm('Trigger AWS Terraform Plan?')) return;
    setSubmitting(slug + '-plan');
    try {
      await api.post(`/v1/integrations/aws/deployments/${slug}/plan`, { confirmationToken: 'PLAN' });
      window.alert('Plan queued');
      await load();
    } catch (e: any) {
      window.alert(e.message || 'Failed to trigger plan');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleApply(slug: string) {
    if (!window.confirm('Trigger AWS Terraform Apply? This requires approval.')) return;
    setSubmitting(slug + '-apply');
    try {
      await api.post(`/v1/integrations/aws/deployments/${slug}/apply`, { confirmationToken: 'APPLY' });
      window.alert('Apply submitted for approval');
      await load();
    } catch (e: any) {
      window.alert(e.message || 'Failed to trigger apply');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50 text-slate-700">
        <Link href="/dashboard/operations"><ArrowLeft className="h-4 w-4" /> Back to Ops Hub</Link>
      </Button>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-950"><Cloud className="h-6 w-6" /> AWS Deployments</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Governed AWS ECS Fargate deployment workflows.</p>
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        </div>
      </section>

      {identity && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">AWS Identity</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-slate-500">Status</p>
              <p className="text-sm font-medium">{identity.status}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Account ID</p>
              <p className="text-sm">{identity.accountId || '-'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Region</p>
              <p className="text-sm">{identity.region || '-'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Message</p>
              <p className="text-sm text-slate-600">{identity.message}</p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {deployments.map((dep) => (
          <section key={dep.workspaceSlug} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-md font-semibold text-slate-900">{dep.workspaceSlug}</h3>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-slate-600">Status: {dep.status}</span>
              <span className="text-sm text-slate-500">Last operation: {dep.lastOperationType || 'None'}</span>
            </div>
            <div className="mt-6 flex gap-3">
              <Button onClick={() => handlePlan(dep.workspaceSlug)} disabled={submitting !== null} className="flex-1 bg-slate-100 text-slate-900 hover:bg-slate-200">
                <Play className="mr-2 h-4 w-4" /> Plan
              </Button>
              <Button onClick={() => handleApply(dep.workspaceSlug)} disabled={submitting !== null} className="flex-1 bg-blue-600 text-white hover:bg-blue-700">
                <Save className="mr-2 h-4 w-4" /> Apply
              </Button>
            </div>
          </section>
        ))}
        {deployments.length === 0 && !loading && (
          <div className="col-span-full rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No AWS deployment targets found. Make sure AWS_ALLOWED_DEPLOYMENT_WORKSPACES is configured.
          </div>
        )}
      </div>
    </div>
  );
}
