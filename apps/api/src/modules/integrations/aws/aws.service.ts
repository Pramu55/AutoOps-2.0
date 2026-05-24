import type {
  AwsCloudWatchAlarm,
  AwsEc2Instance,
  AwsEcrRepository,
  AwsEcsCluster,
  AwsEcsService,
  AwsListResponse,
  AwsPartialFailure,
  AwsStatusResponse,
  AwsSummary,
  AwsIdentityResponse,
  AwsReadinessResponse,
  AwsPermissionsResponse,
  AwsRemoteStateReadinessResponse,
  AwsWorkspaceReadinessResponse,
  AwsDeploymentTarget,
  AwsPermissionDiagnostic,
  AwsEcrReadinessResponse,
  AwsEcrImageBuildRequest,
  AwsEcrImagePushRequest,
  AwsEcrImageMetadata,
  AwsTerraformEcsPlanRequest,
  AwsTerraformPlanReadinessResponse,
  AwsTerraformApplyReadinessResponse,
} from '@autoops/types';
import { ProviderConnectionStatus, AwsIntegrationStatus, AwsReadinessStatus, AwsDiagnosticStatus, AwsDeploymentTargetType, AwsTerraformPlanStatus } from '@autoops/types';
import {
  DescribeAlarmsCommand,
  DescribeClustersCommand,
  DescribeInstancesCommand,
  DescribeRepositoriesCommand,
  GetLifecyclePolicyCommand,
  DescribeServicesCommand,
  GetCallerIdentityCommand,
  ListClustersCommand,
  ListFunctionsCommand,
  ListServicesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  ListTaskDefinitionsCommand,
  DescribeLogGroupsCommand,
  DescribeLoadBalancersCommand,
  GetUserCommand,
  HeadBucketCommand,
  DescribeTableCommand,
  classifyAwsError,
  createAwsClients,
  getAwsConfiguration,
  safeAwsMessage,
} from './aws.client.js';
import { prisma, type Prisma } from '@autoops/database';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  OperationProvider,
  OperationStatus,
  OperationType,
  AwsReleaseStatus,
  type AwsDeploymentOperationResponse,
  type AwsDeploymentSummary,
  type AwsReleaseSummary,
  type AwsReleaseHistoryResponse,
  type AwsReleaseReadinessResponse,
  type AwsReleasePromoteRequest,
  type AwsReleasePromoteResponse,
  type AwsReleaseRollbackRequest,
  type AwsReleaseRollbackResponse,
} from '@autoops/types';
import {
  listTerraformWorkspaces,
  getTerraformWorkspaceBySlug,
  detectTerraformTool,
  listAwsEcrBuildTargets,
  listAllowedAwsEcrRepositories,
  getAwsEcrBuildTargetBySlug,
  isSafeEcrEnvironmentSlug,
  isAllowedAwsEcrRepository,
  isSafeEcrImageTag,
  createEcrImageTag,
  isProductionEnvironment,
} from '@autoops/utils';
import { operationService } from '../../operations/operation.service.js';
import { operationAuthorizationService } from '../../operations/operation-authorization.service.js';
import { isProviderInventoryAccessEnabledForOrg } from '../integration-access.service.js';
import { BadRequestError, UnauthorizedError } from '@autoops/utils';

export class AwsService {
  async getStatus(): Promise<AwsStatusResponse> {
    const checkedAt = new Date().toISOString();
    const config = getAwsConfiguration();
    if (!config.configured) {
      return {
        status: AwsIntegrationStatus.NOT_CONFIGURED,
        configured: false,
        region: config.region,
        message: config.message,
        checkedAt,
      };
    }

    const clients = createAwsClients();
    if (!clients) {
      return {
        status: AwsIntegrationStatus.NOT_CONFIGURED,
        configured: false,
        region: config.region,
        message: config.message,
        checkedAt,
      };
    }

    try {
      await clients.sts.send(new GetCallerIdentityCommand({}));
      return {
        status: AwsIntegrationStatus.CONNECTED,
        configured: true,
        region: clients.region,
        message: 'AWS integration is reachable.',
        checkedAt,
      };
    } catch (error) {
      const pStatus = classifyAwsError(error);
      const mStatus = pStatus === ProviderConnectionStatus.AUTH_FAILED ? AwsIntegrationStatus.AUTH_FAILED : AwsIntegrationStatus.ERROR;
      return {
        status: mStatus,
        configured: true,
        region: clients.region,
        message: safeAwsMessage(error),
        checkedAt,
      };
    }
  }

  async getIdentity(): Promise<AwsIdentityResponse> {
    const checkedAt = new Date().toISOString();
    const config = getAwsConfiguration();
    if (!config.configured) {
      return {
        status: AwsIntegrationStatus.NOT_CONFIGURED,
        configured: false,
        region: config.region,
        checkedAt,
      };
    }

    const clients = createAwsClients();
    if (!clients) {
      return {
        status: AwsIntegrationStatus.NOT_CONFIGURED,
        configured: false,
        region: config.region,
        checkedAt,
      };
    }

    try {
      const identity = await clients.sts.send(new GetCallerIdentityCommand({}));
      return {
        status: AwsIntegrationStatus.CONNECTED,
        configured: true,
        accountId: identity.Account,
        arn: identity.Arn,
        userId: identity.UserId,
        region: clients.region,
        checkedAt,
      };
    } catch (error) {
      const pStatus = classifyAwsError(error);
      const mStatus = pStatus === ProviderConnectionStatus.AUTH_FAILED ? AwsIntegrationStatus.AUTH_FAILED : AwsIntegrationStatus.ERROR;
      return {
        status: mStatus,
        configured: true,
        region: clients.region,
        checkedAt,
      };
    }
  }

  async getReadiness(): Promise<AwsReadinessResponse> {
    const checkedAt = new Date().toISOString();
    
    const integrationEnabled = process.env.AWS_INTEGRATION_ENABLED === 'true';
    const regionConfigured = !!process.env.AWS_REGION;
    const accessKeyConfigured = !!process.env.AWS_ACCESS_KEY_ID;
    const secretKeyConfigured = !!process.env.AWS_SECRET_ACCESS_KEY;
    const sessionTokenConfigured = !!process.env.AWS_SESSION_TOKEN;
    const accountIdConfigured = !!process.env.AWS_ACCOUNT_ID;
    const allowedWorkspacesConfigured = !!process.env.AWS_ALLOWED_DEPLOYMENT_WORKSPACES;
    const remoteStateBucketConfigured = !!process.env.AWS_TERRAFORM_STATE_BUCKET;
    const remoteStateLockTableConfigured = !!process.env.AWS_TERRAFORM_STATE_DYNAMODB_TABLE;
    const remoteStateRegionConfigured = !!process.env.AWS_TERRAFORM_STATE_REGION;
    const applyEnabled = process.env.AWS_DEPLOYMENT_APPLY_ENABLED === 'true';

    const missing: string[] = [];
    if (!process.env.AWS_REGION) missing.push('AWS_REGION');
    if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
    if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
    if (!process.env.AWS_ACCOUNT_ID) missing.push('AWS_ACCOUNT_ID');

    const isFullyConfigured = regionConfigured && accessKeyConfigured && secretKeyConfigured && accountIdConfigured;
    const isNotConfigured = !regionConfigured && !accessKeyConfigured && !secretKeyConfigured && !accountIdConfigured;
    
    let status = AwsReadinessStatus.READY;
    if (isNotConfigured) status = AwsReadinessStatus.NOT_CONFIGURED;
    else if (!isFullyConfigured) status = AwsReadinessStatus.PARTIAL;

    return {
      status,
      integrationEnabled,
      regionConfigured,
      accessKeyConfigured,
      secretKeyConfigured,
      sessionTokenConfigured,
      accountIdConfigured,
      allowedWorkspacesConfigured,
      remoteStateBucketConfigured,
      remoteStateLockTableConfigured,
      remoteStateRegionConfigured,
      applyEnabled,
      missing,
      checkedAt,
    };
  }

