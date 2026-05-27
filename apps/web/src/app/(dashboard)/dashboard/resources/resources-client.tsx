'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ResourceGraphListResponse,
  ResourceGraphNeighborResponse,
  ResourceGraphReadinessResponse,
  ResourceKind,
  ResourceNodeDetail,
  ResourceProvider,
} from '@autoops/types';
import { ResourceKind as ResourceKinds, ResourceProvider as ResourceProviders } from '@autoops/types';
import { Boxes, Link2, RefreshCw, Search, Database } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import { EmptyState } from '@/components/layout/empty-state';

type ApiData<T> = { data: T };
type ArchivedFilter = 'active' | 'archived' | 'all';

const PROVIDER_OPTIONS = Object.values(ResourceProviders);
const KIND_OPTIONS = Object.values(ResourceKinds);

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load Resource Graph data.';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function labelize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ResourcesClient() {
  const [providerFilter, setProviderFilter] = useState<ResourceProvider | 'ALL'>('ALL');
  const [kindFilter, setKindFilter] = useState<ResourceKind | 'ALL'>('ALL');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('active');
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  
  const [readiness, setReadiness] = useState<ResourceGraphReadinessResponse | null>(null);
  const [resources, setResources] = useState<ResourceGraphListResponse | null>(null);
  const [selectedResource, setSelectedResource] = useState<ResourceNodeDetail | null>(null);
  const [neighbors, setNeighbors] = useState<ResourceGraphNeighborResponse | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingSelection, setIsLoadingSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchText]);

  const resourceQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '50');
    if (providerFilter !== 'ALL') params.set('provider', providerFilter);
    if (kindFilter !== 'ALL') params.set('kind', kindFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (archivedFilter === 'archived') params.set('archived', 'true');
    if (archivedFilter === 'all') params.set('archived', 'all');
    return `/v1/resources?${params.toString()}`;
  }, [archivedFilter, debouncedSearch, kindFilter, providerFilter]);

  const loadResources = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const [readinessResponse, resourcesResponse] = await Promise.all([
        api.get<ApiData<ResourceGraphReadinessResponse>>('/v1/resources/readiness'),
        api.get<ApiData<ResourceGraphListResponse>>(resourceQuery),
      ]);
      setReadiness(readinessResponse.data);
      setResources(resourcesResponse.data);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [resourceQuery]);

  useEffect(() => {
    void loadResources('initial');
  }, [loadResources]);

  const resourceItems = resources?.items ?? [];

  useEffect(() => {
    if (!selectedResourceId || isLoading) return;
    if (resourceItems.some((resource) => resource.id === selectedResourceId)) return;
    setSelectedResourceId(null);
    setSelectedResource(null);
    setNeighbors(null);
  }, [isLoading, resourceItems, selectedResourceId]);

  useEffect(() => {
    if (!selectedResourceId) {
      setSelectedResource(null);
      setNeighbors(null);
      setSelectionError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingSelection(true);
    setSelectionError(null);
    Promise.all([
      api.get<ApiData<ResourceNodeDetail>>(`/v1/resources/${selectedResourceId}`),
      api.get<ApiData<ResourceGraphNeighborResponse>>(`/v1/resources/${selectedResourceId}/neighbors`),
    ])
      .then(([detailResponse, neighborResponse]) => {
        if (cancelled) return;
        setSelectedResource(detailResponse.data);
        setNeighbors(neighborResponse.data);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setSelectionError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSelection(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedResourceId]);

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Resources Workspace"
        purpose="Tenant-scoped read model of infrastructure discovered by integrations."
        icon={<Boxes className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Command', href: '/dashboard' }, { label: 'Resources' }]}
        statusSummary={
          <div className="flex items-center gap-3">
             <span className="text-xs text-slate-500">Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadResources()}
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
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
           {[
            ['Status', readiness?.status ?? 'UNKNOWN'],
            ['Resources', readiness?.totalResources ?? 0],
            ['Edges', readiness?.totalEdges ?? 0],
            ['Stale', readiness?.staleCount ?? 0],
            ['Archived', readiness?.archivedCount ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{isLoading ? '...' : value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* Filters */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search name or URN..."
                  className="pl-9 bg-white border-slate-200 focus:border-blue-500 h-9"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                 <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value as ResourceProvider | 'ALL')} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500">
                  <option value="ALL">All providers</option>
                  {PROVIDER_OPTIONS.map((provider) => <option key={provider} value={provider}>{labelize(provider)}</option>)}
                </select>
                <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as ResourceKind | 'ALL')} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500">
                  <option value="ALL">All kinds</option>
                  {KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{labelize(kind)}</option>)}
                </select>
                <select value={archivedFilter} onChange={(event) => setArchivedFilter(event.target.value as ArchivedFilter)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500">
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </div>
            </div>

            <WorkQueue
              title="Resource Inventory"
              description="Tenant-owned resources discovered by integrations."
              isEmpty={resourceItems.length === 0}
              emptyState={
                <EmptyState 
                  title="No resources found" 
                  description="No resources match the current filter criteria." 
                  icon={<Database className="text-slate-400" />} 
                  variant="compact" 
                />
              }
            >
              {resourceItems.map((resource) => (
                <button
                  key={resource.id}
                  onClick={() => setSelectedResourceId(resource.id)}
                  className={cn(
                    "flex w-full items-center justify-between p-4 text-left transition border-b border-slate-100 last:border-0",
                    selectedResourceId === resource.id ? "bg-blue-50/50" : "hover:bg-slate-50/50"
                  )}
                >
                  <div className="flex-1 min-w-0 pr-4">
                     <div className="flex items-center gap-2 mb-1.5">
                       <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">
                         {labelize(resource.provider)}
                       </span>
                       <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">
                         {labelize(resource.kind)}
                       </span>
                     </div>
                     <h4 className="text-sm font-semibold text-slate-900 truncate">{resource.displayName}</h4>
                     <p className="mt-1 text-xs text-slate-500 truncate font-mono">{resource.urn}</p>
                  </div>
                  <div className="shrink-0 text-right">
                     <span className="text-xs text-slate-400">{formatDate(resource.lastSeenAt)}</span>
                  </div>
                </button>
              ))}
            </WorkQueue>
          </div>

          <div className="flex flex-col gap-6">
             {selectedResourceId ? (
               <EvidencePanel title="Resource Inspector" icon={<Boxes className="h-4 w-4" />}>
                  {isLoadingSelection ? (
                    <div className="text-sm text-slate-500 text-center py-8">Loading...</div>
                  ) : selectionError ? (
                     <div className="text-sm text-rose-600 bg-rose-50 p-3 rounded">{selectionError}</div>
                  ) : selectedResource ? (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 leading-tight">{selectedResource.displayName}</h3>
                        <p className="mt-1 font-mono text-xs text-slate-500 break-all">{selectedResource.urn}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded border border-slate-100 bg-slate-50 p-3">
                          <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Incoming Links</span>
                          <span className="font-medium text-slate-900">{selectedResource.incomingEdgeCount}</span>
                        </div>
                        <div className="rounded border border-slate-100 bg-slate-50 p-3">
                          <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Outgoing Links</span>
                          <span className="font-medium text-slate-900">{selectedResource.outgoingEdgeCount}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                         <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Safe Metadata</h4>
                         <div className="rounded border border-slate-100 bg-slate-50 p-3 space-y-2 text-sm">
                            {Object.entries(selectedResource.metadataSummary || {}).length > 0 ? (
                              Object.entries(selectedResource.metadataSummary).map(([key, value]) => (
                                <div key={key} className="flex flex-col">
                                  <span className="text-xs font-medium text-slate-500">{key}</span>
                                  <span className="text-slate-900 break-all">{String(value)}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500">No safe metadata stored.</p>
                            )}
                         </div>
                      </div>

                      <div className="space-y-3">
                         <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                           <Link2 className="h-3.5 w-3.5" /> Neighbors
                         </h4>
                         <div className="space-y-2">
                            {neighbors && (neighbors.incoming.length > 0 || neighbors.outgoing.length > 0) ? (
                              [...neighbors.incoming, ...neighbors.outgoing].slice(0, 12).map((edge) => (
                                <div key={edge.id} className="rounded border border-slate-100 bg-slate-50 p-3 text-sm">
                                  <p className="font-medium text-slate-900 text-xs uppercase tracking-wider">{labelize(edge.type)}</p>
                                  <p className="mt-1 truncate text-xs text-slate-600">
                                    {edge.source?.displayName ?? edge.sourceNodeId} → {edge.target?.displayName ?? edge.targetNodeId}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500">No active neighbors recorded.</p>
                            )}
                         </div>
                      </div>
                    </div>
                  ) : null}
               </EvidencePanel>
             ) : (
               <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500 h-full flex flex-col items-center justify-center min-h-[300px]">
                 <Boxes className="h-8 w-8 mb-4 text-slate-300" />
                 <p className="text-sm">Select a resource to inspect safe metadata and graph neighbors.</p>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
