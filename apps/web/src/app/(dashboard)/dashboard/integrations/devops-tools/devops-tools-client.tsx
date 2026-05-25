'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DevOpsToolsStatusResponse } from '@autoops/types';
import { ArrowLeft, RefreshCw, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type Response = { data: DevOpsToolsStatusResponse };

function tone(status: string) {
  if (status === 'BLOCKED_BY_ORG_POLICY') return 'border-amber-300 bg-amber-50 text-amber-800';
  return status === 'CONNECTED' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-800';
}

export function DevOpsToolsClient() {
  const [data, setData] = useState<DevOpsToolsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get<Response>('/v1/integrations/devops-tools/status');
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
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-950"><Wrench className="h-6 w-6" /> DevOps Tools Readiness</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Runtime detection for CLI tools used by local DevOps workflows. Validation is read-only and does not apply cluster or cloud changes.</p>
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        </div>
      </section>
      {data?.status === 'BLOCKED_BY_ORG_POLICY' ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="text-base font-semibold text-slate-900">Provider access is disabled for this organization</h2>
          <p className="mt-2 leading-6">
            {data.message ?? 'This workspace cannot view shared runtime tool readiness until provider access is enabled for this organization.'}
          </p>
          {data.remediation?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {data.remediation.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>{['Tool', 'Status', 'Version', 'Safe Actions'].map((h) => <th className="border-b bg-slate-50 px-3 py-3" key={h}>{h}</th>)}</tr></thead>
            <tbody>{(data?.tools ?? []).map((tool) => (
              <tr key={tool.key}><td className="border-b px-3 py-3 font-medium">{tool.displayName}</td><td className="border-b px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone(tool.status)}`}>{tool.status}</span></td><td className="border-b px-3 py-3 font-mono text-xs">{tool.version ?? '-'}</td><td className="border-b px-3 py-3 text-slate-600">{tool.safeActions.join(', ')}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