  async getPermissions(): Promise<AwsPermissionsResponse> {
    const checkedAt = new Date().toISOString();
    const config = getAwsConfiguration();
    const clients = createAwsClients();

    if (!config.configured || !clients) {
      return {
        status: AwsIntegrationStatus.NOT_CONFIGURED,
        diagnostics: [],
        checkedAt,
      };
    }

    const diagnostics: AwsPermissionDiagnostic[] = [];

    const runCheck = async (service: string, action: string, fn: () => Promise<void>) => {
      try {
        await fn();
        diagnostics.push({ service, action, status: AwsDiagnosticStatus.PASS, message: 'Permission granted.', checkedAt });
      } catch (error: any) {
        let status = AwsDiagnosticStatus.ERROR;
        const pStatus = classifyAwsError(error);
        if (pStatus === ProviderConnectionStatus.AUTH_FAILED) status = AwsDiagnosticStatus.AUTH_FAILED;
        else if (error?.name === 'AccessDeniedException' || error?.message?.includes('AccessDenied')) status = AwsDiagnosticStatus.MISSING_PERMISSION;
        
        diagnostics.push({ service, action, status, message: safeAwsMessage(error), checkedAt });
      }
    };

    await runCheck('STS', 'sts:GetCallerIdentity', async () => { await clients.sts.send(new GetCallerIdentityCommand({})); });
    await runCheck('ECR', 'ecr:DescribeRepositories', async () => { await clients.ecr.send(new DescribeRepositoriesCommand({ maxResults: 1 })); });
    await runCheck('ECS', 'ecs:ListClusters', async () => { await clients.ecs.send(new ListClustersCommand({ maxResults: 1 })); });
    await runCheck('ECS', 'ecs:ListTaskDefinitions', async () => { await clients.ecs.send(new ListTaskDefinitionsCommand({ maxResults: 1 })); });
    await runCheck('CloudWatchLogs', 'logs:DescribeLogGroups', async () => { await clients.cloudWatchLogs.send(new DescribeLogGroupsCommand({ limit: 1 })); });
    await runCheck('EC2', 'ec2:DescribeVpcs', async () => { await clients.ec2.send(new DescribeVpcsCommand({ MaxResults: 5 })); });
    await runCheck('EC2', 'ec2:DescribeSubnets', async () => { await clients.ec2.send(new DescribeSubnetsCommand({ MaxResults: 5 })); });
    await runCheck('EC2', 'ec2:DescribeSecurityGroups', async () => { await clients.ec2.send(new DescribeSecurityGroupsCommand({ MaxResults: 5 })); });
    await runCheck('ElasticLoadBalancingV2', 'elasticloadbalancing:DescribeLoadBalancers', async () => { await clients.elb.send(new DescribeLoadBalancersCommand({ PageSize: 1 })); });
    await runCheck('IAM', 'iam:GetUser', async () => { await clients.iam.send(new GetUserCommand({})); });

    const allPass = diagnostics.every(d => d.status === AwsDiagnosticStatus.PASS);
    const anyAuthFailed = diagnostics.some(d => d.status === AwsDiagnosticStatus.AUTH_FAILED);

    let status = AwsIntegrationStatus.CONNECTED;
    if (anyAuthFailed) status = AwsIntegrationStatus.AUTH_FAILED;
    else if (!allPass) status = AwsIntegrationStatus.ERROR;

    return {
      status,
      diagnostics,
      checkedAt,
    };
  }

  async getRemoteStateReadiness(): Promise<AwsRemoteStateReadinessResponse> {
    const checkedAt = new Date().toISOString();
    const bucket = process.env.AWS_TERRAFORM_STATE_BUCKET;
    const lockTable = process.env.AWS_TERRAFORM_STATE_DYNAMODB_TABLE;
    const region = process.env.AWS_TERRAFORM_STATE_REGION;

    const bucketConfigured = !!bucket;
    const lockTableConfigured = !!lockTable;
    const stateRegionConfigured = !!region;

    const response: AwsRemoteStateReadinessResponse = {
      status: AwsReadinessStatus.NOT_CONFIGURED,
      bucketConfigured,
      lockTableConfigured,
      stateRegionConfigured,
      bucketReachable: null,
      lockTableReachable: null,
      checks: [],
      checkedAt,
    };

    if (!bucketConfigured && !lockTableConfigured && !stateRegionConfigured) {
      return response;
    }

    if (!bucketConfigured || !lockTableConfigured || !stateRegionConfigured) {
      response.status = AwsReadinessStatus.PARTIAL;
    }

    const clients = createAwsClients();
    if (!clients) {
      response.status = AwsReadinessStatus.AUTH_FAILED;
      return response;
    }

    response.status = AwsReadinessStatus.READY;

    if (bucket) {
      try {
        await clients.s3.send(new HeadBucketCommand({ Bucket: bucket }));
        response.bucketReachable = true;
        response.checks.push({ name: 'S3 state bucket', status: AwsDiagnosticStatus.PASS, message: 'Bucket is reachable.' });
      } catch (error: any) {
        response.bucketReachable = false;
        response.status = AwsReadinessStatus.ERROR;
        if (error?.name === 'NotFound') {
           response.checks.push({ name: 'S3 state bucket', status: 'NOT_FOUND', message: 'Bucket not found.' });
        } else if (error?.name === 'Forbidden') {
           response.checks.push({ name: 'S3 state bucket', status: AwsDiagnosticStatus.MISSING_PERMISSION, message: 'Access denied to bucket.' });
        } else {
           response.checks.push({ name: 'S3 state bucket', status: AwsDiagnosticStatus.ERROR, message: safeAwsMessage(error) });
        }
      }
    } else {
      response.checks.push({ name: 'S3 state bucket', status: 'MISSING_CONFIG', message: 'Bucket not configured.' });
    }

    if (lockTable) {
      try {
        await clients.dynamoDb.send(new DescribeTableCommand({ TableName: lockTable }));
        response.lockTableReachable = true;
        response.checks.push({ name: 'DynamoDB lock table', status: AwsDiagnosticStatus.PASS, message: 'Lock table is reachable.' });
      } catch (error: any) {
        response.lockTableReachable = false;
        response.status = AwsReadinessStatus.ERROR;
        if (error?.name === 'ResourceNotFoundException') {
           response.checks.push({ name: 'DynamoDB lock table', status: 'NOT_FOUND', message: 'Table not found.' });
        } else if (error?.name === 'AccessDeniedException') {
           response.checks.push({ name: 'DynamoDB lock table', status: AwsDiagnosticStatus.MISSING_PERMISSION, message: 'Access denied to table.' });
        } else {
           response.checks.push({ name: 'DynamoDB lock table', status: AwsDiagnosticStatus.ERROR, message: safeAwsMessage(error) });
        }
      }
    } else {
      response.checks.push({ name: 'DynamoDB lock table', status: 'MISSING_CONFIG', message: 'Lock table not configured.' });
    }

    return response;
  }

