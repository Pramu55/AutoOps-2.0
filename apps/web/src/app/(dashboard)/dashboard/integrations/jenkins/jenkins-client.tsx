'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  JenkinsBuild,
  JenkinsJob,
  JenkinsListResponse,
  JenkinsStatusResponse,
  JenkinsSummaryResponse,
  JenkinsTriggerBuildResponse,
} from '@autoops/types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hammer,
  PlayCircle,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type StatusResponse = { data: JenkinsStatusResponse };
type SummaryResponse = { data: JenkinsSummaryResponse };
type JobsResponse = { data: JenkinsListResponse<JenkinsJob> };
type BuildsResponse = { data: JenkinsListResponse<JenkinsBuild> };
type TriggerResponse = { data: JenkinsTriggerBuildResponse };

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
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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
  const [jobName, setJobName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJenkins = useCallback(async (initial = false) => {
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

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

  const currentStatus = status?.status ?? summary?.status ?? 'NOT_CONFIGURED';
  const allowedJobs = status?.allowedJobs ?? summary?.allowedJobs ?? [];
  const triggerEnabled = currentStatus === 'CONNECTED' && allowedJobs.length > 0;
  const recentBuilds = useMemo(() => builds.slice(0, 12), [builds]);

  const triggerBuild = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await api.post<TriggerResponse>(
        `/v1/integrations/jenkins/jobs/${encodeURIComponent(jobName.trim())}/trigger`,
        {
          confirmationToken: 'BUILD',
          reason: 'Triggered from AutoOps Jenkins integration page',
        },
      );
      setMessage(
        response.data.approvalRequired
          ? `Operation ${response.data.operationId} is pending approval.`
          : `Operation ${response.data.operationId} queued for Jenkins worker execution.`,
      );
      await loadJenkins();
    } catch (triggerError) {
      setMessage(getErrorMessage(triggerError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
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
            onClick={() => void triggerBuild()}
            className="rounded-full bg-white text-slate-950 hover:bg-slate-200"
          >
            <PlayCircle className="h-4 w-4" />
            Queue build
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
    </div>
  );
}
