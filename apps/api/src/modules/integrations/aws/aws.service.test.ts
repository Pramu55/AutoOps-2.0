import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AwsService } from './aws.service.js';
import {
  detectTerraformTool,
  listTerraformWorkspaces,
  getTerraformWorkspaceBySlug,
  getAwsEcrBuildTargetBySlug,
  listAwsEcrBuildTargets,
  listAllowedAwsEcrRepositories,
  isAllowedAwsEcrRepository,
  isSafeEcrEnvironmentSlug,
  isSafeEcrImageTag,
  createEcrImageTag,
  isProductionEnvironment,
  evaluateAwsGuardrails,
  getAwsGuardrailConfigStatus,
} from '@autoops/utils';
import { operationService } from '../../operations/operation.service.js';
import { operationAuthorizationService } from '../../operations/operation-authorization.service.js';
import { OperationProvider, OperationType, OperationStatus, AwsIntegrationStatus } from '@autoops/types';
import { awsTerraformEcsPlanRequestSchema } from '@autoops/types';
import { prisma } from '@autoops/database';

vi.mock('@autoops/utils', () => ({
  detectTerraformTool: vi.fn(),
  listTerraformWorkspaces: vi.fn(),
  getTerraformWorkspaceBySlug: vi.fn(),
  getAwsEcrBuildTargetBySlug: vi.fn(),
  listAwsEcrBuildTargets: vi.fn(),
  listAllowedAwsEcrRepositories: vi.fn(),
  isAllowedAwsEcrRepository: vi.fn(),
  isSafeEcrEnvironmentSlug: vi.fn(),
  isSafeEcrImageTag: vi.fn(),
  createEcrImageTag: vi.fn(),
  isProductionEnvironment: vi.fn(),
  evaluateAwsGuardrails: vi.fn(),
  getAwsGuardrailConfigStatus: vi.fn(),
  BadRequestError: class BadRequestError extends Error {},
}));

vi.mock('../../operations/operation.service.js', () => {
  return {
    operationService: {
      createQueuedOperation: vi.fn(),
    },
  };
});

vi.mock('../../operations/operation-authorization.service.js', () => {
  return {
    operationAuthorizationService: {
      canTriggerOperation: vi.fn(),
    },
  };
});

