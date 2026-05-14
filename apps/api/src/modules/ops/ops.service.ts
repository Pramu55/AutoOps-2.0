import { prisma } from '@autoops/database';
import {
  DeploymentStatus,
  IntegrationCategory,
  IntegrationStatus,
  KubernetesConnectionStatus,
  OperationStatus,
  ProviderConnectionStatus,
  RuntimeStatus,
  type Deployment,
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

const BASE_INTEGRATIONS: OpsIntegrationReadiness[] = [
  {
    key: 'kubernetes',
    name: 'Kubernetes',
    category: IntegrationCategory.ORCHESTRATION,
    status: IntegrationStatus.NOT_CONFIGURED,
    description: 'Read-only cluster visibility will be connected before any apply or execution capability.',
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
}

export const opsService = new OpsService();
