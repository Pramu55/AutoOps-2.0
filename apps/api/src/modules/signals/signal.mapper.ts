import type { Prisma, ResourceSignal } from '@prisma/client';
import { sanitizeMetadata } from '@autoops/utils';
import type {
  SignalMetadataSummary,
  SignalSummary,
} from '@autoops/types';

export function sanitizeSignalMetadata(value: unknown): SignalMetadataSummary {
  return sanitizeMetadata(value) as SignalMetadataSummary;
}

function jsonToSummary(value: Prisma.JsonValue | null): SignalMetadataSummary {
  return sanitizeSignalMetadata(value);
}

export function mapResourceSignalSummary(signal: ResourceSignal): SignalSummary {
  return {
    id: signal.id,
    source: signal.source as SignalSummary['source'],
    type: signal.type as SignalSummary['type'],
    severity: signal.severity as SignalSummary['severity'],
    status: signal.status as SignalSummary['status'],
    title: signal.title,
    message: signal.message,
    resourceNodeId: signal.resourceNodeId,
    operationId: signal.operationId,
    deploymentId: signal.deploymentId,
    projectId: signal.projectId,
    environmentId: signal.environmentId,
    observedAt: signal.observedAt.toISOString(),
    firstSeenAt: signal.firstSeenAt.toISOString(),
    lastSeenAt: signal.lastSeenAt.toISOString(),
    count: signal.count,
    metadataSummary: jsonToSummary(signal.metadata),
    labelsSummary: signal.labels ? jsonToSummary(signal.labels) : null,
    archivedAt: signal.archivedAt?.toISOString() ?? null,
  };
}
