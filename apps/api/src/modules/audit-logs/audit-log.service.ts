import { prisma } from '@autoops/database';
import type { AuditLog } from '@autoops/types';

export class AuditLogService {
  async listAuditLogs(organizationId: string): Promise<AuditLog[]> {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });

    return logs.map((log) => ({
      id: log.id,
      organizationId: log.organizationId,
      actorId: log.actorId,
      action: log.action,
      provider: log.provider,
      projectId: log.projectId,
      environmentId: log.environmentId,
      operationId: log.operationId,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: this._toRecord(log.metadata),
      occurredAt: log.occurredAt.toISOString(),
    }));
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }
}

export const auditLogService = new AuditLogService();
