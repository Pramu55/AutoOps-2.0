import { prisma } from '@autoops/database';
import {
  DeploymentStatus,
  IntegrationCategory,
  IntegrationStatus,
  IncidentStatus,
  KubernetesConnectionStatus,
  OperationApprovalStatus,
  OperationActivitySource,
  OperationProvider,
  OperationRiskLevel,
  OperationStatus,
  OperationType,
  ProviderConnectionStatus,
  RuntimeStatus,
  type Deployment,
  type GovernanceEvidenceFilters,
  type GovernanceEvidenceItem,
  type GovernanceEvidenceResponse,
  type GovernanceExportResponse,
  type GovernanceSummaryResponse,
  type IncidentSeverity,
  type OperationActivityItem,
  type OperationActivityResponse,
  type OperationDetailResponse,
  type OperationObservabilityItem,
  type OperationPermissionHints,
  type OrgRole,
  type OpsActivityQuery,
  type OpsObservabilityResponse,
  type OpsIntegrationReadiness,
  type OpsProviderHealthSummary,
  type OpsQueueHealthSummary,
  type OpsSummary,
  type PlatformHealthStatus,
  type WorkerHeartbeatSummary,
  type WorkerQueueCoverage,
  type WorkerQueueCoverageStatus,
  type WorkerRuntimeItem,
  type WorkerRuntimeStatus,
} from '@autoops/types';
import { NotFoundError, UnauthorizedError } from '@autoops/utils';
import { redis } from '../../lib/redis.js';
import { deploymentsQueue } from '../deployments/deployment.queue.js';
import { operationsQueue } from '../operations/operation.queue.js';
import { awsService } from '../integrations/aws/aws.service.js';
import { dockerService } from '../integrations/docker/docker.service.js';
import { infrastructureService } from '../integrations/infrastructure/infrastructure.service.js';
import { jenkinsService } from '../integrations/jenkins/jenkins.service.js';
import { kubernetesService } from '../integrations/kubernetes/kubernetes.service.js';
import { incidentService } from '../incidents/incident.service.js';
import { operationAuthorizationService } from '../operations/operation-authorization.service.js';

const ACTIVE_DEPLOYMENT_STATUSES = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
  DeploymentStatus.RUNNING,
] as const;

const ACTIVE_OPERATION_STATUSES = [
  OperationStatus.QUEUED,
  OperationStatus.RUNNING,
  OperationStatus.PENDING_APPROVAL,
] as const;

const OBSERVABILITY_RECENT_LIMIT = 50;
const WORKER_STALE_THRESHOLD_MS = 30_000;
const WORKER_OFFLINE_THRESHOLD_MS = 90_000;
const REQUIRED_WORKER_QUEUES = ['operations', 'deployments', 'system'] as const;

type OperationActivityRecord = {
  id: string;
  provider: OperationProvider;
  operationType: OperationType;
  status: OperationStatus;
  input: unknown;
  result: unknown;
  error: unknown;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requestedByUserId: string | null;
  requestedBy: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  approvedBy: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  rejectedBy: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  incident?: {
    id: string;
    title: string;
    severity: string;
    status: string;
  } | null;
};

