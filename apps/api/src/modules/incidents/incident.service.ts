import {
  prisma,
  IncidentSeverity as DbIncidentSeverity,
  IncidentStatus as DbIncidentStatus,
  IncidentSource as DbIncidentSource,
  IncidentSignalRole as DbIncidentSignalRole,
  OrgRole,
  type Prisma,
} from '@autoops/database';
import {
  IncidentDetail,
  IncidentFilter,
  IncidentListResponse,
  IncidentReadinessResponse,
  IncidentCorrelationResponse,
  IncidentStatus,
  SignalType,
  SignalSeverity,
  SignalStatus,
} from '@autoops/types';
import { BadRequestError, NotFoundError, UnauthorizedError } from '@autoops/utils';
import { operationAuthorizationService } from '../operations/operation-authorization.service.js';
import { IncidentMapper } from './incident.mapper.js';

export class IncidentService {
  async listIncidents(
    organizationId: string,
    userId: string,
    filter: IncidentFilter,
  ): Promise<IncidentListResponse> {
    await this._requireOrganizationMember(organizationId, userId);

    const where: Prisma.IncidentWhereInput = {
      organizationId,
      archivedAt: filter.status === IncidentStatus.ARCHIVED ? { not: null } : null,
      ...(filter.status && filter.status !== IncidentStatus.ARCHIVED
        ? { status: filter.status as DbIncidentStatus }
        : {}),
      ...(filter.severity ? { severity: filter.severity as DbIncidentSeverity } : {}),
      ...(filter.source ? { source: filter.source as DbIncidentSource } : {}),
      ...(filter.primaryResourceNodeId ? { primaryResourceNodeId: filter.primaryResourceNodeId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.environmentId ? { environmentId: filter.environmentId } : {}),
      ...(filter.deploymentId ? { deploymentId: filter.deploymentId } : {}),
      ...(filter.operationId ? { operationId: filter.operationId } : {}),
      ...(filter.search
        ? {
            OR: [
              { title: { contains: filter.search, mode: 'insensitive' } },
              { summary: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.from || filter.to
        ? {
            openedAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.incident.count({ where }),
      prisma.incident.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        take: filter.limit + 1,
        cursor: filter.cursor ? { id: filter.cursor } : undefined,
      }),
    ]);

    const hasMore = items.length > filter.limit;
    const data = hasMore ? items.slice(0, filter.limit) : items;
    const lastItem = data.at(-1);
    const nextCursor = hasMore ? lastItem?.id : undefined;

    return {
      data: data.map((item) => IncidentMapper.toSummary(item)),
      pagination: {
        total,
        limit: filter.limit,
        hasMore,
        nextCursor,
      },
    };
  }

  async getIncident(
    organizationId: string,
    userId: string,
    incidentId: string,
  ): Promise<IncidentDetail> {
    await this._requireOrganizationMember(organizationId, userId);

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      include: {
        linkedSignals: {
          include: { signal: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        acknowledgedBy: { select: { id: true, name: true, email: true } },
        resolvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!incident) throw new NotFoundError('Incident');

    return IncidentMapper.toDetail(incident);
  }

  async getIncidentReadiness(organizationId: string): Promise<IncidentReadinessResponse> {
    const [counts, latest] = await Promise.all([
      prisma.incident.groupBy({
        by: ['status', 'severity'],
        where: { organizationId, archivedAt: null },
        _count: true,
      }),
      prisma.incident.findFirst({
        where: { organizationId, archivedAt: null },
        orderBy: { openedAt: 'desc' },
        select: { openedAt: true },
      }),
    ]);

    const totalIncidents = counts.reduce((sum, c) => sum + c._count, 0);
    const openIncidents = counts
      .filter((c) => c.status === DbIncidentStatus.OPEN)
      .reduce((sum, c) => sum + c._count, 0);
    const acknowledgedIncidents = counts
      .filter((c) => c.status === DbIncidentStatus.ACKNOWLEDGED)
      .reduce((sum, c) => sum + c._count, 0);
    const resolvedIncidents = counts
      .filter((c) => c.status === DbIncidentStatus.RESOLVED)
      .reduce((sum, c) => sum + c._count, 0);

    const criticalOpenCount = counts
      .filter((c) => c.status === DbIncidentStatus.OPEN && c.severity === DbIncidentSeverity.CRITICAL)
      .reduce((sum, c) => sum + c._count, 0);
    const errorOpenCount = counts
      .filter((c) => c.status === DbIncidentStatus.OPEN && c.severity === DbIncidentSeverity.ERROR)
      .reduce((sum, c) => sum + c._count, 0);
    const warningOpenCount = counts
      .filter((c) => c.status === DbIncidentStatus.OPEN && c.severity === DbIncidentSeverity.WARNING)
      .reduce((sum, c) => sum + c._count, 0);

    return {
      status: totalIncidents === 0 ? 'EMPTY' : 'READY',
      totalIncidents,
      openIncidents,
      acknowledgedIncidents,
      resolvedIncidents,
      criticalOpenCount,
      errorOpenCount,
      warningOpenCount,
      latestOpenedAt: latest?.openedAt.toISOString() ?? null,
      checkedAt: new Date().toISOString(),
    };
  }

  async acknowledgeIncident(
    organizationId: string,
    userId: string,
    incidentId: string,
  ): Promise<IncidentDetail> {
    await this._requirePermission(organizationId, userId, 'ACKNOWLEDGE');

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) throw new NotFoundError('Incident');
    if (incident.status !== DbIncidentStatus.OPEN) {
      throw new BadRequestError('Only open incidents can be acknowledged.');
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: DbIncidentStatus.ACKNOWLEDGED,
        acknowledgedByUserId: userId,
        acknowledgedAt: new Date(),
      },
      include: {
        linkedSignals: { include: { signal: true } },
        acknowledgedBy: true,
        resolvedBy: true,
      },
    });

    return IncidentMapper.toDetail(updated as any);
  }

  async resolveIncident(
    organizationId: string,
    userId: string,
    incidentId: string,
  ): Promise<IncidentDetail> {
    await this._requirePermission(organizationId, userId, 'RESOLVE');

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) throw new NotFoundError('Incident');
    if (incident.status === DbIncidentStatus.RESOLVED) {
      throw new BadRequestError('Incident is already resolved.');
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: DbIncidentStatus.RESOLVED,
        resolvedByUserId: userId,
        resolvedAt: new Date(),
      },
      include: {
        linkedSignals: { include: { signal: true } },
        acknowledgedBy: true,
        resolvedBy: true,
      },
    });

