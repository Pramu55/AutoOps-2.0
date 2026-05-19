'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Deployment, DeploymentEvent } from '@autoops/types';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  GitBranch,
  GitCommit,
  Loader2,
  RefreshCw,
  Timer,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
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

function statusClass(status: string): string {
  if (status === 'SUCCEEDED') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700';
  if (status === 'FAILED') return 'border-destructive/40 bg-destructive/10 text-destructive';
  if (status === 'RUNNING' || status === 'DEPLOYING' || status === 'BUILDING') {
    return 'border-primary/25 bg-primary/10 text-primary';
  }
  if (status === 'QUEUED') return 'border-amber-500/25 bg-amber-500/10 text-amber-700';
  return 'border-border bg-muted text-muted-foreground';
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

  return (
    <pre className="max-h-52 overflow-auto rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

function SummaryTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-3 break-words text-sm font-medium text-foreground">{value}</p>
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
    <div className="space-y-6 animate-fade-in">
      <section className="relative overflow-hidden rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Button asChild type="button" variant="ghost" className="-ml-3 mb-3">
            <Link href="/dashboard/deployments">
              <ArrowLeft className="h-4 w-4" />
              Deployments
            </Link>
            </Button>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Deployment Details</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="break-all text-2xl font-semibold text-foreground">{deployment.id}</h1>
              <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClass(deployment.status)}`}>
                {deployment.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Project {deployment.projectId} / Environment {deployment.environmentId}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadDeployment()}
            disabled={isRefreshing}
            className="border-slate-200 bg-white hover:bg-slate-50"
          >
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Trigger" value={deployment.trigger} icon={<CheckCircle2 className="h-4 w-4" />} />
          <SummaryTile label="Commit" value={shortSha(deployment.commitSha)} icon={<GitCommit className="h-4 w-4" />} />
          <SummaryTile label="Branch" value={deployment.branch ?? 'Not provided'} icon={<GitBranch className="h-4 w-4" />} />
          <SummaryTile label="Duration" value={formatDuration(deployment.durationMs)} icon={<Timer className="h-4 w-4" />} />
          <SummaryTile label="Created" value={formatDate(deployment.createdAt)} icon={<Clock3 className="h-4 w-4" />} />
          <SummaryTile label="Started" value={formatDate(deployment.startedAt)} icon={<Clock3 className="h-4 w-4" />} />
          <SummaryTile label="Completed" value={formatDate(deployment.completedAt)} icon={<Clock3 className="h-4 w-4" />} />
          <SummaryTile label="Image Tag" value={deployment.imageTag ?? 'Not produced'} icon={<CheckCircle2 className="h-4 w-4" />} />
        </div>

        {deployment.errorMessage ? (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {deployment.errorMessage}
          </div>
        ) : null}
      </section>

      <section className="relative overflow-hidden rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Deployment Metadata</h2>
        <div className="mt-4">
          <MetadataBlock metadata={deployment.metadata} />
        </div>
      </section>

      <section className="relative overflow-hidden rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Event Timeline</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Real lifecycle and simulation events from GET /api/v1/deployments/:deploymentId/events.
            </p>
          </div>
          <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            {events.length} events
          </span>
        </div>

        <div className="relative mt-5 space-y-3">
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
      </section>
    </div>
  );
}
