'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type {
  IncidentActionResponse,
  IncidentDetail,
  IncidentTimelineEventSummary,
  IncidentTimelineResponse,
} from '@autoops/types';
import { RecordSummary } from '@/components/layout/record-summary';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { ContextPanel } from '@/components/layout/context-panel';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import {
  ArrowLeft,
  ExternalLink,
  X,
  Shield,
  Clock,
  Archive,
  CheckCircle2,
  MessageSquare,
  AlertTriangle,
  Link2,
  TrendingUp,
  Activity,
  Send,
  Zap,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type IncidentDetailApiResponse = { data: IncidentDetail };
type ModalAction = 'acknowledge' | 'resolve' | 'archive';

const MISSING_VALUE = '-';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') return 'Session expired. Please sign in again.';
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unable to load incident.';
}



function severityTone(severity: string): string {
  if (severity === 'CRITICAL' || severity === 'ERROR') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-700';
  }
  if (severity === 'WARNING') return 'border-amber-400/25 bg-amber-400/10 text-amber-700';
  return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
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

function getEventIcon(type: string) {
  switch (type) {
    case 'INCIDENT_OPENED':
      return <AlertTriangle className="h-4 w-4 text-rose-600" />;
    case 'SIGNAL_LINKED':
    case 'EVIDENCE_ADDED':
      return <Link2 className="h-4 w-4 text-blue-600" />;
    case 'SEVERITY_CHANGED':
      return <TrendingUp className="h-4 w-4 text-purple-600" />;
    case 'STATUS_CHANGED':
      return <Activity className="h-4 w-4 text-indigo-600" />;
    case 'ACKNOWLEDGED':
      return <Shield className="h-4 w-4 text-amber-600" />;
    case 'RESOLVED':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'ARCHIVED':
      return <Archive className="h-4 w-4 text-slate-600" />;
    case 'NOTE_ADDED':
      return <MessageSquare className="h-4 w-4 text-slate-600" />;
    default:
      return <Clock className="h-4 w-4 text-slate-400" />;
  }
}

function getEventColorClass(type: string): string {
  switch (type) {
    case 'INCIDENT_OPENED':
      return 'bg-rose-50 border-rose-200';
    case 'SIGNAL_LINKED':
    case 'EVIDENCE_ADDED':
      return 'bg-blue-50 border-blue-200';
    case 'SEVERITY_CHANGED':
      return 'bg-purple-50 border-purple-200';
    case 'STATUS_CHANGED':
      return 'bg-indigo-50 border-indigo-200';
    case 'ACKNOWLEDGED':
      return 'bg-amber-50 border-amber-200';
    case 'RESOLVED':
      return 'bg-emerald-50 border-emerald-200';
    case 'ARCHIVED':
      return 'bg-slate-100 border-slate-350';
    case 'NOTE_ADDED':
      return 'bg-slate-50 border-slate-200';
    default:
      return 'bg-slate-50 border-slate-200';
  }
}

