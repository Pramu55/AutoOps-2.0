'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ResourceGraphListResponse,
  ResourceGraphNeighborResponse,
  ResourceGraphReadinessResponse,
  ResourceKind,
  ResourceNodeDetail,
  ResourceNodeSummary,
  ResourceProvider,
} from '@autoops/types';
import { ResourceKind as ResourceKinds, ResourceProvider as ResourceProviders } from '@autoops/types';
import { Boxes, RefreshCw, Search } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import { ContextPanel } from '@/components/layout/context-panel';
import { EmptyState } from '@/components/layout/empty-state';

import Link from 'next/link';


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

function statusTone(status: string | null | undefined): string {
  if (status === 'READY' || status === 'CONNECTED' || status === 'RUNNING' || status === 'HEALTHY') {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
  }
  if (status === 'DEGRADED' || status === 'WARNED' || status === 'EMPTY') {
    return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  }
  if (status === 'FAILED' || status === 'UNREACHABLE' || status === 'BLOCKED') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  }
  return 'border-slate-300 bg-slate-100 text-slate-700';
}

function MetadataList({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).slice(0, 12);
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No safe metadata summary stored for this resource.</p>;
  }

  return (
    <dl className="grid gap-2 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[9rem_1fr] gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="truncate font-medium text-slate-600">{key}</dt>
          <dd className="min-w-0 truncate text-slate-900">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResourceRow({ resource, selected, onSelect }: { resource: ResourceNodeSummary; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(resource.id)}
      className={cn(
        'grid w-full min-w-[56rem] grid-cols-[10rem_12rem_13rem_1fr_10rem] gap-3 border-b border-slate-200 px-4 py-3 text-left text-sm transition hover:bg-blue-50',
        selected && 'bg-blue-50 ring-1 ring-inset ring-blue-200',
      )}
    >
      <span className="truncate font-semibold text-slate-950">{resource.displayName}</span>
      <span className="truncate text-slate-600">{labelize(resource.provider)}</span>
      <span className="truncate text-slate-600">{labelize(resource.kind)}</span>
      <span className="truncate font-mono text-xs text-slate-500">{resource.urn}</span>
      <span className="whitespace-nowrap text-slate-600">{formatDate(resource.lastSeenAt)}</span>
    </button>
  );
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

  const providerCounts = readiness?.providerCounts ?? null;
  const providerCountRows = useMemo(
    () => (providerCounts ? PROVIDER_OPTIONS.map((provider) => [provider, providerCounts[provider] ?? 0] as const) : []),
    [providerCounts],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <WorkspaceHeader
        title="Resources Workspace"
        purpose="Resource map of connected infrastructure and AutoOps entities."
        secondaryAction={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/signals">Signals</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/incidents">Incidents</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/integrations">Integrations</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard">Command Workspace</Link></Button>
          </div>
        }
        primaryAction={
          <Button
            type="button"
            onClick={() => void loadResources()}
            disabled={isLoading || isRefreshing}
            className="rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

      <div className="flex flex-col gap-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Status', readiness?.status ?? 'UNKNOWN'],
          ['Resources', readiness?.totalResources ?? 0],
          ['Edges', readiness?.totalEdges ?? 0],
          ['Stale', readiness?.staleCount ?? 0],
          ['Archived', readiness?.archivedCount ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">{isLoading ? '...' : value}</p>
          </div>
        ))}
      </section>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Provider discovery counts</h2>
              <p className="mt-1 text-sm text-slate-600">Blocked organizations do not receive shared provider graph data.</p>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-medium ${statusTone(readiness?.status)}`}>
              Last seen {formatDate(readiness?.lastSeenAt)}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {providerCountRows.map(([provider, count]) => (
              <div key={provider} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{labelize(provider)}</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <WorkQueue
        title="Resources"
        description="Search and inspect tenant-owned resource nodes. No actions are available from this view."
        isEmpty={false}
        emptyState={null}
        className="w-full"
      >
        <div className="border-b border-slate-100 p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[10rem_12rem_10rem_18rem]">
            <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value as ResourceProvider | 'ALL')} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              <option value="ALL">All providers</option>
              {PROVIDER_OPTIONS.map((provider) => <option key={provider} value={provider}>{labelize(provider)}</option>)}
            </select>
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as ResourceKind | 'ALL')} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              <option value="ALL">All kinds</option>
              {KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{labelize(kind)}</option>)}
            </select>
            <select value={archivedFilter} onChange={(event) => setArchivedFilter(event.target.value as ArchivedFilter)} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search name or URN" className="h-10 rounded border-slate-300 pl-9" />
            </div>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="overflow-x-auto">
            <div className="grid min-w-[56rem] grid-cols-[10rem_12rem_13rem_1fr_10rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Name</span>
              <span>Provider</span>
              <span>Kind</span>
              <span>URN</span>
              <span>Last seen</span>
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-sm text-slate-600">Loading resources...</div>
            ) : resourceItems.length === 0 ? (
              <EmptyState
                icon={<Boxes />}
                title="No resources found"
                description="No Resource Graph nodes found for this organization and filter set. Provider inventory may be blocked by org policy or not yet discovered."
                action={<Button variant="outline" asChild><Link href="/dashboard/integrations">View Integrations</Link></Button>}
              />
            ) : (
              resourceItems.map((resource) => (
                <ResourceRow key={resource.id} resource={resource} selected={resource.id === selectedResourceId} onSelect={setSelectedResourceId} />
              ))
            )}
          </div>

          <aside className="border-t border-slate-200 bg-slate-50 p-5 xl:border-l xl:border-t-0">
            {!selectedResourceId ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                Select a resource to inspect safe metadata and graph neighbors.
              </div>
            ) : isLoadingSelection ? (
              <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading resource detail...</div>
            ) : selectionError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{selectionError}</div>
            ) : selectedResource ? (
              <div className="space-y-5">
                <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Selected resource</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">{selectedResource.displayName}</h3>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">{selectedResource.urn}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <span className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-center text-slate-700 font-medium">Incoming {selectedResource.incomingEdgeCount}</span>
                    <span className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-center text-slate-700 font-medium">Outgoing {selectedResource.outgoingEdgeCount}</span>
                  </div>
                </div>

                <EvidencePanel title="Safe Metadata" className="border-slate-200 shadow-sm">
                  <div className="p-4">
                    <MetadataList metadata={selectedResource.metadataSummary} />
                  </div>
                </EvidencePanel>

                <ContextPanel title="Neighbors" actions={[
                  neighbors && neighbors.incoming.length + neighbors.outgoing.length > 0 ? (
                    <div key="neighbors" className="space-y-2 w-full">
                      {[...neighbors.incoming, ...neighbors.outgoing].slice(0, 12).map((edge) => (
                        <div key={edge.id} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                          <p className="font-medium text-slate-900">{labelize(edge.type)}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {edge.source?.displayName ?? edge.sourceNodeId} {'->'} {edge.target?.displayName ?? edge.targetNodeId}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p key="empty" className="text-sm text-slate-500 p-2">No active neighbors recorded for this resource.</p>
                  )
                ]} />
              </div>
            ) : null}
          </aside>
        </div>

      </WorkQueue>
    </div>
  );
}


