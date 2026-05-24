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
} from '@autoops/utils';
import { operationService } from '../../operations/operation.service.js';
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
  BadRequestError: class BadRequestError extends Error {},
}));

vi.mock('../../operations/operation.service.js', () => {
  return {
    operationService: {
      createQueuedOperation: vi.fn(),
    },
  };
});

vi.mock('@autoops/database', () => ({
  prisma: {
    operation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('AwsService', () => {
  let awsService: AwsService;
  const orgId = 'org-1';
  const userId = 'user-1';

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

      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app', 'staging')).rejects.toThrow('blocked due to HIGH risk plan');
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
});
