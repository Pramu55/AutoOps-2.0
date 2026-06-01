import {
  prisma,
  IncidentEventType as DbIncidentEventType,
  OperationStatus as DbOperationStatus,
  type Prisma,
} from '@autoops/database';
import type {
  IncidentTimelineEventSummary,
  IncidentTimelineEventType,
  IncidentTimelineResponse,
  IncidentTimelineSource,
} from '@autoops/types';
import { NotFoundError, sanitizeMetadata } from '@autoops/utils';

const MAX_TIMELINE_EVENTS = 300;
const CORRELATION_WINDOW_MS = 30 * 60 * 1000;

type TimelineEvent = IncidentTimelineEventSummary;

type IncidentRecord = Prisma.IncidentGetPayload<{
  include: {
    linkedSignals: {
      include: { signal: true };
    };
  };
}>;

export class IncidentTimelineService {
  async buildTimeline(
    organizationId: string,
    incidentId: string,
  ): Promise<IncidentTimelineResponse> {
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      include: {
        linkedSignals: {
          include: { signal: true },
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
      },
    });

    if (!incident) throw new NotFoundError('Incident');

    const incidentEvents = await prisma.incidentEvent.findMany({
      where: { organizationId, incidentId },
      orderBy: { occurredAt: 'asc' },
      take: 200,
    });

    const operationIds = this._uniqueIds([
      incident.operationId,
      this._operationIdFromCorrelationKey(incident.correlationKey),
      ...incident.linkedSignals.map((link) => link.signal.operationId),
    ]);
    const deploymentIds = this._uniqueIds([
      incident.deploymentId,
      this._deploymentIdFromCorrelationKey(incident.correlationKey),
      ...incident.linkedSignals.map((link) => link.signal.deploymentId),
    ]);

    const window = this._correlationWindow(incident);
    const correlatedOperationWhere = this._buildCorrelatedOperationWhere(
      organizationId,
      incident,
      operationIds,
      window,
    );

    const [operations, deploymentEvents, auditLogs] = await Promise.all([
      correlatedOperationWhere
        ? prisma.operation.findMany({
            where: correlatedOperationWhere,
            orderBy: { createdAt: 'asc' },
            take: 50,
          })
        : Promise.resolve([]),
      this._listDeploymentEvents(incident, deploymentIds, window),
      operationIds.length
        ? prisma.auditLog.findMany({
            where: {
              organizationId,
              operationId: { in: operationIds },
            },
            orderBy: { occurredAt: 'asc' },
            take: 50,
          })
        : Promise.resolve([]),
    ]);

    const relatedOperationIds = this._uniqueIds([
      ...operationIds,
      ...operations.map((operation) => operation.id),
    ]);

    const operationAuditLogs = relatedOperationIds.length === operationIds.length
      ? auditLogs
      : await prisma.auditLog.findMany({
          where: {
            organizationId,
            operationId: { in: relatedOperationIds },
          },
          orderBy: { occurredAt: 'asc' },
          take: 75,
        });

    const events: TimelineEvent[] = [];
    const hasIncidentOpenedEvent = incidentEvents.some((event) => event.type === DbIncidentEventType.INCIDENT_OPENED);
    if (!hasIncidentOpenedEvent) {
      events.push(this._incidentDetectedFromRecord(incident));
    }

    events.push(...incidentEvents.map((event) => this._fromIncidentEvent(incident, event)));
    events.push(...incident.linkedSignals.map((link) => this._fromSignal(incident, link)));
    events.push(...operations.flatMap((operation) => this._fromOperation(incident.id, operation)));
    events.push(...deploymentEvents.map((event) => this._fromDeploymentEvent(incident.id, event)));
    events.push(...operationAuditLogs.map((log) => this._fromAuditLog(incident.id, log)));

    events.sort((a, b) => {
      const timeDiff = Date.parse(a.timestamp) - Date.parse(b.timestamp);
      return timeDiff || a.id.localeCompare(b.id);
    });

