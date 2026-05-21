'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ObservabilityIntegrationStatusResponse } from '@autoops/types';
import { Activity, ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type Response = { data: ObservabilityIntegrationStatusResponse };

function tone(status?: string) {
  if (status === 'CONNECTED') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'AUTH_REQUIRED' || status === 'NOT_CONFIGURED') return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-rose-300 bg-rose-50 text-rose-700';
}

export function ObservabilityIntegrationClient() {
  const [data, setData] = useState<ObservabilityIntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get<Response>('/v1/integrations/observability/status');
      setData(response.data);
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
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-950"><Activity className="h-6 w-6" /> Observability Integrations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Readiness checks for Prometheus and Grafana using real local endpoints. No fake metrics are generated.</p>
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone(data?.prometheus.status)}`}>{data?.prometheus.status ?? 'UNKNOWN'}</span>
          <h2 className="mt-3 text-lg font-semibold text-slate-950">Prometheus</h2>
          <p className="mt-2 text-sm text-slate-600">{data?.prometheus.message ?? 'Loading...'}</p>
          <p className="mt-3 text-sm text-slate-700">Targets: {data?.prometheus.targets?.healthy ?? 0}/{data?.prometheus.targets?.active ?? 0} healthy</p>
          <p className="text-sm text-slate-700">Query `up`: {data?.prometheus.query?.resultCount ?? 0} results</p>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone(data?.grafana.status)}`}>{data?.grafana.status ?? 'UNKNOWN'}</span>
          <h2 className="mt-3 text-lg font-semibold text-slate-950">Grafana</h2>
          <p className="mt-2 text-sm text-slate-600">{data?.grafana.message ?? 'Loading...'}</p>
          <p className="mt-3 text-sm text-slate-700">Version: {data?.grafana.version ?? '-'}</p>
          {data?.grafana.publicUrl ? <a className="mt-2 inline-block text-sm font-medium text-blue-700" href={data.grafana.publicUrl} target="_blank">Open Grafana</a> : null}
        </section>
      </div>
    </div>
  );
}
