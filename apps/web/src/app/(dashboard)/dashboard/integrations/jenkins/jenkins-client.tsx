'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  JenkinsBuild,
  JenkinsJob,
  JenkinsListResponse,
  JenkinsOperation,
  JenkinsOperationListResponse,
  JenkinsStatusResponse,
  JenkinsSummaryResponse,
  JenkinsTriggerBuildResponse,
} from '@autoops/types';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Hammer,
  PlayCircle,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type StatusResponse = { data: JenkinsStatusResponse };
type SummaryResponse = { data: JenkinsSummaryResponse };
type JobsResponse = { data: JenkinsListResponse<JenkinsJob> };
type BuildsResponse = { data: JenkinsListResponse<JenkinsBuild> };
type OperationsResponse = { data: JenkinsOperationListResponse };
type TriggerResponse = { data: JenkinsTriggerBuildResponse };
const MISSING_VALUE = '—';

type PendingJenkinsAction = {
  jobName: string;
  reason: string;
  mode: 'trigger' | 'rerun';
  operationId?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load Jenkins data.';
}

function statusTone(status: string): string {
  if (status === 'CONNECTED' || status === 'SUCCESS' || status === 'SUCCEEDED') {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  }
  if (status === 'AUTH_FAILED' || status === 'FORBIDDEN' || status === 'FAILED') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  }
  if (status === 'UNREACHABLE' || status === 'UNKNOWN_ERROR') {
    return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  }
  return 'border-slate-400/25 bg-slate-500/10 text-slate-300';
}

