import type {
  AwsCloudWatchAlarm,
  AwsEc2Instance,
  AwsEcrRepository,
  AwsEcsCluster,
  AwsEcsService,
  AwsListResponse,
  AwsPartialFailure,
  AwsStatus,
  AwsSummary,
} from '@autoops/types';
import { ProviderConnectionStatus } from '@autoops/types';
import {
  DescribeAlarmsCommand,
  DescribeClustersCommand,
  DescribeInstancesCommand,
  DescribeRepositoriesCommand,
  DescribeServicesCommand,
  GetCallerIdentityCommand,
  ListClustersCommand,
  ListFunctionsCommand,
  ListServicesCommand,
  classifyAwsError,
  createAwsClients,
  getAwsConfiguration,
  safeAwsMessage,
} from './aws.client.js';
import { prisma, type Prisma } from '@autoops/database';
import { OperationProvider, OperationType, type AwsDeploymentTarget, type AwsDeploymentOperationResponse, type AwsDeploymentSummary } from '@autoops/types';
import { listTerraformWorkspaces, getTerraformWorkspaceBySlug, detectTerraformTool } from '@autoops/utils';
import { operationService } from '../../operations/operation.service.js';

export class AwsService {
  async getStatus(): Promise<AwsStatus> {
    const checkedAt = new Date().toISOString();
    const config = getAwsConfiguration();
    if (!config.configured) {
      return {
        status: ProviderConnectionStatus.NOT_CONFIGURED,
        configured: false,
        region: config.region,
        message: config.message,
        checkedAt,
      };
    }

    const clients = createAwsClients();
    if (!clients) {
      return {
        status: ProviderConnectionStatus.NOT_CONFIGURED,
        configured: false,
        region: config.region,
        message: config.message,
        checkedAt,
      };
    }

    try {
      const identity = await clients.sts.send(new GetCallerIdentityCommand({}));
      return {
        status: ProviderConnectionStatus.CONNECTED,
        configured: true,
        accountId: identity.Account,
        callerArn: identity.Arn,
        region: clients.region,
        message: 'AWS STS identity verified.',
        checkedAt,
      };
    } catch (error) {
      return {
        status: classifyAwsError(error),
        configured: true,
        region: clients.region,
        message: safeAwsMessage(error),
        checkedAt,
      };
    }
  }

  async getSummary(): Promise<AwsSummary> {
    const status = await this.getStatus();
    const partialFailures: AwsPartialFailure[] = [];

    if (status.status !== ProviderConnectionStatus.CONNECTED) {
      return {
        status: status.status,
        accountId: status.accountId,
        region: status.region,
        checkedAt: status.checkedAt,
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
      status: status.status,
      accountId: status.accountId,
      region: status.region,
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
          displayName: w.displayName,
          absolutePath: w.absolutePath,
          relativePath: w.relativePath,
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
    return this._listResponse((clients) => this._loadEcrRepositories(clients));
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
    if (status.status !== ProviderConnectionStatus.CONNECTED) {
      return {
        status: status.status,
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
      status: status.status,
      configured: status.configured,
      region: status.region,
      message: status.message,
      checkedAt: new Date().toISOString(),
      items: await loader(clients),
    };
  }
}

export const awsService = new AwsService();
