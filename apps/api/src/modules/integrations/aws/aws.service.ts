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
} from '@autoops/types';
import { ProviderConnectionStatus, AwsIntegrationStatus, AwsReadinessStatus, AwsDiagnosticStatus, AwsDeploymentTargetType } from '@autoops/types';
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
import { OperationProvider, OperationStatus, OperationType, type AwsDeploymentOperationResponse, type AwsDeploymentSummary } from '@autoops/types';
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
import { BadRequestError } from '@autoops/utils';

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
        const op = operations.find(o => (o.input as Record<string, unknown>)?.workspaceSlug === slug);
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

  async planDeployment(organizationId: string, userId: string, targetSlug: string): Promise<AwsDeploymentOperationResponse> {
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

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        provider: OperationProvider.AWS,
        operationType: OperationType.TERRAFORM_PLAN,
        confirmationToken: 'PLAN',
        idempotencyKey: `aws-deploy-plan-${workspace.slug}-${Date.now()}`,
        input: {
          tool: toolStatus.tool,
          action: 'plan',
          workspaceSlug: workspace.slug,
          displayName: workspace.displayName,
          relativePath: workspace.relativePath,
          commandSummary: `${toolStatus.tool} plan (AWS)`,
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

  async applyDeployment(organizationId: string, userId: string, targetSlug: string): Promise<AwsDeploymentOperationResponse> {
    if (process.env.AWS_DEPLOYMENT_APPLY_ENABLED !== 'true') {
      throw new Error('AWS deployment apply is disabled in this environment.');
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

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        provider: OperationProvider.AWS,
        operationType: OperationType.TERRAFORM_APPLY,
        confirmationToken: 'APPLY',
        idempotencyKey: `aws-deploy-apply-${workspace.slug}-${Date.now()}`,
        input: {
          tool: toolStatus.tool,
          action: 'apply',
          workspaceSlug: workspace.slug,
          displayName: workspace.displayName,
          relativePath: workspace.relativePath,
          commandSummary: `${toolStatus.tool} apply (AWS)`,
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
}

export const awsService = new AwsService();

export function mapAwsToProviderStatus(status: AwsIntegrationStatus): ProviderConnectionStatus {
  if (status === AwsIntegrationStatus.CONNECTED) return ProviderConnectionStatus.CONNECTED;
  if (status === AwsIntegrationStatus.AUTH_FAILED) return ProviderConnectionStatus.AUTH_FAILED;
  if (status === AwsIntegrationStatus.NOT_CONFIGURED) return ProviderConnectionStatus.NOT_CONFIGURED;
  return ProviderConnectionStatus.UNKNOWN_ERROR;
}