export function IncidentDetailClient({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<IncidentTimelineEventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNoteSubmitting, setIsNoteSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [modalAction, setModalAction] = useState<ModalAction | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [newNote, setNewNote] = useState('');

  const loadIncident = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [incidentRes, timelineRes] = await Promise.all([
        api.get<IncidentDetailApiResponse>(`/v1/incidents/${encodeURIComponent(incidentId)}`),
        api.get<IncidentTimelineResponse>(`/v1/incidents/${encodeURIComponent(incidentId)}/timeline`),
      ]);
      setIncident(incidentRes.data);
      setTimelineEvents(timelineRes.data);
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
    const expected = modalAction.toUpperCase();
    if (confirmation !== expected) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      if (modalAction === 'acknowledge') {
        await api.post<IncidentActionResponse>(`/v1/incidents/${incident.id}/acknowledge`, { confirmationToken: 'ACKNOWLEDGE' });
      } else if (modalAction === 'resolve') {
        await api.post<IncidentActionResponse>(`/v1/incidents/${incident.id}/resolve`, { confirmationToken: 'RESOLVE', resolutionNote });
      } else {
        await api.post<IncidentActionResponse>(`/v1/incidents/${incident.id}/archive`, { confirmationToken: 'ARCHIVE' });
      }

      setIncident(null);
      await loadIncident();
      setModalAction(null);
      setConfirmation('');
      setResolutionNote('');
    } catch (actionSubmitError) {
      setActionError(getErrorMessage(actionSubmitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !incident) return;

    setIsNoteSubmitting(true);
    setNoteError(null);
    try {
      const res = await api.post<IncidentTimelineResponse>(`/v1/incidents/${incident.id}/notes`, {
        message: newNote.trim(),
      });
      setTimelineEvents(res.data);
      setNewNote('');
    } catch (err) {
      setNoteError(getErrorMessage(err));
    } finally {
      setIsNoteSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-700 text-center animate-pulse">Loading incident detail...</div>;
  }

  if (error || !incident) {
    return (
      <div className="space-y-6">
        <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50">
          <Link href="/dashboard/incidents"><ArrowLeft className="h-4 w-4" />Back to Incidents</Link>
        </Button>
        <section className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-800">{error ?? 'Incident not found.'}</section>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4 mb-2">
        <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-slate-50">
          <Link href="/dashboard/incidents"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Link>
        </Button>
        <Breadcrumbs items={[{ label: 'Command Workspace', href: '/dashboard' }, { label: 'Incidents', href: '/dashboard/incidents' }, { label: 'Incident Record' }]} />
      </div>

      <RecordSummary
        title={incident.title}
        status={incident.status}
        severity={incident.severity}
        source={incident.source.replace('_', ' ')}
        timestamps={[
          { label: 'Opened', value: formatDate(incident.openedAt) },
          { label: 'Last Observed', value: formatDate(incident.lastObservedAt) },
          { label: 'Signal Count', value: String(incident.signalCount) },
          { label: 'Correlation Key', value: incident.correlationKey }
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <ContextPanel
            title="Next Best Actions"
            description="Recommended operational steps based on current status."
            actions={
              incident.status === 'OPEN' ? [
                'Acknowledge this incident to begin triage.',
                'Review linked signals and timeline evidence.'
              ] : incident.status === 'ACKNOWLEDGED' ? [
                'Add operator notes summarizing your investigation.',
                'Resolve the incident when mitigated.'
              ] : incident.status === 'RESOLVED' ? [
                'Archive the incident when review is complete.'
              ] : [
                'This incident record is closed.',
                'Review timeline and evidence for historical context.'
              ]
            }
          />

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Lifecycle</h2>
            <div className="mt-5 space-y-3 text-xs">
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-slate-700">
                <Clock className="h-4 w-4 text-slate-400" />
                <span>Opened {formatDate(incident.openedAt)}</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-slate-700">
                <Shield className="h-4 w-4 text-slate-400" />
                <span>Ack by {actorLabel(incident.acknowledgedBy)} at {formatDate(incident.acknowledgedAt)}</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-slate-400" />
                <span>Resolved by {actorLabel(incident.resolvedBy)} at {formatDate(incident.resolvedAt)}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {incident.status === 'OPEN' && (
                <Button type="button" onClick={() => setModalAction('acknowledge')} className="rounded-full bg-amber-300 text-slate-950 hover:bg-amber-200">
                  Acknowledge
                </Button>
              )}
              {incident.status !== 'RESOLVED' && incident.status !== 'ARCHIVED' && (
                <Button type="button" onClick={() => setModalAction('resolve')} className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300">
                  Resolve
                </Button>
              )}
              {incident.status === 'RESOLVED' && !incident.archivedAt && (
                <Button type="button" onClick={() => setModalAction('archive')} className="rounded-full bg-slate-900 text-white hover:bg-slate-800">
                  <Archive className="mr-2 h-4 w-4" /> Archive
                </Button>
              )}
            </div>
          </section>

          {(incident.primaryResourceNodeId || incident.operationId || incident.deploymentId) && (
            <ContextPanel
              title="Context Links"
              description="Related platforms and entities"
              actions={[
                incident.primaryResourceNodeId && (
                  <Link href={`/dashboard/resources?search=${incident.primaryResourceNodeId}`} className="flex items-center gap-2 hover:underline">
                    View Primary Resource <ExternalLink className="h-3 w-3" />
                  </Link>
                ),
                incident.operationId && (
                  <Link href={`/dashboard/operations/${incident.operationId}`} className="flex items-center gap-2 hover:underline">
                    View Linked Operation <ExternalLink className="h-3 w-3" />
                  </Link>
                ),
                incident.deploymentId && (
                  <Link href={`/dashboard/deployments/${incident.deploymentId}`} className="flex items-center gap-2 hover:underline">
                    View Linked Deployment <ExternalLink className="h-3 w-3" />
                  </Link>
                )
              ].filter(Boolean)}
            />
          )}

          {/* Note Composer */}
          {incident.status !== 'ARCHIVED' && (
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                Add Operator Note
              </h2>
              <form onSubmit={handleAddNote} className="mt-4 space-y-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Type a workflow note, findings, or update..."
                  maxLength={2000}
                  className="w-full min-h-24 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
                  disabled={isNoteSubmitting}
                />
                {noteError && <p className="text-xs text-rose-600">{noteError}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{newNote.length}/2000 chars</span>
                  <Button
                    type="submit"
                    disabled={isNoteSubmitting || !newNote.trim()}
                    size="sm"
                    className="rounded-full bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5"
                  >
                    <Send className="h-3 w-3" />
                    {isNoteSubmitting ? 'Posting...' : 'Post Note'}
                  </Button>
                </div>
              </form>
            </section>
          )}
        </div>

        <div className="space-y-4">
          {/* Vertical Timeline */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-5">Activity Timeline</h2>
            {timelineEvents.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No timeline events recorded.</p>
            ) : (
              <div className="relative pl-6 border-l border-slate-100 space-y-6">
                {timelineEvents.map((event) => (
                  <div key={event.id} className="relative group">
                    {/* Event badge/icon marker */}
                    <div className={`absolute -left-[35px] top-1 rounded-full border p-1.5 flex items-center justify-center bg-white shadow-sm transition-transform duration-200 group-hover:scale-110 ${getEventColorClass(event.type)}`}>
                      {getEventIcon(event.type)}
                    </div>
                    {/* Event details */}
                    <div>
                      <div className="flex items-baseline justify-between gap-4">
                        <h4 className="text-xs font-semibold text-slate-800">{event.title}</h4>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDate(event.occurredAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-650 leading-relaxed whitespace-pre-wrap">{event.message}</p>
                      {event.actorUserEmail && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="text-[10px] text-slate-400">Actor:</span>
                          <span className="text-[10px] font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">{event.actorUserEmail}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <EvidencePanel
            title={`Signal Evidence (${incident.evidence.length})`}
            description="Correlated observations that support this incident."
            icon={<Zap className="h-4 w-4 text-blue-600" />}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-medium text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Severity</th>
                    <th className="px-5 py-3">Signal</th>
                    <th className="px-5 py-3">Observed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {incident.evidence.map((sig) => (
                    <tr key={sig.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <span className={`font-semibold ${sig.role === 'TRIGGER' ? 'text-blue-700' : 'text-slate-500'}`}>{sig.role}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${severityTone(sig.severity)}`}>{sig.severity}</span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900 line-clamp-1">{sig.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{sig.type}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-500 whitespace-nowrap">{formatDate(sig.observedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </EvidencePanel>
        </div>
      </div>

      {modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{incident.status}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  {modalAction === 'acknowledge' ? 'Acknowledge incident' : modalAction === 'resolve' ? 'Resolve incident' : 'Archive incident'}
                </h2>
              </div>
              <button type="button" onClick={() => setModalAction(null)} disabled={isSubmitting} className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-700">
              Type <span className="font-semibold text-blue-700">{modalAction.toUpperCase()}</span> to continue.
            </p>
            {modalAction === 'resolve' && (
              <>
                <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="incident-resolution-note">Resolution note</label>
                <textarea
                  id="incident-resolution-note"
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  className="mt-2 min-h-28 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-300/40"
                  placeholder="How was this incident resolved?"
                />
              </>
            )}
            {actionError && <div className="mt-4 rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-800">{actionError}</div>}
            <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="incident-confirmation">Required token</label>
            <Input id="incident-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 border-slate-200 bg-white" autoFocus />
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setModalAction(null)} disabled={isSubmitting} className="rounded-full border-slate-200 bg-slate-50">Cancel</Button>
              <Button type="button" onClick={() => void submitAction()} disabled={confirmation !== modalAction.toUpperCase() || isSubmitting} className="rounded-full bg-slate-900 text-white hover:bg-slate-800">
                {isSubmitting ? 'Submitting...' : 'Confirm Action'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
