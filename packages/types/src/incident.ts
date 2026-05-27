import { z } from 'zod';
import { idSchema } from './common.js';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentSource,
  IncidentSignalRole,
} from './enums.js';

export { IncidentSeverity, IncidentStatus, IncidentSource, IncidentSignalRole };

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
  metadataSummary: Record<string, any>;
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
