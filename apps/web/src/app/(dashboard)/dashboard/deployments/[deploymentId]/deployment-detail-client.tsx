'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Deployment, DeploymentEvent } from '@autoops/types';
import {
  AlertCircle,
  ArrowLeft,
  GitCommit,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { RecordSummary } from '@/components/layout/record-summary';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { Button } from '@/components/ui/button';

type DeploymentResponse = {
  data: Deployment;
};

type DeploymentEventsResponse = {
  data: DeploymentEvent[];
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong while loading deployment details.';
}

function formatDate(value: string | null): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null) return 'Pending';
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : 'Not provided';
}

function eventLevelClass(level: string): string {
  if (level === 'ERROR' || level === 'FATAL') return 'border-destructive/40 bg-destructive/10 text-destructive';
  if (level === 'WARN') return 'border-amber-500/25 bg-amber-500/10 text-amber-700';
  return 'border-primary/25 bg-primary/10 text-primary';
}

function hasMetadata(metadata: Record<string, unknown>): boolean {
  return Object.keys(metadata).length > 0;
}

function MetadataBlock({ metadata }: { metadata: Record<string, unknown> }) {
  if (!hasMetadata(metadata)) {
    return <p className="text-sm text-muted-foreground">No metadata recorded.</p>;
  }

  const entries = Object.entries(metadata).slice(0, 10);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background/35">
      <table className="w-full text-left text-xs text-muted-foreground">
        <tbody className="divide-y divide-border">
          {entries.map(([key, value]) => {
            let displayValue = '';
            if (value === null || value === undefined) displayValue = 'null';
            else if (typeof value === 'object') displayValue = '{...}';
            else displayValue = String(value);

            if (displayValue.length > 100) {
              displayValue = displayValue.slice(0, 100) + '...';
            }

            return (
              <tr key={key}>
                <td className="w-1/3 p-2 font-medium bg-muted/50 border-r border-border truncate">{key}</td>
                <td className="p-2 break-all">{displayValue}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DeploymentDetailClient({ deploymentId }: { deploymentId: string }) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [events, setEvents] = useState<DeploymentEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDeployment = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setLoadError(null);

    try {
      const [deploymentResponse, eventsResponse] = await Promise.all([
        api.get<DeploymentResponse>(`/v1/deployments/${deploymentId}`),
        api.get<DeploymentEventsResponse>(`/v1/deployments/${deploymentId}/events`),
      ]);
      setDeployment(deploymentResponse.data);
      setEvents(eventsResponse.data);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    void loadDeployment('initial');
  }, [loadDeployment]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card/60 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading deployment details...
      </div>
    );
  }

  if (loadError || !deployment) {
    const sessionExpired = loadError?.includes('Session expired');

    return (
      <div className="space-y-4">
        <Button asChild type="button" variant="ghost">
          <Link href="/dashboard/deployments">
            <ArrowLeft className="h-4 w-4" />
            Deployments
          </Link>
        </Button>
        <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <h1 className="text-base font-semibold text-destructive">
                {sessionExpired ? 'Session expired' : 'Unable to load deployment'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {loadError ?? 'The deployment was not found or is no longer available.'}
              </p>
              {!sessionExpired ? (
                <Button className="mt-4" type="button" variant="outline" onClick={() => void loadDeployment()}>
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col min-h-screen">
      <WorkspaceHeader
        title={deployment.id}
        purpose={`Project ${deployment.projectId}`}
        backLink={{ href: "/dashboard/deployments", label: "Deployments" }}
        breadcrumbs={[{ label: 'Deployments', href: '/dashboard/deployments' }, { label: deployment.id }]}
        primaryAction={
          <Button type="button" variant="outline" onClick={() => void loadDeployment()} disabled={isRefreshing} className="bg-white">
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        }
      />

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <RecordSummary
          title={deployment.id}
          status={deployment.status}
          source={`Project ${deployment.projectId}`}
          timestamps={[
            { label: 'Started', value: formatDate(deployment.startedAt) },
            { label: 'Duration', value: formatDuration(deployment.durationMs) },
            { label: 'Trigger', value: deployment.trigger },
            { label: 'Branch', value: deployment.branch ?? 'Not provided' },
          ]}
          relatedEntity={{
            label: 'Commit',
            value: (
              <span className="flex items-center gap-2">
                <GitCommit className="h-4 w-4" /> {shortSha(deployment.commitSha)}
              </span>
            )
          }}
        />

        {deployment.errorMessage ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {deployment.errorMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <EvidencePanel title="Event Timeline" description="Real lifecycle and simulation events from GET /api/v1/deployments/:deploymentId/events.">
              <div className="p-5 relative space-y-3">
                {events.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-background/30 p-8 text-center">
                    <p className="text-sm font-medium text-foreground">No events recorded</p>
                    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                      Deployment events will appear as the API and worker write lifecycle records.
                    </p>
                  </div>
                ) : (
                  events.map((event, index) => (
                    <article key={event.id} className="relative rounded-md border border-slate-200 bg-background/35 p-4 pl-12 transition hover:border-primary/30 hover:bg-slate-50">
                      <div className="absolute left-5 top-5 flex h-5 w-5 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      {index < events.length - 1 ? (
                        <span className="absolute bottom-[-0.85rem] left-[1.82rem] top-10 w-px bg-border" />
                      ) : null}
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-md border px-2 py-1 text-xs font-medium ${eventLevelClass(event.level)}`}>
                              {event.level}
                            </span>
                            <h3 className="text-sm font-semibold text-foreground">{event.type}</h3>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{event.message}</p>
                        </div>
                        <p className="shrink-0 text-sm text-muted-foreground">{formatDate(event.occurredAt)}</p>
                      </div>
                      <div className="mt-4">
                        <MetadataBlock metadata={event.metadata} />
                      </div>
                    </article>
                  ))
                )}
              </div>
            </EvidencePanel>
          </div>

          <div className="space-y-6">
            <EvidencePanel title="Deployment Metadata">
              <div className="p-5">
                <MetadataBlock metadata={deployment.metadata} />
              </div>
            </EvidencePanel>
          </div>
        </div>
      </div>
    </div>
  );
}
