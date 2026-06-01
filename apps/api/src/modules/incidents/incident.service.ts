import {
  prisma,
  IncidentSeverity as DbIncidentSeverity,
  IncidentStatus as DbIncidentStatus,
  IncidentSource as DbIncidentSource,
  IncidentSignalRole as DbIncidentSignalRole,
  IncidentEventType as DbIncidentEventType,
  DeploymentStatus as DbDeploymentStatus,
  OrgRole,
  type Prisma,
} from '@autoops/database';
import {
  IncidentDetail,
  IncidentFilter,
  IncidentListResponse,
  IncidentReadinessResponse,
  IncidentCorrelationResponse,
  IncidentNoteInput,
  IncidentStatus,
  SignalType,
  SignalSeverity,
  SignalStatus,
  type Operation,
  type PrepareRemediationRecommendationInput,
  type PrepareRemediationRecommendationResponse,
  type IncidentTimelineResponse,
  type RemediationRecommendation,
} from '@autoops/types';
import { BadRequestError, NotFoundError, UnauthorizedError } from '@autoops/utils';
import { sanitizeMetadata } from '@autoops/utils';
import { operationAuthorizationService } from '../operations/operation-authorization.service.js';
import { IncidentMapper } from './incident.mapper.js';
import { incidentTimelineService } from './incident-timeline.service.js';
import {
  buildRemediationPreparationPlan,
  buildRemediationRecommendations,
} from './remediation-rules.service.js';
import { operationService } from '../operations/operation.service.js';

interface RecordEventInput {
  organizationId: string;
  incidentId: string;
  type: DbIncidentEventType;
  title: string;
  message: string;
  actorUserId?: string | null;
  actorUserEmail?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

type AuditRequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

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