function formatTime(value?: string | null): string {
  if (!value) return MISSING_VALUE;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatOptional(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return MISSING_VALUE;
  return String(value);
}

function formatDuration(value?: number | null): string {
  if (value === null || value === undefined) return MISSING_VALUE;
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function buildKey(jobName: string, buildNumber: number): string {
  return `${jobName}::${buildNumber}`;
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl bg-cyan-300/10 p-2 text-cyan-300">{icon}</div>
      </div>
    </section>
  );
}

export function JenkinsClient() {
  const [status, setStatus] = useState<JenkinsStatusResponse | null>(null);
  const [summary, setSummary] = useState<JenkinsSummaryResponse | null>(null);
  const [jobs, setJobs] = useState<JenkinsJob[]>([]);
  const [builds, setBuilds] = useState<JenkinsBuild[]>([]);
  const [operations, setOperations] = useState<JenkinsOperation[]>([]);
  const [jobName, setJobName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingJenkinsAction | null>(null);
  const [confirmationValue, setConfirmationValue] = useState('');

  const loadJenkins = useCallback(async (initial = false) => {
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    setOperationsError(null);

    try {
      const [statusResponse, summaryResponse, jobsResponse, buildsResponse] = await Promise.all([
        api.get<StatusResponse>('/v1/integrations/jenkins/status'),
        api.get<SummaryResponse>('/v1/integrations/jenkins/summary'),
        api.get<JobsResponse>('/v1/integrations/jenkins/jobs'),
        api.get<BuildsResponse>('/v1/integrations/jenkins/builds'),
      ]);
      setStatus(statusResponse.data);
      setSummary(summaryResponse.data);
      setJobs(jobsResponse.data.items);
      setBuilds(buildsResponse.data.items);

      try {
        const operationsResponse = await api.get<OperationsResponse>('/v1/integrations/jenkins/operations');
      setOperations(operationsResponse.data.items);
      } catch (operationsLoadError) {
        setOperations([]);
        setOperationsError(getErrorMessage(operationsLoadError));
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadJenkins(true);
  }, [loadJenkins]);

  useEffect(() => {
    if (!pendingAction) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        setPendingAction(null);
        setConfirmationValue('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, pendingAction]);

  const currentStatus = status?.status ?? summary?.status ?? 'NOT_CONFIGURED';
  const allowedJobs = status?.allowedJobs ?? summary?.allowedJobs ?? [];
  const triggerEnabled = currentStatus === 'CONNECTED' && allowedJobs.length > 0;
  const recentBuilds = useMemo(() => builds.slice(0, 12), [builds]);
  const buildByKey = useMemo(
    () => new Map(builds.map((build) => [buildKey(build.jobName, build.buildNumber), build])),
    [builds],
  );

  const queueBuild = async () => {
    if (!pendingAction || confirmationValue !== 'BUILD') return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await api.post<TriggerResponse>(
        `/v1/integrations/jenkins/jobs/${encodeURIComponent(pendingAction.jobName)}/trigger`,
        {
          confirmationToken: 'BUILD',
          reason: pendingAction.reason,
        },
      );
      setMessage(
        response.data.approvalRequired
          ? `Operation ${response.data.operationId} submitted for approval. Approval required: ${response.data.approvalReason ?? 'Policy requires approval before worker execution.'}`
          : `Operation ${response.data.operationId} queued for Jenkins worker execution.`,
      );
      setPendingAction(null);
      setConfirmationValue('');
      await loadJenkins();
    } catch (triggerError) {
      setMessage(getErrorMessage(triggerError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerBuild = () => {
    const targetJobName = jobName.trim();
    if (!targetJobName) return;
    setPendingAction({
      jobName: targetJobName,
      reason: 'Triggered from AutoOps Jenkins integration page',
      mode: 'trigger',
    });
    setConfirmationValue('');
    setMessage(null);
  };

  const rerunOperation = (operation: JenkinsOperation) => {
    if (!operation.jobName) return;
    setPendingAction({
      jobName: operation.jobName,
      reason: `Re-run from AutoOps operation ${shortId(operation.id)}`,
      mode: 'rerun',
      operationId: operation.id,
    });
    setConfirmationValue('');
    setMessage(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="rounded-full border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
      >
        <Link href="/dashboard/operations">
          <ArrowLeft className="h-4 w-4" />
          Back to Ops Hub
        </Link>
      </Button>

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.24),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/25 lg:p-8">
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(currentStatus)}`}>
              {currentStatus}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white lg:text-5xl">Jenkins CI/CD Connector</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Real Jenkins status, jobs, builds, queue visibility, and controlled build triggers through the Jenkins Remote Access API.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void loadJenkins()}
            disabled={isLoading || isRefreshing}
            className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
          >
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {currentStatus !== 'CONNECTED' ? (
        <section className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-6">
          <div className="flex gap-4">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h2 className="text-base font-semibold text-white">Jenkins is not connected</h2>
              <p className="mt-2 text-sm leading-6 text-amber-100/80">
                {status?.message ?? 'Set JENKINS_URL, JENKINS_USERNAME, and JENKINS_API_TOKEN for the API and worker containers.'}
              </p>
              <p className="mt-3 text-sm text-slate-300">
                AutoOps never exposes Jenkins API tokens and does not use Jenkins CLI, script console, or job configuration mutation.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-4">
        <div className="flex items-center gap-3 text-sm font-medium text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          Controlled mode active. Build triggers require confirmation, audit logging, and approval when linked to production environments.
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Base URL" value={status?.baseUrl ?? 'Not configured'} icon={<Server className="h-5 w-5" />} />
        <SummaryCard label="Version" value={status?.version ?? 'Unknown'} icon={<CheckCircle2 className="h-5 w-5" />} />
        <SummaryCard label="Jobs" value={summary?.jobCount ?? 0} icon={<Hammer className="h-5 w-5" />} />
        <SummaryCard label="Queue" value={summary?.queueCount ?? 0} icon={<Clock className="h-5 w-5" />} />
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
        <h2 className="text-base font-semibold text-white">Trigger Jenkins build</h2>
        <p className="mt-1 text-sm text-slate-400">
          Queues a real Jenkins build trigger operation through BullMQ. Only jobs in JENKINS_ALLOWED_JOBS can be triggered.
        </p>
        {currentStatus === 'CONNECTED' && allowedJobs.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            No jobs are allowlisted. Set JENKINS_ALLOWED_JOBS to enable controlled build triggering.
          </div>
        ) : null}
        {message ? (
          <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
            {message}
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          {allowedJobs.length > 0 ? (
            <select
              value={jobName}
              onChange={(event) => setJobName(event.target.value)}
              className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-950/55 px-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
            >
              <option value="">Select allowlisted job</option>
              {allowedJobs.map((allowedJob) => (
                <option key={allowedJob} value={allowedJob}>
                  {allowedJob}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value=""
              readOnly
              placeholder="No Jenkins jobs allowlisted"
              className="border-white/10 bg-slate-950/55"
            />
          )}
          <Button
            type="button"
            disabled={!triggerEnabled || !jobName.trim() || isSubmitting}
            onClick={triggerBuild}
            className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
          >
            <PlayCircle className="h-4 w-4" />
            Queue build
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10 xl:col-span-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Recent Jenkins Operations</h2>
              <p className="mt-1 text-sm text-slate-400">
                Real AutoOps worker operations for allowlisted Jenkins build triggers.
              </p>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
              {operations.length} shown
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-6 text-sm text-slate-400">
                Loading Jenkins operations...
              </div>
            ) : operationsError ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-5">
                <p className="text-sm font-medium text-rose-100">Unable to load Jenkins operations.</p>
                <p className="mt-2 text-sm text-rose-100/80">{operationsError}</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void loadJenkins()}
                  disabled={isRefreshing}
                  className="mt-4 rounded-full bg-white text-slate-950 hover:bg-slate-200"
                >
                  <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  Retry
                </Button>
              </div>
            ) : operations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center">
                <p className="text-sm font-medium text-white">No Jenkins operations triggered from AutoOps yet.</p>
                <p className="mt-2 text-sm text-slate-500">
                  Trigger an allowed Jenkins job from AutoOps to see operation history.
                </p>
              </div>
            ) : (
              operations.map((operation) => {
                const canRerun = Boolean(operation.jobName && allowedJobs.includes(operation.jobName));
                const matchedBuild =
                  operation.jobName && operation.buildNumber
                    ? buildByKey.get(buildKey(operation.jobName, operation.buildNumber))
                    : null;
                const displayResult = operation.result ?? matchedBuild?.result ?? null;
                const displayBuildUrl = operation.buildUrl ?? matchedBuild?.url ?? null;
                return (
                  <div
                    key={operation.id}
                    className="grid gap-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4 xl:grid-cols-[1.1fr_0.55fr_0.55fr_0.55fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(operation.status)}`}>
                          {operation.status}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] text-slate-400">
                          {operation.type}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-sm font-semibold text-white">
                        {operation.jobName ?? 'Unknown Jenkins job'}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        op {shortId(operation.id)} | created {formatTime(operation.createdAt)}
                      </p>
                      {operation.errorMessage ? (
                        <p className="mt-2 text-xs text-rose-200">{operation.errorMessage}</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Build</p>
                      <p className="mt-1 text-sm text-slate-200">
                        {operation.buildNumber ? `#${operation.buildNumber}` : MISSING_VALUE}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Result</p>
                      <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(displayResult ?? 'UNKNOWN')}`}>
                        {displayResult ?? 'PENDING'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Duration</p>
                      <p className="mt-1 text-sm text-slate-200">{formatDuration(operation.durationMs)}</p>
                      <p className="mt-1 text-xs text-slate-500">Done {operation.completedAt ? formatTime(operation.completedAt) : MISSING_VALUE}</p>
                    </div>
                    <div className="flex flex-col gap-2 xl:items-end">
                      <Button asChild size="sm" variant="outline" className="rounded-full border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                        <Link href={`/dashboard/operations/${operation.id}`}>
                          View details
                        </Link>
                      </Button>
                      {displayBuildUrl ? (
                        <Button asChild size="sm" variant="outline" className="rounded-full border-white/10 bg-white/[0.04]">
                          <a href={displayBuildUrl} target="_blank" rel="noreferrer noopener">
                            <ExternalLink className="h-4 w-4" />
                            Jenkins
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500">{MISSING_VALUE}</span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        disabled={!triggerEnabled || !canRerun || isSubmitting}
                        onClick={() => rerunOperation(operation)}
                        className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
                      >
                        <RotateCw className="h-4 w-4" />
                        Re-run
                      </Button>
                    </div>
                    <div className="grid gap-2 text-xs text-slate-500 xl:col-span-5 md:grid-cols-4">
                      <p>LOW risk | Confirmation BUILD | Approval not required</p>
                      <p>Started {operation.startedAt ? formatTime(operation.startedAt) : MISSING_VALUE}</p>
                      <p>Queue {formatOptional(operation.queueUrl)}</p>
                      <p className="truncate">Build URL {formatOptional(displayBuildUrl)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <h2 className="text-base font-semibold text-white">Jobs</h2>
          <div className="mt-5 space-y-3">
            {jobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center text-sm text-slate-400">
                {currentStatus === 'CONNECTED' ? 'No Jenkins jobs returned by the connected server.' : 'No jobs shown while Jenkins is disconnected.'}
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job.fullName ?? job.name} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{job.fullName ?? job.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{job.url}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(job.status)}`}>
                      {job.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
          <h2 className="text-base font-semibold text-white">Recent builds</h2>
          <div className="mt-5 space-y-3">
            {recentBuilds.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-6 text-center text-sm text-slate-400">
                {currentStatus === 'CONNECTED' ? 'No Jenkins builds returned by the connected server.' : 'No builds shown while Jenkins is disconnected.'}
              </div>
            ) : (
              recentBuilds.map((build) => (
                <div key={`${build.jobName}-${build.buildNumber}`} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 md:grid-cols-[1fr_0.45fr_0.45fr]">
                  <div>
                    <p className="text-sm font-semibold text-white">{build.fullDisplayName ?? build.jobName}</p>
                    <p className="mt-1 text-xs text-slate-500">#{build.buildNumber} | {formatTime(build.timestamp)}</p>
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(build.result ?? (build.building ? 'BUILDING' : 'UNKNOWN'))}`}>
                    {build.result ?? (build.building ? 'BUILDING' : 'UNKNOWN')}
                  </span>
                  <p className="text-sm text-slate-400">{build.duration ?? 0} ms</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {pendingAction ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jenkins-confirmation-title"
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                  LOW risk | Approval not required
                </p>
                <h2 id="jenkins-confirmation-title" className="mt-2 text-xl font-semibold text-white">
                  {pendingAction.mode === 'rerun' ? 'Confirm Jenkins re-run' : 'Confirm Jenkins build'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  setConfirmationValue('');
                }}
                disabled={isSubmitting}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
              <p>
                You are about to trigger allowlisted Jenkins job{' '}
                <span className="font-semibold text-white">{pendingAction.jobName}</span>.
              </p>
              <p>
                Type <span className="font-semibold text-emerald-200">BUILD</span> to queue the
                worker-executed and audited operation.
              </p>
              {pendingAction.operationId ? (
                <p className="font-mono text-xs text-slate-500">
                  Source operation: {shortId(pendingAction.operationId)}
                </p>
              ) : null}
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="jenkins-confirmation-token">
              Required confirmation token
            </label>
            <Input
              id="jenkins-confirmation-token"
              value={confirmationValue}
              onChange={(event) => setConfirmationValue(event.target.value)}
              placeholder="Type BUILD to confirm"
              className="mt-2 border-white/10 bg-slate-900/80"
              autoFocus
            />

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingAction(null);
                  setConfirmationValue('');
                }}
                disabled={isSubmitting}
                className="rounded-full border-white/10 bg-white/[0.04]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void queueBuild()}
                disabled={confirmationValue !== 'BUILD' || isSubmitting}
                className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
              >
                {isSubmitting ? 'Queueing...' : 'Queue operation'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
