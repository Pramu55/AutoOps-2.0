import { z } from 'zod';
import { IncidentSeverity, IncidentStatus, AlertChannelKind } from './enums.js';

export const metricQuerySchema = z.object({
  metric: z.string().min(1).max(120),
  start: z.string().datetime(),
  end: z.string().datetime(),
  step: z.string().regex(/^\d+[smhd]$/).default('30s'),
  labels: z.record(z.string(), z.string()).optional(),
});
export type MetricQuery = z.infer<typeof metricQuerySchema>;

export interface MetricSeries {
  metric: string;
  labels: Record<string, string>;
  points: Array<[number, number]>;
}

export const createIncidentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(8000).optional(),
  severity: z.nativeEnum(IncidentSeverity).default(IncidentSeverity.SEV3),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export interface Incident {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export const createAlertSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2).max(120),
  query: z.string().min(1).max(2000),
  threshold: z.number(),
  comparator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'neq']),
  durationSeconds: z.number().int().min(30).max(86400),
  channels: z.array(z.nativeEnum(AlertChannelKind)).min(1),
});
export type CreateAlertInput = z.infer<typeof createAlertSchema>;
