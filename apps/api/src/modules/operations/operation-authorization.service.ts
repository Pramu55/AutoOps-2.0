import { prisma } from '@autoops/database';
import { OrgRole, OperationStatus, type OperationProvider, type OperationType } from '@autoops/types';

export type OperationAuthorizationDecision = {
  allowed: boolean;
  reason: string | null;
  role: OrgRole | null;
};

type AuthorizationSubject = {
  organizationId: string;
  userId: string;
};

export type AuthorizableOperation = {
  status: OperationStatus;
  requestedByUserId: string | null;
};

const TRIGGER_ROLES = new Set<OrgRole>([OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER]);
const APPROVAL_ROLES = new Set<OrgRole>([OrgRole.OWNER, OrgRole.ADMIN]);

export class OperationAuthorizationService {
  async getOrganizationRole(input: AuthorizationSubject): Promise<OrgRole | null> {
    const membership = await prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: input.userId,
          organizationId: input.organizationId,
        },
      },
      select: {
        role: true,
      },
    });

    return membership?.role ?? null;
  }

  async canTriggerOperation(
    input: AuthorizationSubject & {
      provider: OperationProvider;
      operationType: OperationType;
    },
  ): Promise<OperationAuthorizationDecision> {
    const role = await this.getOrganizationRole(input);
    return this.canTriggerWithRole(role);
  }

  async canApproveOperation(
    input: AuthorizationSubject & { operation: AuthorizableOperation },
  ): Promise<OperationAuthorizationDecision> {
    const role = await this.getOrganizationRole(input);
    return this.canApproveWithRole(role, input.userId, input.operation);
  }

  async canRejectOperation(
    input: AuthorizationSubject & { operation: AuthorizableOperation },
  ): Promise<OperationAuthorizationDecision> {
    const role = await this.getOrganizationRole(input);
    return this.canRejectWithRole(role, input.userId, input.operation);
  }

  canTriggerWithRole(role: OrgRole | null): OperationAuthorizationDecision {
    if (!role || !TRIGGER_ROLES.has(role)) {
      return {
        allowed: false,
        reason: 'You do not have permission to trigger this operation.',
        role,
      };
    }

    return { allowed: true, reason: null, role };
  }

  canApproveWithRole(
    role: OrgRole | null,
    userId: string,
    operation: AuthorizableOperation,
  ): OperationAuthorizationDecision {
    if (operation.status !== OperationStatus.PENDING_APPROVAL) {
      return {
        allowed: false,
        reason: 'Only pending approval operations can be approved.',
        role,
      };
    }

    if (!role || !APPROVAL_ROLES.has(role)) {
      return {
        allowed: false,
        reason: 'You do not have permission to approve this operation.',
        role,
      };
    }

    if (operation.requestedByUserId === userId) {
      return {
        allowed: false,
        reason: 'Requester and approver must be different users for approval-required operations.',
        role,
      };
    }

    return { allowed: true, reason: null, role };
  }

  canRejectWithRole(
    role: OrgRole | null,
    userId: string,
    operation: AuthorizableOperation,
  ): OperationAuthorizationDecision {
    if (operation.status !== OperationStatus.PENDING_APPROVAL) {
      return {
        allowed: false,
        reason: 'Only pending approval operations can be rejected.',
        role,
      };
    }

    if (!role || !APPROVAL_ROLES.has(role)) {
      return {
        allowed: false,
        reason: 'You do not have permission to reject this operation.',
        role,
      };
    }

    if (operation.requestedByUserId === userId) {
      return {
        allowed: false,
        reason: 'Requester and approver must be different users for approval-required operations.',
        role,
      };
    }

    return { allowed: true, reason: null, role };
  }
}

export const operationAuthorizationService = new OperationAuthorizationService();
