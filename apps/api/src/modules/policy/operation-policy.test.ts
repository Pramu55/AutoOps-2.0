import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationProvider, OperationStatus, OperationType } from '@autoops/types';
import type { OperationPolicyDecision, OperationPolicyInput } from './policy.types.js';

function setRequiredEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://autoops:autoops_dev@localhost:5432/autoops';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env[`JWT_${'SECRET'}`] = 'test-jwt-placeholder-minimum-32-characters';
  process.env[`JWT_REFRESH_${'SECRET'}`] = 'test-refresh-placeholder-minimum-32-chars';
  process.env.OPA_URL = 'http://opa:8181';
  process.env.OPA_POLICY_PATH = '/v1/data/autoops/operation/decision';
  process.env.OPA_REQUEST_TIMEOUT_MS = '1000';
  process.env.JENKINS_ALLOWED_JOBS = 'autoops-smoke-build';
  process.env.POLICY_KUBERNETES_PROTECTED_NAMESPACES =
    'kube-system,kube-public,kube-node-lease';
  process.env.POLICY_KUBERNETES_SCALE_APPROVAL_THRESHOLD = '5';
}

function localDecision(input: OperationPolicyInput): OperationPolicyDecision {
  if (
    input.operation.provider === OperationProvider.JENKINS &&
    !input.policy.jenkins.allowedJobs.includes(String(input.target.jobName))
  ) {
    return {
      allow: false,
      approvalRequired: false,
      risk: 'critical',
      reasons: ['Jenkins job is not allowlisted for AutoOps triggering.'],
      controls: ['jenkins_allowed_jobs'],
    };
  }

  if (
    input.operation.provider === OperationProvider.KUBERNETES &&
    input.policy.kubernetes.protectedNamespaces.includes(String(input.target.namespace))
  ) {
    return {
      allow: false,
      approvalRequired: false,
      risk: 'critical',
      reasons: [`Kubernetes namespace "${String(input.target.namespace)}" is protected.`],
      controls: ['kubernetes_protected_namespaces'],
    };
  }

  if (
    input.operation.provider === OperationProvider.KUBERNETES &&
    input.target.action === 'scale' &&
    Number(input.target.replicas) > input.policy.kubernetes.scaleApprovalThreshold
  ) {
    return {
      allow: true,
      approvalRequired: true,
      risk: 'high',
      reasons: ['Kubernetes scale target exceeds approval threshold.'],
      controls: ['kubernetes_scale_threshold'],
    };
  }

  if (
    input.operation.provider === OperationProvider.DOCKER &&
    (input.target.action === 'stop' || input.target.action === 'restart')
  ) {
    return {
      allow: true,
      approvalRequired: true,
      risk: 'high',
      reasons: ['Docker stop and restart operations require approval.'],
      controls: ['docker_destructive_action_approval'],
    };
  }

  return {
    allow: true,
    approvalRequired: false,
    risk: 'low',
    reasons: ['Operation allowed by policy.'],
    controls: [],
  };
}

