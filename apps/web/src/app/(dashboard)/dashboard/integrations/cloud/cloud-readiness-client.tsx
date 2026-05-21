'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CloudProviderReadiness, CloudReadinessStatusResponse } from '@autoops/types';
import { ArrowLeft, Cloud, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type CloudResponse = { data: CloudReadinessStatusResponse };

function tone(status: string) {
  if (status === 'CONNECTED') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'NOT_CONFIGURED' || status === 'NOT_IMPLEMENTED') return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-rose-300 bg-rose-50 text-rose-700';
}

export function CloudReadinessClient() {
  const [providers, setProviders] = useState<CloudProviderReadiness[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get<CloudResponse>('/v1/integrations/cloud/status');
      setProviders(response.data.providers);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50 text-slate-700">
        <Link href="/dashboard/operations"><ArrowLeft className="h-4 w-4" /> Back to Ops Hub</Link>
      </Button>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-950"><Cloud className="h-6 w-6" /> Cloud Provider Readiness</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Read-only cloud readiness posture for AWS, Azure, and GCP. Direct cloud mutations are intentionally not implemented.</p>
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        </div>
      </section>
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <div className="flex gap-3"><ShieldCheck className="h-4 w-4 shrink-0" /> Cloud writes should flow through approval-gated Terraform/OpenTofu workspaces after credential-broker hardening.</div>
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        {providers.map((provider) => (
          <section key={provider.provider} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone(provider.status)}`}>{provider.status}</span>
            <h2 className="mt-3 text-lg font-semibold text-slate-950">{provider.displayName}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{provider.message}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="text-xs uppercase text-slate-500">Account</dt><dd className="text-slate-900">{provider.accountSummary ?? '-'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Region</dt><dd className="text-slate-900">{provider.region ?? '-'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Write model</dt><dd className="text-slate-700">{provider.writeModel}</dd></div>
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
