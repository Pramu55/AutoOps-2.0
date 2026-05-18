import { z } from 'zod';
import { idSchema } from './common.js';
import { IncidentSeverity, IncidentStatus } from './enums.js';
import type { OperationProvider } from './operation.js';

export const IncidentRunbookActionType = {
  OBSERVE: 'OBSERVE',
  VERIFY: 'VERIFY',
  RECOVER: 'RECOVER',
  ESCALATE: 'ESCALATE',
} as const;
export type IncidentRunbookActionType =
  (typeof IncidentRunbookActionType)[keyof typeof IncidentRunbookActionType];

export const incidentParamsSchema = z.object({
  incidentId: idSchema,
});

export const incidentListQuerySchema = z.object({
  status: z.nativeEnum(IncidentStatus).optional(),
  severity: z.nativeEnum(IncidentSeverity).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;

export const acknowledgeIncidentSchema = z.object({
  confirmationToken: z.literal('ACKNOWLEDGE'),
});

export const resolveIncidentSchema = z.object({
  confirmationToken: z.literal('RESOLVE'),
  resolutionNote: z.string().trim().min(3).max(1000),
});

export interface IncidentActor {
  id: string;
  name: string | null;
  email: string | null;
}

export interface IncidentPermissionHints {
  canAcknowledge: boolean;
  canResolve: boolean;
  reason: string | null;
}

export interface IncidentRunbookStep {
  order: number;
  title: string;
  description: string;
  actionType: IncidentRunbookActionType;
  linkLabel?: string;
  linkHref?: string;
}

export interface IncidentRunbookAction {
  label: string;
  href: string;
}

export interface IncidentRunbook {
  key: string;
  title: string;
  summary: string;
  steps: IncidentRunbookStep[];
  relatedActions: IncidentRunbookAction[];
}

export interface IncidentListItem {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: string;
  provider: OperationProvider | null;
  targetLabel: string | null;
  safeErrorMessage: string | null;
  linkedOperationId: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: IncidentActor | null;
  resolvedAt: string | null;
  resolvedBy: IncidentActor | null;
  resolutionNote: string | null;
  permissions: IncidentPermissionHints;
}

export interface IncidentDetail extends IncidentListItem {
  description: string | null;
  runbook: IncidentRunbook;
}

export interface IncidentSummary {
  open: number;
  acknowledged: number;
  resolvedRecent: number;
  criticalOpen: number;
  latest: IncidentListItem[];
}

export interface IncidentListResponse {
  items: IncidentListItem[];
  summary: IncidentSummary;
}

export interface AcknowledgeIncidentResponse {
  incident: IncidentDetail;
}

export interface ResolveIncidentResponse {
  incident: IncidentDetail;
}
