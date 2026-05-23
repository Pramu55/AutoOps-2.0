import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OperationStatus, OrgRole } from '@autoops/types';

const findMembership = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    orgMembership: {
      findUnique: findMembership,
    },
  },
}));

const { operationAuthorizationService } = await import('./operation-authorization.service.js');

describe('OperationAuthorizationService tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrganizationRole', () => {
    it('returns the role when user has membership in the organization', async () => {
      findMembership.mockResolvedValue({ role: OrgRole.ADMIN });

      const role = await operationAuthorizationService.getOrganizationRole({
        organizationId: 'org-a',
        userId: 'user-1',
      });

      expect(role).toBe(OrgRole.ADMIN);
      expect(findMembership).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: 'user-1',
            organizationId: 'org-a',
          },
        },
        select: { role: true },
      });
    });

    it('returns null when user has no membership in the organization', async () => {
      findMembership.mockResolvedValue(null);

      const role = await operationAuthorizationService.getOrganizationRole({
        organizationId: 'org-b',
        userId: 'user-1',
      });

      expect(role).toBeNull();
    });
  });

  describe('cross-org approval isolation', () => {
    it('blocks approval when user has no role in the organization', () => {
      const decision = operationAuthorizationService.canApproveWithRole(
        null,
        'user-b',
        { status: OperationStatus.PENDING_APPROVAL, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('permission');
    });

    it('blocks approval when user is VIEWER in the organization', () => {
      const decision = operationAuthorizationService.canApproveWithRole(
        OrgRole.VIEWER,
        'user-b',
        { status: OperationStatus.PENDING_APPROVAL, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(false);
    });

    it('allows approval when ADMIN and requester is different user', () => {
      const decision = operationAuthorizationService.canApproveWithRole(
        OrgRole.ADMIN,
        'user-b',
        { status: OperationStatus.PENDING_APPROVAL, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(true);
    });
  });

  describe('requester self-approval blocked', () => {
    it('blocks self-approval even for OWNER', () => {
      const decision = operationAuthorizationService.canApproveWithRole(
        OrgRole.OWNER,
        'user-a',
        { status: OperationStatus.PENDING_APPROVAL, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('different users');
    });

    it('blocks self-approval for ADMIN', () => {
      const decision = operationAuthorizationService.canApproveWithRole(
        OrgRole.ADMIN,
        'user-a',
        { status: OperationStatus.PENDING_APPROVAL, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('different users');
    });

    it('blocks self-rejection even for OWNER', () => {
      const decision = operationAuthorizationService.canRejectWithRole(
        OrgRole.OWNER,
        'user-a',
        { status: OperationStatus.PENDING_APPROVAL, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('different users');
    });
  });

  describe('cross-org rejection isolation', () => {
    it('blocks rejection when user has no role in the organization', () => {
      const decision = operationAuthorizationService.canRejectWithRole(
        null,
        'user-b',
        { status: OperationStatus.PENDING_APPROVAL, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(false);
    });

    it('allows rejection when ADMIN and requester is different user', () => {
      const decision = operationAuthorizationService.canRejectWithRole(
        OrgRole.ADMIN,
        'user-b',
        { status: OperationStatus.PENDING_APPROVAL, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(true);
    });
  });

  describe('trigger authorization isolation', () => {
    it('blocks trigger when user has no role', () => {
      const decision = operationAuthorizationService.canTriggerWithRole(null);

      expect(decision.allowed).toBe(false);
    });

    it('blocks trigger for VIEWER role', () => {
      const decision = operationAuthorizationService.canTriggerWithRole(OrgRole.VIEWER);

      expect(decision.allowed).toBe(false);
    });

    it('allows trigger for MEMBER role', () => {
      const decision = operationAuthorizationService.canTriggerWithRole(OrgRole.MEMBER);

      expect(decision.allowed).toBe(true);
    });

    it('allows trigger for ADMIN role', () => {
      const decision = operationAuthorizationService.canTriggerWithRole(OrgRole.ADMIN);

      expect(decision.allowed).toBe(true);
    });
  });

  describe('status guard', () => {
    it('blocks approval of non-pending operations', () => {
      const decision = operationAuthorizationService.canApproveWithRole(
        OrgRole.ADMIN,
        'user-b',
        { status: OperationStatus.RUNNING, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('pending approval');
    });

    it('blocks rejection of completed operations', () => {
      const decision = operationAuthorizationService.canRejectWithRole(
        OrgRole.ADMIN,
        'user-b',
        { status: OperationStatus.SUCCEEDED, requestedByUserId: 'user-a' },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('pending approval');
    });
  });
});