    const now = new Date();
    const userInfo = await this._getUserInfo(userId);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: DbIncidentStatus.ACKNOWLEDGED,
          acknowledgedByUserId: userId,
          acknowledgedAt: now,
        },
        include: {
          linkedSignals: { include: { signal: true } },
          acknowledgedBy: true,
          resolvedBy: true,
        },
      });

      await tx.incidentEvent.create({
        data: {
          organizationId,
          incidentId,
          type: DbIncidentEventType.ACKNOWLEDGED,
          actorUserId: userId,
          actorUserEmail: userInfo.email,
          title: 'Incident acknowledged',
          message: `Acknowledged by ${userInfo.email}`,
          metadata: {},
          occurredAt: now,
        },
      });

      await tx.incidentEvent.create({
        data: {
          organizationId,
          incidentId,
          type: DbIncidentEventType.STATUS_CHANGED,
          actorUserId: userId,
          actorUserEmail: userInfo.email,
          title: 'Status changed to ACKNOWLEDGED',
          message: `Status transitioned from OPEN to ACKNOWLEDGED by ${userInfo.email}`,
          metadata: { previousStatus: 'OPEN', newStatus: 'ACKNOWLEDGED' },
          occurredAt: now,
        },
      });

      return result;
    });

    return IncidentMapper.toDetail(updated as Parameters<typeof IncidentMapper.toDetail>[0]);
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
    if (incident.status === DbIncidentStatus.ARCHIVED) {
      throw new BadRequestError('Archived incidents cannot be resolved.');
    }

    const now = new Date();
    const previousStatus = incident.status;
    const userInfo = await this._getUserInfo(userId);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: DbIncidentStatus.RESOLVED,
          resolvedByUserId: userId,
          resolvedAt: now,
        },
        include: {
          linkedSignals: { include: { signal: true } },
          acknowledgedBy: true,
          resolvedBy: true,
        },
      });

      await tx.incidentEvent.create({
        data: {
          organizationId,
          incidentId,
          type: DbIncidentEventType.RESOLVED,
          actorUserId: userId,
          actorUserEmail: userInfo.email,
          title: 'Incident resolved',
          message: `Resolved by ${userInfo.email}`,
          metadata: {},
          occurredAt: now,
        },
      });

      await tx.incidentEvent.create({
        data: {
          organizationId,
          incidentId,
          type: DbIncidentEventType.STATUS_CHANGED,
          actorUserId: userId,
          actorUserEmail: userInfo.email,
          title: `Status changed to RESOLVED`,
          message: `Status transitioned from ${previousStatus} to RESOLVED by ${userInfo.email}`,
          metadata: { previousStatus, newStatus: 'RESOLVED' },
          occurredAt: now,
        },
      });

      return result;
    });

    return IncidentMapper.toDetail(updated as Parameters<typeof IncidentMapper.toDetail>[0]);
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
    if (incident.archivedAt) {
      throw new BadRequestError('Incident is already archived.');
    }

    const now = new Date();
    const previousStatus = incident.status;
    const userInfo = await this._getUserInfo(userId);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
        where: { id: incidentId },
        data: {
          archivedAt: now,
        },
        include: {
          linkedSignals: { include: { signal: true } },
          acknowledgedBy: true,
          resolvedBy: true,
        },
      });

      await tx.incidentEvent.create({
        data: {
          organizationId,
          incidentId,
          type: DbIncidentEventType.ARCHIVED,
          actorUserId: userId,
          actorUserEmail: userInfo.email,
          title: 'Incident archived',
          message: `Archived by ${userInfo.email}`,
          metadata: {},
          occurredAt: now,
        },
      });

      await tx.incidentEvent.create({
        data: {
          organizationId,
          incidentId,
          type: DbIncidentEventType.STATUS_CHANGED,
          actorUserId: userId,
          actorUserEmail: userInfo.email,
          title: 'Status changed to ARCHIVED',
          message: `Status transitioned from ${previousStatus} to ARCHIVED by ${userInfo.email}`,
          metadata: { previousStatus, newStatus: 'ARCHIVED' },
          occurredAt: now,
        },
      });

      return result;
    });

    return IncidentMapper.toDetail(updated as Parameters<typeof IncidentMapper.toDetail>[0]);
  }

  async listIncidentTimeline(
    organizationId: string,
    userId: string,
    incidentId: string,
  ): Promise<IncidentTimelineResponse> {
    await this._requireOrganizationMember(organizationId, userId);
    return incidentTimelineService.buildTimeline(organizationId, incidentId);
  }

  async listRemediationRecommendations(
    organizationId: string,
    userId: string,
    incidentId: string,
  ): Promise<RemediationRecommendation[]> {
    const incident = await this.getIncident(organizationId, userId, incidentId);
    const timeline = await this.listIncidentTimeline(organizationId, userId, incidentId);
    const deploymentWhere: Prisma.DeploymentWhereInput = {
      project: { organizationId },
      status: {
        in: [
          DbDeploymentStatus.FAILED,
          DbDeploymentStatus.CANCELLED,
          DbDeploymentStatus.ROLLED_BACK,
        ],
      },
      OR: [
        ...(incident.deploymentId ? [{ id: incident.deploymentId }] : []),
        ...(incident.projectId ? [{ projectId: incident.projectId }] : []),
      ],
    };
    const operationScopes: Prisma.OperationWhereInput[] = [
      ...(incident.operationId ? [{ id: incident.operationId }] : []),
      ...(incident.projectId ? [{ projectId: incident.projectId }] : []),
      ...(incident.environmentId ? [{ environmentId: incident.environmentId }] : []),
    ];

    const [failedDeployments, recentOperations] = await Promise.all([
      deploymentWhere.OR && deploymentWhere.OR.length > 0
        ? prisma.deployment.findMany({
            where: deploymentWhere,
            orderBy: { updatedAt: 'desc' },
            take: 10,
          })
        : Promise.resolve([]),
      operationScopes.length > 0
        ? prisma.operation.findMany({
            where: {
              organizationId,
              OR: operationScopes,
            },
            orderBy: { updatedAt: 'desc' },
            take: 10,
          })
        : Promise.resolve([]),
    ]);

    return buildRemediationRecommendations({
      incident,
      timeline: timeline.data,
      failedDeployments: failedDeployments.map((deployment) => ({
        id: deployment.id,
        status: deployment.status,
        errorMessage: deployment.errorMessage,
        branch: deployment.branch,
        commitSha: deployment.commitSha,
        imageTag: deployment.imageTag,
        updatedAt: deployment.updatedAt.toISOString(),
        metadata: this._toRecord(deployment.metadata),
      })),
      recentOperations: recentOperations.map((operation) => ({
        id: operation.id,
        provider: operation.provider,
        operationType: operation.operationType,
        status: operation.status,
        updatedAt: operation.updatedAt.toISOString(),
      })),
    });
  }

  async prepareRemediationRecommendation(
    organizationId: string,
    userId: string,
    role: string | undefined,
    incidentId: string,
    recommendationId: string,
    input: PrepareRemediationRecommendationInput,
    auditContext: AuditRequestContext = {},
  ): Promise<PrepareRemediationRecommendationResponse> {
    const incident = await this.getIncident(organizationId, userId, incidentId);
    const recommendations = await this.listRemediationRecommendations(organizationId, userId, incidentId);
    const recommendation = recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) throw new NotFoundError('Remediation recommendation');

    const plan = buildRemediationPreparationPlan(recommendation);
    if (!plan.canPrepare) throw new BadRequestError(plan.blockedReason);
    if (input.confirmationToken !== plan.confirmationToken) {
      throw new BadRequestError(`confirmationToken must be ${plan.confirmationToken}`);
    }

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        role,
        provider: plan.provider,
        operationType: plan.operationType,
        input: plan.input,
        projectId: incident.projectId ?? undefined,
        environmentId: incident.environmentId ?? undefined,
        idempotencyKey: `remediation:${recommendation.id}`,
        confirmationToken: input.confirmationToken,
      },
      auditContext,
    );

    await this._recordRemediationPreparationEvent(
      organizationId,
      userId,
      incidentId,
      recommendation,
      operation,
    );

    return { recommendation, operation };
  }

  async addIncidentNote(
    organizationId: string,
    userId: string,
    incidentId: string,
    input: IncidentNoteInput,
  ): Promise<IncidentTimelineResponse> {
    await this._requirePermission(organizationId, userId, 'ADD_NOTE');

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      select: { id: true },
    });
    if (!incident) throw new NotFoundError('Incident');

    const userInfo = await this._getUserInfo(userId);
    const now = new Date();

    await prisma.incidentEvent.create({
      data: {
        organizationId,
        incidentId,
        type: DbIncidentEventType.NOTE_ADDED,
        actorUserId: userId,
        actorUserEmail: userInfo.email,
        title: 'Operator note added',
        message: input.message,
        metadata: {},
        occurredAt: now,
      },
    });

    return this.listIncidentTimeline(organizationId, userId, incidentId);
  }

  async recordIncidentEvent(input: RecordEventInput): Promise<void> {
    await prisma.incidentEvent.create({
      data: {
        organizationId: input.organizationId,
        incidentId: input.incidentId,
        type: input.type,
        actorUserId: input.actorUserId ?? null,
        actorUserEmail: input.actorUserEmail ?? null,
        title: input.title,
        message: input.message,
        metadata: input.metadata ? sanitizeMetadata(input.metadata) : {},
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
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

    const correlationKey = this.buildCorrelationKey(signal as Record<string, unknown>);

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
        const previousSeverity = existing.severity;
        const newSeverity = this._escalateSeverity(existing.severity as DbIncidentSeverity, signal.severity as SignalSeverity);
        const severityChanged = previousSeverity !== newSeverity;

        await prisma.$transaction(async (tx) => {
          await tx.incidentSignal.create({
            data: {
              organizationId,
              incidentId: existing.id,
              signalId: signal.id,
              role: DbIncidentSignalRole.RELATED,
            },
          });

          await tx.incident.update({
            where: { id: existing.id },
            data: {
              signalCount: { increment: 1 },
              lastObservedAt: signal.observedAt > existing.lastObservedAt ? signal.observedAt : undefined,
              severity: newSeverity,
            },
          });

          // Record INCIDENT_UPDATED
          await tx.incidentEvent.create({
            data: {
              organizationId,
              incidentId: existing.id,
              type: DbIncidentEventType.INCIDENT_UPDATED,
              title: 'Incident updated by correlation',
              message: `New signal linked: ${signal.title}`,
              metadata: sanitizeMetadata({ signalId: signal.id, signalType: signal.type, signalSource: signal.source }),
              occurredAt: new Date(),
            },
          });

          // Record SIGNAL_LINKED
          await tx.incidentEvent.create({
            data: {
              organizationId,
              incidentId: existing.id,
              type: DbIncidentEventType.SIGNAL_LINKED,
              title: `Signal linked: ${signal.title}`,
              message: `Signal ${signal.id} (${signal.type}) linked as RELATED evidence`,
              metadata: sanitizeMetadata({ signalId: signal.id, signalType: signal.type, signalSeverity: signal.severity }),
              occurredAt: new Date(),
            },
          });

          // Record SEVERITY_CHANGED if severity escalated
          if (severityChanged) {
            await tx.incidentEvent.create({
              data: {
                organizationId,
                incidentId: existing.id,
                type: DbIncidentEventType.SEVERITY_CHANGED,
                title: `Severity escalated to ${newSeverity}`,
                message: `Severity changed from ${previousSeverity} to ${newSeverity} due to incoming signal`,
                metadata: { previousSeverity, newSeverity },
                occurredAt: new Date(),
              },
            });
          }
        });

        return { action: 'UPDATED' };
      }
      return { action: 'SKIPPED' };
    }

    // Create new incident
    await prisma.$transaction(async (tx) => {
      const incident = await tx.incident.create({
        data: {
          organizationId,
          title: this._deriveTitle(signal as Record<string, unknown>),
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

      // Record INCIDENT_OPENED
      await tx.incidentEvent.create({
        data: {
          organizationId,
          incidentId: incident.id,
          type: DbIncidentEventType.INCIDENT_OPENED,
          title: 'Incident opened',
          message: `Incident created by deterministic signal correlation from: ${signal.title}`,
          metadata: sanitizeMetadata({ correlationKey, signalId: signal.id, signalType: signal.type, signalSource: signal.source, rule: 'DETERMINISTIC_V1' }),
          occurredAt: new Date(),
        },
      });

      // Record initial SIGNAL_LINKED for trigger signal
      await tx.incidentEvent.create({
        data: {
          organizationId,
          incidentId: incident.id,
          type: DbIncidentEventType.SIGNAL_LINKED,
          title: `Trigger signal linked: ${signal.title}`,
          message: `Signal ${signal.id} (${signal.type}) linked as TRIGGER evidence`,
          metadata: sanitizeMetadata({ signalId: signal.id, signalType: signal.type, signalSeverity: signal.severity, role: 'TRIGGER' }),
          occurredAt: new Date(),
        },
      });
    });

    return { action: 'CREATED' };
  }

  buildCorrelationKey(signal: Record<string, unknown>): string {
    const resourcePart = signal.resourceNodeId || (signal.resourceNode as Record<string, unknown>)?.urn || 'no-resource';
    const typePart = this._groupType(signal.type as string);
    const sourcePart = signal.source as string;

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

  private _deriveTitle(signal: Record<string, unknown>): string {
    const resourceNode = signal.resourceNode as Record<string, unknown> | undefined;
    if (resourceNode) {
      return `${resourceNode.displayName}: ${signal.title}`;
    }
    return signal.title as string;
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

  private async _getUserInfo(userId: string): Promise<{ email: string; name: string | null }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    return { email: user?.email ?? 'unknown', name: user?.name ?? null };
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private async _recordRemediationPreparationEvent(
    organizationId: string,
    userId: string,
    incidentId: string,
    recommendation: RemediationRecommendation,
    operation: Operation,
  ): Promise<void> {
    const userInfo = await this._getUserInfo(userId);
    await prisma.incidentEvent.create({
      data: {
        organizationId,
        incidentId,
        type: DbIncidentEventType.EVIDENCE_ADDED,
        actorUserId: userId,
        actorUserEmail: userInfo.email,
        title: 'Governed remediation operation prepared',
        message: `Prepared ${operation.operationType} from recommendation ${recommendation.id}.`,
        metadata: sanitizeMetadata({
          operationId: operation.id,
          recommendationId: recommendation.id,
          provider: operation.provider,
          operationType: operation.operationType,
          operationStatus: operation.status,
        }),
        occurredAt: new Date(),
      },
    });
  }
}

export const incidentService = new IncidentService();
