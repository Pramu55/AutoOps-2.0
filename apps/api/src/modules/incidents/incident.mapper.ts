import type { Prisma } from '@autoops/database';
import {
  IncidentDetail,
  IncidentEventType,
  IncidentSeverity,
  IncidentSignalRole,
  IncidentSource,
  IncidentStatus,
  IncidentSummary,
  IncidentTimelineEventSummary,
} from '@autoops/types';

export class IncidentMapper {
  static toSummary(record: Prisma.IncidentGetPayload<{}>): IncidentSummary {
    return {
      id: record.id,
      title: record.title,
      summary: record.summary,
      severity: record.severity as IncidentSeverity,
      status: record.status as IncidentStatus,
      source: record.source as IncidentSource,
      correlationKey: record.correlationKey,
      primaryResourceNodeId: record.primaryResourceNodeId,
      projectId: record.projectId,
      environmentId: record.environmentId,
      deploymentId: record.deploymentId,
      operationId: record.operationId,
      signalCount: record.signalCount,
      firstObservedAt: record.firstObservedAt.toISOString(),
      lastObservedAt: record.lastObservedAt.toISOString(),
      openedAt: record.openedAt.toISOString(),
      acknowledgedAt: record.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: record.resolvedAt?.toISOString() ?? null,
      archivedAt: record.archivedAt?.toISOString() ?? null,
      metadataSummary: (record.metadata as Record<string, string | number | boolean | null>) || {},
      labelsSummary: (record.labels as Record<string, string>) || {},
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  static toDetail(
    record: Prisma.IncidentGetPayload<{
      include: {
        linkedSignals: {
          include: { signal: true };
        };
        acknowledgedBy: { select: { id: true; name: true; email: true } };
        resolvedBy: { select: { id: true; name: true; email: true } };
      };
    }>,
  ): IncidentDetail {
    return {
      ...this.toSummary(record),
      evidence: record.linkedSignals.map((ls) => ({
        id: ls.id,
        signalId: ls.signalId,
        role: ls.role as IncidentSignalRole,
        type: ls.signal.type,
        title: ls.signal.title,
        severity: ls.signal.severity,
        observedAt: ls.signal.observedAt.toISOString(),
      })),
      acknowledgedBy: record.acknowledgedBy
        ? {
            id: record.acknowledgedBy.id,
            name: record.acknowledgedBy.name,
            email: record.acknowledgedBy.email,
          }
        : null,
      resolvedBy: record.resolvedBy
        ? {
            id: record.resolvedBy.id,
            name: record.resolvedBy.name,
            email: record.resolvedBy.email,
          }
        : null,
    };
  }

  static toTimelineEventSummary(
    record: Prisma.IncidentEventGetPayload<{}>,
  ): IncidentTimelineEventSummary {
    return {
      id: record.id,
      type: record.type as IncidentEventType,
      title: record.title,
      message: record.message,
      actorUserId: record.actorUserId,
      actorUserEmail: record.actorUserEmail,
      metadata: (record.metadata as Record<string, string | number | boolean | null>) || {},
      occurredAt: record.occurredAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    };
  }
}
