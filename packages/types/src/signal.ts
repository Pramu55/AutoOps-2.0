import { z } from 'zod';
import {
  SignalSeverity,
  SignalSource,
  SignalStatus,
  SignalType,
} from './enums.js';

export const signalSeveritySchema = z.nativeEnum(SignalSeverity);
export const signalSourceSchema = z.nativeEnum(SignalSource);
export const signalStatusSchema = z.nativeEnum(SignalStatus);
export const signalTypeSchema = z.nativeEnum(SignalType);

export const signalMetadataSummarySchema = z.record(
  z.string().max(80),
  z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
);
export type SignalMetadataSummary = z.infer<typeof signalMetadataSummarySchema>;

export const SignalSummarySchema = z.object({
  id: z.string().uuid(),
  source: signalSourceSchema,
  type: signalTypeSchema,
  severity: signalSeveritySchema,
  status: signalStatusSchema,
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  resourceNodeId: z.string().uuid().nullable().optional(),
  operationId: z.string().uuid().nullable().optional(),
  deploymentId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  environmentId: z.string().uuid().nullable().optional(),
  observedAt: z.string().datetime(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  count: z.number().int().min(1),
  metadataSummary: signalMetadataSummarySchema.default({}),
  labelsSummary: signalMetadataSummarySchema.nullable().optional(),
  archivedAt: z.string().datetime().nullable(),
});
export type SignalSummary = z.infer<typeof SignalSummarySchema>;

export const SignalDetailSchema = SignalSummarySchema.extend({
  // Future: links to incident, etc.
});
export type SignalDetail = z.infer<typeof SignalDetailSchema>;

export const signalFilterSchema = z.object({
  source: signalSourceSchema.optional(),
  type: signalTypeSchema.optional(),
  severity: signalSeveritySchema.optional(),
  status: signalStatusSchema.optional(),
  resourceNodeId: z.string().uuid().optional(),
  operationId: z.string().uuid().optional(),
  deploymentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
  archived: z.enum(['active', 'archived', 'all']).default('active'),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type SignalFilter = z.infer<typeof signalFilterSchema>;

export const SignalListResponseSchema = z.object({
  items: z.array(SignalSummarySchema),
  nextCursor: z.string().uuid().nullable(),
  total: z.number().int().min(0),
});
export type SignalListResponse = z.infer<typeof SignalListResponseSchema>;

export const SignalReadinessResponseSchema = z.object({
  status: z.enum(['READY', 'EMPTY', 'DEGRADED']),
  totalSignals: z.number().int().min(0),
  activeSignals: z.number().int().min(0),
  warningCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  criticalCount: z.number().int().min(0),
  sourceCounts: z.record(signalSourceSchema, z.number().int().min(0)),
  severityCounts: z.record(signalSeveritySchema, z.number().int().min(0)),
  latestObservedAt: z.string().datetime().nullable(),
  checkedAt: z.string().datetime(),
});
export type SignalReadinessResponse = z.infer<typeof SignalReadinessResponseSchema>;

export type SignalIngestInput = {
  source: SignalSource;
  type: SignalType;
  severity: SignalSeverity;
  title: string;
  message: string;
  observedAt?: Date;
  resourceNodeId?: string | null;
  operationId?: string | null;
  deploymentId?: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  metadata?: Record<string, unknown>;
  labels?: Record<string, unknown> | null;
  dedupeMode?: 'DEDUPE' | 'EVENT';
};
