import { z } from 'zod';
import { idSchema } from './common.js';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentSource,
  IncidentSignalRole,
  IncidentEventType,
} from './enums.js';
import { OperationProvider, OperationType } from './operation.js';

export { IncidentSeverity, IncidentStatus, IncidentSource, IncidentSignalRole, IncidentEventType };

export const incidentParamsSchema = z.object({
  incidentId: idSchema,
});

export const incidentFilterSchema = z.object({
  status: z.nativeEnum(IncidentStatus).optional(),
  severity: z.nativeEnum(IncidentSeverity).optional(),
  source: z.nativeEnum(IncidentSource).optional(),
  primaryResourceNodeId: idSchema.optional(),
  projectId: idSchema.optional(),
  environmentId: idSchema.optional(),
  deploymentId: idSchema.optional(),
  operationId: idSchema.optional(),
  search: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type IncidentFilter = z.infer<typeof incidentFilterSchema>;

export const acknowledgeIncidentSchema = z.object({
  confirmationToken: z.literal('ACKNOWLEDGE'),
});

export const resolveIncidentSchema = z.object({
  confirmationToken: z.literal('RESOLVE'),
  resolutionNote: z.string().trim().min(3).max(1000).optional(),
});

export const archiveIncidentSchema = z.object({
  confirmationToken: z.literal('ARCHIVE'),
});

export const incidentNoteSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});
export type IncidentNoteInput = z.infer<typeof incidentNoteSchema>;

export interface IncidentActor {
  id: string;
  name: string | null;
  email: string | null;
}

export interface IncidentSignalEvidence {
  id: string;
  signalId: string;
  role: IncidentSignalRole;
  type: string;
  title: string;
  severity: string;
  observedAt: string;
}

export interface IncidentSummary {
  id: string;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: IncidentSource;
  correlationKey: string;
  primaryResourceNodeId: string | null;
  projectId: string | null;
  environmentId: string | null;
  deploymentId: string | null;
  operationId: string | null;
  signalCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  archivedAt: string | null;
  metadataSummary: Record<string, string | number | boolean | null>;
  labelsSummary: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentDetail extends IncidentSummary {
  evidence: IncidentSignalEvidence[];
  acknowledgedBy: IncidentActor | null;
  resolvedBy: IncidentActor | null;
}

export interface IncidentReadinessResponse {
  status: 'READY' | 'EMPTY' | 'DEGRADED';
  totalIncidents: number;
  openIncidents: number;
  acknowledgedIncidents: number;
  resolvedIncidents: number;
  criticalOpenCount: number;
  errorOpenCount: number;
  warningOpenCount: number;
  latestOpenedAt: string | null;
  checkedAt: string;
}

export interface IncidentListResponse {
  data: IncidentSummary[];
  pagination: {
    total: number;
    limit: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface IncidentCorrelationResponse {
  createdCount: number;
  updatedCount: number;
  linkedSignalCount: number;
  skippedSignalCount: number;
}

export interface IncidentActionResponse {
  incident: IncidentSummary;
}

export type IncidentTimelineEventType =
  | 'incident_detected'
  | 'incident_acknowledged'
  | 'incident_resolved'
  | 'incident_archived'
  | 'signal_observed'
  | 'operation_requested'
  | 'operation_pending_approval'
  | 'operation_approved'
  | 'operation_rejected'
  | 'operation_started'
  | 'operation_succeeded'
  | 'operation_failed'
  | 'deployment_event'
  | 'provider_evidence';

export type IncidentTimelineSource =
  | 'incident'
  | 'signal'
  | 'operation'
  | 'deployment'
  | 'governance'
  | 'provider';

export interface IncidentTimelineRelatedIds {
  incidentId: string;
  signalId?: string | null;
  operationId?: string | null;
  deploymentId?: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  resourceNodeId?: string | null;
  auditLogId?: string | null;
}

export interface IncidentTimelineEventSummary {
  id: string;
  source: IncidentTimelineSource;
  type: IncidentTimelineEventType;
  severity: string | null;
  status: string | null;
  title: string;
  description: string;
  relatedIds: IncidentTimelineRelatedIds;
  message: string;
  actorUserId: string | null;
  actorUserEmail: string | null;
  metadata: Record<string, string | number | boolean | null>;
  timestamp: string;
  occurredAt: string;
  createdAt: string;
}

export interface IncidentTimelineResponse {
  data: IncidentTimelineEventSummary[];
}

export type RemediationRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RemediationEvidence {
  source: 'incident' | 'signal' | 'timeline' | 'deployment' | 'operation' | 'resource';
  sourceId: string;
  type: string;
  label: string;
  occurredAt?: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface RemediationRecommendation {
  id: string;
  incidentId: string;
  title: string;
  description: string;
  provider: OperationProvider | 'AUTOOPS' | 'POLICY' | 'GITOPS';
  actionType: OperationType | 'INVESTIGATE' | 'REVIEW_POLICY' | 'REVIEW_GITOPS';
  reason: string;
  evidence: RemediationEvidence[];
  riskLevel: RemediationRiskLevel;
  confirmationToken: string | null;
  approvalRequired: boolean;
  canPrepareOperation: boolean;
  blockedReason?: string;
}
