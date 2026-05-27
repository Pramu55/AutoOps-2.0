'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import type { Deployment, Project, IncidentSummary, OperationActivityItem, OpsObservabilityResponse, SignalReadinessResponse } from '@autoops/types';
import {
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { WorkQueue } from '@/components/layout/work-queue';
import { ContextPanel } from '@/components/layout/context-panel';
import { EmptyState } from '@/components/layout/empty-state';

type ProjectsResponse = { data: Project[] };
type DeploymentsResponse = { data: Deployment[] };
type IncidentListResponse = { data: IncidentSummary[] };
type OperationActivityApiResponse = { data: { items: OperationActivityItem[] } };
type OpsObservabilityApiResponse = { data: OpsObservabilityResponse };
type SignalReadinessApiResponse = { data: SignalReadinessResponse };

const POLL_INTERVAL_MS = 15_000;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load dashboard data.';
}

export function DashboardOverviewClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [operations, setOperations] = useState<OperationActivityItem[]>([]);
  const [observability, setObservability] = useState<OpsObservabilityResponse | null>(null);
  const [signals, setSignals] = useState<SignalReadinessResponse | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOverview = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const [
        projectsRes,
        deploymentsRes,
        incidentsRes,
        operationsRes,
        observabilityRes,
        signalsRes
      ] = await Promise.allSettled([
        api.get<ProjectsResponse>('/v1/projects'),
        api.get<DeploymentsResponse>('/v1/deployments'),
        api.get<IncidentListResponse>('/v1/incidents?limit=5'),
        api.get<OperationActivityApiResponse>('/v1/ops/activity?limit=5'),
        api.get<OpsObservabilityApiResponse>('/v1/ops/observability'),
        api.get<SignalReadinessApiResponse>('/v1/signals/readiness')
      ]);

      if (projectsRes.status === 'fulfilled') setProjects(projectsRes.value.data);
      if (deploymentsRes.status === 'fulfilled') setDeployments(deploymentsRes.value.data);
      if (incidentsRes.status === 'fulfilled') setIncidents(incidentsRes.value.data);
      if (operationsRes.status === 'fulfilled') setOperations(operationsRes.value.data.items);
      if (observabilityRes.status === 'fulfilled') setObservability(observabilityRes.value.data);
      if (signalsRes.status === 'fulfilled') setSignals(signalsRes.value.data);

      setLastUpdated(new Date());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview('initial');
    const intervalId = window.setInterval(() => void loadOverview(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadOverview]);

  const activeIncidents = useMemo(() => incidents.filter(i => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED'), [incidents]);
  const failedOps = useMemo(() => operations.filter(o => o.status === 'FAILED'), [operations]);
  const pendingOps = useMemo(() => operations.filter(o => o.status === 'PENDING_APPROVAL'), [operations]);
  const activeDeployments = useMemo(() => deployments.filter(d => ['QUEUED', 'BUILDING', 'DEPLOYING'].includes(d.status)), [deployments]);
  const failedDeployments = useMemo(() => deployments.filter(d => d.status === 'FAILED'), [deployments]);
  
  const providers = observability?.providers;
  const anyProviderUnreachable = providers && Object.values(providers).some(p => p.status === 'UNREACHABLE' || p.status === 'OFFLINE');

  // Next Best Actions
  const nextActions = [];
  if (activeIncidents.length > 0) {
    nextActions.push(<Link key="inc" href="/dashboard/incidents" className="hover:underline">Acknowledge or resolve {activeIncidents.length} active incidents.</Link>);
  } else if ((signals?.activeSignals ?? 0) > 0) {
    nextActions.push(<Link key="sig" href="/dashboard/signals" className="hover:underline">Run correlation to group related signals into incidents.</Link>);
  } else {
    nextActions.push(<span key="no-inc">No active incidents. Review signals or provider health.</span>);
  }

  if (pendingOps.length > 0) {
    nextActions.push(<Link key="pend" href="/dashboard/operations" className="hover:underline">Review {pendingOps.length} pending operation approvals.</Link>);
  }
  
  if (anyProviderUnreachable) {
    nextActions.push(<Link key="prov" href="/dashboard/integrations" className="hover:underline">Check whether the provider service or container is running.</Link>);
  }

  if (deployments.length === 0) {
    nextActions.push(<Link key="dep" href="/dashboard/projects" className="hover:underline">Create or select a project and environment before triggering deployments.</Link>);
  }

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Command Workspace"
        purpose="Your operational command center."
        icon={<Server className="h-5 w-5" />}
        statusSummary={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadOverview()}
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
            {/* Needs Attention */}
            <WorkQueue
              title="Needs Attention"
              description="Critical items blocking operational health."
              isEmpty={activeIncidents.length === 0 && failedOps.length === 0 && pendingOps.length === 0 && failedDeployments.length === 0}
              emptyState={<EmptyState title="All clear" description="No critical issues require immediate attention." icon={<ShieldCheck />} variant="compact" />}
            >
              {activeIncidents.map(inc => (
                <div key={inc.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={inc.status} />
                      <StatusBadge status={inc.severity} />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{inc.title}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/incidents/${inc.id}`}>Triage</Link>
                  </Button>
                </div>
              ))}
              {failedOps.map(op => (
                <div key={op.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={op.status} />
                      <span className="text-xs font-medium text-slate-500">Operation</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{op.title}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/operations/${op.id}`}>Review</Link>
                  </Button>
                </div>
              ))}
              {pendingOps.map(op => (
                <div key={op.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={op.status} />
                      <span className="text-xs font-medium text-slate-500">Approval Required</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{op.title}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/operations/${op.id}`}>Approve</Link>
                  </Button>
                </div>
              ))}
              {failedDeployments.map(dep => (
                <div key={dep.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={dep.status} />
                      <span className="text-xs font-medium text-slate-500">Deployment</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">Deployment {dep.id.slice(0, 8)} failed</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/deployments/${dep.id}`}>Review</Link>
                  </Button>
                </div>
              ))}
            </WorkQueue>

            {/* Delivery Snapshot */}
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-4 sm:p-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Delivery Snapshot</h2>
                  <p className="mt-1 text-sm text-slate-500">Recent projects and deployment activity.</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/deployments">View All</Link>
                </Button>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/50">
                <div className="p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Projects</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{projects.length}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Deployments</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{deployments.length}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">In Flight</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{activeDeployments.length}</p>
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <ContextPanel actions={nextActions} />

            {/* Provider Health Snapshot */}
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-4 sm:p-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Provider Health</h2>
                  <p className="mt-1 text-sm text-slate-500">Snapshot of connected systems.</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/integrations">Manage</Link>
                </Button>
              </div>
              <div className="divide-y divide-slate-100">
                {providers ? Object.entries(providers).map(([key, p]) => (
                  <div key={key} className="p-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 capitalize">{key}</span>
                    <StatusBadge status={p.status} />
                  </div>
                )) : (
                  <div className="p-4 text-sm text-slate-500 text-center">No providers loaded.</div>
                )}
              </div>
            </section>

            {/* Signals Snapshot */}
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-4 sm:p-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Observations</h2>
                  <p className="mt-1 text-sm text-slate-500">Critical/Error signals.</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/signals">View Signals</Link>
                </Button>
              </div>
              <div className="p-4 flex flex-col gap-3">
                 <div className="flex items-center justify-between">
                   <span className="text-sm text-slate-600">Active Signals</span>
                   <span className="font-semibold text-slate-900">{signals?.activeSignals ?? 0}</span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-sm text-slate-600">Critical</span>
                   <span className="font-semibold text-rose-600">{signals?.criticalCount ?? 0}</span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-sm text-slate-600">Errors</span>
                   <span className="font-semibold text-rose-600">{signals?.errorCount ?? 0}</span>
                 </div>
              </div>
            </section>

          </div>
        </div>

      </div>
    </div>
  );
}