vi.mock('@autoops/database', () => ({
  prisma: {
    operation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    awsRelease: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

describe('AwsService', () => {
  let awsService: AwsService;
  const orgId = 'org-1';
  const userId = 'user-1';
  const passedGuardrails = {
    operationId: null,
    targetSlug: 'sample-ecs-app',
    environmentSlug: 'staging',
    status: 'PASSED',
    riskLevel: 'LOW',
    accountAllowed: true,
    regionAllowed: true,
    accountIdMasked: '********9012',
    region: 'ap-south-1',
    costEstimate: {
      estimatedMonthlyMinUsd: 0,
      estimatedMonthlyMaxUsd: 0,
      estimatedMonthlyDeltaUsd: 0,
      currency: 'USD',
      confidence: 'LOW',
      notes: ['Conservative local estimate only.', 'Not a billing guarantee.'],
    },
    blastRadius: {
      addCount: 0,
      changeCount: 0,
      destroyCount: 0,
      replacementCount: 0,
      publicLoadBalancerDetected: false,
      iamChangeDetected: false,
      securityGroupChangeDetected: false,
      networkChangeDetected: false,
      desiredCount: null,
      fargateCpu: null,
      fargateMemoryMb: null,
      unknownHighImpactResources: [],
    },
    blockedReasons: [],
    warnings: [],
    applyEligible: true,
    evaluatedAt: '2026-05-24T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    awsService = new AwsService();
    process.env.AWS_ALLOWED_DEPLOYMENT_WORKSPACES = 'sample-ecs-app, another-app';
    process.env.AWS_DEPLOYMENT_APPLY_ENABLED = 'true';
    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'placeholder-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'placeholder-secret';
    process.env.AWS_TERRAFORM_STATE_BUCKET = 'autoops-state';
    process.env.AWS_TERRAFORM_STATE_DYNAMODB_TABLE = 'autoops-locks';
    process.env.AWS_TERRAFORM_STATE_REGION = 'ap-south-1';
    process.env.AWS_ECR_PUSH_ENABLED = 'true';
    process.env.AWS_ECR_PRODUCTION_PUSH_REQUIRES_APPROVAL = 'true';
    process.env.AWS_ALLOWED_ACCOUNT_IDS = '123456789012';
    process.env.AWS_ALLOWED_REGIONS = 'ap-south-1';
    process.env.AWS_MAX_PLAN_ADD_COUNT = '10';
    process.env.AWS_MAX_PLAN_CHANGE_COUNT = '20';
    process.env.AWS_MAX_MONTHLY_COST_DELTA_USD = '100';
    process.env.AWS_MAX_FARGATE_CPU = '1024';
    process.env.AWS_MAX_FARGATE_MEMORY_MB = '2048';
    process.env.AWS_MAX_DESIRED_COUNT = '2';
    process.env.AWS_BLOCK_PUBLIC_LOAD_BALANCER_BY_DEFAULT = 'true';
    process.env.AWS_ALLOW_PUBLIC_LOAD_BALANCER = 'false';
    process.env.AWS_COST_GUARDRAILS_ENABLED = 'true';
    process.env.AWS_BLAST_RADIUS_GUARDRAILS_ENABLED = 'true';
    vi.mocked(getAwsGuardrailConfigStatus).mockReturnValue({
      costGuardrailsEnabled: true,
      blastRadiusGuardrailsEnabled: true,
      allowedAccountIdsConfigured: true,
      allowedRegionsConfigured: true,
      maxPlanAddCount: 10,
      maxPlanChangeCount: 20,
      maxMonthlyCostDeltaUsd: 100,
      maxFargateCpu: 1024,
      maxFargateMemoryMb: 2048,
      maxDesiredCount: 2,
      blockPublicLoadBalancerByDefault: true,
      allowPublicLoadBalancer: false,
      missing: [],
    });
    vi.mocked(evaluateAwsGuardrails).mockReturnValue(passedGuardrails as any);
    vi.mocked(listAllowedAwsEcrRepositories).mockReturnValue(['autoops-sample-app']);
    vi.mocked(listAwsEcrBuildTargets).mockReturnValue([
      {
        targetSlug: 'aws-sample-ecs-app',
        displayName: 'AWS Sample ECS App',
        contextPath: 'infra/terraform/aws-sample-ecs-app/app',
        dockerfilePath: 'infra/terraform/aws-sample-ecs-app/app/Dockerfile',
        defaultRepository: 'autoops-sample-app',
        allowedEnvironments: ['development', 'staging', 'production'],
        allowedPlatforms: ['linux/amd64'],
        absoluteContextPath: '/repo/infra/terraform/aws-sample-ecs-app/app',
        absoluteDockerfilePath: '/repo/infra/terraform/aws-sample-ecs-app/app/Dockerfile',
      },
    ]);
    vi.mocked(getAwsEcrBuildTargetBySlug).mockReturnValue({
      targetSlug: 'aws-sample-ecs-app',
      displayName: 'AWS Sample ECS App',
      contextPath: 'infra/terraform/aws-sample-ecs-app/app',
      dockerfilePath: 'infra/terraform/aws-sample-ecs-app/app/Dockerfile',
      defaultRepository: 'autoops-sample-app',
      allowedEnvironments: ['development', 'staging', 'production'],
      allowedPlatforms: ['linux/amd64'],
      absoluteContextPath: '/repo/infra/terraform/aws-sample-ecs-app/app',
      absoluteDockerfilePath: '/repo/infra/terraform/aws-sample-ecs-app/app/Dockerfile',
    });
    vi.mocked(isAllowedAwsEcrRepository).mockReturnValue(true);
    vi.mocked(isSafeEcrEnvironmentSlug).mockReturnValue(true);
    vi.mocked(isSafeEcrImageTag).mockReturnValue(true);
    vi.mocked(createEcrImageTag).mockReturnValue('staging-20260524120000');
    vi.mocked(isProductionEnvironment).mockImplementation((value) => value === 'production' || value === 'prod');
    
    vi.spyOn(awsService as any, '_listResponse').mockImplementation(async (fetcher: any) => {
      const items = await fetcher({});
      return { status: 'CONNECTED', message: 'OK', items };
    });

    vi.spyOn(awsService, 'getStatus').mockResolvedValue({
      status: AwsIntegrationStatus.CONNECTED,
      configured: true,
      region: 'ap-south-1',
      message: 'AWS integration is reachable.',
      checkedAt: new Date().toISOString(),
    });
  });

  describe('listDeploymentTargets', () => {
    it('filters workspaces based on allowlist', async () => {
      vi.mocked(listTerraformWorkspaces).mockResolvedValue([
        { slug: 'sample-ecs-app', displayName: 'Sample', absolutePath: '/a', relativePath: 'a' },
        { slug: 'not-allowed', displayName: 'Not Allowed', absolutePath: '/b', relativePath: 'b' },
      ]);

      const result = await awsService.listDeploymentTargets();
      expect(result.items).toBeDefined();
      expect(result.items!).toHaveLength(1);
      expect(result.items![0]!.slug).toBe('sample-ecs-app');
    });
  });

  describe('planDeployment', () => {
    it('requires PLAN confirmation and rejects arbitrary workspace/tfvars fields', () => {
      expect(() => awsTerraformEcsPlanRequestSchema.parse({
        targetSlug: 'sample-ecs-app',
        environmentSlug: 'staging',
        imageOperationId: '33333333-3333-4333-8333-333333333333',
        confirmationToken: 'APPLY',
      })).toThrow();
      expect(() => awsTerraformEcsPlanRequestSchema.parse({
        targetSlug: 'sample-ecs-app',
        environmentSlug: 'staging',
        imageOperationId: '33333333-3333-4333-8333-333333333333',
        confirmationToken: 'PLAN',
        workspacePath: '../other',
      })).toThrow();
      expect(() => awsTerraformEcsPlanRequestSchema.parse({
        targetSlug: 'sample-ecs-app',
        environmentSlug: 'staging',
        imageOperationId: '33333333-3333-4333-8333-333333333333',
        confirmationToken: 'PLAN',
        tfvars: { adminPassword: 'secret' },
      })).toThrow();
    });

    it('creates an AWS_TERRAFORM_ECS_PLAN operation for an allowed target and tenant-scoped pushed image', async () => {
      vi.mocked(detectTerraformTool).mockResolvedValue({
        status: 'CONNECTED',
        configured: true,
        tool: 'terraform',
        version: '1.5.0',
        checkedAt: new Date().toISOString(),
        message: 'OK',
      });
      const { getTerraformWorkspaceBySlug } = await import('@autoops/utils');
      vi.mocked(getTerraformWorkspaceBySlug).mockResolvedValue({
        slug: 'sample-ecs-app',
        displayName: 'Sample',
        absolutePath: '/a',
        relativePath: 'a',
      });
      vi.mocked(listTerraformWorkspaces).mockResolvedValue([
        { slug: 'sample-ecs-app', displayName: 'Sample', absolutePath: '/a', relativePath: 'a' },
      ]);
      vi.mocked(operationService.createQueuedOperation).mockResolvedValue({
        id: 'op-1',
        status: OperationStatus.QUEUED,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_TERRAFORM_ECS_PLAN,
      } as any);
      vi.mocked(prisma.operation.findFirst).mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        input: {
          targetSlug: 'sample-ecs-app',
          environmentSlug: 'staging',
          imageUri: '123456789012.dkr.ecr.ap-south-1.amazonaws.com/autoops-sample-app:staging-20260524120000',
        },
        result: {
          imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      } as any);

      const res = await awsService.planDeployment(orgId, userId, 'sample-ecs-app', {
        targetSlug: 'sample-ecs-app',
        environmentSlug: 'staging',
        imageOperationId: '33333333-3333-4333-8333-333333333333',
        confirmationToken: 'PLAN',
      });
      expect(res.operationId).toBe('op-1');
      expect(operationService.createQueuedOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          provider: OperationProvider.AWS,
          operationType: OperationType.AWS_TERRAFORM_ECS_PLAN,
          confirmationToken: 'PLAN',
          input: expect.objectContaining({
            action: 'ecs-plan',
            workspaceSlug: 'sample-ecs-app',
            environmentSlug: 'staging',
            imageOperationId: '33333333-3333-4333-8333-333333333333',
          }),
        }),
        expect.anything()
      );
    });

    it('rejects targets not in allowlist', async () => {
      vi.mocked(detectTerraformTool).mockResolvedValue({
        status: 'CONNECTED',
        configured: true,
        tool: 'terraform',
        version: '1.5.0',
        checkedAt: new Date().toISOString(),
        message: 'OK',
      });
      vi.mocked(getTerraformWorkspaceBySlug).mockResolvedValue({
        slug: 'not-allowed',
        displayName: 'Not Allowed',
        absolutePath: '/b',
        relativePath: 'b',
      });
      vi.mocked(listTerraformWorkspaces).mockResolvedValue([
        { slug: 'not-allowed', displayName: 'Not Allowed', absolutePath: '/b', relativePath: 'b' },
      ]);

      await expect(awsService.planDeployment(orgId, userId, 'not-allowed', {
        targetSlug: 'not-allowed',
        environmentSlug: 'staging',
        imageOperationId: '33333333-3333-4333-8333-333333333333',
        confirmationToken: 'PLAN',
      })).rejects.toThrow('is not an allowed AWS deployment workspace');
    });

    it('blocks plan execution when remote state is missing', async () => {
      process.env.AWS_TERRAFORM_STATE_BUCKET = '';
      await expect(awsService.planDeployment(orgId, userId, 'sample-ecs-app', {
        targetSlug: 'sample-ecs-app',
        environmentSlug: 'staging',
        imageOperationId: '33333333-3333-4333-8333-333333333333',
        confirmationToken: 'PLAN',
      })).rejects.toThrow('remote state is not fully configured');
    });

    it('rejects cross-org or missing pushed ECR image metadata', async () => {
      vi.mocked(detectTerraformTool).mockResolvedValue({
        status: 'CONNECTED',
        configured: true,
        tool: 'terraform',
        version: '1.5.0',
        checkedAt: new Date().toISOString(),
        message: 'OK',
      });
      vi.mocked(getTerraformWorkspaceBySlug).mockResolvedValue({
        slug: 'sample-ecs-app',
        displayName: 'Sample',
        absolutePath: '/a',
        relativePath: 'a',
      });
      vi.mocked(listTerraformWorkspaces).mockResolvedValue([
        { slug: 'sample-ecs-app', displayName: 'Sample', absolutePath: '/a', relativePath: 'a' },
      ]);
      vi.mocked(prisma.operation.findFirst).mockResolvedValue(null);

      await expect(awsService.planDeployment(orgId, userId, 'sample-ecs-app', {
        targetSlug: 'sample-ecs-app',
        environmentSlug: 'staging',
        imageOperationId: '33333333-3333-4333-8333-333333333333',
        confirmationToken: 'PLAN',
      })).rejects.toThrow('tenant-scoped ECR push');
    });
  });

  describe('applyDeployment', () => {
    beforeEach(async () => {
      vi.mocked(detectTerraformTool).mockResolvedValue({
        status: 'CONNECTED',
        configured: true,
        tool: 'terraform',
        version: '1.5.0',
        checkedAt: new Date().toISOString(),
        message: 'OK',
      });
      const { getTerraformWorkspaceBySlug } = await import('@autoops/utils');
      vi.mocked(getTerraformWorkspaceBySlug).mockResolvedValue({
        slug: 'sample-ecs-app',
        displayName: 'Sample',
        absolutePath: '/a',
        relativePath: 'a',
      });
      vi.mocked(listTerraformWorkspaces).mockResolvedValue([
        { slug: 'sample-ecs-app', displayName: 'Sample', absolutePath: '/a', relativePath: 'a' },
      ]);
    });

    it('creates an AWS_TERRAFORM_ECS_APPLY operation when enabled and a valid plan exists', async () => {
      const freshDate = new Date();
      vi.mocked(prisma.operation.findFirst).mockResolvedValue({
        id: 'plan-123',
        status: OperationStatus.SUCCEEDED,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_TERRAFORM_ECS_PLAN,
        updatedAt: freshDate,
        input: {
          targetSlug: 'sample-ecs-app',
          environmentSlug: 'staging',
          imageUri: '123456789012.dkr.ecr.ap-south-1.amazonaws.com/autoops-sample-app:staging-20260524120000',
        },
        result: {
          addCount: 2,
          changeCount: 1,
          destroyCount: 0,
          riskLevel: 'LOW',
          applyEligible: true,
        },
      } as any);

      vi.mocked(operationService.createQueuedOperation).mockResolvedValue({
        id: 'op-apply-1',
        status: OperationStatus.PENDING_APPROVAL,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_TERRAFORM_ECS_APPLY,
      } as any);

      const res = await awsService.applyDeployment(orgId, userId, 'sample-ecs-app', 'staging');
      expect(res.operationId).toBe('op-apply-1');
      expect(res.status).toBe(OperationStatus.PENDING_APPROVAL);
      expect(operationService.createQueuedOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: OperationProvider.AWS,
          operationType: OperationType.AWS_TERRAFORM_ECS_APPLY,
          confirmationToken: 'APPLY',
          input: expect.objectContaining({
            action: 'ecs-apply',
            sourcePlanOperationId: 'plan-123',
            addCount: 2,
            changeCount: 1,
            destroyCount: 0,
            applyEligible: true,
          }),
        }),
        expect.anything()
      );
    });

    it('rejects apply if AWS_DEPLOYMENT_APPLY_ENABLED is not true', async () => {
      process.env.AWS_DEPLOYMENT_APPLY_ENABLED = 'false';
      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app')).rejects.toThrow('AWS deployment apply is disabled');
    });

    it('rejects apply if remote state is missing', async () => {
      process.env.AWS_TERRAFORM_STATE_BUCKET = '';
      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app')).rejects.toThrow('remote state is not fully configured');
    });

    it('rejects apply if no successful plan exists', async () => {
      vi.mocked(prisma.operation.findFirst).mockResolvedValue(null);
      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app')).rejects.toThrow('No successful tenant-scoped ECS plan');
    });

    it('rejects apply if the plan is stale (older than 24 hours)', async () => {
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      vi.mocked(prisma.operation.findFirst).mockResolvedValue({
        id: 'plan-123',
        status: OperationStatus.SUCCEEDED,
        updatedAt: staleDate,
        input: { targetSlug: 'sample-ecs-app', environmentSlug: 'staging' },
        result: { destroyCount: 0, applyEligible: true },
      } as any);

      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app', 'staging')).rejects.toThrow('plan is stale');
    });

    it('rejects apply if destroyCount > 0', async () => {
      vi.mocked(prisma.operation.findFirst).mockResolvedValue({
        id: 'plan-123',
        status: OperationStatus.SUCCEEDED,
        updatedAt: new Date(),
        input: { targetSlug: 'sample-ecs-app', environmentSlug: 'staging' },
        result: { destroyCount: 1, applyEligible: true },
      } as any);

      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app', 'staging')).rejects.toThrow('plan includes destroy actions');
    });

    it('rejects apply if applyEligible=false or riskLevel=HIGH', async () => {
      vi.mocked(prisma.operation.findFirst).mockResolvedValue({
        id: 'plan-123',
        status: OperationStatus.SUCCEEDED,
        updatedAt: new Date(),
        input: { targetSlug: 'sample-ecs-app', environmentSlug: 'staging' },
        result: { destroyCount: 0, applyEligible: false },
      } as any);

      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app', 'staging')).rejects.toThrow('not eligible for apply');

      vi.mocked(prisma.operation.findFirst).mockResolvedValue({
        id: 'plan-123',
        status: OperationStatus.SUCCEEDED,
        updatedAt: new Date(),
        input: { targetSlug: 'sample-ecs-app', environmentSlug: 'staging' },
        result: { destroyCount: 0, applyEligible: true, riskLevel: 'HIGH' },
      } as any);

      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app', 'staging')).rejects.toThrow('high-risk or blocked plan');
    });

    it('blocks apply readiness and requests when guardrail config is missing', async () => {
      vi.mocked(getAwsGuardrailConfigStatus).mockReturnValue({
        costGuardrailsEnabled: true,
        blastRadiusGuardrailsEnabled: true,
        allowedAccountIdsConfigured: false,
        allowedRegionsConfigured: false,
        maxPlanAddCount: 10,
        maxPlanChangeCount: 20,
        maxMonthlyCostDeltaUsd: 100,
        maxFargateCpu: 1024,
        maxFargateMemoryMb: 2048,
        maxDesiredCount: 2,
        blockPublicLoadBalancerByDefault: true,
        allowPublicLoadBalancer: false,
        missing: ['AWS_ALLOWED_ACCOUNT_IDS', 'AWS_ALLOWED_REGIONS'],
      });

      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app', 'staging')).rejects.toThrow('AWS guardrails are blocked');
    });

    it('blocks apply when latest plan guardrails are BLOCKED even if approval would exist later', async () => {
      vi.mocked(prisma.operation.findFirst).mockResolvedValue({
        id: 'plan-123',
        status: OperationStatus.SUCCEEDED,
        updatedAt: new Date(),
        input: { targetSlug: 'sample-ecs-app', environmentSlug: 'staging' },
        result: {
          destroyCount: 0,
          applyEligible: true,
          riskLevel: 'LOW',
          guardrails: {
            ...passedGuardrails,
            status: 'BLOCKED',
            riskLevel: 'BLOCKED',
            applyEligible: false,
            blockedReasons: [{ code: 'DISALLOWED_REGION', message: 'AWS region is not in the configured allowlist.' }],
          },
        },
      } as any);

      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app', 'staging')).rejects.toThrow('cost and blast-radius guardrails');
    });

    it('reports correct state in getTerraformApplyReadiness', async () => {
      vi.mocked(prisma.operation.findFirst).mockResolvedValue({
        id: 'plan-123',
        status: OperationStatus.SUCCEEDED,
        updatedAt: new Date(),
        input: { targetSlug: 'sample-ecs-app', environmentSlug: 'staging' },
        result: { addCount: 1, changeCount: 2, destroyCount: 0, applyEligible: true, riskLevel: 'LOW' },
      } as any);

      const readiness = await awsService.getTerraformApplyReadiness(orgId, 'sample-ecs-app', 'staging');
      expect(readiness.status).toBe('READY');
      expect(readiness.applyEnabled).toBe(true);
      expect(readiness.latestPlanAvailable).toBe(true);
      expect(readiness.destroyCount).toBe(0);
      expect(readiness.applyEligible).toBe(true);
    });
  });

  describe('guardrail evaluations', () => {
    it('returns empty tenant-scoped guardrail evaluations for a new org', async () => {
      vi.mocked(prisma.operation.findMany).mockResolvedValue([]);

      const res = await awsService.listGuardrailEvaluations('new-org');

      expect(res.items).toEqual([]);
      expect(prisma.operation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'new-org',
            provider: OperationProvider.AWS,
          }),
        }),
      );
    });

    it('does not return cross-org guardrail evidence by operation id', async () => {
      vi.mocked(prisma.operation.findMany).mockResolvedValue([]);

      const res = await awsService.listGuardrailEvaluations(orgId, 'other-org-operation');

      expect(res.items).toEqual([]);
      expect(prisma.operation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'other-org-operation',
            organizationId: orgId,
          }),
          take: 1,
        }),
      );
    });

    it('surfaces safe guardrail metadata from operation result without raw provider output', async () => {
      vi.mocked(prisma.operation.findMany).mockResolvedValue([
        {
          id: 'plan-123',
          input: {},
          result: {
            guardrails: {
              ...passedGuardrails,
              operationId: 'plan-123',
              costEstimate: {
                ...passedGuardrails.costEstimate,
                estimatedMonthlyDeltaUsd: 42,
              },
            },
          },
        } as any,
      ]);

      const res = await awsService.listGuardrailEvaluations(orgId, 'plan-123');

      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.operationId).toBe('plan-123');
      expect(res.items[0]!.costEstimate.estimatedMonthlyDeltaUsd).toBe(42);
    });
  });

  describe('ECR image operations', () => {
    it('creates a separate AWS_ECR_IMAGE_BUILD operation for an allowlisted target', async () => {
      vi.spyOn(awsService, 'listEcrRepositories').mockResolvedValue({
        status: 'CONNECTED' as any,
        configured: true,
        checkedAt: new Date().toISOString(),
        items: [
          {
            repositoryName: 'autoops-sample-app',
            repositoryUri: '123456789012.dkr.ecr.ap-south-1.amazonaws.com/autoops-sample-app',
            createdAt: null,
            imageTagMutability: 'MUTABLE',
            scanOnPush: true,
            encryptionType: 'AES256',
          },
        ],
      });
      vi.mocked(operationService.createQueuedOperation).mockResolvedValue({
        id: 'op-build',
        status: OperationStatus.QUEUED,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_ECR_IMAGE_BUILD,
      } as any);

      const res = await awsService.buildEcrImage(orgId, userId, {
        targetSlug: 'aws-sample-ecs-app',
        environmentSlug: 'staging',
        confirmationToken: 'BUILD',
      });

      expect(res.operationId).toBe('op-build');
      expect(operationService.createQueuedOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          userId,
          provider: OperationProvider.AWS,
          operationType: OperationType.AWS_ECR_IMAGE_BUILD,
          confirmationToken: 'BUILD',
          input: expect.objectContaining({
            action: 'build',
            targetSlug: 'aws-sample-ecs-app',
            repositoryName: 'autoops-sample-app',
            imageTag: 'staging-20260524120000',
          }),
        }),
        expect.anything(),
      );
    });

    it('rejects unknown ECR repositories for push', async () => {
      vi.mocked(isAllowedAwsEcrRepository).mockReturnValue(false);
      await expect(
        awsService.pushEcrImage(orgId, userId, {
          targetSlug: 'aws-sample-ecs-app',
          repositoryName: 'unknown-repo',
          environmentSlug: 'staging',
          imageTag: 'staging-20260524120000',
          confirmationToken: 'PUSH',
        }),
      ).rejects.toThrow('repository is not allowlisted');
    });
  });

  describe('AWS releases, promotion, and rollbacks', () => {
    beforeEach(() => {
      process.env.AWS_ALLOWED_DEPLOYMENT_WORKSPACES = 'aws-sample-ecs-app, sample-ecs-app, another-app';
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({ id: orgId, slug: 'autoops-demo' } as any);
      vi.mocked(operationAuthorizationService.canTriggerOperation).mockResolvedValue({ allowed: true, reason: null, role: 'OWNER' });
      vi.mocked(listTerraformWorkspaces).mockResolvedValue([
        { slug: 'aws-sample-ecs-app', displayName: 'Sample', absolutePath: '/a', relativePath: 'a' },
      ]);
    });

    it('returns empty list for listReleases/listReleaseHistory when new user has no releases', async () => {
      vi.mocked(prisma.awsRelease.findMany).mockResolvedValue([]);

      const res = await awsService.listReleases(orgId);
      expect(res.items).toEqual([]);

      const history = await awsService.listReleaseHistory(orgId);
      expect(history.items).toEqual([]);
    });

    it('scopes listReleases and listReleaseHistory by organizationId', async () => {
      const mockReleases = [
        {
          id: 'release-1',
          organizationId: orgId,
          targetSlug: 'aws-sample-ecs-app',
          environmentSlug: 'staging',
          imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:tag',
          releaseVersion: 1,
          status: 'ACTIVE',
          createdAt: new Date(),
          promotedAt: null,
          rolledBackAt: null,
        },
      ];
      vi.mocked(prisma.awsRelease.findMany).mockResolvedValue(mockReleases as any);

      const res = await awsService.listReleases(orgId);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.id).toBe('release-1');
      expect(prisma.awsRelease.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
          }),
        }),
      );
    });

    it('blocks cross-org release detail access', async () => {
      vi.mocked(prisma.awsRelease.findFirst).mockResolvedValue(null);

      await expect(awsService.getRelease(orgId, 'release-other-org')).rejects.toThrow('Release not found');
    });

    it('blocks promotion if target workspace is not allowlisted', async () => {
      const mockSourceRelease = {
        id: 'release-1',
        organizationId: orgId,
        targetSlug: 'aws-sample-ecs-app',
        environmentSlug: 'staging',
        imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:tag',
      };
      vi.mocked(prisma.awsRelease.findFirst).mockResolvedValue(mockSourceRelease as any);

      await expect(
        awsService.promoteRelease(orgId, userId, 'release-1', {
          targetSlug: 'not-allowlisted',
          targetEnvironmentSlug: 'production',
          confirmationToken: 'PROMOTE',
        }),
      ).rejects.toThrow('not allowed');
    });

    it('creates promotion operation and enforces authorization policy', async () => {
      const mockSourceRelease = {
        id: 'release-1',
        organizationId: orgId,
        targetSlug: 'aws-sample-ecs-app',
        environmentSlug: 'staging',
        imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:tag',
        imageDigest: 'sha256:123',
      };
      vi.mocked(prisma.awsRelease.findFirst).mockResolvedValue(mockSourceRelease as any);
      vi.mocked(detectTerraformTool).mockResolvedValue({
        status: 'CONNECTED',
        configured: true,
        tool: 'terraform',
        version: '1.5.0',
        checkedAt: new Date().toISOString(),
        message: 'OK',
      });
      vi.mocked(operationService.createQueuedOperation).mockResolvedValue({
        id: 'op-promote-123',
        status: 'PENDING_APPROVAL',
        provider: 'AWS',
        operationType: 'AWS_ECS_RELEASE_PROMOTE',
      } as any);

      const res = await awsService.promoteRelease(orgId, userId, 'release-1', {
        targetSlug: 'aws-sample-ecs-app',
        targetEnvironmentSlug: 'production',
        confirmationToken: 'PROMOTE',
      });

      expect(res.operationId).toBe('op-promote-123');
      expect(res.status).toBe('PENDING_APPROVAL');
    });

    it('blocks promotion when AWS guardrails are blocked', async () => {
      vi.mocked(getAwsGuardrailConfigStatus).mockReturnValue({
        costGuardrailsEnabled: true,
        blastRadiusGuardrailsEnabled: true,
        allowedAccountIdsConfigured: false,
        allowedRegionsConfigured: true,
        maxPlanAddCount: 10,
        maxPlanChangeCount: 20,
        maxMonthlyCostDeltaUsd: 100,
        maxFargateCpu: 1024,
        maxFargateMemoryMb: 2048,
        maxDesiredCount: 2,
        blockPublicLoadBalancerByDefault: true,
        allowPublicLoadBalancer: false,
        missing: ['AWS_ALLOWED_ACCOUNT_IDS'],
      });
      vi.mocked(prisma.awsRelease.findFirst).mockResolvedValue({
        id: 'release-1',
        organizationId: orgId,
        targetSlug: 'aws-sample-ecs-app',
        environmentSlug: 'staging',
        imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:tag',
      } as any);
      vi.mocked(detectTerraformTool).mockResolvedValue({
        status: 'CONNECTED',
        configured: true,
        tool: 'terraform',
        version: '1.5.0',
        checkedAt: new Date().toISOString(),
        message: 'OK',
      });

      await expect(
        awsService.promoteRelease(orgId, userId, 'release-1', {
          targetSlug: 'aws-sample-ecs-app',
          targetEnvironmentSlug: 'production',
          confirmationToken: 'PROMOTE',
        }),
      ).rejects.toThrow('AWS guardrails are blocked');
    });

    it('blocks rollback if target release does not exist or belongs to another org', async () => {
      vi.mocked(prisma.awsRelease.findFirst).mockResolvedValue(null);

      await expect(
        awsService.rollbackRelease(orgId, userId, 'release-other', {
          confirmationToken: 'ROLLBACK',
        }),
      ).rejects.toThrow('Target rollback release not found');
    });

    it('blocks rollback if no active release currently exists to rollback from', async () => {
      const mockTargetRelease = {
        id: 'release-target',
        organizationId: orgId,
        targetSlug: 'aws-sample-ecs-app',
        environmentSlug: 'production',
        imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:v1',
      };
      vi.mocked(prisma.awsRelease.findFirst)
        .mockResolvedValueOnce(mockTargetRelease as any)
        .mockResolvedValueOnce(null);

      await expect(
        awsService.rollbackRelease(orgId, userId, 'release-target', {
          confirmationToken: 'ROLLBACK',
        }),
      ).rejects.toThrow('No active release found to rollback from');
    });

    it('creates rollback operation and enforces approval policy', async () => {
      const mockTargetRelease = {
        id: 'release-target',
        organizationId: orgId,
        targetSlug: 'aws-sample-ecs-app',
        environmentSlug: 'production',
        imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:v1',
        releaseVersion: 1,
      };
      const mockActiveRelease = {
        id: 'release-active',
        organizationId: orgId,
        targetSlug: 'aws-sample-ecs-app',
        environmentSlug: 'production',
        imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:v2',
        releaseVersion: 2,
      };
      vi.mocked(prisma.awsRelease.findFirst)
        .mockResolvedValueOnce(mockTargetRelease as any)
        .mockResolvedValueOnce(mockActiveRelease as any);

      vi.mocked(detectTerraformTool).mockResolvedValue({
        status: 'CONNECTED',
        configured: true,
        tool: 'terraform',
        version: '1.5.0',
        checkedAt: new Date().toISOString(),
        message: 'OK',
      });
      vi.mocked(operationService.createQueuedOperation).mockResolvedValue({
        id: 'op-rollback-123',
        status: 'PENDING_APPROVAL',
        provider: 'AWS',
        operationType: 'AWS_ECS_RELEASE_ROLLBACK',
      } as any);

      const res = await awsService.rollbackRelease(orgId, userId, 'release-target', {
        confirmationToken: 'ROLLBACK',
      });

      expect(res.operationId).toBe('op-rollback-123');
      expect(res.status).toBe('PENDING_APPROVAL');
    });

    it('blocks rollback when AWS guardrails are blocked', async () => {
      vi.mocked(getAwsGuardrailConfigStatus).mockReturnValue({
        costGuardrailsEnabled: true,
        blastRadiusGuardrailsEnabled: true,
        allowedAccountIdsConfigured: true,
        allowedRegionsConfigured: false,
        maxPlanAddCount: 10,
        maxPlanChangeCount: 20,
        maxMonthlyCostDeltaUsd: 100,
        maxFargateCpu: 1024,
        maxFargateMemoryMb: 2048,
        maxDesiredCount: 2,
        blockPublicLoadBalancerByDefault: true,
        allowPublicLoadBalancer: false,
        missing: ['AWS_ALLOWED_REGIONS'],
      });
      vi.mocked(prisma.awsRelease.findFirst)
        .mockResolvedValueOnce({
          id: 'release-target',
          organizationId: orgId,
          targetSlug: 'aws-sample-ecs-app',
          environmentSlug: 'production',
          imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:v1',
        } as any)
        .mockResolvedValueOnce({
          id: 'release-active',
          organizationId: orgId,
          targetSlug: 'aws-sample-ecs-app',
          environmentSlug: 'production',
          imageUri: '12345.dkr.ecr.us-east-1.amazonaws.com/app:v2',
        } as any);
      vi.mocked(detectTerraformTool).mockResolvedValue({
        status: 'CONNECTED',
        configured: true,
        tool: 'terraform',
        version: '1.5.0',
        checkedAt: new Date().toISOString(),
        message: 'OK',
      });

      await expect(
        awsService.rollbackRelease(orgId, userId, 'release-target', {
          confirmationToken: 'ROLLBACK',
        }),
      ).rejects.toThrow('AWS guardrails are blocked');
    });
  });
});