type SafePolicyMetadata = {
  riskLevel: OperationRiskLevel | null;
  confirmationTokenLabel: string | null;
  approvalRequired: boolean | null;
  approvalReason: string | null;
  policyName: string | null;
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
    description: 'Allowlisted playbook syntax, check, and run controls execute through governed worker operations.',
    href: '/dashboard/integrations/infrastructure',
  },
  {
    key: 'terraform',
    name: 'Terraform',
    category: IntegrationCategory.INFRASTRUCTURE,
    status: IntegrationStatus.NOT_CONNECTED,
    description: 'Allowlisted Terraform/OpenTofu validate, plan, and apply controls execute through governed worker operations.',
    href: '/dashboard/integrations/infrastructure',
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
    description: 'Docker controlled operations require confirmation and audit before worker execution.',
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
    userId: string,
    query: OpsActivityQuery,
  ): Promise<OperationActivityResponse> {
    const provider = query.source ? this._providerForSource(query.source) : null;
    if (query.source && !provider) {
      return { items: [] };
    }

    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
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
        approvedAt: true,
        rejectedAt: true,
        createdAt: true,
        updatedAt: true,
        requestedByUserId: true,
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        incident: {
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
          },
        },
      },
    });

    return {
      items: operations.map((operation) => this._toActivityItem(operation, role, userId)),
    };
  }

  async getActivityDetail(
    organizationId: string,
    userId: string,
    operationId: string,
  ): Promise<OperationDetailResponse> {
    const [operation, incident] = await Promise.all([
      prisma.operation.findFirst({
        where: {
          id: operationId,
          organizationId,
        },
        select: {
          id: true,
          provider: true,
          operationType: true,
          status: true,
          input: true,
          result: true,
          error: true,
          approvedAt: true,
          rejectedAt: true,
          createdAt: true,
          updatedAt: true,
          requestedByUserId: true,
          requestedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          rejectedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.incident.findFirst({
        where: {
          operationId,
          organizationId,
        },
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
        },
      }),
    ]);

    if (!operation) throw new NotFoundError('Operation');

    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    return this._toOperationDetail({ ...operation, incident }, role, userId);
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
      dockerStatus,
      infrastructureStatus,
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
      dockerService.getStatus(),
      infrastructureService.getStatus(),
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
      integrations: this._withProviderStatus(kubernetesStatus, awsStatus, jenkinsStatus, dockerStatus, infrastructureStatus),
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

  async getObservability(organizationId: string, userId: string): Promise<OpsObservabilityResponse> {
    const generatedAt = new Date().toISOString();
    const [
      databaseStatus,
      redisStatus,
      deploymentQueue,
      operationQueue,
      workerRuntime,
      recentOperations,
      jenkinsHealth,
      dockerHealth,
      kubernetesHealth,
      infrastructureHealth,
      role,
      incidentSummary,
    ] = await Promise.all([
      this._getDatabaseStatus(),
      this._getRedisStatus(),
      this._getQueueHealth(deploymentsQueue, 'Deployments queue'),
      this._getQueueHealth(operationsQueue, 'Operations queue'),
      this._getWorkerRuntime(),
      this._getRecentOperationRecords(organizationId),
      this._getJenkinsHealth(),
      this._getDockerHealth(),
      this._getKubernetesHealth(),
      this._getInfrastructureHealth(),
      operationAuthorizationService.getOrganizationRole({ organizationId, userId }),
      incidentService.getSummary(organizationId, userId),
    ]);

    const observableOperations = recentOperations.map((operation) =>
      this._toObservabilityItem(operation, role, userId),
    );
    const statusBreakdown = this._operationStatusBreakdown(recentOperations);
    const active = observableOperations
      .filter((operation) =>
        ACTIVE_OPERATION_STATUSES.includes(operation.status as (typeof ACTIVE_OPERATION_STATUSES)[number]),
      )
      .slice(0, 10);
    const recentFailures = observableOperations
      .filter((operation) => operation.status === OperationStatus.FAILED)
      .slice(0, 10);

    return {
      platform: {
        api: {
          status: 'HEALTHY',
          message: 'API is serving authenticated operations requests.',
          checkedAt: generatedAt,
        },
        database: {
          status: databaseStatus === RuntimeStatus.READY ? 'CONNECTED' : 'UNAVAILABLE',
          message:
            databaseStatus === RuntimeStatus.READY
              ? 'PostgreSQL readiness check succeeded.'
              : 'PostgreSQL readiness check is unavailable.',
          checkedAt: generatedAt,
        },
        redis: {
          status: redisStatus === RuntimeStatus.READY ? 'CONNECTED' : 'UNAVAILABLE',
          message:
            redisStatus === RuntimeStatus.READY
              ? 'Redis readiness check succeeded.'
              : 'Redis readiness check is unavailable.',
          checkedAt: generatedAt,
        },
        worker: {
          status: this._platformStatusForWorker(workerRuntime.status),
          message: workerRuntime.message,
          checkedAt: generatedAt,
        },
      },
      queues: {
        deployments: deploymentQueue,
        operations: operationQueue,
      },
      workerRuntime,
      providers: {
        jenkins: jenkinsHealth,
        docker: dockerHealth,
        kubernetes: kubernetesHealth,
        infrastructure: infrastructureHealth,
      },
      operations: {
        totalRecent: observableOperations.length,
        recentWindowLabel: `Latest ${OBSERVABILITY_RECENT_LIMIT} tenant operations`,
        statusBreakdown,
        active,
        recentFailures,
        latest: observableOperations.slice(0, 10),
      },
      incidents: incidentSummary,
      generatedAt,
    };
  }

  async getGovernanceEvidence(
    organizationId: string,
    userId: string,
    query: GovernanceEvidenceFilters,
  ): Promise<GovernanceEvidenceResponse> {
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    if (!role) throw new UnauthorizedError('You do not have permission to view governance evidence.');

    const operations = await this._getGovernanceOperationRecords(organizationId, query);
    const filteredEvidence = this._filterGovernanceEvidence(
      operations.map((operation) => this._toGovernanceEvidenceItem(operation, role, userId)),
      query,
    );
    const evidence = filteredEvidence.slice(0, query.limit);

    return {
      summary: this._governanceSummary(evidence),
      evidence,
      latestHighRiskOperations: evidence.filter((item) => item.policy.riskLevel === OperationRiskLevel.HIGH).slice(0, 5),
      latestRejectedOperations: evidence.filter((item) => item.status === OperationStatus.REJECTED).slice(0, 5),
      latestFailedOperations: evidence.filter((item) => item.status === OperationStatus.FAILED).slice(0, 5),
      latestIncidentLinkedOperations: evidence.filter((item) => item.incident !== null).slice(0, 5),
      generatedAt: new Date().toISOString(),
    };
  }

  async exportGovernanceEvidence(
    organizationId: string,
    userId: string,
    query: GovernanceEvidenceFilters,
  ): Promise<GovernanceExportResponse> {
    const role = await operationAuthorizationService.getOrganizationRole({ organizationId, userId });
    if (!role || (role !== 'OWNER' && role !== 'ADMIN')) {
      throw new UnauthorizedError('Only owner or admin users can export governance evidence.');
    }

    const response = await this.getGovernanceEvidence(organizationId, userId, {
      ...query,
      limit: Math.min(query.limit ?? 500, 500),
    });

    return {
      format: 'json',
      generatedAt: response.generatedAt,
      limit: response.evidence.length,
      evidence: response.evidence,
      summary: response.summary,
    };
  }

  private _withProviderStatus(
    kubernetesStatus: Awaited<ReturnType<typeof kubernetesService.getStatus>>,
    awsStatus: Awaited<ReturnType<typeof awsService.getStatus>>,
    jenkinsStatus: Awaited<ReturnType<typeof jenkinsService.getStatus>>,
    dockerStatus: Awaited<ReturnType<typeof dockerService.getStatus>>,
    infrastructureStatus: Awaited<ReturnType<typeof infrastructureService.getStatus>>,
  ): OpsIntegrationReadiness[] {
    return BASE_INTEGRATIONS.map((integration) => {
      if (integration.key === 'terraform') {
        const terraformStatus = infrastructureStatus.terraform;
        return {
          ...integration,
          status:
            terraformStatus.status === 'CONNECTED'
              ? IntegrationStatus.CONNECTED
              : terraformStatus.status === 'NOT_INSTALLED'
                ? IntegrationStatus.NOT_CONFIGURED
                : IntegrationStatus.UNREACHABLE,
          description:
            terraformStatus.status === 'CONNECTED'
              ? `${terraformStatus.tool ?? 'Terraform/OpenTofu'} is available for allowlisted validate, plan, and approval-gated apply operations.`
              : terraformStatus.message,
          lastCheckedAt: terraformStatus.checkedAt,
          metrics: {
            tool: terraformStatus.tool,
            version: terraformStatus.version,
          },
        };
      }

      if (integration.key === 'ansible') {
        const ansibleStatus = infrastructureStatus.ansible;
        return {
          ...integration,
          status:
            ansibleStatus.status === 'CONNECTED'
              ? IntegrationStatus.CONNECTED
              : ansibleStatus.status === 'NOT_INSTALLED'
                ? IntegrationStatus.NOT_CONFIGURED
                : IntegrationStatus.UNREACHABLE,
          description:
            ansibleStatus.status === 'CONNECTED'
              ? 'Ansible playbook runner is available for allowlisted syntax, check, and approval-gated run operations.'
              : ansibleStatus.message,
          lastCheckedAt: ansibleStatus.checkedAt,
          metrics: {
            tool: ansibleStatus.tool,
            version: ansibleStatus.version,
          },
        };
      }

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

      if (integration.key === 'docker') {
        return {
          ...integration,
          status:
            dockerStatus.status === ProviderConnectionStatus.CONNECTED
              ? IntegrationStatus.CONNECTED
              : dockerStatus.status === ProviderConnectionStatus.UNREACHABLE ||
                  dockerStatus.status === ProviderConnectionStatus.AUTH_FAILED
                ? IntegrationStatus.UNREACHABLE
                : IntegrationStatus.NOT_CONFIGURED,
          description:
            dockerStatus.status === ProviderConnectionStatus.CONNECTED
              ? 'Docker engine connected. Container start, stop, and restart operations are confirmation-protected and audited.'
              : dockerStatus.message,
          href: '/dashboard/integrations/docker',
          lastCheckedAt: dockerStatus.checkedAt,
          metrics: {
            version: dockerStatus.version ?? null,
            containers: dockerStatus.containers,
            images: dockerStatus.images,
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
            ? 'Kubernetes discovery is connected. Controlled scale and rollout backend operations require audit and confirmation.'
            : kubernetesStatus.status === KubernetesConnectionStatus.UNREACHABLE
              ? 'Kubernetes configuration is present, but the API server is unreachable from AutoOps.'
              : integration.description,
        href: '/dashboard/integrations/kubernetes',
        lastCheckedAt: kubernetesStatus.checkedAt,
        metrics: {
          nodes: kubernetesStatus.nodeCount ?? 0,
          readyNodes: kubernetesStatus.readyNodeCount ?? 0,
          namespaces: kubernetesStatus.namespaceCount ?? 0,
          controlledOperations: 'scale and rollout restart',
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
    const queue = await this._getQueueHealth(deploymentsQueue, 'Deployments queue');
    return {
      status: queue.status,
      waiting: queue.waiting,
      active: queue.active,
      completed: queue.completed,
      failed: queue.failed,
      delayed: queue.delayed,
    };
  }

  private async _getQueueHealth(
    queue: {
      getJobCounts: (
        ...types: Array<'waiting' | 'active' | 'completed' | 'failed' | 'delayed'>
      ) => Promise<{
        waiting?: number;
        active?: number;
        completed?: number;
        failed?: number;
        delayed?: number;
      }>;
    },
    label: string,
  ): Promise<OpsQueueHealthSummary> {
    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );

      return {
        status: RuntimeStatus.READY,
        message: `${label} counts are readable.`,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    } catch {
      return {
        status: RuntimeStatus.UNKNOWN,
        message: `${label} counts are unavailable.`,
      };
    }
  }

  private async _getWorkerRuntime(): Promise<WorkerHeartbeatSummary> {
    try {
      const now = Date.now();
      const heartbeats = await prisma.workerHeartbeat.findMany({
        where: {
          service: 'autoops-worker',
        },
        orderBy: {
          lastSeenAt: 'desc',
        },
        take: 20,
        select: {
          workerId: true,
          service: true,
          status: true,
          queues: true,
          startedAt: true,
          lastSeenAt: true,
          processId: true,
          environment: true,
          version: true,
        },
      });

      if (heartbeats.length === 0) return this._emptyWorkerRuntime();

      const workers: WorkerRuntimeItem[] = heartbeats.map((heartbeat) => ({
        workerId: heartbeat.workerId,
        service: heartbeat.service,
        status: heartbeat.status,
        queues: this._stringArray(heartbeat.queues),
        startedAt: heartbeat.startedAt.toISOString(),
        lastSeenAt: heartbeat.lastSeenAt.toISOString(),
        heartbeatAgeMs: Math.max(0, now - heartbeat.lastSeenAt.getTime()),
        runtime: {
          ...(heartbeat.processId ? { processId: heartbeat.processId } : {}),
          ...(heartbeat.environment ? { environment: heartbeat.environment } : {}),
          version: heartbeat.version,
        },
      }));

      const activeWorkers = workers.filter(
        (worker) =>
          worker.status === 'RUNNING' && worker.heartbeatAgeMs <= WORKER_STALE_THRESHOLD_MS,
      );
      const staleWorkers = workers.filter(
        (worker) =>
          worker.status === 'RUNNING' &&
          worker.heartbeatAgeMs > WORKER_STALE_THRESHOLD_MS &&
          worker.heartbeatAgeMs <= WORKER_OFFLINE_THRESHOLD_MS,
      );
      const offlineWorkers = workers.filter(
        (worker) =>
          worker.status !== 'RUNNING' || worker.heartbeatAgeMs > WORKER_OFFLINE_THRESHOLD_MS,
      );
      const queueCoverage = this._queueCoverage(activeWorkers);
      const missingQueues = REQUIRED_WORKER_QUEUES.filter(
        (queueName) => queueCoverage[queueName] !== 'COVERED',
      );
      const status = this._workerRuntimeStatus(
        activeWorkers.length,
        staleWorkers.length,
        missingQueues.length,
      );

      return {
        status,
        message: this._workerRuntimeMessage(status, activeWorkers.length, missingQueues),
        activeCount: activeWorkers.length,
        staleCount: staleWorkers.length,
        offlineCount: offlineWorkers.length,
        lastSeenAt: workers[0]?.lastSeenAt ?? null,
        staleThresholdMs: WORKER_STALE_THRESHOLD_MS,
        offlineThresholdMs: WORKER_OFFLINE_THRESHOLD_MS,
        queueCoverage,
        workers,
      };
    } catch {
      return {
        status: 'UNKNOWN',
        message: 'Worker heartbeat registry is unavailable.',
        activeCount: 0,
        staleCount: 0,
        offlineCount: 0,
        lastSeenAt: null,
        staleThresholdMs: WORKER_STALE_THRESHOLD_MS,
        offlineThresholdMs: WORKER_OFFLINE_THRESHOLD_MS,
        queueCoverage: this._unknownQueueCoverage(),
        workers: [],
      };
    }
  }

  private _emptyWorkerRuntime(): WorkerHeartbeatSummary {
    return {
      status: 'UNKNOWN',
      message: 'No worker heartbeat has been received yet.',
      activeCount: 0,
      staleCount: 0,
      offlineCount: 0,
      lastSeenAt: null,
      staleThresholdMs: WORKER_STALE_THRESHOLD_MS,
      offlineThresholdMs: WORKER_OFFLINE_THRESHOLD_MS,
      queueCoverage: this._unknownQueueCoverage(),
      workers: [],
    };
  }

  private _queueCoverage(activeWorkers: WorkerRuntimeItem[]): WorkerQueueCoverage {
    return {
      operations: this._coverageForQueue(activeWorkers, 'operations'),
      deployments: this._coverageForQueue(activeWorkers, 'deployments'),
      system: this._coverageForQueue(activeWorkers, 'system'),
    };
  }

  private _coverageForQueue(
    workers: WorkerRuntimeItem[],
    queueName: keyof WorkerQueueCoverage,
  ): WorkerQueueCoverageStatus {
    return workers.some((worker) => worker.queues.includes(queueName)) ? 'COVERED' : 'UNCOVERED';
  }

  private _unknownQueueCoverage(): WorkerQueueCoverage {
    return {
      operations: 'UNKNOWN',
      deployments: 'UNKNOWN',
      system: 'UNKNOWN',
    };
  }

  private _workerRuntimeStatus(
    activeCount: number,
    staleCount: number,
    missingQueueCount: number,
  ): WorkerRuntimeStatus {
    if (activeCount > 0 && missingQueueCount === 0) return 'RUNNING';
    if (activeCount > 0 || staleCount > 0) return 'DEGRADED';
    return 'OFFLINE';
  }

  private _workerRuntimeMessage(
    status: WorkerRuntimeStatus,
    activeCount: number,
    missingQueues: readonly string[],
  ): string {
    if (status === 'RUNNING') {
      return `${activeCount} active worker heartbeat(s). Queue coverage is fresh.`;
    }
    if (activeCount > 0 && missingQueues.length > 0) {
      return `Worker heartbeat is fresh, but queue coverage is missing for ${missingQueues.join(', ')}.`;
    }
    if (status === 'DEGRADED') {
      return 'Only stale worker heartbeat data is available. Operations may be delayed.';
    }
    return 'No fresh worker heartbeat detected. Operations may remain queued until a worker is available.';
  }

  private _platformStatusForWorker(status: WorkerRuntimeStatus): PlatformHealthStatus {
    if (status === 'RUNNING') return 'RUNNING';
    if (status === 'DEGRADED') return 'DEGRADED';
    if (status === 'OFFLINE') return 'OFFLINE';
    return 'UNKNOWN';
  }

  private _stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }

  private async _getGovernanceOperationRecords(
    organizationId: string,
    query: GovernanceEvidenceFilters,
  ): Promise<OperationActivityRecord[]> {
    return prisma.operation.findMany({
      where: {
        organizationId,
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.operationType ? { operationType: query.operationType } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 500,
      select: {
        id: true,
        provider: true,
        operationType: true,
        status: true,
        input: true,
        result: true,
        error: true,
        approvedAt: true,
        rejectedAt: true,
        createdAt: true,
        updatedAt: true,
        requestedByUserId: true,
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        incident: {
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
          },
        },
      },
    });
  }

  private _filterGovernanceEvidence(
    evidence: GovernanceEvidenceItem[],
    query: GovernanceEvidenceFilters,
  ): GovernanceEvidenceItem[] {
    const search = query.search?.toLowerCase();
    const actor = query.actor?.toLowerCase();
    return evidence.filter((item) => {
      if (query.risk && item.policy.riskLevel !== query.risk) return false;
      if (query.approvalStatus && item.policy.approvalStatus !== query.approvalStatus) return false;
      if (search) {
        const haystack = [
          item.operationId,
          item.title,
          item.targetDisplayName,
          item.provider,
          item.operationType,
          item.status,
          item.requestedBy?.name,
          item.requestedBy?.email,
          item.incident?.title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (actor) {
        const actorHaystack = [
          item.requestedBy?.name,
          item.requestedBy?.email,
          item.approvedBy?.name,
          item.approvedBy?.email,
          item.rejectedBy?.name,
          item.rejectedBy?.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!actorHaystack.includes(actor)) return false;
      }
      return true;
    });
  }

  private async _getRecentOperationRecords(organizationId: string): Promise<OperationActivityRecord[]> {
    return prisma.operation.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: OBSERVABILITY_RECENT_LIMIT,
      select: {
        id: true,
        provider: true,
        operationType: true,
        status: true,
        input: true,
        result: true,
        error: true,
        approvedAt: true,
        rejectedAt: true,
        createdAt: true,
        updatedAt: true,
        requestedByUserId: true,
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  private _toObservabilityItem(
    operation: OperationActivityRecord,
    role: OrgRole | null,
    userId: string,
  ): OperationObservabilityItem {
    const input = this._toRecord(operation.input);
    const result = this._toRecord(operation.result);
    return {
      ...this._toActivityItem(operation, role, userId),
      retry: this._retryInfo(operation.operationType, input, result),
    };
  }

  private _operationStatusBreakdown(
    operations: OperationActivityRecord[],
  ): OpsObservabilityResponse['operations']['statusBreakdown'] {
    return operations.reduce<OpsObservabilityResponse['operations']['statusBreakdown']>(
      (breakdown, operation) => {
        if (operation.status === OperationStatus.QUEUED) breakdown.queued += 1;
        else if (operation.status === OperationStatus.RUNNING) breakdown.running += 1;
        else if (operation.status === OperationStatus.SUCCEEDED) breakdown.succeeded += 1;
        else if (operation.status === OperationStatus.FAILED) breakdown.failed += 1;
        else if (operation.status === OperationStatus.REJECTED) breakdown.rejected += 1;
        else if (operation.status === OperationStatus.CANCELLED) breakdown.cancelled += 1;
        else if (operation.status === OperationStatus.PENDING_APPROVAL) breakdown.pendingApproval += 1;
        return breakdown;
      },
      {
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        rejected: 0,
        cancelled: 0,
        pendingApproval: 0,
      },
    );
  }

  private async _getJenkinsHealth(): Promise<OpsProviderHealthSummary> {
    try {
      const status = await jenkinsService.getStatus();
      return {
        status: status.status,
        message:
          status.status === ProviderConnectionStatus.CONNECTED
            ? status.triggerEnabled
              ? 'Jenkins is connected and allowlisted build triggers are enabled.'
              : 'Jenkins is connected; no jobs are allowlisted for triggering.'
            : status.message,
        href: '/dashboard/integrations/jenkins',
        checkedAt: status.checkedAt,
        triggerEnabled: status.triggerEnabled,
      };
    } catch {
      return this._unknownProviderHealth(
        '/dashboard/integrations/jenkins',
        'Jenkins health check failed safely.',
      );
    }
  }

  private async _getDockerHealth(): Promise<OpsProviderHealthSummary> {
    try {
      const status = await dockerService.getStatus();
      return {
        status: status.status,
        message:
          status.status === ProviderConnectionStatus.CONNECTED
            ? 'Docker engine is reachable for governed container operations.'
            : status.message,
        href: '/dashboard/integrations/docker',
        checkedAt: status.checkedAt,
      };
    } catch {
      return this._unknownProviderHealth(
        '/dashboard/integrations/docker',
        'Docker health check failed safely.',
      );
    }
  }

  private async _getKubernetesHealth(): Promise<OpsProviderHealthSummary> {
    try {
      const summary = await kubernetesService.getSummary();
      return {
        status: summary.status,
        message:
          summary.status === KubernetesConnectionStatus.CONNECTED
            ? `Kubernetes API is connected. Metrics API ${summary.metricsApi.status}.`
            : summary.message ?? 'Kubernetes is not connected.',
        href: '/dashboard/integrations/kubernetes',
        checkedAt: summary.checkedAt,
        metricsApiStatus: summary.metricsApi.status,
      };
    } catch {
      return this._unknownProviderHealth(
        '/dashboard/integrations/kubernetes',
        'Kubernetes health check failed safely.',
      );
    }
  }

  private async _getInfrastructureHealth(): Promise<OpsProviderHealthSummary> {
    try {
      const status = await infrastructureService.getStatus();
      const connectedTools = [status.terraform, status.ansible].filter((tool) => tool.status === 'CONNECTED');
      return {
        status: connectedTools.length > 0 ? 'CONNECTED' : 'NOT_CONFIGURED',
        message:
          connectedTools.length > 0
            ? `${connectedTools.length} infrastructure automation tool(s) available for allowlisted worker operations.`
            : 'Terraform/OpenTofu and Ansible are not installed in this runtime.',
        href: '/dashboard/integrations/infrastructure',
        checkedAt: status.terraform.checkedAt,
      };
    } catch {
      return this._unknownProviderHealth(
        '/dashboard/integrations/infrastructure',
        'Infrastructure automation health check failed safely.',
      );
    }
  }

  private _unknownProviderHealth(href: string, message: string): OpsProviderHealthSummary {
    return {
      status: 'UNKNOWN',
      message,
      href,
      checkedAt: new Date().toISOString(),
    };
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

  private _toActivityItem(
    operation: OperationActivityRecord,
    role: OrgRole | null,
    userId: string,
  ): OperationActivityItem {
    const input = this._toRecord(operation.input);
    const result = this._toRecord(operation.result);
    const error = this._toRecord(operation.error);
    const source = this._sourceForProvider(operation.provider);
    const terminal = this._isTerminalStatus(operation.status);
    const started = this._isStartedStatus(operation.status);
    const durationMs = terminal
      ? Math.max(0, operation.updatedAt.getTime() - operation.createdAt.getTime())
      : null;
    const governance = this._governanceForOperation(
      operation.operationType,
      operation.status,
      operation.approvedAt,
      operation.rejectedAt,
      input,
    );

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
      governance: {
        ...governance,
        approvedBy: operation.approvedBy
          ? {
              id: operation.approvedBy.id,
              name: operation.approvedBy.name,
              email: operation.approvedBy.email,
            }
          : null,
        rejectedBy: operation.rejectedBy
          ? {
              id: operation.rejectedBy.id,
              name: operation.rejectedBy.name,
              email: operation.rejectedBy.email,
            }
          : null,
      },
      permissions: this._permissionHints(operation, role, userId),
    };
  }

  private _toOperationDetail(
    operation: OperationActivityRecord,
    role: OrgRole | null,
    userId: string,
  ): OperationDetailResponse {
    const activity = this._toActivityItem(operation, role, userId);
    const input = this._toRecord(operation.input);
    const result = this._toRecord(operation.result);
    const error = this._toRecord(operation.error);

    return {
      ...activity,
      updatedAt: operation.updatedAt.toISOString(),
      providerDetails: this._providerDetails(operation.provider, operation.operationType, input, result),
      lifecycle: this._lifecycle(operation),
      retry: this._retryInfo(operation.operationType, input, result),
      incident: operation.incident
        ? {
            id: operation.incident.id,
            title: operation.incident.title,
            severity: operation.incident.severity as IncidentSeverity,
            status:
              operation.incident.status === 'TRIGGERED'
                ? IncidentStatus.OPEN
                : operation.incident.status === 'MITIGATED'
                  ? IncidentStatus.ACKNOWLEDGED
                  : (operation.incident.status as NonNullable<OperationDetailResponse['incident']>['status']),
          }
        : null,
      errorMessage: activity.errorMessage ?? this._stringField(error, 'reason'),
      governanceEvidence: this._toGovernanceEvidenceItem(operation, role, userId),
    };
  }

  private _toGovernanceEvidenceItem(
    operation: OperationActivityRecord,
    role: OrgRole | null,
    userId: string,
  ): GovernanceEvidenceItem {
    const activity = this._toActivityItem(operation, role, userId);
    const input = this._toRecord(operation.input);
    const result = this._toRecord(operation.result);
    const error = this._toRecord(operation.error);
    const providerDetails = this._providerDetails(operation.provider, operation.operationType, input, result);
    const lifecycle = this._lifecycle(operation);
    const retry = this._retryInfo(operation.operationType, input, result);
    const safeResultSummary =
      activity.result ??
      providerDetails.safeSummary.find((item) => item.startsWith('Result:'))?.replace(/^Result:\s*/, '') ??
      providerDetails.safeSummary[0] ??
      null;
    const safeErrorSummary = activity.errorMessage ?? this._stringField(error, 'reason');

    return {
      operationId: operation.id,
      provider: operation.provider,
      source: activity.source,
      operationType: operation.operationType,
      status: operation.status,
      title: activity.title,
      targetDisplayName: activity.targetLabel,
      requestedBy: activity.actor,
      requestedAt: operation.createdAt.toISOString(),
      approvedBy: activity.governance.approvedBy ?? null,
      approvedAt: activity.governance.approvedAt,
      rejectedBy: activity.governance.rejectedBy ?? null,
      rejectedAt: activity.governance.rejectedAt,
      completedAt: activity.completedAt,
      durationMs: activity.durationMs,
      policy: {
        policyName: activity.governance.policyName,
        policyReason: activity.governance.approvalReason,
        riskLevel: activity.governance.riskLevel,
        confirmationTokenRequired: activity.governance.confirmationRequired,
        confirmationTokenLabel: activity.governance.confirmationTokenLabel,
        approvalRequired: activity.governance.approvalRequired,
        approvalStatus: activity.governance.approvalStatus,
      },
      incident: operation.incident
        ? {
            id: operation.incident.id,
            title: operation.incident.title,
            severity: operation.incident.severity as IncidentSeverity,
            status:
              operation.incident.status === 'TRIGGERED'
                ? IncidentStatus.OPEN
                : operation.incident.status === 'MITIGATED'
                  ? IncidentStatus.ACKNOWLEDGED
                  : (operation.incident.status as NonNullable<GovernanceEvidenceItem['incident']>['status']),
          }
        : null,
      safeResultSummary,
      safeErrorSummary,
      lifecycleCount: lifecycle.length,
      recoveryAvailable: retry.supported,
      evidenceSummary: this._evidenceSummary(activity, operation),
    };
  }

  private _evidenceSummary(
    activity: OperationActivityItem,
    operation: OperationActivityRecord,
  ): string {
    const requester = activity.actor?.name ?? activity.actor?.email ?? 'an authenticated user';
    const target = activity.targetLabel ? ` for ${activity.targetLabel}` : '';
    const policy = activity.governance.policyName ?? 'AutoOps policy';
    const approval =
      activity.governance.approvalStatus === OperationApprovalStatus.APPROVED
        ? `approved by ${activity.governance.approvedBy?.name ?? activity.governance.approvedBy?.email ?? 'an approver'}`
        : activity.governance.approvalStatus === OperationApprovalStatus.REJECTED
          ? `rejected by ${activity.governance.rejectedBy?.name ?? activity.governance.rejectedBy?.email ?? 'an approver'}`
          : activity.governance.approvalStatus === OperationApprovalStatus.PENDING
            ? 'waiting for approval'
            : 'did not require approval';

    return `Operation ${this._shortId(operation.id)} was requested by ${requester}${target}, evaluated by ${policy}, ${approval}, and is currently ${operation.status}.`;
  }

  private _governanceSummary(evidence: GovernanceEvidenceItem[]): GovernanceSummaryResponse {
    const approvalDurations = evidence
      .filter((item) => item.approvedAt || item.rejectedAt)
      .map((item) => {
        const decisionAt = item.approvedAt ?? item.rejectedAt;
        return decisionAt ? Math.max(0, new Date(decisionAt).getTime() - new Date(item.requestedAt).getTime()) : null;
      })
      .filter((item): item is number => item !== null);
    const executionDurations = evidence
      .map((item) => item.durationMs)
      .filter((item): item is number => item !== null);

    return {
      total: evidence.length,
      pendingApprovals: evidence.filter((item) => item.policy.approvalStatus === OperationApprovalStatus.PENDING).length,
      rejected: evidence.filter((item) => item.status === OperationStatus.REJECTED).length,
      failed: evidence.filter((item) => item.status === OperationStatus.FAILED).length,
      incidentsLinked: evidence.filter((item) => item.incident !== null).length,
      statusBreakdown: {
        queued: evidence.filter((item) => item.status === OperationStatus.QUEUED).length,
        running: evidence.filter((item) => item.status === OperationStatus.RUNNING).length,
        succeeded: evidence.filter((item) => item.status === OperationStatus.SUCCEEDED).length,
        failed: evidence.filter((item) => item.status === OperationStatus.FAILED).length,
        rejected: evidence.filter((item) => item.status === OperationStatus.REJECTED).length,
        cancelled: evidence.filter((item) => item.status === OperationStatus.CANCELLED).length,
        pendingApproval: evidence.filter((item) => item.status === OperationStatus.PENDING_APPROVAL).length,
      },
      providerBreakdown: {
        [OperationProvider.AWS]: evidence.filter((item) => item.provider === OperationProvider.AWS).length,
        [OperationProvider.DOCKER]: evidence.filter((item) => item.provider === OperationProvider.DOCKER).length,
        [OperationProvider.GITHUB]: evidence.filter((item) => item.provider === OperationProvider.GITHUB).length,
        [OperationProvider.JENKINS]: evidence.filter((item) => item.provider === OperationProvider.JENKINS).length,
        [OperationProvider.KUBERNETES]: evidence.filter((item) => item.provider === OperationProvider.KUBERNETES).length,
        [OperationProvider.INFRASTRUCTURE]: evidence.filter((item) => item.provider === OperationProvider.INFRASTRUCTURE).length,
      },
      riskBreakdown: {
        [OperationRiskLevel.LOW]: evidence.filter((item) => item.policy.riskLevel === OperationRiskLevel.LOW).length,
        [OperationRiskLevel.MEDIUM]: evidence.filter((item) => item.policy.riskLevel === OperationRiskLevel.MEDIUM).length,
        [OperationRiskLevel.HIGH]: evidence.filter((item) => item.policy.riskLevel === OperationRiskLevel.HIGH).length,
      },
      approvalBreakdown: {
        [OperationApprovalStatus.NOT_REQUIRED]: evidence.filter((item) => item.policy.approvalStatus === OperationApprovalStatus.NOT_REQUIRED).length,
        [OperationApprovalStatus.PENDING]: evidence.filter((item) => item.policy.approvalStatus === OperationApprovalStatus.PENDING).length,
        [OperationApprovalStatus.APPROVED]: evidence.filter((item) => item.policy.approvalStatus === OperationApprovalStatus.APPROVED).length,
        [OperationApprovalStatus.REJECTED]: evidence.filter((item) => item.policy.approvalStatus === OperationApprovalStatus.REJECTED).length,
      },
      meanApprovalTimeMs: this._mean(approvalDurations),
      medianApprovalTimeMs: this._median(approvalDurations),
      meanExecutionDurationMs: this._mean(executionDurations),
      medianExecutionDurationMs: this._median(executionDurations),
    };
  }

  private _mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  private _median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((first, second) => first - second);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[middle] ?? null;
    const left = sorted[middle - 1] ?? 0;
    const right = sorted[middle] ?? 0;
    return Math.round((left + right) / 2);
  }

  private _permissionHints(
    operation: OperationActivityRecord,
    role: OrgRole | null,
    userId: string,
  ): OperationPermissionHints {
    const approveDecision = operationAuthorizationService.canApproveWithRole(role, userId, operation);
    const rejectDecision = operationAuthorizationService.canRejectWithRole(role, userId, operation);
    const triggerDecision = operationAuthorizationService.canTriggerWithRole(role);
    const isTerminal = this._isTerminalStatus(operation.status);
    const reason =
      operation.status === OperationStatus.PENDING_APPROVAL
        ? approveDecision.reason ?? rejectDecision.reason
        : triggerDecision.reason;

    return {
      canApprove: approveDecision.allowed,
      canReject: rejectDecision.allowed,
      canTriggerRecovery: isTerminal && triggerDecision.allowed,
      reason,
    };
  }

  private _sourceForProvider(provider: OperationProvider): OperationActivitySource {
    if (provider === OperationProvider.JENKINS) return OperationActivitySource.JENKINS;
    if (provider === OperationProvider.KUBERNETES) return OperationActivitySource.KUBERNETES;
    if (provider === OperationProvider.DOCKER) return OperationActivitySource.DOCKER;
    if (provider === OperationProvider.INFRASTRUCTURE) return OperationActivitySource.INFRASTRUCTURE;
    if (provider === OperationProvider.GITHUB) return OperationActivitySource.GITHUB;
    if (provider === OperationProvider.AWS) return OperationActivitySource.AWS;
    return OperationActivitySource.SYSTEM;
  }

  private _providerForSource(source: OperationActivitySource): OperationProvider | null {
    if (source === OperationActivitySource.JENKINS) return OperationProvider.JENKINS;
    if (source === OperationActivitySource.KUBERNETES) return OperationProvider.KUBERNETES;
    if (source === OperationActivitySource.DOCKER) return OperationProvider.DOCKER;
    if (source === OperationActivitySource.INFRASTRUCTURE) return OperationProvider.INFRASTRUCTURE;
    if (source === OperationActivitySource.GITHUB) return OperationProvider.GITHUB;
    if (source === OperationActivitySource.AWS) return OperationProvider.AWS;
    return null;
  }

  private _titleForType(type: OperationType): string {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) return 'Jenkins build triggered';
    if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) return 'Kubernetes deployment scaled';
    if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return 'Kubernetes deployment rollout restarted';
    if (type === OperationType.KUBERNETES_MANIFEST_DRY_RUN) return 'Kubernetes manifest dry run';
    if (type === OperationType.KUBERNETES_MANIFEST_APPLY) return 'Kubernetes manifest apply';
    if (type === OperationType.DOCKER_CONTAINER_START) return 'Docker container started';
    if (type === OperationType.DOCKER_CONTAINER_STOP) return 'Docker container stopped';
    if (type === OperationType.DOCKER_CONTAINER_RESTART) return 'Docker container restarted';
    if (type === OperationType.TERRAFORM_VALIDATE) return 'Terraform/OpenTofu workspace validated';
    if (type === OperationType.TERRAFORM_PLAN) return 'Terraform/OpenTofu plan generated';
    if (type === OperationType.TERRAFORM_APPLY) return 'Terraform/OpenTofu apply requested';
    if (type === OperationType.ANSIBLE_SYNTAX_CHECK) return 'Ansible syntax checked';
    if (type === OperationType.ANSIBLE_CHECK) return 'Ansible check mode executed';
    if (type === OperationType.ANSIBLE_RUN) return 'Ansible run requested';
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

    if (
      type === OperationType.TERRAFORM_VALIDATE ||
      type === OperationType.TERRAFORM_PLAN ||
      type === OperationType.TERRAFORM_APPLY
    ) {
      return (
        this._stringField(result, 'workspaceSlug') ??
        this._stringField(input, 'workspaceSlug') ??
        this._stringField(input, 'relativePath')
      );
    }

    if (
      type === OperationType.ANSIBLE_SYNTAX_CHECK ||
      type === OperationType.ANSIBLE_CHECK ||
      type === OperationType.ANSIBLE_RUN
    ) {
      return (
        this._stringField(result, 'playbookSlug') ??
        this._stringField(input, 'playbookSlug') ??
        this._stringField(input, 'relativePath')
      );
    }

    if (
      type === OperationType.KUBERNETES_DEPLOYMENT_SCALE ||
      type === OperationType.KUBERNETES_DEPLOYMENT_RESTART ||
      type === OperationType.DOCKER_CONTAINER_START ||
      type === OperationType.DOCKER_CONTAINER_STOP ||
      type === OperationType.DOCKER_CONTAINER_RESTART
    ) {
      if (
        type === OperationType.KUBERNETES_DEPLOYMENT_SCALE ||
        type === OperationType.KUBERNETES_DEPLOYMENT_RESTART
      ) {
        const namespace =
          this._stringField(result, 'namespace') ?? this._stringField(input, 'namespace');
        const name = this._stringField(result, 'name') ?? this._stringField(input, 'name');
        if (namespace && name) return `${namespace}/${name}`;
      }

      return (
        this._stringField(result, 'containerName') ??
        this._stringField(input, 'containerName') ??
        this._stringField(result, 'containerId') ??
        this._stringField(input, 'containerId')
      );
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

    if (
      type === OperationType.TERRAFORM_VALIDATE ||
      type === OperationType.TERRAFORM_PLAN ||
      type === OperationType.TERRAFORM_APPLY ||
      type === OperationType.ANSIBLE_SYNTAX_CHECK ||
      type === OperationType.ANSIBLE_CHECK ||
      type === OperationType.ANSIBLE_RUN
    ) {
      return this._stringField(result, 'status') ?? this._stringField(result, 'safeOutputSummary');
    }

    if (
      type === OperationType.KUBERNETES_DEPLOYMENT_SCALE ||
      type === OperationType.KUBERNETES_DEPLOYMENT_RESTART
    ) {
      return this._stringField(result, 'status');
    }

    return this._stringField(result, 'status') ?? this._stringField(result, 'result');
  }

  private _externalUrl(type: OperationType, result: Record<string, unknown>): string | null {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) {
      return this._stringField(result, 'buildUrl');
    }

    return null;
  }

  private _providerDetails(
    provider: OperationProvider,
    type: OperationType,
    input: Record<string, unknown>,
    result: Record<string, unknown>,
  ): OperationDetailResponse['providerDetails'] {
    const safeSummary: string[] = [];
    const action = this._stringField(result, 'action') ?? this._stringField(input, 'action');
    const namespace = this._stringField(result, 'namespace') ?? this._stringField(input, 'namespace');
    const targetName = this._stringField(result, 'name') ?? this._stringField(input, 'name');
    const targetKind = this._stringField(result, 'kind') ?? this._stringField(input, 'kind');
    const containerName =
      this._stringField(result, 'containerName') ?? this._stringField(input, 'containerName');
    const containerId =
      this._stringField(result, 'containerId') ?? this._stringField(input, 'containerId');
    const jobName = this._stringField(result, 'jobName') ?? this._stringField(input, 'jobName');
    const workspaceSlug =
      this._stringField(result, 'workspaceSlug') ?? this._stringField(input, 'workspaceSlug');
    const playbookSlug =
      this._stringField(result, 'playbookSlug') ?? this._stringField(input, 'playbookSlug');
    const relativePath =
      this._stringField(result, 'relativePath') ?? this._stringField(input, 'relativePath');
    const safeOutputSummary = this._stringField(result, 'safeOutputSummary');
    const buildNumber = this._numberField(result, 'buildNumber');
    const buildUrl = this._stringField(result, 'buildUrl');
    const replicas = this._numberField(result, 'replicas') ?? this._numberField(input, 'replicas');
    const status = this._stringField(result, 'status') ?? this._stringField(result, 'result');
    const completedAt = this._stringField(result, 'completedAt');
    const restartedAt = this._stringField(result, 'restartedAt');

    if (jobName) safeSummary.push(`Job: ${jobName}`);
    if (workspaceSlug) safeSummary.push(`Terraform workspace: ${workspaceSlug}`);
    if (playbookSlug) safeSummary.push(`Ansible playbook: ${playbookSlug}`);
    if (relativePath) safeSummary.push(`Allowlisted path: ${relativePath}`);
    if (buildNumber !== null) safeSummary.push(`Build: #${buildNumber}`);
    if (buildUrl) safeSummary.push('Jenkins build URL is available.');
    if (containerName) safeSummary.push(`Container: ${containerName}`);
    if (containerId) safeSummary.push(`Container ID: ${this._shortId(containerId)}`);
    if (namespace && targetName) safeSummary.push(`Workload: ${namespace}/${targetName}`);
    if (action) safeSummary.push(`Action: ${this._humanizeAction(action)}`);
    if (replicas !== null) safeSummary.push(`Replica target: ${replicas}`);
    if (restartedAt) safeSummary.push(`Restarted at: ${restartedAt}`);
    if (status) safeSummary.push(`Result: ${status}`);
    if (safeOutputSummary) safeSummary.push(`Output summary: ${safeOutputSummary.slice(0, 300)}`);
    if (completedAt) safeSummary.push(`Completed at: ${completedAt}`);
    if (safeSummary.length === 0) safeSummary.push('No additional safe provider details are available.');

    return {
      provider,
      operationType: type,
      targetKind:
        targetKind ??
        (workspaceSlug ? 'Terraform/OpenTofu workspace' : playbookSlug ? 'Ansible playbook' : namespace && targetName ? 'Deployment' : null),
      targetName: targetName ?? workspaceSlug ?? playbookSlug,
      namespace,
      containerName,
      containerId,
      jobName,
      buildNumber,
      buildUrl,
      action,
      replicas,
      safeSummary,
    };
  }

  private _lifecycle(operation: OperationActivityRecord): OperationDetailResponse['lifecycle'] {
    const terminal = this._isTerminalStatus(operation.status);
    const running = operation.status === OperationStatus.RUNNING;
    const pendingApproval = operation.status === OperationStatus.PENDING_APPROVAL;
    const policy = this._policyFromInput(this._toRecord(operation.input));
    const approvalRequired =
      policy.approvalRequired === true ||
      pendingApproval ||
      operation.approvedAt !== null ||
      operation.rejectedAt !== null ||
      operation.status === OperationStatus.REJECTED;
    const failed =
      operation.status === OperationStatus.FAILED ||
      operation.status === OperationStatus.REJECTED ||
      operation.status === OperationStatus.CANCELLED;

    return [
      {
        label: 'Requested',
        status: 'completed',
        timestamp: operation.createdAt.toISOString(),
        description: 'Operation request was recorded for this organization.',
      },
      {
        label: approvalRequired ? 'Approval' : 'Policy check',
        status:
          operation.status === OperationStatus.REJECTED
            ? 'failed'
            : pendingApproval
              ? 'active'
              : 'completed',
        timestamp:
          operation.approvedAt?.toISOString() ??
          operation.rejectedAt?.toISOString() ??
          (approvalRequired ? null : operation.createdAt.toISOString()),
        description:
          operation.status === OperationStatus.REJECTED
            ? 'Operation was rejected and will not execute.'
            : pendingApproval
              ? 'Operation is waiting for approval before worker execution.'
              : approvalRequired
                ? 'Operation approval was granted before worker execution.'
                : 'Local policy did not require approval for this operation.',
      },
      {
        label: 'Queued',
        status:
          pendingApproval || operation.status === OperationStatus.REJECTED ? 'pending' : 'completed',
        timestamp:
          pendingApproval || operation.status === OperationStatus.REJECTED
            ? null
            : operation.createdAt.toISOString(),
        description:
          pendingApproval || operation.status === OperationStatus.REJECTED
            ? 'Operation is not eligible for worker execution yet.'
            : 'Operation was eligible for worker execution.',
      },
      {
        label: 'Running',
        status: running ? 'active' : terminal ? 'completed' : 'pending',
        timestamp: this._isStartedStatus(operation.status) ? operation.updatedAt.toISOString() : null,
        description: running
          ? 'Worker execution is in progress.'
          : terminal
            ? 'Worker execution has finished.'
            : 'Worker execution has not started yet.',
      },
      {
        label: this._terminalLabel(operation.status),
        status: failed ? 'failed' : terminal ? 'completed' : 'pending',
        timestamp: terminal ? operation.updatedAt.toISOString() : null,
        description: terminal
          ? `Operation reached ${operation.status}.`
          : 'Operation has not reached a terminal state yet.',
      },
    ];
  }

  private _retryInfo(
    type: OperationType,
    input: Record<string, unknown>,
    result: Record<string, unknown>,
  ): OperationDetailResponse['retry'] {
    if (type === OperationType.JENKINS_BUILD_TRIGGER) {
      const jobName = this._stringField(result, 'jobName') ?? this._stringField(input, 'jobName');
      return jobName
        ? {
            supported: true,
            actionLabel: 'Re-run Jenkins build',
            confirmationTokenLabel: 'BUILD',
            reason: null,
          }
        : {
            supported: false,
            actionLabel: null,
            confirmationTokenLabel: null,
            reason: 'Jenkins job name is missing.',
          };
    }

    if (type === OperationType.DOCKER_CONTAINER_START) {
      return this._dockerRetryInfo(input, result, 'START', 'Retry Docker start');
    }
    if (type === OperationType.DOCKER_CONTAINER_STOP) {
      return this._dockerRetryInfo(input, result, 'STOP', 'Retry Docker stop');
    }
    if (type === OperationType.DOCKER_CONTAINER_RESTART) {
      return this._dockerRetryInfo(input, result, 'RESTART', 'Retry Docker restart');
    }

    if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) {
      const namespace = this._stringField(result, 'namespace') ?? this._stringField(input, 'namespace');
      const name = this._stringField(result, 'name') ?? this._stringField(input, 'name');
      const replicas = this._numberField(result, 'replicas') ?? this._numberField(input, 'replicas');
      if (!namespace || !name) {
        return {
          supported: false,
          actionLabel: null,
          confirmationTokenLabel: null,
          reason: 'Deployment target is missing.',
        };
      }
      if (replicas === null) {
        return {
          supported: false,
          actionLabel: null,
          confirmationTokenLabel: null,
          reason: 'Replica target missing; retry from Kubernetes control page.',
        };
      }
      return {
        supported: true,
        actionLabel: 'Retry Kubernetes scale',
        confirmationTokenLabel: 'SCALE',
        reason: null,
      };
    }

    if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) {
      const namespace = this._stringField(result, 'namespace') ?? this._stringField(input, 'namespace');
      const name = this._stringField(result, 'name') ?? this._stringField(input, 'name');
      return namespace && name
        ? {
            supported: true,
            actionLabel: 'Retry rollout restart',
            confirmationTokenLabel: 'ROLLOUT',
            reason: null,
          }
        : {
            supported: false,
            actionLabel: null,
            confirmationTokenLabel: null,
            reason: 'Deployment target is missing.',
          };
    }

    return {
      supported: false,
      actionLabel: null,
      confirmationTokenLabel: null,
      reason: 'Recovery action is not available for this operation.',
    };
  }

  private _dockerRetryInfo(
    input: Record<string, unknown>,
    result: Record<string, unknown>,
    token: string,
    actionLabel: string,
  ): OperationDetailResponse['retry'] {
    const containerId =
      this._stringField(result, 'containerId') ?? this._stringField(input, 'containerId');
    return containerId
      ? {
          supported: true,
          actionLabel,
          confirmationTokenLabel: token,
          reason: null,
        }
      : {
          supported: false,
          actionLabel: null,
          confirmationTokenLabel: null,
          reason: 'Container target is missing.',
        };
  }

  private _stringField(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private _numberField(record: Record<string, unknown>, key: string): number | null {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private _shortId(value: string): string {
    return value.length > 12 ? value.slice(0, 12) : value;
  }

  private _humanizeAction(value: string): string {
    return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }

  private _terminalLabel(status: OperationStatus): string {
    if (status === OperationStatus.SUCCEEDED) return 'Succeeded';
    if (status === OperationStatus.FAILED) return 'Failed';
    if (status === OperationStatus.REJECTED) return 'Rejected';
    if (status === OperationStatus.CANCELLED) return 'Cancelled';
    return 'Completed';
  }

  private _governanceForOperation(
    type: OperationType,
    status: OperationStatus,
    approvedAt: Date | null,
    rejectedAt: Date | null,
    input: Record<string, unknown>,
  ): OperationActivityItem['governance'] {
    const policy = this._policyFromInput(input);
    const approvalStatus = this._approvalStatus(status, approvedAt, rejectedAt);
    const approvalRequired =
      policy.approvalRequired ?? approvalStatus !== OperationApprovalStatus.NOT_REQUIRED;

    if (type === OperationType.JENKINS_BUILD_TRIGGER) {
      return {
        riskLevel: policy.riskLevel ?? OperationRiskLevel.LOW,
        confirmationRequired: true,
        confirmationTokenLabel: policy.confirmationTokenLabel ?? 'BUILD',
        confirmationSatisfied: true,
        approvalRequired,
        approvalStatus,
        approvalReason: policy.approvalReason,
        policyName: policy.policyName,
        approvedAt: approvedAt?.toISOString() ?? null,
        rejectedAt: rejectedAt?.toISOString() ?? null,
      };
    }

    if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) {
      return this._confirmationGovernance(
        policy.confirmationTokenLabel ?? 'SCALE',
        policy.riskLevel ?? OperationRiskLevel.MEDIUM,
        approvalRequired,
        approvalStatus,
        policy,
        approvedAt,
        rejectedAt,
      );
    }

    if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) {
      return this._confirmationGovernance(
        policy.confirmationTokenLabel ?? 'ROLLOUT',
        policy.riskLevel ?? OperationRiskLevel.MEDIUM,
        approvalRequired,
        approvalStatus,
        policy,
        approvedAt,
        rejectedAt,
      );
    }

    if (type === OperationType.KUBERNETES_MANIFEST_APPLY) {
      return {
        riskLevel: policy.riskLevel ?? OperationRiskLevel.HIGH,
        confirmationRequired: true,
        confirmationTokenLabel: policy.confirmationTokenLabel ?? 'APPLY',
        confirmationSatisfied: true,
        approvalRequired,
        approvalStatus,
        approvalReason: policy.approvalReason,
        policyName: policy.policyName,
        approvedAt: approvedAt?.toISOString() ?? null,
        rejectedAt: rejectedAt?.toISOString() ?? null,
      };
    }

    if (type === OperationType.DOCKER_CONTAINER_START) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'START', policy.riskLevel ?? OperationRiskLevel.MEDIUM, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.DOCKER_CONTAINER_STOP) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'STOP', policy.riskLevel ?? OperationRiskLevel.MEDIUM, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.DOCKER_CONTAINER_RESTART) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'RESTART', policy.riskLevel ?? OperationRiskLevel.MEDIUM, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.TERRAFORM_VALIDATE) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'VALIDATE', policy.riskLevel ?? OperationRiskLevel.LOW, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.TERRAFORM_PLAN) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'PLAN', policy.riskLevel ?? OperationRiskLevel.LOW, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.TERRAFORM_APPLY) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'APPLY', policy.riskLevel ?? OperationRiskLevel.HIGH, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.ANSIBLE_SYNTAX_CHECK) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'SYNTAX', policy.riskLevel ?? OperationRiskLevel.LOW, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.ANSIBLE_CHECK) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'CHECK', policy.riskLevel ?? OperationRiskLevel.LOW, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.ANSIBLE_RUN) {
      return this._confirmationGovernance(policy.confirmationTokenLabel ?? 'RUN', policy.riskLevel ?? OperationRiskLevel.HIGH, approvalRequired, approvalStatus, policy, approvedAt, rejectedAt);
    }

    if (type === OperationType.GITHUB_WORKFLOW_DISPATCH) {
      return {
        riskLevel: policy.riskLevel ?? OperationRiskLevel.MEDIUM,
        confirmationRequired: true,
        confirmationTokenLabel: policy.confirmationTokenLabel ?? 'DISPATCH',
        confirmationSatisfied: true,
        approvalRequired,
        approvalStatus,
        approvalReason: policy.approvalReason,
        policyName: policy.policyName,
        approvedAt: approvedAt?.toISOString() ?? null,
        rejectedAt: rejectedAt?.toISOString() ?? null,
      };
    }

    if (type === OperationType.DEPLOYMENT_ROLLBACK) {
      return {
        riskLevel: policy.riskLevel ?? OperationRiskLevel.HIGH,
        confirmationRequired: true,
        confirmationTokenLabel: policy.confirmationTokenLabel ?? 'ROLLBACK',
        confirmationSatisfied: true,
        approvalRequired,
        approvalStatus,
        approvalReason: policy.approvalReason,
        policyName: policy.policyName,
        approvedAt: approvedAt?.toISOString() ?? null,
        rejectedAt: rejectedAt?.toISOString() ?? null,
      };
    }

    if (type === OperationType.AWS_DEPLOYMENT) {
      return {
        riskLevel: policy.riskLevel ?? OperationRiskLevel.HIGH,
        confirmationRequired: true,
        confirmationTokenLabel: policy.confirmationTokenLabel,
        confirmationSatisfied: false,
        approvalRequired,
        approvalStatus,
        approvalReason: policy.approvalReason,
        policyName: policy.policyName,
        approvedAt: approvedAt?.toISOString() ?? null,
        rejectedAt: rejectedAt?.toISOString() ?? null,
      };
    }

    return {
      riskLevel: policy.riskLevel ?? OperationRiskLevel.LOW,
      confirmationRequired: false,
      confirmationTokenLabel: policy.confirmationTokenLabel,
      confirmationSatisfied: false,
      approvalRequired,
      approvalStatus,
      approvalReason: policy.approvalReason,
      policyName: policy.policyName,
      approvedAt: approvedAt?.toISOString() ?? null,
      rejectedAt: rejectedAt?.toISOString() ?? null,
    };
  }

  private _confirmationGovernance(
    confirmationTokenLabel: string,
    riskLevel: OperationRiskLevel,
    approvalRequired: boolean,
    approvalStatus: OperationApprovalStatus,
    policy: SafePolicyMetadata,
    approvedAt: Date | null,
    rejectedAt: Date | null,
  ): OperationActivityItem['governance'] {
    return {
      riskLevel,
      confirmationRequired: true,
      confirmationTokenLabel,
      confirmationSatisfied: true,
      approvalRequired,
      approvalStatus,
      approvalReason: policy.approvalReason,
      policyName: policy.policyName,
      approvedAt: approvedAt?.toISOString() ?? null,
      rejectedAt: rejectedAt?.toISOString() ?? null,
    };
  }

  private _policyFromInput(input: Record<string, unknown>): SafePolicyMetadata {
    const policy = this._toRecord(input.policy);
    const riskLevel = this._stringField(policy, 'riskLevel');
    const approvalRequired = policy.approvalRequired;
    return {
      riskLevel:
        riskLevel === OperationRiskLevel.LOW ||
        riskLevel === OperationRiskLevel.MEDIUM ||
        riskLevel === OperationRiskLevel.HIGH
          ? riskLevel
          : null,
      confirmationTokenLabel: this._stringField(policy, 'confirmationTokenLabel'),
      approvalRequired: typeof approvalRequired === 'boolean' ? approvalRequired : null,
      approvalReason: this._stringField(policy, 'approvalReason'),
      policyName: this._stringField(policy, 'policyName'),
    };
  }

  private _approvalStatus(
    status: OperationStatus,
    approvedAt: Date | null,
    rejectedAt: Date | null,
  ): OperationApprovalStatus {
    if (rejectedAt || status === OperationStatus.REJECTED) return OperationApprovalStatus.REJECTED;
    if (approvedAt) return OperationApprovalStatus.APPROVED;
    if (status === OperationStatus.PENDING_APPROVAL) return OperationApprovalStatus.PENDING;
    return OperationApprovalStatus.NOT_REQUIRED;
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
