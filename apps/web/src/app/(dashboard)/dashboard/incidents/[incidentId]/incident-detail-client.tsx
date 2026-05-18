'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AcknowledgeIncidentResponse, IncidentDetail, ResolveIncidentResponse } from '@autoops/types';
import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCw, X } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type IncidentDetailApiResponse = { data: IncidentDetail };
type ModalAction = 'acknowledge' | 'resolve';

const MISSING_VALUE = '-';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') return 'Session expired. Please sign in again.';
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load incident.';
}

function statusTone(status: string): string {
  if (status === 'RESOLVED') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (status === 'ACKNOWLEDGED' || status === 'MITIGATED') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  if (status === 'OPEN' || status === 'TRIGGERED') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  return 'border-slate-500/25 bg-slate-500/10 text-slate-300';
}

function severityTone(severity: string): string {
  if (severity === 'CRITICAL' || severity === 'HIGH' || severity === 'SEV1' || severity === 'SEV2') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  }
  if (severity === 'MEDIUM' || severity === 'SEV3') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
}

function formatDate(value: string | null): string {
  if (!value) return MISSING_VALUE;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function actorLabel(actor: IncidentDetail['acknowledgedBy']): string {
  if (!actor) return MISSING_VALUE;
  return actor.name ?? actor.email ?? actor.id;
}

export function IncidentDetailClient({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalAction, setModalAction] = useState<ModalAction | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  const loadIncident = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<IncidentDetailApiResponse>(`/v1/incidents/${encodeURIComponent(incidentId)}`);
      setIncident(response.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    void loadIncident();
  }, [loadIncident]);

  const submitAction = async () => {
    if (!modalAction || !incident) return;
    const expected = modalAction === 'acknowledge' ? 'ACKNOWLEDGE' : 'RESOLVE';
    if (confirmation !== expected) return;
    if (modalAction === 'resolve' && resolutionNote.trim().length < 3) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const response =
        modalAction === 'acknowledge'
          ? await api.post<{ data: AcknowledgeIncidentResponse }>(`/v1/incidents/${incident.id}/acknowledge`, {
              confirmationToken: 'ACKNOWLEDGE',
            })
          : await api.post<{ data: ResolveIncidentResponse }>(`/v1/incidents/${incident.id}/resolve`, {
              confirmationToken: 'RESOLVE',
              resolutionNote,
            });
      setIncident(response.data.incident);
      setModalAction(null);
      setConfirmation('');
      setResolutionNote('');
    } catch (actionSubmitError) {
      setActionError(getErrorMessage(actionSubmitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-8 text-sm text-slate-300">Loading incident...</div>;
  }

  if (error || !incident) {
    return (
      <div className="space-y-6">
        <Button asChild variant="outline" size="sm" className="rounded-full border-white/10 bg-white/[0.04]">
          <Link href="/dashboard/incidents"><ArrowLeft className="h-4 w-4" />Back to Incidents</Link>
        </Button>
        <section className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-100">{error ?? 'Incident not found.'}</section>
      </div>
    );
  }

  const canAcknowledge = incident.permissions.canAcknowledge;
  const canResolve = incident.permissions.canResolve;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="rounded-full border-white/10 bg-white/[0.04]">
          <Link href="/dashboard/incidents"><ArrowLeft className="h-4 w-4" />Back to Incidents</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="rounded-full border-white/10 bg-white/[0.04]">
          <Link href="/dashboard/operations">Back to Ops Hub</Link>
        </Button>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/25 lg:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${severityTone(incident.severity)}`}>{incident.severity}</span>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(incident.status)}`}>{incident.status}</span>
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white lg:text-5xl">{incident.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Incident response for {incident.targetLabel ?? 'an AutoOps target'} using safe operation context and deterministic runbook guidance.
            </p>
          </div>
          <Button type="button" onClick={() => void loadIncident()} disabled={isLoading} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Refresh
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {[
          ['Provider', incident.provider ?? 'AutoOps'],
          ['Target', incident.targetLabel ?? MISSING_VALUE],
          ['Created', formatDate(incident.createdAt)],
          ['Updated', formatDate(incident.updatedAt)],
        ].map(([label, value]) => (
          <section key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 truncate text-sm font-semibold text-white">{value}</p>
          </section>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5">
          <h2 className="text-base font-semibold text-white">Lifecycle</h2>
          <div className="mt-5 space-y-3 text-sm">
            <p className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-slate-300">Created {formatDate(incident.createdAt)}</p>
            <p className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-slate-300">Acknowledged by {actorLabel(incident.acknowledgedBy)} at {formatDate(incident.acknowledgedAt)}</p>
            <p className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-slate-300">Resolved by {actorLabel(incident.resolvedBy)} at {formatDate(incident.resolvedAt)}</p>
          </div>
          {incident.permissions.reason ? (
            <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">{incident.permissions.reason}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setModalAction('acknowledge')} disabled={!canAcknowledge} className="rounded-full bg-amber-300 text-slate-950 hover:bg-amber-200 disabled:opacity-50">
              Acknowledge
            </Button>
            <Button type="button" onClick={() => setModalAction('resolve')} disabled={!canResolve} className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 disabled:opacity-50">
              Resolve
            </Button>
            {incident.linkedOperationId ? (
              <Button asChild variant="outline" className="rounded-full border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                <Link href={`/dashboard/operations/${incident.linkedOperationId}`}>
                  <ExternalLink className="h-4 w-4" />View operation
                </Link>
              </Button>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5">
          <h2 className="text-base font-semibold text-white">Safe error summary</h2>
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{incident.safeErrorMessage ?? 'No safe error summary is available.'}</div>
          </div>
          {incident.resolutionNote ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              Resolution note: {incident.resolutionNote}
            </div>
          ) : null}
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5">
        <h2 className="text-base font-semibold text-white">{incident.runbook.title}</h2>
        <p className="mt-1 text-sm text-slate-400">{incident.runbook.summary}</p>
        <div className="mt-5 grid gap-3">
          {incident.runbook.steps.map((step) => (
            <div key={step.order} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">{step.actionType}</span>
                <p className="text-sm font-semibold text-white">{step.order}. {step.title}</p>
              </div>
              <p className="mt-2 text-sm text-slate-400">{step.description}</p>
              {step.linkHref && step.linkLabel ? (
                <Link className="mt-3 inline-flex text-sm font-medium text-cyan-200 underline decoration-cyan-200/40 underline-offset-4" href={step.linkHref}>{step.linkLabel}</Link>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {modalAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">{incident.status}</p>
                <h2 className="mt-2 text-xl font-semibold text-white">{modalAction === 'acknowledge' ? 'Acknowledge incident' : 'Resolve incident'}</h2>
              </div>
              <button type="button" onClick={() => setModalAction(null)} disabled={isSubmitting} className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-300">
              Type <span className="font-semibold text-cyan-200">{modalAction === 'acknowledge' ? 'ACKNOWLEDGE' : 'RESOLVE'}</span> to continue.
            </p>
            {modalAction === 'resolve' ? (
              <>
                <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="incident-resolution-note">Resolution note</label>
                <textarea
                  id="incident-resolution-note"
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300/40"
                  placeholder="Describe how this incident was verified and resolved."
                />
              </>
            ) : null}
            {actionError ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{actionError}</div> : null}
            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="incident-confirmation">Required token</label>
            <Input id="incident-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 border-white/10 bg-slate-900/80" autoFocus />
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setModalAction(null)} disabled={isSubmitting} className="rounded-full border-white/10 bg-white/[0.04]">Cancel</Button>
              <Button type="button" onClick={() => void submitAction()} disabled={confirmation !== (modalAction === 'acknowledge' ? 'ACKNOWLEDGE' : 'RESOLVE') || (modalAction === 'resolve' && resolutionNote.trim().length < 3) || isSubmitting} className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
                {isSubmitting ? 'Submitting...' : modalAction === 'acknowledge' ? 'Acknowledge incident' : 'Resolve incident'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
