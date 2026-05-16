import { prisma } from '@autoops/database';
import {
  DeploymentStatus,
  IntegrationCategory,
  IntegrationStatus,
  KubernetesConnectionStatus,
  OperationActivitySource,
  OperationProvider,
  OperationStatus,
  OperationType,
  ProviderConnectionStatus,
  RuntimeStatus,
  type Deployment,
  type OperationActivityItem,
  type OperationActivityResponse,
  type OpsActivityQuery,
  type OpsIntegrationReadiness,
  type OpsSummary,
} from '@autoops/types';
import { redis } from '../../lib/redis.js';
import { deploymentsQueue } from '../deployments/deployment.queue.js';
import { awsService } from '../integrations/aws/aws.service.js';
import { jenkinsService } from '../integrations/jenkins/jenkins.service.js';
import { kubernetesService } from '../integrations/kubernetes/kubernetes.service.js';

const ACTIVE_DEPLOYMENT_STATUSES = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
  DeploymentStatus.RUNNING,
] as const;

type OperationActivityRecord = {
  id: string;
  provider: OperationProvider;
  operationType: OperationType;
  status: OperationStatus;
  input: unknown;
  result: unknown;
  error: unknown;
  createdAt: Date;
  updatedAt: Date;
  requestedBy: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

const BASE_INTEGRATIONS: OpsIntegrationReadiness[] = [
  {
    key: 'kubernetes',
    name: 'Kubernetes',
    category: IntegrationCategory.ORCHESTRATION,
    status: IntegrationStatus.NOT_CONFIGURED,
    description: 'Cluster visibility connects first. Controlled Kubernetes actions require confirmation, audit, and approval gates.',
  },
  {
    key: 'jenkins',
    name: 'Jenkins',
    category: IntegrationCategory.CI_CD,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'Pipeline visibility is not connected. AutoOps is not triggering Jenkins jobs.',
  },
  {
    key: 'ansible',
    name: 'Ansible',
    category: IntegrationCategory.CONFIGURATION,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'Playbook inventory and run history are planned as read-only surfaces first.',
  },
  {
    key: 'terraform',
    name: 'Terraform',
    category: IntegrationCategory.INFRASTRUCTURE,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'State and plan visibility are planned. No terraform commands are executed.',
  },
  {
    key: 'github-actions',
    name: 'GitHub Actions',
    category: IntegrationCategory.CI_CD,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'Workflow run visibility is not connected. No workflows are triggered by AutoOps.',
  },
  {
    key: 'docker',
    name: 'Docker',
    category: IntegrationCategory.CONTAINER,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'Container execution is not active. Current deployments use the safe simulation executor.',
  },
  {
    key: 'aws',
    name: 'AWS',
    category: IntegrationCategory.CLOUD,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'Cloud asset discovery is not connected and no provider APIs are called.',
  },
  {
    key: 'azure',
    name: 'Azure',
    category: IntegrationCategory.CLOUD,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'Cloud asset discovery is not connected and no provider APIs are called.',
  },
  {
    key: 'gcp',
    name: 'GCP',
    category: IntegrationCategory.CLOUD,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'Cloud asset discovery is not connected and no provider APIs are called.',
  },
];

export class OpsService {
  async listActivity(
    organizationId: string,
    query: OpsActivityQuery,
  ): Promise<OperationActivityResponse> {
    const provider = query.source ? this._providerForSource(query.source) : null;
    if (query.source && !provider) {
      return { items: [] };
    }

    const operations = await prisma.operation.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { operationType: query.type } : {}),
        ...(provider ? { provider } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: query.limit,
      select: {
        id: true,
        provider: true,
        operationType: true,
        status: true,
        input: true,
        result: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      items: operations.map((operation) => this._toActivityItem(operation)),
    };
  }

  async getSummary(organizationId: string): Promise<OpsSummary> {
    const [
      databaseStatus,
      redisStatus,
      projects,
      environmentCount,
      deploymentCount,
      deploymentStatusCounts,
      latestDeployments,
      queueSummary,
      kubernetesStatus,
      awsStatus,
      jenkinsStatus,
      operationStatusCounts,
    ] = await Promise.all([
      this._getDatabaseStatus(),
      this._getRedisStatus(),
      prisma.project.findMany({
        where: {
          organizationId,
          archivedAt: null,
        },
        select: {
          id: true,
        },
      }),
      prisma.environment.count({
        where: {
          archivedAt: null,
          project: {
            organizationId,
            archivedAt: null,
          },
        },
      }),
      prisma.deployment.count({
        where: {
          project: {
            organizationId,
            archivedAt: null,
          },
        },
      }),
      prisma.deployment.groupBy({
        by: ['status'],
        where: {
          project: {
            organizationId,
            archivedAt: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.deployment.findMany({
        where: {
          project: {
            organizationId,
            archivedAt: null,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 8,
      }),
      this._getDeploymentQueueSummary(),
      kubernetesService.getStatus(),
      awsService.getStatus(),
      jenkinsService.getStatus(),
      prisma.operation.groupBy({
        by: ['status'],
        where: {
          organizationId,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const statusCount = new Map(
      deploymentStatusCounts.map((item) => [item.status, item._count._all]),
    );

    return {
      runtime: {
        api: { status: RuntimeStatus.READY },
        database: { status: databaseStatus },
        redis: { status: redisStatus },
        worker: { status: RuntimeStatus.UNKNOWN },
        generatedAt: new Date().toISOString(),
      },
      resources: {
        projects: projects.length,
        environments: environmentCount,
        deployments: deploymentCount,
      },
      deployments: {
        total: deploymentCount,
        queued: statusCount.get(DeploymentStatus.QUEUED) ?? 0,
        active: ACTIVE_DEPLOYMENT_STATUSES.reduce(
          (total, status) => total + (statusCount.get(status) ?? 0),
          0,
        ),
        running: statusCount.get(DeploymentStatus.RUNNING) ?? 0,
        succeeded: statusCount.get(DeploymentStatus.SUCCEEDED) ?? 0,
        failed: statusCount.get(DeploymentStatus.FAILED) ?? 0,
        latest: latestDeployments.map((deployment) => this._toDeployment(deployment)),
      },
      queues: {
        deployments: queueSummary,
      },
      integrations: this._withProviderStatus(kubernetesStatus, awsStatus, jenkinsStatus),
      operations: {
        total: operationStatusCounts.reduce((total, item) => total + item._count._all, 0),
        pendingApproval:
          operationStatusCounts.find((item) => item.status === OperationStatus.PENDING_APPROVAL)
            ?._count._all ?? 0,
        running:
          operationStatusCounts.find((item) => item.status === OperationStatus.RUNNING)?._count
            ._all ?? 0,
        failed:
          operationStatusCounts.find((item) => item.status === OperationStatus.FAILED)?._count
            ._all ?? 0,
      },
    };
  }

  private _withProviderStatus(
    kubernetesStatus: Awaited<ReturnType<typeof kubernetesService.getStatus>>,
    awsStatus: Awaited<ReturnType<typeof awsService.getStatus>>,
    jenkinsStatus: Awaited<ReturnType<typeof jenkinsService.getStatus>>,
  ): OpsIntegrationReadiness[] {
    return BASE_INTEGRATIONS.map((integration) => {
      if (integration.key === 'jenkins') {
        return {
          ...integration,
          status:
            jenkinsStatus.status === ProviderConnectionStatus.CONNECTED
              ? IntegrationStatus.CONNECTED
              : jenkinsStatus.status === ProviderConnectionStatus.UNREACHABLE ||
                  jenkinsStatus.status === ProviderConnectionStatus.AUTH_FAILED ||
                  jenkinsStatus.status === ProviderConnectionStatus.FORBIDDEN
                ? IntegrationStatus.UNREACHABLE
                : IntegrationStatus.NOT_CONFIGURED,
          description:
            jenkinsStatus.status === ProviderConnectionStatus.CONNECTED
              ? jenkinsStatus.triggerEnabled
                ? `Jenkins ${jenkinsStatus.version ?? ''} connected as ${jenkinsStatus.username ?? 'configured user'}. Real CI/CD trigger enabled for ${jenkinsStatus.allowedJobs.length} allowlisted job(s).`
                : `Jenkins ${jenkinsStatus.version ?? ''} connected as ${jenkinsStatus.username ?? 'configured user'}. No jobs are allowlisted for triggering.`
              : jenkinsStatus.message,
          href: '/dashboard/integrations/jenkins',
          lastCheckedAt: jenkinsStatus.checkedAt,
          metrics: {
            version: jenkinsStatus.version ?? null,
            executors: jenkinsStatus.numExecutors ?? null,
            allowedJobs: jenkinsStatus.allowedJobs.length,
            triggerEnabled: jenkinsStatus.triggerEnabled,
          },
        };
      }

      if (integration.key === 'aws') {
        return {
          ...integration,
          status:
            awsStatus.status === ProviderConnectionStatus.CONNECTED
              ? IntegrationStatus.CONNECTED
              : awsStatus.status === ProviderConnectionStatus.UNREACHABLE ||
                  awsStatus.status === ProviderConnectionStatus.AUTH_FAILED
                ? IntegrationStatus.UNREACHABLE
                : IntegrationStatus.NOT_CONFIGURED,
          description:
            awsStatus.status === ProviderConnectionStatus.CONNECTED
              ? `AWS account ${awsStatus.accountId ?? 'unknown'} connected in ${awsStatus.region ?? 'unknown region'}.`
              : awsStatus.message,
          href: '/dashboard/operations',
          lastCheckedAt: awsStatus.checkedAt,
          metrics: {
            region: awsStatus.region ?? null,
            accountId: awsStatus.accountId ?? null,
          },
        };
      }

      if (integration.key !== 'kubernetes') return integration;

      return {
        ...integration,
        status:
          kubernetesStatus.status === KubernetesConnectionStatus.CONNECTED
            ? IntegrationStatus.CONNECTED
            : kubernetesStatus.status === KubernetesConnectionStatus.UNREACHABLE ||
                kubernetesStatus.status === KubernetesConnectionStatus.AUTH_FAILED
              ? IntegrationStatus.UNREACHABLE
              : IntegrationStatus.NOT_CONFIGURED,
        description:
          kubernetesStatus.status === KubernetesConnectionStatus.CONNECTED
            ? 'Kubernetes discovery is connected. Controlled restart/apply operations require audit and confirmation.'
            : kubernetesStatus.status === KubernetesConnectionStatus.UNREACHABLE
              ? 'Kubernetes configuration is present, but the API server is unreachable from AutoOps.'
              : integration.description,
        href: '/dashboard/integrations/kubernetes',
        lastCheckedAt: kubernetesStatus.checkedAt,
        metrics: {
          nodes: kubernetesStatus.nodeCount ?? 0,
          readyNodes: kubernetesStatus.readyNodeCount ?? 0,
          namespaces: kubernetesStatus.namespaceCount ?? 0,
          readOnly: true,
        },
      };
    });
  }

  private async _getDatabaseStatus(): Promise<RuntimeStatus> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return RuntimeStatus.READY;
    } catch {
      return RuntimeStatus.UNKNOWN;
    }
  }

  private async _getRedisStatus(): Promise<RuntimeStatus> {
    try {
      const result = await redis.ping();
      return result === 'PONG' ? RuntimeStatus.READY : RuntimeStatus.UNKNOWN;
    } catch {
      return RuntimeStatus.UNKNOWN;
    }
  }

  private async _getDeploymentQueueSummary(): Promise<OpsSummary['queues']['deployments']> {
    try {
      const counts = await deploymentsQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );

      return {
        status: RuntimeStatus.READY,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    } catch {
      return {
        status: RuntimeStatus.UNKNOWN,
      };
    }
  }

  private _toDeployment(deployment: {
    id: string;
    projectId: string;
    environmentId: string;
    status: Deployment['status'];
    trigger: Deployment['trigger'];
    commitSha: string | null;
    branch: string | null;
    triggeredById: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
    imageTag: string | null;
    errorMessage: string | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): Deployment {
    return {
      id: deployment.id,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      status: deployment.status,
      trigger: deployment.trigger,
      commitSha: deployment.commitSha,
      branch: deployment.branch,
      triggeredById: deployment.triggeredById,
      startedAt: deployment.startedAt?.toISOString() ?? null,
      completedAt: deployment.completedAt?.toISOString() ?? null,
      durationMs: deployment.durationMs,
      imageTag: deployment.imageTag,
      errorMessage: deployment.errorMessage,
      metadata: this._toRecord(deployment.metadata),
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
    };
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private _toActivityItem(operation: OperationActivityRecord): OperationActivityItem {
    const input = this._toRecord(operation.input);
    const result = this._toRecord(operation.result);
    const error = this._toRecord(operation.error);
    const source = this._sourceForProvider(operation.provider);
    const terminal = this._isTerminalStatus(operation.status);
    const started = this._isStartedStatus(operation.status);
    const durationMs = terminal
      ? Math.max(0, operation.updatedAt.getTime() - operation.createdAt.getTime())
      : null;

    return {
      id: operation.id,
      type: operation.operationType,
      source,
      status: operation.status,
      title: this._titleForType(operation.operationType),
      targetLabel: this._targetLabel(operation.operationType, input, result),
      result: this._resultLabel(operation.operationType, result),
      externalUrl: this._externalUrl(operation.operationType, result),
      createdAt: operation.createdAt.toISOString(),
      startedAt: started ? operation.updatedAt.toISOString() : null,
      completedAt: terminal ? operation.updatedAt.toISOString() : null,
      durationMs,
      actor: operation.requestedBy
        ? {
            id: operation.requestedBy.id,
            name: operation.requestedBy.name,
            email: operation.requestedBy.email,
          }
        : null,
      errorMessage: this._stringField(error, 'message'),
    };
  }

  private _sourceForProvider(provider: OperationProvider): OperationActivitySource {
    if (provider === OperationProvider.JENKINS) return OperationActivitySource.JENKINS;
    if (provider === OperationProvider.KUBERNETES) return OperationActivitySource.KUBERNETES;
    if (provider === OperationProvider.DOCKER) return OperationActivitySource.DOCKER;
    if (provider === OperationProvider.GITHUB) return OperationActivitySource.GITHUB;
    if (provider === OperationProvider.AWS) return OperationActivitySource.AWS;
    return OperationActivitySource.SYSTEM;
  }

  private _providerForSource(source: OperationActivitySource): OperationProvider | null {
    if (source === OperationActivitySource.JENKINS) return OperationProvider.JENKINS;
    if (source === OperationActivitySource.KUBERNETES) return OperationProvider.KUBERNETES;
    if (source === OperationActivitySource.DOCKER) return OperationProvider.DOCKER;
    if (source === OperationActivitySource.GITHUB) return OperationProvider.GITHUB;
    if (source === OperationActivitySource.AWS) return OperationProvider.AWS;
    return null;
  }

  private _titleForType(type: OperationType): string {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) return 'Jenkins build triggered';
    if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return 'Kubernetes deployment restart';
    if (type === OperationType.KUBERNETES_MANIFEST_DRY_RUN) return 'Kubernetes manifest dry run';
    if (type === OperationType.KUBERNETES_MANIFEST_APPLY) return 'Kubernetes manifest apply';
    if (type === OperationType.GITHUB_WORKFLOW_DISPATCH) return 'GitHub workflow dispatched';
    if (type === OperationType.AWS_DEPLOYMENT) return 'AWS deployment requested';
    if (type === OperationType.DEPLOYMENT_ROLLBACK) return 'Deployment rollback requested';
    return String(type).replace(/_/g, ' ').toLowerCase();
  }

  private _targetLabel(
    type: OperationType,
    input: Record<string, unknown>,
    result: Record<string, unknown>,
  ): string | null {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) {
      return this._stringField(result, 'jobName') ?? this._stringField(input, 'jobName');
    }

    return (
      this._stringField(input, 'target') ??
      this._stringField(input, 'resourceName') ??
      this._stringField(input, 'name') ??
      this._stringField(result, 'target') ??
      null
    );
  }

  private _resultLabel(type: OperationType, result: Record<string, unknown>): string | null {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) {
      return this._stringField(result, 'result');
    }

    return this._stringField(result, 'status') ?? this._stringField(result, 'result');
  }

  private _externalUrl(type: OperationType, result: Record<string, unknown>): string | null {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) {
      return this._stringField(result, 'buildUrl');
    }

    return null;
  }

  private _stringField(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private _isStartedStatus(status: OperationStatus): boolean {
    return status !== OperationStatus.QUEUED && status !== OperationStatus.PENDING_APPROVAL;
  }

  private _isTerminalStatus(status: OperationStatus): boolean {
    return (
      status === OperationStatus.SUCCEEDED ||
      status === OperationStatus.FAILED ||
      status === OperationStatus.REJECTED ||
      status === OperationStatus.CANCELLED
    );
  }
}

export const opsService = new OpsService();
