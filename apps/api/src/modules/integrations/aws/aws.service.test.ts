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
import { OperationProvider, OperationType, OperationStatus } from '@autoops/types';

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

describe('AwsService', () => {
  let awsService: AwsService;
  const orgId = 'org-1';
  const userId = 'user-1';

  beforeEach(() => {
    vi.resetAllMocks();
    awsService = new AwsService();
    process.env.AWS_ALLOWED_DEPLOYMENT_WORKSPACES = 'sample-ecs-app, another-app';
    process.env.AWS_DEPLOYMENT_APPLY_ENABLED = 'true';
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
    it('creates a TERRAFORM_PLAN operation for an allowed target', async () => {
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
        operationType: OperationType.TERRAFORM_PLAN,
      } as any);

      const res = await awsService.planDeployment(orgId, userId, 'sample-ecs-app');
      expect(res.operationId).toBe('op-1');
      expect(operationService.createQueuedOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: OperationProvider.AWS,
          operationType: OperationType.TERRAFORM_PLAN,
          input: expect.objectContaining({
            action: 'plan',
            workspaceSlug: 'sample-ecs-app',
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

      await expect(awsService.planDeployment(orgId, userId, 'not-allowed')).rejects.toThrow('is not an allowed AWS deployment workspace');
    });
  });

  describe('applyDeployment', () => {
    it('creates a TERRAFORM_APPLY operation if enabled', async () => {
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
        id: 'op-2',
        status: OperationStatus.PENDING_APPROVAL,
        provider: OperationProvider.AWS,
        operationType: OperationType.TERRAFORM_APPLY,
      } as any);

      const res = await awsService.applyDeployment(orgId, userId, 'sample-ecs-app');
      expect(res.operationId).toBe('op-2');
      expect(res.status).toBe(OperationStatus.PENDING_APPROVAL);
      expect(operationService.createQueuedOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: OperationProvider.AWS,
          operationType: OperationType.TERRAFORM_APPLY,
          input: expect.objectContaining({ action: 'apply' }),
        }),
        expect.anything()
      );
    });

    it('rejects apply if AWS_DEPLOYMENT_APPLY_ENABLED is not true', async () => {
      process.env.AWS_DEPLOYMENT_APPLY_ENABLED = 'false';
      await expect(awsService.applyDeployment(orgId, userId, 'sample-ecs-app')).rejects.toThrow('AWS deployment apply is disabled');
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