  async getWorkspaceReadiness(targetSlug: string): Promise<AwsWorkspaceReadinessResponse> {
    const checkedAt = new Date().toISOString();
    
    const targets = await this.listDeploymentTargets();
    const isAllowed = targets.items.some(t => t.slug === targetSlug);

    const res: AwsWorkspaceReadinessResponse = {
      status: AwsReadinessStatus.NOT_CONFIGURED,
      targetSlug,
      workspaceExists: false,
      requiredFiles: [],
      tooling: {
        tofuAvailable: false,
        terraformAvailable: false,
      },
      checks: [],
      checkedAt,
    };

    if (!isAllowed) {
       res.status = AwsReadinessStatus.ERROR;
       res.checks.push({ name: 'Allowed Target', status: 'FAIL', message: 'Target slug is not allowlisted.' });
       return res;
    }

    const workspace = await getTerraformWorkspaceBySlug(targetSlug);
    if (!workspace) {
       res.status = AwsReadinessStatus.ERROR;
       res.checks.push({ name: 'Workspace Directory', status: 'FAIL', message: 'Workspace directory does not exist.' });
       return res;
    }

    res.workspaceExists = true;
    res.status = AwsReadinessStatus.READY;

    const reqFiles = ['providers.tf', 'main.tf', 'variables.tf', 'outputs.tf', 'backend.tf.example', 'terraform.tfvars.example', 'README.md'];
    for (const file of reqFiles) {
      try {
        await fs.access(path.join(workspace.absolutePath, file));
        res.requiredFiles.push({ path: file, present: true });
      } catch {
        res.requiredFiles.push({ path: file, present: false });
        res.status = AwsReadinessStatus.PARTIAL;
      }
    }

    try {
      await fs.access(path.join(workspace.absolutePath, 'terraform.tfstate'));
      res.checks.push({ name: 'Local State', status: 'FAIL', message: 'terraform.tfstate is checked in!' });
      res.status = AwsReadinessStatus.ERROR;
    } catch {
      res.checks.push({ name: 'Local State', status: AwsDiagnosticStatus.PASS, message: 'No local terraform.tfstate found.' });
    }

    try {
      await fs.access(path.join(workspace.absolutePath, '.terraform'));
      res.checks.push({ name: '.terraform Directory', status: 'FAIL', message: '.terraform directory is checked in!' });
      res.status = AwsReadinessStatus.ERROR;
    } catch {
      res.checks.push({ name: '.terraform Directory', status: AwsDiagnosticStatus.PASS, message: 'No local .terraform dir found.' });
    }

    const toolStatus = await detectTerraformTool();
    if (toolStatus.tool === 'tofu') res.tooling.tofuAvailable = true;
    if (toolStatus.tool === 'terraform') res.tooling.terraformAvailable = true;

    if (!res.tooling.tofuAvailable && !res.tooling.terraformAvailable) {
      res.checks.push({ name: 'Tooling', status: 'FAIL', message: 'Neither tofu nor terraform is available.' });
      res.status = AwsReadinessStatus.ERROR;
    } else {
      res.checks.push({ name: 'Tooling', status: AwsDiagnosticStatus.PASS, message: `${toolStatus.tool} is available.` });
    }

    res.checks.push({ name: 'tofu fmt -check', status: AwsDiagnosticStatus.SKIPPED, message: 'Skipped formatting check to avoid execution.' });

    return res;
  }

  async getTerraformPlanReadiness(
    organizationId: string,
    targetSlug?: string,
    environmentSlug?: string,
  ): Promise<AwsTerraformPlanReadinessResponse> {
    const checkedAt = new Date().toISOString();
    const awsStatus = await this.getStatus();
    const targets = await this.listDeploymentTargets();
    const target = targetSlug
      ? targets.items.find((item) => item.slug === targetSlug)
      : targets.items[0] ?? null;
    const missing: string[] = [];
    const blockedReasons: string[] = [];

    const state = this._remoteStateConfig();
    if (!awsStatus.configured) missing.push('AWS credentials');
    if (!awsStatus.region) missing.push('AWS_REGION');
    if (!state.bucket) missing.push('AWS_TERRAFORM_STATE_BUCKET');
    if (!state.lockTable) missing.push('AWS_TERRAFORM_STATE_DYNAMODB_TABLE');
    if (!state.region) missing.push('AWS_TERRAFORM_STATE_REGION');
    if (!target) missing.push('AWS_ALLOWED_DEPLOYMENT_WORKSPACES');
    if (targetSlug && !target) blockedReasons.push('Target slug is not allowlisted.');

    const workspace = target ? await getTerraformWorkspaceBySlug(target.slug) : null;
    if (target && !workspace) blockedReasons.push('Allowlisted Terraform/OpenTofu workspace does not exist.');

    const toolStatus = await detectTerraformTool();
    if (toolStatus.status !== 'CONNECTED') blockedReasons.push('Terraform/OpenTofu is not available in this runtime.');

    const image = target
      ? await this._latestPushedEcrImage(organizationId, target.slug, environmentSlug)
      : null;
    if (!image) blockedReasons.push('No successful tenant-scoped ECR push metadata is available for this target/environment.');

    let status = AwsTerraformPlanStatus.READY;
    if (missing.length > 0) status = AwsTerraformPlanStatus.NOT_CONFIGURED;
    else if (blockedReasons.length > 0) status = AwsTerraformPlanStatus.BLOCKED;

    return {
      status,
      awsConfigured: awsStatus.configured,
      regionConfigured: Boolean(awsStatus.region),
      remoteStateBucketConfigured: Boolean(state.bucket),
      remoteStateLockTableConfigured: Boolean(state.lockTable),
      remoteStateRegionConfigured: Boolean(state.region),
      allowedWorkspaceConfigured: Boolean(target),
      workspaceExists: Boolean(workspace),
      terraformToolAvailable: toolStatus.status === 'CONNECTED',
      safeImageAvailable: Boolean(image),
      targetSlug: target?.slug ?? targetSlug ?? null,
      environmentSlug: environmentSlug ?? (image ? this._string(this._record(image.input).environmentSlug) : null),
      latestImageOperationId: image?.id ?? null,
      missing,
      blockedReasons,
      checkedAt,
    };
  }

