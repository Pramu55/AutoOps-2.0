import {
  prisma,
  IncidentSeverity as DbIncidentSeverity,
  IncidentStatus as DbIncidentStatus,
  OrgRole,
  OperationProvider,
  OperationType,
  type Prisma,
} from '@autoops/database';
import {
  IncidentSeverity,
  IncidentStatus,
  OperationStatus,
  type IncidentDetail,
  type IncidentListItem,
  type IncidentListQuery,
  type IncidentPermissionHints,
  type IncidentSummary,
} from '@autoops/types';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '@autoops/utils';
import { operationAuthorizationService } from '../operations/operation-authorization.service.js';
import { incidentRunbookService } from './incident-runbook.service.js';

const ACKNOWLEDGE_ROLES = new Set<OrgRole>([OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER]);
const RESOLVE_ROLES = new Set<OrgRole>([OrgRole.OWNER, OrgRole.ADMIN]);
const OPEN_STATUSES = [DbIncidentStatus.OPEN, DbIncidentStatus.TRIGGERED] as const;
const ACKNOWLEDGED_STATUSES = [DbIncidentStatus.ACKNOWLEDGED, DbIncidentStatus.MITIGATED] as const;
const HIGH_SEVERITIES = [
  DbIncidentSeverity.CRITICAL,
  DbIncidentSeverity.HIGH,
  DbIncidentSeverity.SEV1,
  DbIncidentSeverity.SEV2,
] as const;

type IncidentRecord = Prisma.IncidentGetPayload<{
  include: {
    acknowledgedBy: { select: { id: true; name: true; email: true } };
    resolvedBy: { select: { id: true; name: true; email: true } };
    operation: { select: { operationType: true } };
  };
}>;

type FailedOperationRecord = {
  id: string;
  organizationId: string;
  projectId: string | null;
  provider: OperationProvider;
  operationType: OperationType;
  input: unknown;
  error: unknown;
};

export class IncidentService {
  async listIncidents(
    organizationId: string,
    userId: string,
    query: IncidentListQuery,
  ): Promise<{ items: IncidentListItem[]; summary: IncidentSummary }> {
    await this._requireOrganizationMember(organizationId, userId);
    const [incidents, summary] = await Promise.all([
      prisma.incident.findMany({
        where: {
          organizationId,
          ...(query.status ? { status: query.status as DbIncidentStatus } : {}),
          ...(query.severity ? { severity: query.severity as DbIncidentSeverity } : {}),
        },
        orderBy: { detectedAt: 'desc' },
        take: query.limit,
        include: this._include(),
      }),
      this.getSummary(organizationId, userId),
    ]);

    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    return {
      items: incidents.map((incident) => this._toListItem(incident, role)),
      summary,
    };
  }

