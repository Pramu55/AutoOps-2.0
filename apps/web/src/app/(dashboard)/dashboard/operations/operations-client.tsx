'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { OperationActivityItem, OperationActivityResponse, OpsObservabilityResponse } from '@autoops/types';
import { Activity, ShieldCheck, RefreshCw } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/layout/empty-state';

type OperationActivityApiResponse = { data: OperationActivityResponse };
type OpsObservabilityApiResponse = { data: OpsObservabilityResponse };

const POLL_INTERVAL_MS = 15_000;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') return 'Session expired. Please sign in again.';
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load operations data.';
}

export function OperationsClient() {
  const [activityItems, setActivityItems] = useState<OperationActivityItem[]>([]);
  const [observability, setObservability] = useState<OpsObservabilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadSummary = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const [activityRes, observabilityRes] = await Promise.allSettled([
        api.get<OperationActivityApiResponse>('/v1/ops/activity?limit=50'),
        api.get<OpsObservabilityApiResponse>('/v1/ops/observability'),
      ]);

      if (activityRes.status === 'fulfilled') setActivityItems(activityRes.value.data.items);
      if (observabilityRes.status === 'fulfilled') setObservability(observabilityRes.value.data);

      setLastUpdated(new Date());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary('initial');
    const intervalId = window.setInterval(() => void loadSummary(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadSummary]);

  const activeOps = useMemo(() => activityItems.filter(op => ['QUEUED', 'BUILDING', 'RUNNING'].includes(op.status)), [activityItems]);
  const failedOps = useMemo(() => activityItems.filter(op => op.status === 'FAILED'), [activityItems]);
  const pendingOps = useMemo(() => activityItems.filter(op => op.status === 'PENDING_APPROVAL'), [activityItems]);
  const recentOps = useMemo(() => activityItems.filter(op => !['QUEUED', 'BUILDING', 'RUNNING', 'FAILED', 'PENDING_APPROVAL'].includes(op.status)).slice(0, 5), [activityItems]);
  
  const providers = observability?.providers;

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Operations Workspace"
        purpose="Controlled, audited actions across providers."
        icon={<Activity className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Command', href: '/dashboard' }, { label: 'Operations' }]}
        statusSummary={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSummary()}
              disabled={isLoading || isRefreshing}
              className="bg-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="rounded border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-900">
              <span className="font-semibold text-blue-950">Safety notice: </span>
              Controlled operations are audited and may require confirmation or approval.
            </div>

            <WorkQueue
              title="Active & Pending Operations"
              description="Operations that are currently running, failed, or require approval."
              isEmpty={activeOps.length === 0 && failedOps.length === 0 && pendingOps.length === 0}
              emptyState={<EmptyState title="No active operations" description="There are no operations currently in progress or waiting." icon={<ShieldCheck />} variant="compact" />}
            >
              {[...failedOps, ...pendingOps, ...activeOps].map(op => (
                <div key={op.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={op.status} />
                      <span className="text-xs font-medium text-slate-500 capitalize">{op.source}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{op.title}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/operations/${op.id}`}>View Record</Link>
                  </Button>
                </div>
              ))}
            </WorkQueue>

            <WorkQueue
              title="Recent Activity"
              description="Recently completed or archived operations."
              isEmpty={recentOps.length === 0}
              emptyState={<EmptyState title="No recent activity" description="Operation history will appear here." variant="compact" />}
            >
               {recentOps.map(op => (
                <div key={op.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={op.status} />
                      <span className="text-xs font-medium text-slate-500 capitalize">{op.source}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{op.title}</p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/dashboard/operations/${op.id}`}>Details</Link>
                  </Button>
                </div>
              ))}
            </WorkQueue>
          </div>

          <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-4 sm:p-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Governance</h2>
                  <p className="mt-1 text-sm text-slate-500">Approvals & Audit.</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/governance">Governance Hub</Link>
                </Button>
              </div>
              <div className="p-4 flex flex-col gap-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Pending Approvals</span>
                  <span className="font-semibold text-slate-900">{pendingOps.length}</span>
                </div>
                <div className="flex items-center justify-between">
                   <span>Failed Operations</span>
                   <span className="font-semibold text-rose-600">{failedOps.length}</span>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-4 sm:p-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Provider Snapshot</h2>
                  <p className="mt-1 text-sm text-slate-500">Compact provider health.</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/integrations">Integrations</Link>
                </Button>
              </div>
              <div className="divide-y divide-slate-100">
                {providers ? Object.entries(providers).map(([key, p]) => (
                  <div key={key} className="p-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 capitalize">{key}</span>
                    <StatusBadge status={p.status} />
                  </div>
                )) : (
                  <div className="p-4 text-sm text-slate-500 text-center">No providers loaded.</div>
                )}
              </div>
            </section>

          </div>
        </div>

      </div>
    </div>
  );
}
