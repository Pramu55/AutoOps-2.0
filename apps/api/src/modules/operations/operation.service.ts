import { prisma, AuditAction, type Prisma } from '@autoops/database';
import {
  OperationProvider,
  OperationStatus,
  OperationType,
  type Operation,
} from '@autoops/types';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '@autoops/utils';
import { enqueueOperationJob } from './operation.queue.js';
import { operationAuthorizationService } from './operation-authorization.service.js';
import { evaluateOperationPolicy, type OperationPolicyDecision } from './operation-policy.service.js';
import { resourceGraphService } from '../resources/resource-graph.service.js';
import { signalService } from '../signals/signal.service.js';
import { SignalSeverity, SignalSource, SignalType } from '@autoops/types';


type CreateOperationInput = {
  organizationId: string;
  userId: string;
  role?: string;
  provider: OperationProvider;
  operationType: OperationType;
  input: Record<string, unknown>;
  projectId?: string;
  environmentId?: string;
  idempotencyKey?: string;
  confirmationToken?: string;
};

type AuditRequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export class OperationService {
  async listOperations(organizationId: string): Promise<Operation[]> {
    const operations = await prisma.operation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return operations.map((operation) => this._toOperation(operation));
  }

  async getOperation(operationId: string, organizationId: string): Promise<Operation> {
    const operation = await prisma.operation.findFirst({
      where: { id: operationId, organizationId },
    });
    if (!operation) throw new NotFoundError('Operation');
    return this._toOperation(operation);
  }

  async createQueuedOperation(
    input: CreateOperationInput,
    auditContext: AuditRequestContext = {},
  ): Promise<Operation> {
    const triggerDecision = await operationAuthorizationService.canTriggerOperation({
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      operationType: input.operationType,
    });
    if (!triggerDecision.allowed) {
      throw new UnauthorizedError(triggerDecision.reason ?? 'You do not have permission to trigger this operation.');
    }

    if (!input.confirmationToken) {
      throw new BadRequestError('A confirmation token is required for real operations');
    }

    if (input.idempotencyKey) {
      const existing = await prisma.operation.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return this._toOperation(existing);
    }

    const policy = evaluateOperationPolicy({
      provider: input.provider,
      operationType: input.operationType,
      input: input.input,
    });

    if (
      policy.confirmationRequired &&
      policy.confirmationTokenLabel &&
      input.confirmationToken !== policy.confirmationTokenLabel
    ) {
      throw new BadRequestError(`confirmationToken must be ${policy.confirmationTokenLabel}`);
    }

    const created = await prisma.$transaction(async (tx) => {
      const operation = await tx.operation.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          environmentId: input.environmentId ?? null,
          provider: input.provider,
          operationType: input.operationType,
          status: policy.approvalRequired ? OperationStatus.PENDING_APPROVAL : OperationStatus.QUEUED,
          requestedByUserId: input.userId,
          idempotencyKey: input.idempotencyKey ?? null,
          input: this._inputWithPolicy(input.input, policy) as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.userId,
          action: this._auditAction(input.operationType),
          provider: input.provider,
          projectId: input.projectId ?? null,
          environmentId: input.environmentId ?? null,
          operationId: operation.id,
          resourceType: 'operation',
          resourceId: operation.id,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: {
            operationType: input.operationType,
            status: operation.status,
            approvalRequired: policy.approvalRequired,
            approvalReason: policy.approvalReason,
            riskLevel: policy.riskLevel,
            policyName: policy.policyName,
          },
        },
      });

      return operation;
    });

    // Side-effect: Emit signal
    void signalService.ingestSignal(input.organizationId, {
      source: SignalSource.AUTOOPS,
      type: SignalType.OPERATION_CREATED,
      severity: SignalSeverity.INFO,
      title: `Operation Created: ${input.operationType}`,
      message: `Operation ${created.id} of type ${input.operationType} created by user ${input.userId}.`,
      operationId: created.id,
      projectId: created.projectId ?? undefined,
      environmentId: created.environmentId ?? undefined,
      dedupeMode: 'EVENT',
    }).catch(() => undefined);

    if (!policy.approvalRequired) {

      await enqueueOperationJob({
        operationId: created.id,
        organizationId: input.organizationId,
        requestedByUserId: input.userId,
      });
    }

    await this._registerOperationNode(input.organizationId, created);
    return this._toOperation(created);
  }

  async approveOperation(
    operationId: string,
    organizationId: string,
    userId: string,
    _role?: string,
    reason?: string,
    auditContext: AuditRequestContext = {},
  ): Promise<Operation> {
    const operation = await prisma.operation.findFirst({
      where: { id: operationId, organizationId },
    });
    if (!operation) throw new NotFoundError('Operation');
    if (operation.status !== OperationStatus.PENDING_APPROVAL) {
      throw new ConflictError('Only pending approval operations can be approved');
    }
    const approvalDecision = await operationAuthorizationService.canApproveOperation({
      organizationId,
      userId,
      operation,
    });
    if (!approvalDecision.allowed) {
      throw new UnauthorizedError(approvalDecision.reason ?? 'You do not have permission to approve this operation.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const approved = await tx.operation.update({
        where: { id: operation.id },
        data: {
          status: OperationStatus.QUEUED,
          approvedByUserId: userId,
          approvedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: userId,
          action: AuditAction.UPDATE,
          provider: operation.provider,
          projectId: operation.projectId,
          environmentId: operation.environmentId,
          operationId: operation.id,
          resourceType: 'operation',
          resourceId: operation.id,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { decision: 'approved', reason },
        },
      });

      return approved;
    });

    // Side-effect: Emit signal
    void signalService.ingestSignal(organizationId, {
      source: SignalSource.AUTOOPS,
      type: SignalType.APPROVAL_APPROVED,
      severity: SignalSeverity.INFO,
      title: 'Operation Approved',
      message: `Operation ${updated.id} was approved by user ${userId}.`,
      operationId: updated.id,
      projectId: updated.projectId ?? undefined,
      environmentId: updated.environmentId ?? undefined,
      dedupeMode: 'EVENT',
    }).catch(() => undefined);

    await enqueueOperationJob({

      operationId: updated.id,
      organizationId,
      requestedByUserId: operation.requestedByUserId ?? userId,
    });

    return this._toOperation(updated);
  }

  async rejectOperation(
    operationId: string,
    organizationId: string,
    userId: string,
    _role?: string,
    reason?: string,
    auditContext: AuditRequestContext = {},
  ): Promise<Operation> {
    const operation = await prisma.operation.findFirst({
      where: { id: operationId, organizationId },
    });
    if (!operation) throw new NotFoundError('Operation');
    if (operation.status !== OperationStatus.PENDING_APPROVAL) {
      throw new ConflictError('Only pending approval operations can be rejected');
    }
    const rejectionDecision = await operationAuthorizationService.canRejectOperation({
      organizationId,
      userId,
      operation,
    });
    if (!rejectionDecision.allowed) {
      throw new UnauthorizedError(rejectionDecision.reason ?? 'You do not have permission to reject this operation.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const rejected = await tx.operation.update({
        where: { id: operation.id },
        data: {
          status: OperationStatus.REJECTED,
          rejectedByUserId: userId,
          rejectedAt: new Date(),
          error: { reason: reason ?? 'Rejected by approver' },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: userId,
          action: AuditAction.UPDATE,
          provider: operation.provider,
          projectId: operation.projectId,
          environmentId: operation.environmentId,
          operationId: operation.id,
          resourceType: 'operation',
          resourceId: operation.id,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { decision: 'rejected', reason },
        },
      });

      return rejected;
    });

    // Side-effect: Emit signal
    void signalService.ingestSignal(organizationId, {
      source: SignalSource.AUTOOPS,
      type: SignalType.APPROVAL_REJECTED,
      severity: SignalSeverity.WARNING,
      title: 'Operation Rejected',
      message: `Operation ${updated.id} was rejected by user ${userId}. Reason: ${reason ?? 'No reason provided'}.`,
      operationId: updated.id,
      projectId: updated.projectId ?? undefined,
      environmentId: updated.environmentId ?? undefined,
      dedupeMode: 'EVENT',
    }).catch(() => undefined);

    return this._toOperation(updated);

  }

  private _auditAction(operationType: OperationType): AuditAction {
    if (operationType === OperationType.KUBERNETES_DEPLOYMENT_SCALE) {
      return AuditAction.KUBERNETES_DEPLOYMENT_SCALE_REQUESTED;
    }
    if (operationType === OperationType.KUBERNETES_DEPLOYMENT_RESTART) {
      return AuditAction.KUBERNETES_DEPLOYMENT_RESTART_REQUESTED;
    }
    if (operationType === OperationType.KUBERNETES_MANIFEST_APPLY) {
      return AuditAction.KUBERNETES_MANIFEST_APPLY_REQUESTED;
    }
    if (operationType === OperationType.JENKINS_BUILD_TRIGGER) {
      return AuditAction.JENKINS_BUILD_TRIGGER_REQUESTED;
    }
    if (operationType === OperationType.DOCKER_CONTAINER_START) {
      return AuditAction.DOCKER_CONTAINER_START_REQUESTED;
    }
    if (operationType === OperationType.DOCKER_CONTAINER_STOP) {
      return AuditAction.DOCKER_CONTAINER_STOP_REQUESTED;
    }
    if (operationType === OperationType.DOCKER_CONTAINER_RESTART) {
      return AuditAction.DOCKER_CONTAINER_RESTART_REQUESTED;
    }
    if (operationType === OperationType.TERRAFORM_VALIDATE) {
      return AuditAction.TERRAFORM_VALIDATE_REQUESTED;
    }
    if (operationType === OperationType.TERRAFORM_PLAN) {
      return AuditAction.TERRAFORM_PLAN_REQUESTED;
    }
    if (operationType === OperationType.TERRAFORM_APPLY) {
      return AuditAction.TERRAFORM_APPLY_REQUESTED;
    }
    if (operationType === OperationType.ANSIBLE_SYNTAX_CHECK) {
      return AuditAction.ANSIBLE_SYNTAX_CHECK_REQUESTED;
    }
    if (operationType === OperationType.ANSIBLE_CHECK) {
      return AuditAction.ANSIBLE_CHECK_REQUESTED;
    }
    if (operationType === OperationType.ANSIBLE_RUN) {
      return AuditAction.ANSIBLE_RUN_REQUESTED;
    }
    if (operationType === OperationType.KUBERNETES_MANIFEST_DRY_RUN) {
      return AuditAction.KUBERNETES_MANIFEST_DRY_RUN_REQUESTED;
    }
    if (operationType === OperationType.AWS_ECR_IMAGE_BUILD) {
      return AuditAction.AWS_ECR_IMAGE_BUILD_REQUESTED;
    }
    if (operationType === OperationType.AWS_ECR_IMAGE_PUSH) {
      return AuditAction.AWS_ECR_IMAGE_PUSH_REQUESTED;
    }
    if (operationType === OperationType.AWS_TERRAFORM_ECS_PLAN) {
      return AuditAction.AWS_TERRAFORM_ECS_PLAN_REQUESTED;
    }
    if (operationType === OperationType.AWS_TERRAFORM_ECS_APPLY) {
      return AuditAction.AWS_TERRAFORM_ECS_APPLY_REQUESTED;
    }
    return AuditAction.UPDATE;
  }

  private _toOperation(operation: {
    id: string;
    organizationId: string;
    projectId: string | null;
    environmentId: string | null;
    provider: Operation['provider'];
    operationType: Operation['operationType'];
    status: Operation['status'];
    requestedByUserId: string | null;
    approvedByUserId: string | null;
    approvedAt: Date | null;
    rejectedByUserId: string | null;
    rejectedAt: Date | null;
    idempotencyKey: string | null;
    input: unknown;
    result: unknown;
    error: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): Operation {
    return {
      id: operation.id,
      organizationId: operation.organizationId,
      projectId: operation.projectId,
      environmentId: operation.environmentId,
      provider: operation.provider,
      operationType: operation.operationType,
      status: operation.status,
      requestedByUserId: operation.requestedByUserId,
      approvedByUserId: operation.approvedByUserId,
      approvedAt: operation.approvedAt?.toISOString() ?? null,
      rejectedByUserId: operation.rejectedByUserId,
      rejectedAt: operation.rejectedAt?.toISOString() ?? null,
      idempotencyKey: operation.idempotencyKey,
      input: this._toRecord(operation.input),
      result: operation.result ? this._toRecord(operation.result) : null,
      error: operation.error ? this._toRecord(operation.error) : null,
      createdAt: operation.createdAt.toISOString(),
      updatedAt: operation.updatedAt.toISOString(),
    };
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private _inputWithPolicy(
    input: Record<string, unknown>,
    policy: OperationPolicyDecision,
  ): Record<string, unknown> {
    return {
      ...input,
      policy: {
        riskLevel: policy.riskLevel,
        confirmationRequired: policy.confirmationRequired,
        confirmationTokenLabel: policy.confirmationTokenLabel,
        approvalRequired: policy.approvalRequired,
        approvalReason: policy.approvalReason,
        policyName: policy.policyName,
      },
    };
  }

  private async _registerOperationNode(
    organizationId: string,
    operation: {
      id: string;
      provider: Operation['provider'];
      operationType: Operation['operationType'];
      status: Operation['status'];
      projectId: string | null;
      environmentId: string | null;
    },
  ): Promise<void> {
    try {
      await resourceGraphService.registerAutoOpsOperationNode(organizationId, operation);
    } catch (error) {
      console.warn('Resource graph operation registration failed', {
        organizationId,
        operationId: operation.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

export const operationService = new OperationService();