  async getIncident(
    organizationId: string,
    userId: string,
    incidentId: string,
  ): Promise<IncidentDetail> {
    await this._requireOrganizationMember(organizationId, userId);
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      include: this._include(),
    });
    if (!incident) throw new NotFoundError('Incident');
    return this._toDetail(incident, role);
  }

  async acknowledgeIncident(
    organizationId: string,
    userId: string,
    incidentId: string,
  ): Promise<IncidentDetail> {
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    if (!role || !ACKNOWLEDGE_ROLES.has(role as OrgRole)) {
      throw new UnauthorizedError('You do not have permission to acknowledge this incident.');
    }

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) throw new NotFoundError('Incident');
    if (!OPEN_STATUSES.includes(incident.status as (typeof OPEN_STATUSES)[number])) {
      throw new ConflictError('Only open incidents can be acknowledged.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const acknowledged = await tx.incident.update({
        where: { id: incident.id },
        data: {
          status: DbIncidentStatus.ACKNOWLEDGED,
          acknowledgedByUserId: userId,
          acknowledgedAt: new Date(),
        },
        include: this._include(),
      });
      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          type: 'ACKNOWLEDGED',
          message: 'Incident acknowledged.',
          metadata: {},
        },
      });
      return acknowledged;
    });

    return this._toDetail(updated, role);
  }

  async resolveIncident(
    organizationId: string,
    userId: string,
    incidentId: string,
    resolutionNote: string,
  ): Promise<IncidentDetail> {
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    if (!role || !RESOLVE_ROLES.has(role as OrgRole)) {
      throw new UnauthorizedError('You do not have permission to resolve this incident.');
    }

    const note = resolutionNote.trim();
    if (note.length < 3) throw new BadRequestError('A resolution note is required.');

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) throw new NotFoundError('Incident');
    if (incident.status === DbIncidentStatus.RESOLVED) {
      throw new ConflictError('Incident is already resolved.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const resolved = await tx.incident.update({
        where: { id: incident.id },
        data: {
          status: DbIncidentStatus.RESOLVED,
          resolvedByUserId: userId,
          resolvedAt: new Date(),
          resolutionNote: note,
        },
        include: this._include(),
      });
      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          type: 'RESOLVED',
          message: 'Incident resolved.',
          metadata: {},
        },
      });
      return resolved;
    });

    return this._toDetail(updated, role);
  }

  async getSummary(organizationId: string, userId: string): Promise<IncidentSummary> {
    await this.ensureForRecentFailedOperations(organizationId);
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    const resolvedSince = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [open, acknowledged, resolvedRecent, criticalOpen, latest] = await Promise.all([
      prisma.incident.count({ where: { organizationId, status: { in: [...OPEN_STATUSES] } } }),
      prisma.incident.count({ where: { organizationId, status: { in: [...ACKNOWLEDGED_STATUSES] } } }),
      prisma.incident.count({
        where: { organizationId, status: DbIncidentStatus.RESOLVED, resolvedAt: { gte: resolvedSince } },
      }),
      prisma.incident.count({
        where: {
          organizationId,
          status: { in: [...OPEN_STATUSES, ...ACKNOWLEDGED_STATUSES] },
          severity: { in: [...HIGH_SEVERITIES] },
        },
      }),
      prisma.incident.findMany({
        where: { organizationId },
        orderBy: { detectedAt: 'desc' },
        take: 5,
        include: this._include(),
      }),
    ]);

    return {
      open,
      acknowledged,
      resolvedRecent,
      criticalOpen,
      latest: latest.map((incident) => this._toListItem(incident, role)),
    };
  }

  async createForFailedOperation(operation: FailedOperationRecord): Promise<void> {
    if (!operation.organizationId) return;
    const existing = await prisma.incident.findUnique({
      where: { operationId: operation.id },
      select: { id: true },
    });
    if (existing) return;

    const input = this._toRecord(operation.input);
    const safeErrorMessage = this._safeError(operation.error);
    const target = this._target(operation.operationType, input);
    const severity = this._severity(operation.operationType, input);
    const runbookKey = this._runbookKey(operation.operationType);

    await prisma.incident.create({
      data: {
        organizationId: operation.organizationId,
        projectId: operation.projectId,
        operationId: operation.id,
        title: this._title(operation.operationType, target.label),
        description: `AutoOps created this incident from failed operation ${operation.id}.`,
        severity,
        status: DbIncidentStatus.OPEN,
        source: 'operation',
        provider: operation.provider,
        targetKind: target.kind,
        targetName: target.label,
        safeErrorMessage,
        runbookKey,
        events: {
          create: {
            type: 'CREATED',
            message: 'Incident created from failed operation.',
            metadata: {},
          },
        },
      },
    });
  }

  async ensureForRecentFailedOperations(organizationId: string): Promise<void> {
    const failedOperations = await prisma.operation.findMany({
      where: {
        organizationId,
        status: OperationStatus.FAILED,
        incident: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        provider: true,
        operationType: true,
        input: true,
        error: true,
      },
    });

    for (const operation of failedOperations) {
      await this.createForFailedOperation(operation);
    }
  }

  private async _requireOrganizationMember(organizationId: string, userId: string): Promise<void> {
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    if (!role) throw new UnauthorizedError('You do not have permission to view incidents.');
  }

  private _include() {
    return {
      acknowledgedBy: { select: { id: true, name: true, email: true } },
      resolvedBy: { select: { id: true, name: true, email: true } },
      operation: { select: { operationType: true } },
    } satisfies Prisma.IncidentInclude;
  }

  private _toDetail(incident: IncidentRecord, role: OrgRole | null): IncidentDetail {
    const operationType = incident.operation?.operationType ?? null;
    return {
      ...this._toListItem(incident, role),
      description: incident.description,
      runbook: incidentRunbookService.getRunbook({
        key: incident.runbookKey,
        provider: incident.provider,
        operationType,
        operationId: incident.operationId,
      }),
    };
  }

  private _toListItem(incident: IncidentRecord, role: OrgRole | null): IncidentListItem {
    return {
      id: incident.id,
      title: incident.title,
      severity: incident.severity as IncidentSeverity,
      status: this._displayStatus(incident.status),
      source: incident.source,
      provider: incident.provider,
      targetLabel: incident.targetName,
      safeErrorMessage: incident.safeErrorMessage,
      linkedOperationId: incident.operationId,
      createdAt: incident.detectedAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
      acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: incident.acknowledgedBy,
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      resolvedBy: incident.resolvedBy,
      resolutionNote: incident.resolutionNote,
      permissions: this._permissions(incident.status, role),
    };
  }

  private _permissions(status: DbIncidentStatus, role: OrgRole | null): IncidentPermissionHints {
    if (!role) {
      return { canAcknowledge: false, canResolve: false, reason: 'You do not have permission to manage this incident.' };
    }
    if (status === DbIncidentStatus.RESOLVED) {
      return { canAcknowledge: false, canResolve: false, reason: 'Incident is already resolved.' };
    }

    const canAcknowledge =
      OPEN_STATUSES.includes(status as (typeof OPEN_STATUSES)[number]) && ACKNOWLEDGE_ROLES.has(role);
    const canResolve = RESOLVE_ROLES.has(role);
    let reason: string | null = null;
    if (!canAcknowledge && !canResolve) reason = 'You do not have permission to manage this incident.';
    else if (!canAcknowledge && OPEN_STATUSES.includes(status as (typeof OPEN_STATUSES)[number])) {
      reason = 'Only owner, admin, or member users can acknowledge incidents.';
    }
    return { canAcknowledge, canResolve, reason };
  }

  private _displayStatus(status: DbIncidentStatus): IncidentStatus {
    if (status === DbIncidentStatus.TRIGGERED) return IncidentStatus.OPEN;
    if (status === DbIncidentStatus.MITIGATED) return IncidentStatus.ACKNOWLEDGED;
    return status as IncidentStatus;
  }

  private _severity(type: OperationType, input: Record<string, unknown>): DbIncidentSeverity {
    if (type === OperationType.DOCKER_CONTAINER_RESTART) return DbIncidentSeverity.HIGH;
    if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return DbIncidentSeverity.HIGH;
    if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) {
      const replicas = typeof input.replicas === 'number' ? input.replicas : 0;
      return replicas > 2 ? DbIncidentSeverity.HIGH : DbIncidentSeverity.MEDIUM;
    }
    if (type === OperationType.JENKINS_BUILD_TRIGGER) return DbIncidentSeverity.MEDIUM;
    if (type === OperationType.TERRAFORM_APPLY || type === OperationType.ANSIBLE_RUN) {
      return DbIncidentSeverity.HIGH;
    }
    return DbIncidentSeverity.MEDIUM;
  }

  private _runbookKey(type: OperationType): string {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) return 'jenkins-build-failure';
    if (type === OperationType.DOCKER_CONTAINER_RESTART) return 'docker-restart-failure';
    if (type === OperationType.DOCKER_CONTAINER_START || type === OperationType.DOCKER_CONTAINER_STOP) {
      return 'docker-container-action-failure';
    }
    if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) return 'kubernetes-scale-failure';
    if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return 'kubernetes-rollout-failure';
    if (
      type === OperationType.TERRAFORM_VALIDATE ||
      type === OperationType.TERRAFORM_PLAN ||
      type === OperationType.TERRAFORM_APPLY
    ) {
      return 'terraform-operation-failure';
    }
    if (
      type === OperationType.ANSIBLE_SYNTAX_CHECK ||
      type === OperationType.ANSIBLE_CHECK ||
      type === OperationType.ANSIBLE_RUN
    ) {
      return 'ansible-operation-failure';
    }
    return 'operation-failure';
  }

  private _title(type: OperationType, target: string | null): string {
    const label = target ? `: ${target}` : '';
    if (type === OperationType.JENKINS_BUILD_TRIGGER) return `Jenkins build failed${label}`;
    if (type === OperationType.DOCKER_CONTAINER_RESTART) return `Docker container restart failed${label}`;
    if (type === OperationType.DOCKER_CONTAINER_START) return `Docker container start failed${label}`;
    if (type === OperationType.DOCKER_CONTAINER_STOP) return `Docker container stop failed${label}`;
    if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) return `Kubernetes deployment scale failed${label}`;
    if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return `Kubernetes rollout restart failed${label}`;
    if (type === OperationType.TERRAFORM_VALIDATE) return `Terraform/OpenTofu validate failed${label}`;
    if (type === OperationType.TERRAFORM_PLAN) return `Terraform/OpenTofu plan failed${label}`;
    if (type === OperationType.TERRAFORM_APPLY) return `Terraform/OpenTofu apply failed${label}`;
    if (type === OperationType.ANSIBLE_SYNTAX_CHECK) return `Ansible syntax check failed${label}`;
    if (type === OperationType.ANSIBLE_CHECK) return `Ansible check mode failed${label}`;
    if (type === OperationType.ANSIBLE_RUN) return `Ansible run failed${label}`;
    return `Operation failed${label}`;
  }

  private _target(type: OperationType, input: Record<string, unknown>): { kind: string | null; label: string | null } {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) {
      return { kind: 'Jenkins job', label: this._string(input, 'jobName') };
    }
    if (
      type === OperationType.DOCKER_CONTAINER_START ||
      type === OperationType.DOCKER_CONTAINER_STOP ||
      type === OperationType.DOCKER_CONTAINER_RESTART
    ) {
      return {
        kind: 'Docker container',
        label: this._string(input, 'containerName') ?? this._string(input, 'containerId'),
      };
    }
    if (
      type === OperationType.KUBERNETES_DEPLOYMENT_SCALE ||
      type === OperationType.KUBERNETES_DEPLOYMENT_RESTART
    ) {
      const namespace = this._string(input, 'namespace');
      const name = this._string(input, 'name');
      return { kind: 'Kubernetes deployment', label: namespace && name ? `${namespace}/${name}` : name };
    }
    if (
      type === OperationType.TERRAFORM_VALIDATE ||
      type === OperationType.TERRAFORM_PLAN ||
      type === OperationType.TERRAFORM_APPLY
    ) {
      return { kind: 'Terraform/OpenTofu workspace', label: this._string(input, 'workspaceSlug') };
    }
    if (
      type === OperationType.ANSIBLE_SYNTAX_CHECK ||
      type === OperationType.ANSIBLE_CHECK ||
      type === OperationType.ANSIBLE_RUN
    ) {
      return { kind: 'Ansible playbook', label: this._string(input, 'playbookSlug') };
    }
    return { kind: null, label: null };
  }

  private _safeError(value: unknown): string {
    const record = this._toRecord(value);
    const message = this._string(record, 'message') ?? 'Operation failed.';
    return message.replace(/\s+/g, ' ').slice(0, 500);
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private _string(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}

export const incidentService = new IncidentService();
