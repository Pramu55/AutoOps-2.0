export interface AuditLog {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  action: string;
  provider: string | null;
  projectId: string | null;
  environmentId: string | null;
  operationId: string | null;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}
