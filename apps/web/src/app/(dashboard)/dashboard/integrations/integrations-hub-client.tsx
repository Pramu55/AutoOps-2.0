'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { OpsObservabilityResponse, OpsProviderHealthSummary } from '@autoops/types';
import { ApiError, api } from '@/lib/api';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { Button } from '@/components/ui/button';
import { RefreshCw, Webhook, Box, Cloud, ActivitySquare, Server } from 'lucide-react';
import { cn } from '@/lib/cn';
import { StatusBadge } from '@/components/ui/status-badge';

type OpsObservabilityApiResponse = { data: OpsObservabilityResponse };

const POLL_INTERVAL_MS = 15_000;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') return 'Session expired. Please sign in again.';
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load integrations data.';
}

const PROVIDER_CATEGORIES: Record<string, string[]> = {
  'CI/CD': ['jenkins', 'github_actions'],
  'Infrastructure': ['kubernetes', 'docker'],
  'Cloud': ['aws', 'gcp', 'azure'],
  'Observability': ['datadog', 'prometheus', 'grafana', 'sentry'],
};

function getCategoryIcon(category: string) {
  switch (category) {
    case 'CI/CD': return <Webhook className="h-5 w-5 text-blue-500" />;
    case 'Infrastructure': return <Server className="h-5 w-5 text-indigo-500" />;
    case 'Cloud': return <Cloud className="h-5 w-5 text-cyan-500" />;
    case 'Observability': return <ActivitySquare className="h-5 w-5 text-purple-500" />;
    default: return <Box className="h-5 w-5 text-slate-500" />;
  }
}

function getProviderName(id: string): string {
  return id
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function IntegrationsHubClient() {
  const [observability, setObservability] = useState<OpsObservabilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const res = await api.get<OpsObservabilityApiResponse>('/v1/ops/observability');
      setObservability(res.data);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData('initial');
    const intervalId = window.setInterval(() => void loadData(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadData]);

  const providersObj = observability?.providers as Record<string, OpsProviderHealthSummary> | undefined;
  
  // Convert providers object to array with 'id' field
  const providers = Object.entries(providersObj ?? {})
    .filter(([_, p]) => p !== undefined && p !== null)
    .map(([id, p]) => ({
      id,
      status: p!.status,
      message: p!.message,
      href: p!.href,
      checkedAt: p!.checkedAt,
      triggerEnabled: p!.triggerEnabled,
      metricsApiStatus: p!.metricsApiStatus
    }));

  // Group providers by category
  const groups: Record<string, typeof providers> = {
    'CI/CD': [],
    'Infrastructure': [],
    'Cloud': [],
    'Observability': [],
    'Other': [],
  };

  providers.forEach(p => {
    let matched = false;
    for (const [category, ids] of Object.entries(PROVIDER_CATEGORIES)) {
      if (ids.includes(p.id)) {
        if (!groups[category]) groups[category] = [];
        groups[category]!.push(p);
        matched = true;
        break;
      }
    }
    if (!matched) {
       if (!groups['Other']) groups['Other'] = [];
       groups['Other']!.push(p);
    }
  });

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Integrations Hub"
        purpose="Central management for external providers, cloud environments, and tools."
        icon={<Webhook className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Command', href: '/dashboard' }, { label: 'Integrations' }]}
        statusSummary={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              disabled={isLoading || isRefreshing}
              className="bg-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-8">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Connected</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-600">
              {providers.filter(p => p.status === 'CONNECTED' || p.status === 'READY' || p.status === 'HEALTHY').length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Errors</p>
            <p className="mt-2 text-2xl font-semibold text-rose-600">
               {providers.filter(p => p.status === 'ERROR' || p.status === 'FAILED' || p.status === 'UNREACHABLE').length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Degraded</p>
            <p className="mt-2 text-2xl font-semibold text-amber-600">
               {providers.filter(p => p.status === 'DEGRADED' || p.status === 'WARNING').length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Configured</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{providers.length}</p>
          </div>
        </div>

        {Object.entries(groups).map(([category, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={category} className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                {getCategoryIcon(category)}
                {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((provider) => (
                  <Link
                    key={provider.id}
                    href={`/dashboard/integrations/${provider.id}`}
                    className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-blue-200 flex flex-col"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                         <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                           <Box className="h-5 w-5 text-slate-600 group-hover:text-blue-600" />
                         </div>
                         <div>
                           <h4 className="font-semibold text-slate-900">{getProviderName(provider.id)}</h4>
                           <span className="text-xs text-slate-500">Enterprise Integration</span>
                         </div>
                      </div>
                      <StatusBadge status={provider.status} />
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100 flex-1">
                      {provider.message ? (
                        <p className={cn(
                          "text-sm line-clamp-2",
                          (provider.status === 'ERROR' || provider.status === 'UNREACHABLE') ? "text-rose-600" : "text-slate-600"
                        )}>
                          {provider.message}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No status message provided.</p>
                      )}
                    </div>

                    <div className="mt-4 text-xs font-medium text-slate-400 flex items-center justify-between">
                      <span>ID: {provider.id}</span>
                      {provider.checkedAt && <span>Checked {new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(new Date(provider.checkedAt))}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