    return {
      data: events.slice(0, MAX_TIMELINE_EVENTS),
    };
  }

  private _incidentDetectedFromRecord(incident: IncidentRecord): TimelineEvent {
    return this._event({
      id: `incident:${incident.id}:detected`,
      incidentId: incident.id,
      timestamp: incident.openedAt,
      source: 'incident',
      type: 'incident_detected',
      severity: incident.severity,
      status: incident.status,
      title: 'Incident detected',
      description: incident.summary,
      metadata: {
        correlationKey: incident.correlationKey,
        source: incident.source,
        signalCount: incident.signalCount,
      },
      relatedIds: {
        operationId: incident.operationId,
        deploymentId: incident.deploymentId,
        projectId: incident.projectId,
        environmentId: incident.environmentId,
        resourceNodeId: incident.primaryResourceNodeId,
      },
    });
  }

  private _fromIncidentEvent(
    incident: IncidentRecord,
    event: Prisma.IncidentEventGetPayload<{}>,
  ): TimelineEvent {
    const type = this._mapIncidentEventType(event.type, event.metadata);
    return this._event({
      id: event.id,
      incidentId: incident.id,
      timestamp: event.occurredAt,
      createdAt: event.createdAt,
      source: 'incident',
      type,
      severity: incident.severity,
      status: this._statusFromIncidentEvent(event.type, event.metadata) ?? incident.status,
      title: event.title,
      description: event.message,
      actorUserId: event.actorUserId,
      actorUserEmail: event.actorUserEmail,
      metadata: event.metadata,
      relatedIds: {
        signalId: this._stringFromMetadata(event.metadata, 'signalId'),
        operationId: this._stringFromMetadata(event.metadata, 'operationId') ?? incident.operationId,
        deploymentId: incident.deploymentId,
        projectId: incident.projectId,
        environmentId: incident.environmentId,
        resourceNodeId: incident.primaryResourceNodeId,
      },
    });
  }

  private _fromSignal(
    incident: IncidentRecord,
    link: IncidentRecord['linkedSignals'][number],
  ): TimelineEvent {
    const signal = link.signal;
    return this._event({
      id: `signal:${signal.id}`,
      incidentId: incident.id,
      timestamp: signal.observedAt,
      source: 'signal',
      type: 'signal_observed',
      severity: signal.severity,
      status: signal.status,
      title: signal.title,
      description: signal.message,
      metadata: {
        ...this._safeMetadata(signal.metadata),
        signalType: signal.type,
        signalSource: signal.source,
        role: link.role,
        count: signal.count,
      },
      relatedIds: {
        signalId: signal.id,
        operationId: signal.operationId,
        deploymentId: signal.deploymentId,
        projectId: signal.projectId,
        environmentId: signal.environmentId,
        resourceNodeId: signal.resourceNodeId,
      },
    });
  }

  private _fromOperation(
    incidentId: string,
    operation: Prisma.OperationGetPayload<{}>,
  ): TimelineEvent[] {
    const base = {
      incidentId,
      source: 'operation' as IncidentTimelineSource,
      severity: this._severityFromOperationStatus(operation.status),
      relatedIds: {
        operationId: operation.id,
        projectId: operation.projectId,
        environmentId: operation.environmentId,
      },
    };
    const metadata = {
      provider: operation.provider,
      operationType: operation.operationType,
      input: this._summarizeMetadata(operation.input),
      result: this._summarizeMetadata(operation.result),
      error: this._summarizeMetadata(operation.error),
    };

    const events: TimelineEvent[] = [
      this._event({
        ...base,
        id: `operation:${operation.id}:requested`,
        timestamp: operation.createdAt,
        type: operation.status === DbOperationStatus.PENDING_APPROVAL
          ? 'operation_pending_approval'
          : 'operation_requested',
        status: operation.status,
        title: `${operation.provider} ${operation.operationType}`,
        description: `Operation ${operation.operationType} was requested.`,
        actorUserId: operation.requestedByUserId,
        metadata,
      }),
    ];

    if (operation.approvedAt) {
      events.push(this._event({
        ...base,
        id: `operation:${operation.id}:approved`,
        timestamp: operation.approvedAt,
        type: 'operation_approved',
        status: operation.status,
        title: 'Operation approved',
        description: `${operation.operationType} was approved.`,
        actorUserId: operation.approvedByUserId,
        metadata,
      }));
    }

    if (operation.rejectedAt || operation.status === DbOperationStatus.REJECTED) {
      events.push(this._event({
        ...base,
        id: `operation:${operation.id}:rejected`,
        timestamp: operation.rejectedAt ?? operation.updatedAt,
        type: 'operation_rejected',
        status: operation.status,
        title: 'Operation rejected',
        description: `${operation.operationType} was rejected.`,
        actorUserId: operation.rejectedByUserId,
        metadata,
      }));
    }

    if (operation.status === DbOperationStatus.RUNNING) {
      events.push(this._event({
        ...base,
        id: `operation:${operation.id}:started`,
        timestamp: operation.updatedAt,
        type: 'operation_started',
        status: operation.status,
        title: 'Operation started',
        description: `${operation.operationType} is running.`,
        metadata,
      }));
    }

    if (operation.status === DbOperationStatus.SUCCEEDED) {
      events.push(this._event({
        ...base,
        id: `operation:${operation.id}:succeeded`,
        timestamp: operation.updatedAt,
        type: 'operation_succeeded',
        status: operation.status,
        title: 'Operation succeeded',
        description: `${operation.operationType} completed successfully.`,
        metadata,
      }));
    }

    if (operation.status === DbOperationStatus.FAILED || operation.status === DbOperationStatus.CANCELLED) {
      events.push(this._event({
        ...base,
        id: `operation:${operation.id}:failed`,
        timestamp: operation.updatedAt,
        type: 'operation_failed',
        status: operation.status,
        title: operation.status === DbOperationStatus.CANCELLED ? 'Operation cancelled' : 'Operation failed',
        description: `${operation.operationType} ended with status ${operation.status}.`,
        metadata,
      }));
    }

    return events;
  }

  private _fromDeploymentEvent(
    incidentId: string,
    event: Prisma.DeploymentEventGetPayload<{ include: { deployment: true } }>,
  ): TimelineEvent {
    return this._event({
      id: event.id,
      incidentId,
      timestamp: event.occurredAt,
      source: 'deployment',
      type: 'deployment_event',
      severity: this._severityFromLogLevel(event.level),
      status: event.deployment.status,
      title: event.type,
      description: event.message,
      metadata: event.metadata,
      relatedIds: {
        deploymentId: event.deploymentId,
        projectId: event.deployment.projectId,
        environmentId: event.deployment.environmentId,
      },
    });
  }

  private _fromAuditLog(
    incidentId: string,
    log: Prisma.AuditLogGetPayload<{}>,
  ): TimelineEvent {
    return this._event({
      id: log.id,
      incidentId,
      timestamp: log.occurredAt,
      source: 'governance',
      type: 'provider_evidence',
      severity: null,
      status: String(log.action),
      title: `Governance evidence: ${log.action}`,
      description: `${log.resourceType} activity recorded for related operation.`,
      actorUserId: log.actorId,
      metadata: {
        ...this._safeMetadata(log.metadata),
        provider: log.provider,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
      },
      relatedIds: {
        auditLogId: log.id,
        operationId: log.operationId,
        projectId: log.projectId,
        environmentId: log.environmentId,
      },
    });
  }

  private async _listDeploymentEvents(
    incident: IncidentRecord,
    deploymentIds: string[],
    window: { gte: Date; lte: Date },
  ): Promise<Prisma.DeploymentEventGetPayload<{ include: { deployment: true } }>[]> {
    const directWhere: Prisma.DeploymentEventWhereInput[] = deploymentIds.map((deploymentId) => ({
      deploymentId,
      deployment: {
        project: { organizationId: incident.organizationId },
      },
    }));

    if (incident.projectId && incident.environmentId) {
      directWhere.push({
        occurredAt: window,
        deployment: {
          projectId: incident.projectId,
          environmentId: incident.environmentId,
          project: { organizationId: incident.organizationId },
        },
      });
    }

    if (!directWhere.length) return [];

    return prisma.deploymentEvent.findMany({
      where: { OR: directWhere },
      include: { deployment: true },
      orderBy: { occurredAt: 'asc' },
      take: 75,
    });
  }

  private _buildCorrelatedOperationWhere(
    organizationId: string,
    incident: IncidentRecord,
    operationIds: string[],
    window: { gte: Date; lte: Date },
  ): Prisma.OperationWhereInput | null {
    const or: Prisma.OperationWhereInput[] = operationIds.length ? [{ id: { in: operationIds } }] : [];

    if (incident.projectId && incident.environmentId) {
      or.push({
        projectId: incident.projectId,
        environmentId: incident.environmentId,
        createdAt: window,
      });
    } else if (incident.projectId) {
      or.push({
        projectId: incident.projectId,
        createdAt: window,
      });
    }

    if (!or.length) return null;
    return { organizationId, OR: or };
  }

  private _event(input: {
    id: string;
    incidentId: string;
    timestamp: Date;
    createdAt?: Date;
    source: IncidentTimelineSource;
    type: IncidentTimelineEventType;
    severity: string | null;
    status: string | null;
    title: string;
    description: string;
    actorUserId?: string | null;
    actorUserEmail?: string | null;
    metadata?: unknown;
    relatedIds?: Omit<TimelineEvent['relatedIds'], 'incidentId'>;
  }): TimelineEvent {
    const timestamp = input.timestamp.toISOString();
    return {
      id: input.id,
      source: input.source,
      type: input.type,
      severity: input.severity,
      status: input.status,
      title: input.title,
      description: input.description,
      relatedIds: {
        incidentId: input.incidentId,
        ...(input.relatedIds ?? {}),
      },
      message: input.description,
      actorUserId: input.actorUserId ?? null,
      actorUserEmail: input.actorUserEmail ?? null,
      metadata: this._safeMetadata(input.metadata),
      timestamp,
      occurredAt: timestamp,
      createdAt: (input.createdAt ?? input.timestamp).toISOString(),
    };
  }

  private _mapIncidentEventType(type: DbIncidentEventType, metadata: unknown): IncidentTimelineEventType {
    if (type === DbIncidentEventType.INCIDENT_OPENED) return 'incident_detected';
    if (type === DbIncidentEventType.ACKNOWLEDGED) return 'incident_acknowledged';
    if (type === DbIncidentEventType.RESOLVED) return 'incident_resolved';
    if (type === DbIncidentEventType.ARCHIVED) return 'incident_archived';
    if (type === DbIncidentEventType.SIGNAL_LINKED || type === DbIncidentEventType.EVIDENCE_ADDED) return 'signal_observed';
    if (type === DbIncidentEventType.STATUS_CHANGED) {
      const newStatus = this._statusFromIncidentEvent(type, metadata);
      if (newStatus === 'ACKNOWLEDGED') return 'incident_acknowledged';
      if (newStatus === 'RESOLVED') return 'incident_resolved';
      if (newStatus === 'ARCHIVED') return 'incident_archived';
    }
    return 'provider_evidence';
  }

  private _statusFromIncidentEvent(type: DbIncidentEventType, metadata: unknown): string | null {
    if (type === DbIncidentEventType.ACKNOWLEDGED) return 'ACKNOWLEDGED';
    if (type === DbIncidentEventType.RESOLVED) return 'RESOLVED';
    if (type === DbIncidentEventType.ARCHIVED) return 'ARCHIVED';
    return this._stringFromMetadata(metadata, 'newStatus');
  }

  private _stringFromMetadata(metadata: unknown, key: string): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }

  private _safeMetadata(value: unknown): Record<string, string | number | boolean | null> {
    return sanitizeMetadata(value);
  }

  private _summarizeMetadata(value: unknown): string | null {
    const summary = this._safeMetadata(value);
    const keys = Object.keys(summary);
    return keys.length ? keys.join(', ') : null;
  }

  private _uniqueIds(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
  }

  private _operationIdFromCorrelationKey(correlationKey: string): string | null {
    return correlationKey.startsWith('operation:') ? correlationKey.slice('operation:'.length) || null : null;
  }

  private _deploymentIdFromCorrelationKey(correlationKey: string): string | null {
    return correlationKey.startsWith('deployment:') ? correlationKey.slice('deployment:'.length) || null : null;
  }

  private _correlationWindow(incident: IncidentRecord): { gte: Date; lte: Date } {
    return {
      gte: new Date(incident.firstObservedAt.getTime() - CORRELATION_WINDOW_MS),
      lte: new Date(incident.lastObservedAt.getTime() + CORRELATION_WINDOW_MS),
    };
  }

  private _severityFromOperationStatus(status: DbOperationStatus): string | null {
    if (status === DbOperationStatus.FAILED || status === DbOperationStatus.REJECTED) return 'ERROR';
    if (status === DbOperationStatus.CANCELLED || status === DbOperationStatus.PENDING_APPROVAL) return 'WARNING';
    return 'INFO';
  }

  private _severityFromLogLevel(level: string): string | null {
    if (level === 'ERROR' || level === 'FATAL') return 'ERROR';
    if (level === 'WARN') return 'WARNING';
    return 'INFO';
  }
}

export const incidentTimelineService = new IncidentTimelineService();
