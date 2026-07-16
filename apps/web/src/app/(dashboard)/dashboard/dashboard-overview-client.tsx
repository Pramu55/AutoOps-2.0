'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  Deployment,
  Environment,
  Project,
  OpsObservabilityResponse,
  OperationActivityItem,
  OperationActivityResponse,
  SignalReadinessResponse,
  IncidentSummary,
  IncidentListResponse
} from '@autoops/types';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  GitMerge,
  Network,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Zap
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load dashboard data.';
}

function formatTime(value: Date | string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

const POLL_INTERVAL_MS = 60_000;

export function DashboardOverviewClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  const [observability, setObservability] = useState<OpsObservabilityResponse | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<OperationActivityItem[]>([]);
  const [recentOperations, setRecentOperations] = useState<OperationActivityItem[]>([]);
  const [signalReadiness, setSignalReadiness] = useState<SignalReadinessResponse | null>(null);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const [
        projectsRes,
        deploymentsRes,
        obsRes,
        pendingOpsRes,
        recentOpsRes,
        signalsRes,
        openIncidentsRes,
        ackIncidentsRes
      ] = await Promise.all([
        api.get<{ data: Project[] }>('/v1/projects'),
        api.get<{ data: Deployment[] }>('/v1/deployments'),
        api.get<{ data: OpsObservabilityResponse }>('/v1/ops/observability'),
        api.get<{ data: OperationActivityResponse }>('/v1/ops/activity?status=PENDING_APPROVAL&limit=5'),
        api.get<{ data: OperationActivityResponse }>('/v1/ops/activity?limit=5'),
        api.get<{ data: SignalReadinessResponse }>('/v1/signals/readiness'),
        api.get<IncidentListResponse>('/v1/incidents?status=OPEN&limit=5').catch(() => ({ data: [] as IncidentSummary[] })),
        api.get<IncidentListResponse>('/v1/incidents?status=ACKNOWLEDGED&limit=5').catch(() => ({ data: [] as IncidentSummary[] })),
      ]);

      setProjects(projectsRes.data);
      setDeployments(deploymentsRes.data);
      setObservability(obsRes.data);
      setPendingApprovals(pendingOpsRes.data.items || []);
      setRecentOperations(recentOpsRes.data.items || []);
      setSignalReadiness(signalsRes.data);

      const openIncidents = (openIncidentsRes.data || []) as IncidentSummary[];
      const ackIncidents = (ackIncidentsRes.data || []) as IncidentSummary[];

      const allActiveIncidents: IncidentSummary[] = [
        ...openIncidents,
        ...ackIncidents,
      ];

      allActiveIncidents.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setIncidents(allActiveIncidents.slice(0, 5));

      const visibleProjects = projectsRes.data.slice(0, 12);
      const environmentResults = await Promise.allSettled(
        visibleProjects.map((project) => api.get<{ data: Environment[] }>(`/v1/projects/${project.id}/environments`)),
      );
      const loadedEnvironments = environmentResults.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.data : [],
      );
      setEnvironments(loadedEnvironments);

      setLastUpdated(new Date());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview('initial');
  }, [loadOverview]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadOverview('refresh');
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadOverview]);

  const needsAttentionItems = useMemo(() => {
    const items: Array<{ title: string; description: string; href: string; tone: string }> = [];

    if (incidents.length > 0) {
      items.push({
        title: `${incidents.length} active incident${incidents.length === 1 ? '' : 's'}`,
        description: 'Open or acknowledged incidents require your attention.',
        href: '/dashboard/incidents',
        tone: 'rose',
      });
    }

    if (pendingApprovals.length > 0) {
      items.push({
        title: `${pendingApprovals.length} pending approval${pendingApprovals.length === 1 ? '' : 's'}`,
        description: 'Operations are blocked waiting for review.',
        href: '/dashboard/operations#approvals',
        tone: 'amber',
      });
    }

    const failedOps = recentOperations.filter(op => op.status === 'FAILED');
    if (failedOps.length > 0) {
      items.push({
        title: `${failedOps.length} recent failed operation${failedOps.length === 1 ? '' : 's'}`,
        description: 'Operations have failed and may require recovery.',
        href: '/dashboard/operations',
        tone: 'rose',
      });
    }

    const criticalSignals = signalReadiness?.criticalCount ?? 0;
    const errorSignals = signalReadiness?.errorCount ?? 0;
    if (criticalSignals > 0 || errorSignals > 0) {
      items.push({
        title: `${criticalSignals + errorSignals} critical/error signals`,
        description: 'Infrastructure signals indicate severe problems.',
        href: '/dashboard/signals',
        tone: 'rose',
      });
    }

    if (observability?.platform.api.status === 'OFFLINE') {
      items.push({
        title: 'Platform API Offline',
        description: 'Core API is unreachable. Operations may be impacted.',
        href: '/dashboard/operations#runtime-health',
        tone: 'rose',
      });
    }

    const providers = observability?.providers || {};
    type ProviderHealthLike = {
      status?: string;
    };

    const hasUnhealthyProviders = Object.values(providers).some((provider) => {
      const providerHealth = provider as ProviderHealthLike;
      return providerHealth.status === 'UNAVAILABLE' || providerHealth.status === 'DEGRADED';
    });
    if (hasUnhealthyProviders) {
      items.push({
        title: 'Provider Health Issues',
        description: 'One or more connected providers are unreachable or failing auth.',
        href: '/dashboard/integrations',
        tone: 'rose',
      });
    }

    return items;
  }, [incidents.length, pendingApprovals.length, recentOperations, signalReadiness, observability]);

  const nextBestActions = useMemo(() => {
    const actions: Array<{ title: string; description: string; href: string; icon: React.ElementType }> = [];

    if (incidents.length === 0 && pendingApprovals.length === 0 && (signalReadiness?.activeSignals ?? 0) === 0) {
      actions.push({
        title: 'Review Provider Health',
        description: 'Check connected providers to ensure readiness.',
        href: '/dashboard/integrations',
        icon: Network,
      });
      actions.push({
        title: 'Review Delivery Activity',
        description: 'View recent deployments and projects.',
        href: '/dashboard/deployments',
        icon: Activity,
      });
    }

    if (incidents.length === 0 && (signalReadiness?.activeSignals ?? 0) > 0) {
      actions.push({
        title: 'Run Correlation',
        description: 'Signals exist. Open Incidents to run correlation.',
        href: '/dashboard/incidents',
        icon: Zap,
      });
    }

    if (pendingApprovals.length > 0) {
      actions.push({
        title: 'Review Approvals',
        description: 'Operations are waiting for your decision.',
        href: '/dashboard/operations',
        icon: ShieldCheck,
      });
    }

    if (incidents.length > 0) {
      actions.push({
        title: 'Triage Incidents',
        description: 'Acknowledge or resolve open incidents.',
        href: '/dashboard/incidents',
        icon: AlertTriangle,
      });
    }

    if (Object.values(observability?.providers ?? {}).some(p => p.status === 'NOT_CONFIGURED')) {
       actions.push({
        title: 'Configure Providers',
        description: 'Some providers are not configured.',
        href: '/dashboard/integrations',
        icon: Database,
      });
    }

    if (actions.length === 0) {
       actions.push({
        title: 'Open Operations Hub',
        description: 'Monitor ongoing activity.',
        href: '/dashboard/operations',
        icon: Terminal,
      });
    }

    return actions.slice(0, 4);
  }, [incidents.length, pendingApprovals.length, signalReadiness?.activeSignals, observability?.providers]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 animate-fade-in">
      <WorkspaceHeader
        title="Command Workspace"
        purpose="Your operational command center."
        icon={<Activity className="h-5 w-5 text-blue-600" />}
        statusSummary={
          <span className="text-xs font-medium text-slate-500">
            Updated {formatTime(lastUpdated)}
          </span>
        }
        primaryAction={
          <button
            onClick={() => void loadOverview('refresh')}
            disabled={isLoading || isRefreshing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </button>
        }
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm">
            {error}
          </div>
        )}

        <WorkQueue
          title="Needs Attention"
          description="Urgent items requiring your review."
          count={needsAttentionItems.length}
          isEmpty={needsAttentionItems.length === 0}
          emptyState={
            <EmptyState
              title="All clear"
              description="No active incidents, failing signals, or blocked operations."
              icon={<CheckCircle2 className="h-6 w-6" />}
              variant="compact"
            />
          }
        >
          {needsAttentionItems.map((item, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 transition-colors gap-3 border-t border-slate-100 first:border-t-0">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "mt-1.5 h-2 w-2 rounded-full shrink-0",
                  item.tone === 'rose' ? "bg-rose-500" : "bg-amber-500"
                )} />
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                  <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                </div>
              </div>
              <Link href={item.href} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700 sm:self-center">
                Review <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </WorkQueue>

        <div className="grid gap-6 xl:grid-cols-2">
           <WorkQueue
             title="Active Incidents"
             viewAllLink="/dashboard/incidents"
             count={incidents.length}
             isEmpty={incidents.length === 0}
             emptyState={<EmptyState title="No active incidents" description="No OPEN or ACKNOWLEDGED incidents." variant="compact" />}
           >
             {incidents.map((inc, i) => (
               <div key={inc.id} className={cn("flex items-center justify-between p-4 hover:bg-slate-50 transition-colors", i > 0 && "border-t border-slate-100")}>
                  <div className="flex flex-wrap items-center gap-2">
                     <StatusBadge status={inc.severity} />
                     <StatusBadge status={inc.status} />
                     <span className="text-sm font-medium text-slate-900 ml-1 truncate max-w-[200px] sm:max-w-xs">{inc.title}</span>
                  </div>
                  <Link href={`/dashboard/incidents/${inc.id}`} className="text-sm font-semibold text-blue-600 hover:underline shrink-0 ml-4">Details</Link>
               </div>
             ))}
           </WorkQueue>

           <WorkQueue
             title="Pending Approvals"
             viewAllLink="/dashboard/operations#approvals"
             count={pendingApprovals.length}
             isEmpty={pendingApprovals.length === 0}
             emptyState={<EmptyState title="No pending approvals" description="All operations are approved." variant="compact" />}
           >
             {pendingApprovals.map((op, i) => (
               <div key={op.id} className={cn("flex items-center justify-between p-4 hover:bg-slate-50 transition-colors", i > 0 && "border-t border-slate-100")}>
                  <div className="flex flex-wrap items-center gap-2">
                     <StatusBadge status={op.status} />
                     <span className="text-sm font-medium text-slate-900 ml-1 truncate max-w-[200px] sm:max-w-xs">{op.title}</span>
                  </div>
                  <Link href={`/dashboard/operations/${op.id}`} className="text-sm font-semibold text-blue-600 hover:underline shrink-0 ml-4">Review</Link>
               </div>
             ))}
           </WorkQueue>

           <div className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                 <div>
                   <h3 className="text-base font-semibold text-slate-900">Critical & Error Signals</h3>
                   <p className="text-sm text-slate-500 mt-1">Tenant-scoped signal readiness.</p>
                 </div>
                 <Link href="/dashboard/signals" className="text-sm font-medium text-blue-600 hover:underline">View all</Link>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-center">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-4 flex flex-col items-center justify-center text-center">
                       <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Critical</p>
                       <p className="mt-2 text-3xl font-bold text-rose-900">{signalReadiness?.criticalCount ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex flex-col items-center justify-center text-center">
                       <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Errors</p>
                       <p className="mt-2 text-3xl font-bold text-amber-900">{signalReadiness?.errorCount ?? 0}</p>
                    </div>
                 </div>
              </div>
           </div>

           <WorkQueue
             title="Recent Controlled Operations"
             viewAllLink="/dashboard/operations"
             count={recentOperations.length}
             isEmpty={recentOperations.length === 0}
             emptyState={<EmptyState title="No recent operations" description="No operation history available." variant="compact" />}
           >
             {recentOperations.map((op, i) => (
               <div key={op.id} className={cn("flex items-center justify-between p-4 hover:bg-slate-50 transition-colors", i > 0 && "border-t border-slate-100")}>
                  <div className="flex flex-wrap items-center gap-2">
                     <StatusBadge status={op.status} />
                     <span className="text-sm font-medium text-slate-900 ml-1 truncate max-w-[200px] sm:max-w-xs">{op.title}</span>
                  </div>
                  <Link href={`/dashboard/operations/${op.id}`} className="text-sm font-semibold text-blue-600 hover:underline shrink-0 ml-4">Details</Link>
               </div>
             ))}
           </WorkQueue>

           <div className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                 <div>
                   <h3 className="text-base font-semibold text-slate-900">Provider Health Snapshot</h3>
                   <p className="text-sm text-slate-500 mt-1">Summary of connected systems.</p>
                 </div>
                 <Link href="/dashboard/integrations" className="text-sm font-medium text-blue-600 hover:underline">Manage</Link>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                 {['jenkins', 'docker', 'kubernetes', 'aws', 'github'].map(providerKey => {
                    const provider = observability?.providers?.[providerKey as keyof typeof observability.providers];
                    if (!provider) return null;
                    return (
                       <div key={providerKey} className="rounded-md border border-slate-100 bg-slate-50 p-3 flex flex-col items-start justify-between">
                          <p className="text-xs font-semibold capitalize text-slate-700">{providerKey}</p>
                          <StatusBadge status={provider.status} className="mt-2 self-start" />
                       </div>
                    );
                 })}
              </div>
           </div>

           <div className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                 <div>
                   <h3 className="text-base font-semibold text-slate-900">Delivery Snapshot</h3>
                   <p className="text-sm text-slate-500 mt-1">Overview of your delivery pipeline.</p>
                 </div>
                 <Link href="/dashboard/deployments" className="text-sm font-medium text-blue-600 hover:underline">View</Link>
              </div>
              <div className="p-5 grid grid-cols-3 gap-4">
                 <div className="rounded-md border border-slate-200 bg-white p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Projects</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{projects.length}</p>
                 </div>
                 <div className="rounded-md border border-slate-200 bg-white p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Environments</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{environments.length}</p>
                 </div>
                 <div className="rounded-md border border-slate-200 bg-white p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Deployments</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{deployments.length}</p>
                 </div>
              </div>
           </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-5">
           <h3 className="text-base font-semibold text-slate-900 mb-4">Command Service Paths</h3>
           <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/dashboard/integrations/docker" className="rounded-md border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition">
                 <Database className="h-5 w-5 text-blue-600 mb-2" />
                 <span className="block text-sm font-semibold text-slate-900">Docker</span>
                 <span className="mt-1 block text-xs text-slate-500">Containers and local state</span>
              </Link>
              <Link href="/dashboard/integrations/kubernetes" className="rounded-md border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition">
                 <Network className="h-5 w-5 text-blue-600 mb-2" />
                 <span className="block text-sm font-semibold text-slate-900">Kubernetes</span>
                 <span className="mt-1 block text-xs text-slate-500">Cluster workloads</span>
              </Link>
              <Link href="/dashboard/integrations/jenkins" className="rounded-md border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition">
                 <GitMerge className="h-5 w-5 text-blue-600 mb-2" />
                 <span className="block text-sm font-semibold text-slate-900">Jenkins</span>
                 <span className="mt-1 block text-xs text-slate-500">Build pipelines</span>
              </Link>
              <Link href="/dashboard/operations#runtime-health" className="rounded-md border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition">
                 <RadioTower className="h-5 w-5 text-blue-600 mb-2" />
                 <span className="block text-sm font-semibold text-slate-900">Runtime Health</span>
                 <span className="mt-1 block text-xs text-slate-500">API and worker status</span>
              </Link>
           </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-5">
           <h3 className="text-base font-semibold text-slate-900 mb-4">Next Best Actions</h3>
           <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {nextBestActions.map((action, i) => {
                 const Icon = action.icon;
                 return (
                    <Link key={i} href={action.href} className="flex flex-col rounded-md border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition">
                       <Icon className="h-5 w-5 text-blue-600 mb-2" />
                       <span className="text-sm font-semibold text-slate-900">{action.title}</span>
                       <span className="mt-1 text-xs text-slate-500">{action.description}</span>
                    </Link>
                 );
              })}
           </div>
        </div>
      </div>
    </div>
  );
}