    return IncidentMapper.toDetail(updated as any);
  }

  async archiveIncident(
    organizationId: string,
    userId: string,
    incidentId: string,
  ): Promise<IncidentDetail> {
    await this._requirePermission(organizationId, userId, 'ARCHIVE');

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) throw new NotFoundError('Incident');

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        archivedAt: new Date(),
      },
      include: {
        linkedSignals: { include: { signal: true } },
        acknowledgedBy: true,
        resolvedBy: true,
      },
    });

    return IncidentMapper.toDetail(updated as any);
  }

  async correlateSignalsForOrg(
    organizationId: string,
  ): Promise<IncidentCorrelationResponse> {
    const signals = await prisma.resourceSignal.findMany({
      where: {
        organizationId,
        status: SignalStatus.ACTIVE,
        severity: { in: [SignalSeverity.WARNING, SignalSeverity.ERROR, SignalSeverity.CRITICAL] },
        archivedAt: null,
      },
      orderBy: { observedAt: 'asc' },
    });

    let createdCount = 0;
    let updatedCount = 0;
    let linkedSignalCount = 0;
    let skippedSignalCount = 0;

    for (const signal of signals) {
      const result = await this.correlateSignal(organizationId, signal.id);
      if (result.action === 'CREATED') createdCount++;
      else if (result.action === 'UPDATED') updatedCount++;
      else if (result.action === 'SKIPPED') skippedSignalCount++;

      if (result.action !== 'SKIPPED') linkedSignalCount++;
    }

    return {
      createdCount,
      updatedCount,
      linkedSignalCount,
      skippedSignalCount,
    };
  }

  async correlateSignal(
    organizationId: string,
    signalId: string,
  ): Promise<{ action: 'CREATED' | 'UPDATED' | 'SKIPPED' }> {
    const signal = await prisma.resourceSignal.findFirst({
      where: { id: signalId, organizationId },
      include: { resourceNode: true },
    });

    if (!signal) return { action: 'SKIPPED' };

    const correlationKey = this.buildCorrelationKey(signal as any);

    const existing = await prisma.incident.findFirst({
      where: {
        organizationId,
        correlationKey,
        status: { in: [DbIncidentStatus.OPEN, DbIncidentStatus.ACKNOWLEDGED] },
        archivedAt: null,
      },
    });

    if (existing) {
      // Link signal if not already linked
      const link = await prisma.incidentSignal.findUnique({
        where: { incidentId_signalId: { incidentId: existing.id, signalId: signal.id } },
      });

      if (!link) {
        await prisma.$transaction([
          prisma.incidentSignal.create({
            data: {
              organizationId,
              incidentId: existing.id,
              signalId: signal.id,
              role: DbIncidentSignalRole.RELATED,
            },
          }),
          prisma.incident.update({
            where: { id: existing.id },
            data: {
              signalCount: { increment: 1 },
              lastObservedAt: signal.observedAt > existing.lastObservedAt ? signal.observedAt : undefined,
              severity: this._escalateSeverity(existing.severity as DbIncidentSeverity, signal.severity as SignalSeverity),
            },
          }),
        ]);
        return { action: 'UPDATED' };
      }
      return { action: 'SKIPPED' };
    }

    // Create new incident
    await prisma.$transaction(async (tx) => {
      const incident = await tx.incident.create({
        data: {
          organizationId,
          title: this._deriveTitle(signal as any),
          summary: `Correlated from signal: ${signal.title}. ${signal.message}`,
          severity: this._mapSeverity(signal.severity as SignalSeverity),
          status: DbIncidentStatus.OPEN,
          source: DbIncidentSource.SIGNAL_CORRELATION,
          correlationKey,
          primaryResourceNodeId: signal.resourceNodeId,
          projectId: signal.projectId,
          environmentId: signal.environmentId,
          deploymentId: signal.deploymentId,
          operationId: signal.operationId,
          signalCount: 1,
          firstObservedAt: signal.observedAt,
          lastObservedAt: signal.observedAt,
          metadata: {
            source: signal.source,
            type: signal.type,
            rule: 'DETERMINISTIC_V1',
          },
        },
      });

      await tx.incidentSignal.create({
        data: {
          organizationId,
          incidentId: incident.id,
          signalId: signal.id,
          role: DbIncidentSignalRole.TRIGGER,
        },
      });
    });

    return { action: 'CREATED' };
  }

  buildCorrelationKey(signal: any): string {
    const resourcePart = signal.resourceNodeId || signal.resourceNode?.urn || 'no-resource';
    const typePart = this._groupType(signal.type);
    const sourcePart = signal.source;

    // For some types, we want broader grouping
    if (signal.type === SignalType.PROVIDER_UNREACHABLE || signal.type === SignalType.PROVIDER_AUTH_FAILED) {
      return `provider-connectivity:${sourcePart}`;
    }

    if (signal.operationId) {
      return `operation:${signal.operationId}`;
    }

    if (signal.deploymentId) {
      return `deployment:${signal.deploymentId}`;
    }

    return `${sourcePart}:${typePart}:${resourcePart}`;
  }

  private _groupType(type: string): string {
    if (type.startsWith('KUBERNETES_')) return 'kubernetes-context';
    if (type.startsWith('DOCKER_')) return 'docker-context';
    if (type.startsWith('JENKINS_')) return 'jenkins-context';
    return type;
  }

  private _deriveTitle(signal: any): string {
    if (signal.resourceNode) {
      return `${signal.resourceNode.displayName}: ${signal.title}`;
    }
    return signal.title;
  }

  private _mapSeverity(severity: SignalSeverity): DbIncidentSeverity {
    switch (severity) {
      case SignalSeverity.CRITICAL: return DbIncidentSeverity.CRITICAL;
      case SignalSeverity.ERROR: return DbIncidentSeverity.ERROR;
      case SignalSeverity.WARNING: return DbIncidentSeverity.WARNING;
      default: return DbIncidentSeverity.INFO;
    }
  }

  private _escalateSeverity(current: DbIncidentSeverity, incoming: SignalSeverity): DbIncidentSeverity {
    const mapped = this._mapSeverity(incoming);
    const order = {
      [DbIncidentSeverity.INFO]: 0,
      [DbIncidentSeverity.WARNING]: 1,
      [DbIncidentSeverity.ERROR]: 2,
      [DbIncidentSeverity.CRITICAL]: 3,
    };
    return order[mapped] > order[current] ? mapped : current;
  }

  private async _requireOrganizationMember(organizationId: string, userId: string): Promise<void> {
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    if (!role) throw new UnauthorizedError('You do not have permission to view incidents.');
  }

  private async _requirePermission(organizationId: string, userId: string, action: string): Promise<void> {
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    if (!role) throw new UnauthorizedError(`You do not have permission to ${action.toLowerCase()} incidents.`);

    const allowed: OrgRole[] =
      action === 'ARCHIVE'
        ? [OrgRole.OWNER, OrgRole.ADMIN]
        : [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER];

    if (!allowed.includes(role)) {
      throw new UnauthorizedError(`You do not have permission to ${action.toLowerCase()} incidents.`);
    }
  }
}

export const incidentService = new IncidentService();