  async getTerraformApplyReadiness(
    organizationId: string,
    targetSlug?: string,
    environmentSlug?: string,
  ): Promise<AwsTerraformApplyReadinessResponse> {
    const checkedAt = new Date().toISOString();
    const awsStatus = await this.getStatus();
    const targets = await this.listDeploymentTargets();
    const target = targetSlug
      ? targets.items.find((item) => item.slug === targetSlug)
      : targets.items[0] ?? null;
    const missing: string[] = [];
    const blockedReasons: string[] = [];

    const state = this._remoteStateConfig();
    if (!awsStatus.configured) missing.push('AWS credentials');
    if (!awsStatus.region) missing.push('AWS_REGION');
    if (!state.bucket) missing.push('AWS_TERRAFORM_STATE_BUCKET');
    if (!state.lockTable) missing.push('AWS_TERRAFORM_STATE_DYNAMODB_TABLE');
    if (!state.region) missing.push('AWS_TERRAFORM_STATE_REGION');
    if (!target) missing.push('AWS_ALLOWED_DEPLOYMENT_WORKSPACES');
    if (targetSlug && !target) blockedReasons.push('Target slug is not allowlisted.');

    const workspace = target ? await getTerraformWorkspaceBySlug(target.slug) : null;
    if (target && !workspace) blockedReasons.push('Allowlisted Terraform/OpenTofu workspace does not exist.');

    const toolStatus = await detectTerraformTool();
    if (toolStatus.status !== 'CONNECTED') blockedReasons.push('Terraform/OpenTofu is not available in this runtime.');

    const applyEnabled = process.env.AWS_DEPLOYMENT_APPLY_ENABLED === 'true';
    if (!applyEnabled) {
      blockedReasons.push('AWS deployment apply is disabled in this environment.');
    }

    const latestPlan = target
      ? await prisma.operation.findFirst({
          where: {
            organizationId,
            provider: OperationProvider.AWS,
            operationType: OperationType.AWS_TERRAFORM_ECS_PLAN,
            status: OperationStatus.SUCCEEDED,
            AND: [
              { input: { path: ['targetSlug'], equals: target.slug } },
              ...(environmentSlug ? [{ input: { path: ['environmentSlug'], equals: environmentSlug } }] : []),
            ],
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    let latestPlanAvailable = false;
    let latestPlanApproved = false;
    let latestPlanOperationId: string | null = null;
    let latestPlanStatus: string | null = null;
    let latestPlanAgeSeconds: number | null = null;
    let addCount: number | null = null;
    let changeCount: number | null = null;
    let destroyCount: number | null = null;
    let riskLevel: string | null = null;
    let applyEligible: boolean | null = null;

    if (latestPlan) {
      latestPlanAvailable = true;
      latestPlanOperationId = latestPlan.id;
      latestPlanStatus = latestPlan.status;
      latestPlanAgeSeconds = Math.max(0, Math.floor((Date.now() - latestPlan.updatedAt.getTime()) / 1000));

      const fresh = latestPlanAgeSeconds < 24 * 60 * 60;
      if (!fresh) {
        blockedReasons.push('The latest successful ECS plan is stale (older than 24 hours).');
      }

      latestPlanApproved = true;

      const result = this._record(latestPlan.result);
      addCount = typeof result.addCount === 'number' ? result.addCount : 0;
      changeCount = typeof result.changeCount === 'number' ? result.changeCount : 0;
      destroyCount = typeof result.destroyCount === 'number' ? result.destroyCount : 0;
      riskLevel = typeof result.riskLevel === 'string' ? result.riskLevel : 'LOW';
      applyEligible = result.applyEligible === true;

      if (destroyCount > 0) {
        blockedReasons.push('Terraform plan includes destroy actions. Apply is blocked.');
      }
      if (!applyEligible) {
        blockedReasons.push('The latest plan is not eligible for apply.');
      }
      if (riskLevel === 'HIGH') {
        blockedReasons.push('Apply is blocked due to HIGH risk plan.');
      }
    } else {
      blockedReasons.push('No successful tenant-scoped ECS plan is available for this target/environment.');
    }

    let status = AwsTerraformPlanStatus.READY;
    if (missing.length > 0) status = AwsTerraformPlanStatus.NOT_CONFIGURED;
    else if (blockedReasons.length > 0) status = AwsTerraformPlanStatus.BLOCKED;

    return {
      status,
      applyEnabled,
      awsConfigured: awsStatus.configured,
      regionConfigured: Boolean(awsStatus.region),
      remoteStateBucketConfigured: Boolean(state.bucket),
      remoteStateLockTableConfigured: Boolean(state.lockTable),
      remoteStateRegionConfigured: Boolean(state.region),
      allowedWorkspaceConfigured: Boolean(target),
      workspaceExists: Boolean(workspace),
      terraformToolAvailable: toolStatus.status === 'CONNECTED',
      latestPlanAvailable,
      latestPlanApproved,
      latestPlanOperationId,
      latestPlanStatus,
      latestPlanAgeSeconds,
      addCount,
      changeCount,
      destroyCount,
      riskLevel,
      applyEligible,
      targetSlug: target?.slug ?? targetSlug ?? null,
      environmentSlug: environmentSlug ?? (latestPlan ? this._string(this._record(latestPlan.input).environmentSlug) : null),
      missing,
      blockedReasons,
      checkedAt,
    };
  }

  async getSummary(): Promise<AwsSummary> {
    const identity = await this.getIdentity();
    const partialFailures: AwsPartialFailure[] = [];

    const mappedStatus = mapAwsToProviderStatus(identity.status);

    if (mappedStatus !== ProviderConnectionStatus.CONNECTED) {
      return {
        status: mappedStatus,
        accountId: identity.accountId,
        region: identity.region,
        checkedAt: identity.checkedAt,
        partialFailures,
      };
    }

    const clients = createAwsClients();
    if (!clients) {
      return {
        status: ProviderConnectionStatus.NOT_CONFIGURED,
        checkedAt: new Date().toISOString(),
        partialFailures,
      };
    }

    const [instances, clusters, repositories, alarms, functions] = await Promise.all([
      this._safe('EC2', partialFailures, () => this._loadEc2Instances(clients)),
      this._safe('ECS', partialFailures, () => this._loadEcsClusters(clients)),
      this._safe('ECR', partialFailures, () => this._loadEcrRepositories(clients)),
      this._safe('CloudWatch', partialFailures, () => this._loadCloudWatchAlarms(clients)),
      this._safe('Lambda', partialFailures, async () => {
        const response = await clients.lambda.send(new ListFunctionsCommand({}));
        return response.Functions ?? [];
      }),
    ]);

    return {
      status: mappedStatus,
      accountId: identity.accountId,
      region: identity.region,
      checkedAt: new Date().toISOString(),
      ec2: instances
        ? {
            instances: instances.length,
            running: instances.filter((item) => item.state === 'running').length,
            stopped: instances.filter((item) => item.state === 'stopped').length,
          }
        : undefined,
      ecs: clusters
        ? {
            clusters: clusters.length,
            activeServices: clusters.reduce((total, cluster) => total + cluster.activeServicesCount, 0),
            runningTasks: clusters.reduce((total, cluster) => total + cluster.runningTasksCount, 0),
            pendingTasks: clusters.reduce((total, cluster) => total + cluster.pendingTasksCount, 0),
          }
        : undefined,
      ecr: repositories ? { repositories: repositories.length } : undefined,
      cloudWatch: alarms
        ? {
            alarms: alarms.length,
            alarmState: alarms.filter((alarm) => alarm.stateValue === 'ALARM').length,
            okState: alarms.filter((alarm) => alarm.stateValue === 'OK').length,
            insufficientData: alarms.filter((alarm) => alarm.stateValue === 'INSUFFICIENT_DATA').length,
          }
        : undefined,
      lambda: functions ? { functions: functions.length } : undefined,
      partialFailures,
    };
  }

  async listDeploymentTargets(): Promise<AwsListResponse<AwsDeploymentTarget>> {
    return this._listResponse(async () => {
      const allWorkspaces = await listTerraformWorkspaces();
      const allowedEnv = process.env.AWS_ALLOWED_DEPLOYMENT_WORKSPACES ?? '';
      const allowedSlugs = new Set(allowedEnv.split(',').map((s) => s.trim()).filter(Boolean));

      return allWorkspaces
        .filter((w) => allowedSlugs.has(w.slug))
        .map((w) => ({
          slug: w.slug,
          name: w.displayName,
          type: AwsDeploymentTargetType.ECS_FARGATE,
          planSupported: true,
          applySupported: true,
          applyEnabled: process.env.AWS_DEPLOYMENT_APPLY_ENABLED === 'true',
          requiresApproval: true,
          remoteStateRequired: true,
          status: 'READY',
        }));
    });
  }

  async listDeployments(organizationId: string): Promise<AwsListResponse<AwsDeploymentSummary>> {
    return this._listResponse(async () => {
      const targets = await this.listDeploymentTargets();
      if (!targets.items || targets.items.length === 0) return [];

      const targetSlugs = targets.items.map(t => t.slug);

      const operations = await prisma.operation.findMany({
        where: {
          organizationId,
          provider: OperationProvider.AWS,
        },
        orderBy: { createdAt: 'desc' },
      });

      const summaries: AwsDeploymentSummary[] = [];
      for (const slug of targetSlugs) {
        const op = operations.find(o => {
          const opInput = (o.input as Record<string, unknown>) ?? {};
          return opInput.workspaceSlug === slug || opInput.targetSlug === slug;
        });
        summaries.push({
          workspaceSlug: slug,
          status: op ? op.status : 'NOT_DEPLOYED',
          lastOperationId: op?.id,
          lastOperationType: op?.operationType,
        });
      }
      return summaries;
    });
  }

  async getEcrReadiness(): Promise<AwsEcrReadinessResponse> {
    const checkedAt = new Date().toISOString();
    const status = await this.getStatus();
    const allowedRepositories = listAllowedAwsEcrRepositories();
    const buildTargets = listAwsEcrBuildTargets().map((target) => ({
      targetSlug: target.targetSlug,
      displayName: target.displayName,
      contextPath: target.contextPath,
      dockerfilePath: target.dockerfilePath,
      defaultRepository: target.defaultRepository,
      allowedEnvironments: target.allowedEnvironments,
      allowedPlatforms: target.allowedPlatforms,
    }));
    const missing: string[] = [];

    if (!process.env.AWS_REGION) missing.push('AWS_REGION');
    if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
    if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
    if (allowedRepositories.length === 0) missing.push('AWS_ECR_ALLOWED_REPOSITORIES');
    if (buildTargets.length === 0) missing.push('AWS_ECR_ALLOWED_BUILD_TARGETS');

    const response: AwsEcrReadinessResponse = {
      status: AwsReadinessStatus.NOT_CONFIGURED,
      integrationConfigured: status.configured,
      regionConfigured: Boolean(status.region),
      pushEnabled: process.env.AWS_ECR_PUSH_ENABLED === 'true',
      productionPushRequiresApproval: process.env.AWS_ECR_PRODUCTION_PUSH_REQUIRES_APPROVAL !== 'false',
      allowedRepositoriesConfigured: allowedRepositories.length > 0,
      allowedBuildTargetsConfigured: buildTargets.length > 0,
      repositories: allowedRepositories.map((repositoryName) => ({
        repositoryName,
        repositoryUri: null,
        exists: null,
        scanOnPush: null,
        encryptionType: null,
        lifecyclePolicyConfigured: null,
      })),
      buildTargets,
      missing,
      checkedAt,
    };

    if (!status.configured || allowedRepositories.length === 0 || buildTargets.length === 0) {
      response.status = missing.length > 0 ? AwsReadinessStatus.NOT_CONFIGURED : AwsReadinessStatus.PARTIAL;
      return response;
    }

    const clients = createAwsClients();
    if (!clients) return response;

    try {
      const repositories = await this._loadEcrRepositories(clients);
      response.repositories = await Promise.all(
        allowedRepositories.map(async (repositoryName) => {
          const repository = repositories.find((item) => item.repositoryName === repositoryName);
          const lifecyclePolicyConfigured = repository
            ? await this._hasEcrLifecyclePolicy(clients, repositoryName)
            : false;
          return {
            repositoryName,
            repositoryUri: repository?.repositoryUri ?? null,
            exists: Boolean(repository),
            scanOnPush: repository?.scanOnPush ?? null,
            encryptionType: repository?.encryptionType ?? null,
            lifecyclePolicyConfigured,
          };
        }),
      );
      response.status = response.repositories.every((item) => item.exists) ? AwsReadinessStatus.READY : AwsReadinessStatus.PARTIAL;
      return response;
    } catch {
      return {
        ...response,
        status: AwsReadinessStatus.ERROR,
      };
    }
  }

  async listEcrImages(organizationId: string): Promise<AwsListResponse<AwsEcrImageMetadata>> {
    return this._listResponse(async () => {
      const operations = await prisma.operation.findMany({
        where: {
          organizationId,
          provider: OperationProvider.AWS,
          operationType: { in: [OperationType.AWS_ECR_IMAGE_BUILD, OperationType.AWS_ECR_IMAGE_PUSH] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return operations.map((operation) => {
        const input = this._record(operation.input);
        const result = this._record(operation.result);
        return {
          operationId: operation.id,
          targetSlug: this._string(input.targetSlug) ?? 'unknown',
          repositoryName: this._string(input.repositoryName) ?? 'unknown',
          repositoryUri: this._string(input.repositoryUri),
          imageTag: this._string(input.imageTag) ?? 'unknown',
          imageUri: this._string(input.imageUri) ?? this._string(result.imageUri),
          imageDigest: this._string(result.imageDigest),
          environmentSlug: this._string(input.environmentSlug) ?? 'unknown',
          status: operation.status,
          action: operation.operationType === OperationType.AWS_ECR_IMAGE_PUSH ? 'push' : 'build',
          requestedAt: operation.createdAt.toISOString(),
          completedAt: operation.updatedAt.toISOString(),
        };
      });
    });
  }

  async buildEcrImage(
    organizationId: string,
    userId: string,
    input: AwsEcrImageBuildRequest,
  ): Promise<AwsDeploymentOperationResponse> {
    const target = this._requireEcrBuildTarget(input.targetSlug);
    if (!target.allowedEnvironments.includes(input.environmentSlug) || !isSafeEcrEnvironmentSlug(input.environmentSlug)) {
      throw new BadRequestError('Environment is not allowlisted for this ECR build target.');
    }
    if (input.platform && !(target.allowedPlatforms ?? []).includes(input.platform)) {
      throw new BadRequestError('Platform is not allowlisted for this ECR build target.');
    }

    const repository = await this._requireAllowedEcrRepository(target.defaultRepository);
    const imageTag = createEcrImageTag({ environmentSlug: input.environmentSlug });
    const imageUri = repository.repositoryUri ? `${repository.repositoryUri}:${imageTag}` : `${target.defaultRepository}:${imageTag}`;

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_ECR_IMAGE_BUILD,
        confirmationToken: 'BUILD',
        idempotencyKey: `aws-ecr-build-${target.targetSlug}-${input.environmentSlug}-${imageTag}`,
        input: {
          action: 'build',
          targetSlug: target.targetSlug,
          displayName: target.displayName,
          contextPath: target.contextPath,
          dockerfilePath: target.dockerfilePath,
          repositoryName: target.defaultRepository,
          repositoryUri: repository.repositoryUri,
          imageTag,
          imageUri,
          environmentSlug: input.environmentSlug,
          platform: input.platform ?? null,
          commandSummary: `docker build ${target.targetSlug}`,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
      },
      {},
    );

    return { operationId: operation.id, status: operation.status, provider: operation.provider, type: operation.operationType };
  }

  async pushEcrImage(
    organizationId: string,
    userId: string,
    input: AwsEcrImagePushRequest,
  ): Promise<AwsDeploymentOperationResponse> {
    const target = this._requireEcrBuildTarget(input.targetSlug);
    if (!target.allowedEnvironments.includes(input.environmentSlug) || !isSafeEcrEnvironmentSlug(input.environmentSlug)) {
      throw new BadRequestError('Environment is not allowlisted for this ECR build target.');
    }
    if (!isAllowedAwsEcrRepository(input.repositoryName) || input.repositoryName !== target.defaultRepository) {
      throw new BadRequestError('ECR repository is not allowlisted for this build target.');
    }
    if (!isSafeEcrImageTag(input.imageTag) || !input.imageTag.startsWith(`${input.environmentSlug}-`)) {
      throw new BadRequestError('Image tag is not a safe AutoOps-generated ECR tag.');
    }
    if (process.env.AWS_ECR_PUSH_ENABLED !== 'true') {
      throw new BadRequestError('AWS ECR push is disabled in this environment.');
    }

    const buildOperation = await prisma.operation.findFirst({
      where: {
        organizationId,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_ECR_IMAGE_BUILD,
        status: OperationStatus.SUCCEEDED,
        AND: [
          { input: { path: ['targetSlug'], equals: target.targetSlug } },
          { input: { path: ['repositoryName'], equals: input.repositoryName } },
          { input: { path: ['environmentSlug'], equals: input.environmentSlug } },
          { input: { path: ['imageTag'], equals: input.imageTag } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!buildOperation) {
      throw new BadRequestError('A successful tenant-scoped ECR build is required before push.');
    }

    const repository = await this._requireAllowedEcrRepository(input.repositoryName);
    const imageUri = repository.repositoryUri ? `${repository.repositoryUri}:${input.imageTag}` : `${input.repositoryName}:${input.imageTag}`;
    const productionPush = isProductionEnvironment(input.environmentSlug);

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_ECR_IMAGE_PUSH,
        confirmationToken: 'PUSH',
        idempotencyKey: `aws-ecr-push-${target.targetSlug}-${input.environmentSlug}-${input.imageTag}`,
        input: {
          action: 'push',
          targetSlug: target.targetSlug,
          displayName: target.displayName,
          repositoryName: input.repositoryName,
          repositoryUri: repository.repositoryUri,
          imageTag: input.imageTag,
          imageUri,
          environmentSlug: input.environmentSlug,
          productionPush,
          sourceBuildOperationId: buildOperation.id,
          commandSummary: `docker push ${input.repositoryName}:${input.imageTag}`,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
      },
      {},
    );

    return { operationId: operation.id, status: operation.status, provider: operation.provider, type: operation.operationType };
  }

  async planDeployment(
    organizationId: string,
    userId: string,
    targetSlug: string,
    input: AwsTerraformEcsPlanRequest,
  ): Promise<AwsDeploymentOperationResponse> {
    if (targetSlug !== input.targetSlug) {
      throw new BadRequestError('Route targetSlug must match request targetSlug.');
    }
    const state = this._remoteStateConfig();
    if (!state.bucket || !state.lockTable || !state.region) {
      throw new BadRequestError('AWS Terraform remote state is not fully configured.');
    }
    const toolStatus = await detectTerraformTool();
    if (toolStatus.status !== 'CONNECTED') {
      throw new Error(toolStatus.message);
    }

    const workspace = await getTerraformWorkspaceBySlug(targetSlug);
    if (!workspace) throw new Error(`Deployment target ${targetSlug} not found.`);

    const targets = await this.listDeploymentTargets();
    if (!targets.items.some(t => t.slug === targetSlug)) {
      throw new Error(`Deployment target ${targetSlug} is not an allowed AWS deployment workspace.`);
    }

    const imageOperation = await this._requirePushedEcrImageOperation(
      organizationId,
      input.imageOperationId,
      targetSlug,
      input.environmentSlug,
    );
    const imageInput = this._record(imageOperation.input);
    const imageResult = this._record(imageOperation.result);
    const imageUri = this._string(imageResult.imageUri) ?? this._string(imageInput.imageUri);
    if (!imageUri) {
      throw new BadRequestError('Selected ECR image metadata does not include a safe image URI.');
    }
    const imageDigest = this._string(imageResult.imageDigest);

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_TERRAFORM_ECS_PLAN,
        confirmationToken: 'PLAN',
        idempotencyKey: `aws-ecs-plan-${workspace.slug}-${input.environmentSlug}-${input.imageOperationId}-${Date.now()}`,
        input: {
          tool: toolStatus.tool,
          action: 'ecs-plan',
          targetSlug: workspace.slug,
          workspaceSlug: workspace.slug,
          displayName: workspace.displayName,
          relativePath: workspace.relativePath,
          environmentSlug: input.environmentSlug,
          imageOperationId: imageOperation.id,
          imageUri,
          imageDigest,
          remoteStateConfigured: true,
          applyEligible: false,
          commandSummary: `${toolStatus.tool} plan (AWS ECS, remote state)`,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
      },
      {}
    );

    return {
      operationId: operation.id,
      status: operation.status,
      provider: operation.provider,
      type: operation.operationType,
    };
  }

  async applyDeployment(
    organizationId: string,
    userId: string,
    targetSlug: string,
    environmentSlug?: string,
  ): Promise<AwsDeploymentOperationResponse> {
    if (process.env.AWS_DEPLOYMENT_APPLY_ENABLED !== 'true') {
      throw new BadRequestError('AWS deployment apply is disabled in this environment.');
    }

    const state = this._remoteStateConfig();
    if (!state.bucket || !state.lockTable || !state.region) {
      throw new BadRequestError('AWS Terraform remote state is not fully configured.');
    }

    const toolStatus = await detectTerraformTool();
    if (toolStatus.status !== 'CONNECTED') {
      throw new BadRequestError(toolStatus.message);
    }

    const workspace = await getTerraformWorkspaceBySlug(targetSlug);
    if (!workspace) throw new BadRequestError(`Deployment target ${targetSlug} not found.`);

    const targets = await this.listDeploymentTargets();
    if (!targets.items.some(t => t.slug === targetSlug)) {
      throw new BadRequestError(`Deployment target ${targetSlug} is not an allowed AWS deployment workspace.`);
    }

    // Find the latest successful plan for this organization, target slug, and environment
    const latestPlan = await prisma.operation.findFirst({
      where: {
        organizationId,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_TERRAFORM_ECS_PLAN,
        status: OperationStatus.SUCCEEDED,
        AND: [
          { input: { path: ['targetSlug'], equals: targetSlug } },
          ...(environmentSlug ? [{ input: { path: ['environmentSlug'], equals: environmentSlug } }] : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!latestPlan) {
      throw new BadRequestError('No successful tenant-scoped ECS plan is available for this target/environment.');
    }

    const latestPlanInput = this._record(latestPlan.input);
    const latestPlanResult = this._record(latestPlan.result);

    const planAgeSeconds = Math.max(0, Math.floor((Date.now() - latestPlan.updatedAt.getTime()) / 1000));
    if (planAgeSeconds > 24 * 60 * 60) {
      throw new BadRequestError('The latest successful ECS plan is stale (older than 24 hours).');
    }

    const addCount = typeof latestPlanResult.addCount === 'number' ? latestPlanResult.addCount : 0;
    const changeCount = typeof latestPlanResult.changeCount === 'number' ? latestPlanResult.changeCount : 0;
    const destroyCount = typeof latestPlanResult.destroyCount === 'number' ? latestPlanResult.destroyCount : 0;
    const riskLevel = typeof latestPlanResult.riskLevel === 'string' ? latestPlanResult.riskLevel : 'LOW';
    const applyEligible = latestPlanResult.applyEligible === true;

    if (destroyCount > 0) {
      throw new BadRequestError('Terraform plan includes destroy actions. Apply is blocked.');
    }
    if (!applyEligible) {
      throw new BadRequestError('The latest plan is not eligible for apply.');
    }
    if (riskLevel === 'HIGH') {
      throw new BadRequestError('Apply is blocked due to HIGH risk plan.');
    }

    const planEnvironmentSlug = this._string(latestPlanInput.environmentSlug);
    const imageUri = this._string(latestPlanInput.imageUri);
    const imageDigest = this._string(latestPlanInput.imageDigest);

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_TERRAFORM_ECS_APPLY,
        confirmationToken: 'APPLY',
        idempotencyKey: `aws-ecs-apply-${workspace.slug}-${latestPlan.id}-${Date.now()}`,
        input: {
          tool: toolStatus.tool,
          action: 'ecs-apply',
          targetSlug: workspace.slug,
          workspaceSlug: workspace.slug,
          displayName: workspace.displayName,
          relativePath: workspace.relativePath,
          environmentSlug: planEnvironmentSlug,
          imageUri,
          imageDigest,
          sourcePlanOperationId: latestPlan.id,
          addCount,
          changeCount,
          destroyCount: 0,
          applyEligible: true,
          commandSummary: `${toolStatus.tool} apply (AWS ECS)`,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
      },
      {}
    );

    return {
      operationId: operation.id,
      status: operation.status,
      provider: operation.provider,
      type: operation.operationType,
    };
  }

  async listEc2Instances(): Promise<AwsListResponse<AwsEc2Instance>> {
    return this._listResponse((clients) => this._loadEc2Instances(clients));
  }

  async listEcsClusters(): Promise<AwsListResponse<AwsEcsCluster>> {
    return this._listResponse((clients) => this._loadEcsClusters(clients));
  }

  async listEcsServices(): Promise<AwsListResponse<AwsEcsService>> {
    return this._listResponse((clients) => this._loadEcsServices(clients));
  }

  async listEcrRepositories(): Promise<AwsListResponse<AwsEcrRepository>> {
    return this._listResponse(async (clients) => {
      const allowed = new Set(listAllowedAwsEcrRepositories());
      return (await this._loadEcrRepositories(clients)).filter((repository) => allowed.has(repository.repositoryName));
    });
  }

  async listCloudWatchAlarms(): Promise<AwsListResponse<AwsCloudWatchAlarm>> {
    return this._listResponse((clients) => this._loadCloudWatchAlarms(clients));
  }

  private _remoteStateConfig(): { bucket: string | null; lockTable: string | null; region: string | null } {
    return {
      bucket: this._string(process.env.AWS_TERRAFORM_STATE_BUCKET),
      lockTable: this._string(process.env.AWS_TERRAFORM_STATE_DYNAMODB_TABLE),
      region: this._string(process.env.AWS_TERRAFORM_STATE_REGION),
    };
  }

  private async _latestPushedEcrImage(
    organizationId: string,
    targetSlug: string,
    environmentSlug?: string,
  ) {
    return prisma.operation.findFirst({
      where: {
        organizationId,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_ECR_IMAGE_PUSH,
        status: OperationStatus.SUCCEEDED,
        AND: [
          { input: { path: ['targetSlug'], equals: targetSlug } },
          ...(environmentSlug ? [{ input: { path: ['environmentSlug'], equals: environmentSlug } }] : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async _requirePushedEcrImageOperation(
    organizationId: string,
    operationId: string,
    targetSlug: string,
    environmentSlug: string,
  ) {
    const operation = await prisma.operation.findFirst({
      where: {
        id: operationId,
        organizationId,
        provider: OperationProvider.AWS,
        operationType: OperationType.AWS_ECR_IMAGE_PUSH,
        status: OperationStatus.SUCCEEDED,
        AND: [
          { input: { path: ['targetSlug'], equals: targetSlug } },
          { input: { path: ['environmentSlug'], equals: environmentSlug } },
        ],
      },
    });
    if (!operation) {
      throw new BadRequestError('A successful tenant-scoped ECR push operation is required before ECS plan.');
    }
    return operation;
  }

  private async _loadEc2Instances(clients = createAwsClients()): Promise<AwsEc2Instance[]> {
    if (!clients) return [];
    const response = await clients.ec2.send(new DescribeInstancesCommand({}));
    return (response.Reservations ?? []).flatMap((reservation) =>
      (reservation.Instances ?? []).map((instance) => {
        const tags = Object.fromEntries(
          (instance.Tags ?? [])
            .filter((tag) => tag.Key)
            .map((tag) => [tag.Key as string, tag.Value ?? '']),
        );
        return {
          instanceId: instance.InstanceId ?? 'unknown',
          name: tags.Name ?? null,
          state: instance.State?.Name ?? null,
          instanceType: instance.InstanceType ?? null,
          privateIp: instance.PrivateIpAddress ?? null,
          publicIp: instance.PublicIpAddress ?? null,
          availabilityZone: instance.Placement?.AvailabilityZone ?? null,
          launchTime: instance.LaunchTime?.toISOString() ?? null,
          tags,
          vpcId: instance.VpcId ?? null,
          subnetId: instance.SubnetId ?? null,
        };
      }),
    );
  }

  private async _loadEcsClusters(clients = createAwsClients()): Promise<AwsEcsCluster[]> {
    if (!clients) return [];
    const list = await clients.ecs.send(new ListClustersCommand({}));
    const clusterArns = list.clusterArns ?? [];
    if (clusterArns.length === 0) return [];

    const describe = await clients.ecs.send(new DescribeClustersCommand({ clusters: clusterArns }));
    return (describe.clusters ?? []).map((cluster) => ({
      clusterArn: cluster.clusterArn ?? 'unknown',
      clusterName: cluster.clusterName ?? 'unknown',
      status: cluster.status ?? null,
      runningTasksCount: cluster.runningTasksCount ?? 0,
      pendingTasksCount: cluster.pendingTasksCount ?? 0,
      activeServicesCount: cluster.activeServicesCount ?? 0,
      registeredContainerInstancesCount: cluster.registeredContainerInstancesCount ?? 0,
    }));
  }

  private async _loadEcsServices(clients = createAwsClients()): Promise<AwsEcsService[]> {
    if (!clients) return [];
    const clusters = await this._loadEcsClusters(clients);
    const services = await Promise.all(
      clusters.map(async (cluster) => {
        const list = await clients.ecs.send(new ListServicesCommand({ cluster: cluster.clusterArn }));
        const serviceArns = list.serviceArns ?? [];
        if (serviceArns.length === 0) return [];
        const describe = await clients.ecs.send(
          new DescribeServicesCommand({ cluster: cluster.clusterArn, services: serviceArns }),
        );
        return (describe.services ?? []).map((service) => ({
          clusterName: cluster.clusterName,
          serviceName: service.serviceName ?? 'unknown',
          status: service.status ?? null,
          desiredCount: service.desiredCount ?? 0,
          runningCount: service.runningCount ?? 0,
          pendingCount: service.pendingCount ?? 0,
          taskDefinition: service.taskDefinition ?? null,
          deployments: (service.deployments ?? []) as Array<Record<string, unknown>>,
          loadBalancers: (service.loadBalancers ?? []) as Array<Record<string, unknown>>,
        }));
      }),
    );
    return services.flat();
  }

  private async _loadEcrRepositories(clients = createAwsClients()): Promise<AwsEcrRepository[]> {
    if (!clients) return [];
    const response = await clients.ecr.send(new DescribeRepositoriesCommand({}));
    return (response.repositories ?? []).map((repository) => ({
      repositoryName: repository.repositoryName ?? 'unknown',
      repositoryUri: repository.repositoryUri ?? null,
      createdAt: repository.createdAt?.toISOString() ?? null,
      imageTagMutability: repository.imageTagMutability ?? null,
      scanOnPush: repository.imageScanningConfiguration?.scanOnPush ?? null,
      encryptionType: repository.encryptionConfiguration?.encryptionType ?? null,
    }));
  }

  private async _loadCloudWatchAlarms(clients = createAwsClients()): Promise<AwsCloudWatchAlarm[]> {
    if (!clients) return [];
    const response = await clients.cloudWatch.send(new DescribeAlarmsCommand({}));
    return (response.MetricAlarms ?? []).map((alarm) => ({
      alarmName: alarm.AlarmName ?? 'unknown',
      stateValue: alarm.StateValue ?? null,
      stateReason: alarm.StateReason ?? null,
      metricName: alarm.MetricName ?? null,
      namespace: alarm.Namespace ?? null,
      updatedAt: alarm.StateUpdatedTimestamp?.toISOString() ?? null,
    }));
  }

  private _requireEcrBuildTarget(targetSlug: string) {
    const target = getAwsEcrBuildTargetBySlug(targetSlug);
    if (!target) {
      throw new BadRequestError('ECR build target is not allowlisted.');
    }
    return target;
  }

  private async _requireAllowedEcrRepository(repositoryName: string): Promise<AwsEcrRepository> {
    if (!isAllowedAwsEcrRepository(repositoryName)) {
      throw new BadRequestError('ECR repository is not allowlisted.');
    }
    const repositories = await this.listEcrRepositories();
    const repository = repositories.items.find((item) => item.repositoryName === repositoryName);
    if (!repository) {
      throw new BadRequestError('Allowlisted ECR repository was not found or AWS is not configured.');
    }
    return repository;
  }

  private async _hasEcrLifecyclePolicy(
    clients: NonNullable<ReturnType<typeof createAwsClients>>,
    repositoryName: string,
  ): Promise<boolean> {
    try {
      await clients.ecr.send(new GetLifecyclePolicyCommand({ repositoryName }));
      return true;
    } catch {
      return false;
    }
  }

  private _record(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private _string(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private async _safe<T>(
    service: string,
    failures: AwsPartialFailure[],
    loader: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await loader();
    } catch (error) {
      failures.push({ service, message: safeAwsMessage(error) });
      return undefined;
    }
  }

  private async _listResponse<T>(
    loader: (clients: NonNullable<ReturnType<typeof createAwsClients>>) => Promise<T[]>,
  ): Promise<AwsListResponse<T>> {
    const status = await this.getStatus();
    const mappedStatus = mapAwsToProviderStatus(status.status);
    if (mappedStatus !== ProviderConnectionStatus.CONNECTED) {
      return {
        status: mappedStatus,
        configured: status.configured,
        region: status.region,
        message: status.message,
        checkedAt: status.checkedAt,
        items: [],
      };
    }

    const clients = createAwsClients();
    if (!clients) {
      return {
        status: ProviderConnectionStatus.NOT_CONFIGURED,
        configured: false,
        checkedAt: new Date().toISOString(),
        message: 'AWS credentials are not configured.',
        items: [],
      };
    }

    return {
      status: mappedStatus,
      configured: status.configured,
      region: status.region,
      message: status.message,
      checkedAt: new Date().toISOString(),
      items: await loader(clients),
    };
  }

  async listReleases(
    organizationId: string,
    targetSlug?: string,
    environmentSlug?: string,
  ): Promise<AwsReleaseHistoryResponse> {
    const checkedAt = new Date().toISOString();
    if (!await isProviderInventoryAccessEnabledForOrg(organizationId)) {
      return { items: [], checkedAt };
    }

    const releases = await prisma.awsRelease.findMany({
      where: {
        organizationId,
        ...(targetSlug ? { targetSlug } : {}),
        ...(environmentSlug ? { environmentSlug } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: releases.map(r => this._toReleaseSummary(r)),
      checkedAt,
    };
  }

  async listReleaseHistory(organizationId: string): Promise<AwsReleaseHistoryResponse> {
    const checkedAt = new Date().toISOString();
    if (!await isProviderInventoryAccessEnabledForOrg(organizationId)) {
      return { items: [], checkedAt };
    }

    const releases = await prisma.awsRelease.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: releases.map(r => this._toReleaseSummary(r)),
      checkedAt,
    };
  }

  async getRelease(organizationId: string, releaseId: string): Promise<AwsReleaseSummary> {
    const release = await prisma.awsRelease.findFirst({
      where: { id: releaseId, organizationId },
    });
    if (!release) throw new BadRequestError('Release not found');
    return this._toReleaseSummary(release);
  }

  async getReleaseReadiness(
    organizationId: string,
    targetSlug?: string,
    environmentSlug?: string,
  ): Promise<AwsReleaseReadinessResponse> {
    const checkedAt = new Date().toISOString();
    const config = getAwsConfiguration();
    const missing: string[] = [];
    const blockedReasons: string[] = [];

    if (!config.configured) {
      missing.push('AWS credentials are not configured.');
    }

    const workspaceRes = targetSlug ? await getTerraformWorkspaceBySlug(targetSlug) : null;
    if (targetSlug && !workspaceRes) {
      blockedReasons.push(`Workspace ${targetSlug} not found.`);
    }

    const allowedWorkspaces = process.env.AWS_ALLOWED_DEPLOYMENT_WORKSPACES
      ? process.env.AWS_ALLOWED_DEPLOYMENT_WORKSPACES.split(',').map(s => s.trim())
      : [];
    if (targetSlug && !allowedWorkspaces.includes(targetSlug)) {
      blockedReasons.push(`Workspace ${targetSlug} is not allowlisted.`);
    }

    // Check active release in the environment
    const activeRelease = targetSlug && environmentSlug ? await prisma.awsRelease.findFirst({
      where: {
        organizationId,
        targetSlug,
        environmentSlug,
        status: 'ACTIVE',
      },
    }) : null;

    const rollbackEligible = targetSlug && environmentSlug ? (await prisma.awsRelease.count({
      where: {
        organizationId,
        targetSlug,
        environmentSlug,
      },
    })) > 1 : false;

    const toolStatus = await detectTerraformTool();

    const hasAccess = await isProviderInventoryAccessEnabledForOrg(organizationId);
    if (!hasAccess) {
      blockedReasons.push('Provider inventory access is not enabled for this organization.');
    }

    const isReady =
      config.configured &&
      (!targetSlug || !!workspaceRes) &&
      (!targetSlug || allowedWorkspaces.includes(targetSlug)) &&
      toolStatus.status === 'CONNECTED' &&
      hasAccess;

    return {
      status: isReady ? 'READY' : 'BLOCKED',
      awsConfigured: config.configured,
      regionConfigured: !!config.region,
      allowedWorkspaceConfigured: allowedWorkspaces.length > 0,
      workspaceExists: !!workspaceRes,
      terraformToolAvailable: toolStatus.status === 'CONNECTED',
      activeReleaseAvailable: !!activeRelease,
      rollbackEligible,
      targetSlug: targetSlug || null,
      environmentSlug: environmentSlug || null,
      missing,
      blockedReasons,
      checkedAt,
    };
  }

  async promoteRelease(
    organizationId: string,
    userId: string,
    releaseId: string,
    body: AwsReleasePromoteRequest,
  ): Promise<AwsReleasePromoteResponse> {
    // 1. Find source release
    const sourceRelease = await prisma.awsRelease.findFirst({
      where: { id: releaseId, organizationId },
    });
    if (!sourceRelease) throw new BadRequestError('Source release not found');

    // 2. Validate target workspace is allowed
    const targets = await this.listDeploymentTargets();
    if (!targets.items.some(t => t.slug === body.targetSlug)) {
      throw new BadRequestError(`Target workspace ${body.targetSlug} is not allowed.`);
    }

    // 3. Create plan operation
    const toolStatus = await detectTerraformTool();

    // Evaluate trigger eligibility
    const triggerDecision = await operationAuthorizationService.canTriggerOperation({
      organizationId,
      userId,
      provider: OperationProvider.AWS,
      operationType: OperationType.AWS_ECS_RELEASE_PROMOTE,
    });
    if (!triggerDecision.allowed) {
      throw new UnauthorizedError(triggerDecision.reason ?? 'You do not have permission to trigger promotion.');
    }

    // Create operations record directly via operationService
    const operation = await operationService.createQueuedOperation({
      organizationId,
      userId,
      provider: OperationProvider.AWS,
      operationType: OperationType.AWS_ECS_RELEASE_PROMOTE,
      confirmationToken: 'PROMOTE',
      idempotencyKey: `aws-ecs-promote-${body.targetSlug}-${releaseId}-${Date.now()}`,
      input: {
        tool: toolStatus.tool,
        action: 'ecs-promote',
        sourceReleaseId: sourceRelease.id,
        targetSlug: body.targetSlug,
        environmentSlug: body.targetEnvironmentSlug,
        imageUri: sourceRelease.imageUri,
        imageDigest: sourceRelease.imageDigest,
        commandSummary: `AWS ECS promote from ${sourceRelease.environmentSlug} to ${body.targetEnvironmentSlug}`,
        requestedAt: new Date().toISOString(),
      },
    });

    return {
      operationId: operation.id,
      status: operation.status,
      provider: operation.provider,
      type: operation.operationType,
    };
  }

  async rollbackRelease(
    organizationId: string,
    userId: string,
    releaseId: string,
    body: AwsReleaseRollbackRequest,
  ): Promise<AwsReleaseRollbackResponse> {
    if (body.confirmationToken !== 'ROLLBACK') {
      throw new BadRequestError('Confirmation token must be "ROLLBACK" to trigger a rollback');
    }

    // 1. Find target release to rollback to
    const targetRelease = await prisma.awsRelease.findFirst({
      where: { id: releaseId, organizationId },
    });
    if (!targetRelease) throw new BadRequestError('Target rollback release not found');

    // 2. Find currently ACTIVE release to roll back from
    const activeRelease = await prisma.awsRelease.findFirst({
      where: {
        organizationId,
        targetSlug: targetRelease.targetSlug,
        environmentSlug: targetRelease.environmentSlug,
        status: 'ACTIVE',
      },
    });
    if (!activeRelease) throw new BadRequestError('No active release found to rollback from.');
    if (activeRelease.id === targetRelease.id) {
      throw new BadRequestError('The selected release is already the currently active release.');
    }

    const toolStatus = await detectTerraformTool();

    // Evaluate trigger eligibility
    const triggerDecision = await operationAuthorizationService.canTriggerOperation({
      organizationId,
      userId,
      provider: OperationProvider.AWS,
      operationType: OperationType.AWS_ECS_RELEASE_ROLLBACK,
    });
    if (!triggerDecision.allowed) {
      throw new UnauthorizedError(triggerDecision.reason ?? 'You do not have permission to trigger rollback.');
    }

    const operation = await operationService.createQueuedOperation({
      organizationId,
      userId,
      provider: OperationProvider.AWS,
      operationType: OperationType.AWS_ECS_RELEASE_ROLLBACK,
      confirmationToken: 'ROLLBACK',
      idempotencyKey: `aws-ecs-rollback-${targetRelease.targetSlug}-${releaseId}-${Date.now()}`,
      input: {
        tool: toolStatus.tool,
        action: 'ecs-rollback',
        targetSlug: targetRelease.targetSlug,
        environmentSlug: targetRelease.environmentSlug,
        rollbackToReleaseId: targetRelease.id,
        rolledBackFromReleaseId: activeRelease.id,
        imageUri: targetRelease.imageUri,
        imageDigest: targetRelease.imageDigest,
        commandSummary: `AWS ECS rollback to version ${targetRelease.releaseVersion}`,
        requestedAt: new Date().toISOString(),
      },
    });

    return {
      operationId: operation.id,
      status: operation.status,
      provider: operation.provider,
      type: operation.operationType,
    };
  }

  private _toReleaseSummary(r: any): AwsReleaseSummary {
    return {
      id: r.id,
      organizationId: r.organizationId,
      targetSlug: r.targetSlug,
      environmentSlug: r.environmentSlug,
      sourceOperationId: r.sourceOperationId,
      planOperationId: r.planOperationId,
      applyOperationId: r.applyOperationId,
      imageUri: r.imageUri,
      imageDigest: r.imageDigest,
      taskDefinitionArn: r.taskDefinitionArn,
      ecsClusterName: r.ecsClusterName,
      ecsServiceName: r.ecsServiceName,
      releaseVersion: r.releaseVersion,
      status: r.status as AwsReleaseStatus,
      promotedFromReleaseId: r.promotedFromReleaseId,
      rolledBackFromReleaseId: r.rolledBackFromReleaseId,
      createdByUserId: r.createdByUserId,
      approvedByUserId: r.approvedByUserId,
      createdAt: r.createdAt.toISOString(),
      promotedAt: r.promotedAt ? r.promotedAt.toISOString() : null,
      rolledBackAt: r.rolledBackAt ? r.rolledBackAt.toISOString() : null,
    };
  }
}

export const awsService = new AwsService();

export function mapAwsToProviderStatus(status: AwsIntegrationStatus): ProviderConnectionStatus {
  if (status === AwsIntegrationStatus.CONNECTED) return ProviderConnectionStatus.CONNECTED;
  if (status === AwsIntegrationStatus.AUTH_FAILED) return ProviderConnectionStatus.AUTH_FAILED;
  if (status === AwsIntegrationStatus.NOT_CONFIGURED) return ProviderConnectionStatus.NOT_CONFIGURED;
  return ProviderConnectionStatus.UNKNOWN_ERROR;
}