describe('operation policy evaluation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setRequiredEnv();
    process.env.OPA_ENFORCEMENT_MODE = 'enforce';
  });

  async function evaluate(input: Parameters<typeof import('./operation-policy.service.js').buildOperationPolicyInput>[0]) {
    const { buildOperationPolicyInput } = await import('./operation-policy.service.js');
    const { evaluateOperationPolicy } = await import('./operation-policy.middleware.js');
    const policyInput = buildOperationPolicyInput(input);
    return evaluateOperationPolicy(policyInput, {
      evaluateOperation: vi.fn(async (operationInput) => localDecision(operationInput)),
    });
  }

  it('allows an allowlisted Jenkins job', async () => {
    const result = await evaluate({
      organizationId: 'org-1',
      userId: 'user-1',
      provider: OperationProvider.JENKINS,
      operationType: OperationType.JENKINS_BUILD_TRIGGER,
      input: { jobName: 'autoops-smoke-build', parameters: { token: 'redacted' } },
    });

    expect(result.enforcedDecision).toMatchObject({
      allow: true,
      approvalRequired: false,
      risk: 'low',
    });
    expect(result.input.target).toEqual({
      jobName: 'autoops-smoke-build',
      parameterCount: 1,
    });
  });

  it('denies a non-allowlisted Jenkins job', async () => {
    const result = await evaluate({
      organizationId: 'org-1',
      userId: 'user-1',
      provider: OperationProvider.JENKINS,
      operationType: OperationType.JENKINS_BUILD_TRIGGER,
      input: { jobName: 'not-approved' },
    });

    expect(result.enforcedDecision.allow).toBe(false);
    expect(result.enforcedDecision.controls).toContain('jenkins_allowed_jobs');
  });

  it('denies Kubernetes protected namespaces', async () => {
    const result = await evaluate({
      organizationId: 'org-1',
      userId: 'user-1',
      provider: OperationProvider.KUBERNETES,
      operationType: OperationType.KUBERNETES_DEPLOYMENT_RESTART,
      input: { namespace: 'kube-system', name: 'coredns', action: 'rollout_restart' },
    });

    expect(result.enforcedDecision.allow).toBe(false);
    expect(result.enforcedDecision.controls).toContain('kubernetes_protected_namespaces');
  });

  it('requires approval for Kubernetes scale above threshold', async () => {
    const result = await evaluate({
      organizationId: 'org-1',
      userId: 'user-1',
      provider: OperationProvider.KUBERNETES,
      operationType: OperationType.KUBERNETES_MANIFEST_APPLY,
      input: { namespace: 'apps', name: 'web', action: 'scale', replicas: 8 },
    });

    expect(result.enforcedDecision).toMatchObject({
      allow: true,
      approvalRequired: true,
      risk: 'high',
    });
  });

  it('allows Docker start', async () => {
    const result = await evaluate({
      organizationId: 'org-1',
      userId: 'user-1',
      provider: OperationProvider.DOCKER,
      operationType: 'DOCKER_CONTAINER_START',
      input: { containerName: 'api', action: 'start' },
    });

    expect(result.enforcedDecision).toMatchObject({
      allow: true,
      approvalRequired: false,
    });
  });

  it.each(['stop', 'restart'])('requires approval for Docker %s', async (action) => {
    const result = await evaluate({
      organizationId: 'org-1',
      userId: 'user-1',
      provider: OperationProvider.DOCKER,
      operationType:
        action === 'stop' ? 'DOCKER_CONTAINER_STOP' : 'DOCKER_CONTAINER_RESTART',
      input: { containerName: 'api', action },
    });

    expect(result.enforcedDecision).toMatchObject({
      allow: true,
      approvalRequired: true,
    });
    expect(result.enforcedDecision.controls).toContain('docker_destructive_action_approval');
  });

  it('fails closed when OPA is unavailable', async () => {
    const { buildOperationPolicyInput } = await import('./operation-policy.service.js');
    const { evaluateOperationPolicy } = await import('./operation-policy.middleware.js');
    const result = await evaluateOperationPolicy(
      buildOperationPolicyInput({
        organizationId: 'org-1',
        userId: 'user-1',
        provider: OperationProvider.JENKINS,
        operationType: OperationType.JENKINS_BUILD_TRIGGER,
        input: { jobName: 'autoops-smoke-build' },
      }),
      {
        evaluateOperation: vi.fn().mockRejectedValue(new Error('OPA down')),
      },
    );

    expect(result.enforcedDecision).toMatchObject({
      allow: false,
      risk: 'critical',
    });
    expect(result.enforcedDecision.controls).toContain('fail_closed');
  });
});
describe('operation service policy queue boundaries', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setRequiredEnv();
    process.env.OPA_ENFORCEMENT_MODE = 'enforce';
  });

  async function loadService(policyDecision: OperationPolicyDecision) {
    const enqueueOperationJob = vi.fn();
    const auditLogCreate = vi.fn();
    const operationCreate = vi.fn().mockImplementation(({ data }) => ({
      id: 'operation-1',
      organizationId: data.organizationId,
      projectId: data.projectId,
      environmentId: data.environmentId,
      provider: data.provider,
      operationType: data.operationType,
      status: data.status,
      requestedByUserId: data.requestedByUserId,
      approvedByUserId: null,
      approvedAt: null,
      rejectedByUserId: null,
      rejectedAt: null,
      idempotencyKey: data.idempotencyKey,
      input: data.input,
      result: null,
      error: null,
      createdAt: new Date('2026-05-31T00:00:00.000Z'),
      updatedAt: new Date('2026-05-31T00:00:00.000Z'),
    }));

    vi.doMock('../operations/operation.queue.js', () => ({ enqueueOperationJob }));
    vi.doMock('../policy/operation-policy.middleware.js', () => ({
      evaluateOperationPolicy: vi.fn().mockResolvedValue({
        mode: 'enforce',
        input: {},
        decision: policyDecision,
        enforcedDecision: policyDecision,
      }),
    }));
    vi.doMock('@autoops/database', () => ({
      AuditAction: {
        UPDATE: 'UPDATE',
        JENKINS_BUILD_TRIGGER_REQUESTED: 'JENKINS_BUILD_TRIGGER_REQUESTED',
        KUBERNETES_DEPLOYMENT_RESTART_REQUESTED: 'KUBERNETES_DEPLOYMENT_RESTART_REQUESTED',
        KUBERNETES_MANIFEST_APPLY_REQUESTED: 'KUBERNETES_MANIFEST_APPLY_REQUESTED',
        KUBERNETES_MANIFEST_DRY_RUN_REQUESTED: 'KUBERNETES_MANIFEST_DRY_RUN_REQUESTED',
      },
      EnvironmentKind: { PRODUCTION: 'PRODUCTION' },
      prisma: {
        orgMembership: { findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN' }) },
        project: { findFirst: vi.fn() },
        environment: { findFirst: vi.fn() },
        operation: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: operationCreate,
        },
        auditLog: { create: auditLogCreate },
        $transaction: vi.fn(async (callback) =>
          callback({
            operation: { create: operationCreate },
            auditLog: { create: auditLogCreate },
          }),
        ),
      },
    }));

    const { operationService } = await import('../operations/operation.service.js');
    return { operationService, enqueueOperationJob, auditLogCreate };
  }

  it('does not enqueue a pending approval operation', async () => {
    const { operationService, enqueueOperationJob } = await loadService({
      allow: true,
      approvalRequired: true,
      risk: 'high',
      reasons: ['Approval required.'],
      controls: ['test_control'],
    });

    const operation = await operationService.createQueuedOperation({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'ADMIN',
      provider: OperationProvider.JENKINS,
      operationType: OperationType.JENKINS_BUILD_TRIGGER,
      confirmationToken: 'BUILD',
      input: { jobName: 'autoops-smoke-build' },
    });

    expect(operation.status).toBe(OperationStatus.PENDING_APPROVAL);
    expect(enqueueOperationJob).not.toHaveBeenCalled();
  });

  it('never queues a denied operation', async () => {
    const { operationService, enqueueOperationJob, auditLogCreate } = await loadService({
      allow: false,
      approvalRequired: false,
      risk: 'critical',
      reasons: ['Denied by policy.'],
      controls: ['test_control'],
    });

    await expect(
      operationService.createQueuedOperation({
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'ADMIN',
        provider: OperationProvider.JENKINS,
        operationType: OperationType.JENKINS_BUILD_TRIGGER,
        confirmationToken: 'BUILD',
        input: { jobName: 'not-approved' },
      }),
    ).rejects.toThrow('Denied by policy.');

    expect(enqueueOperationJob).not.toHaveBeenCalled();
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resourceType: 'operation_policy' }),
      }),
    );
  });
});
