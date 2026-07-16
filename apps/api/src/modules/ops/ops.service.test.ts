import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaQueryRaw = vi.fn();
const projectFindMany = vi.fn();
const environmentCount = vi.fn();
const environmentFindMany = vi.fn();
const deploymentCount = vi.fn();
const deploymentGroupBy = vi.fn();
const deploymentFindMany = vi.fn();
const operationGroupBy = vi.fn();
const redisPing = vi.fn();
const deploymentQueueGetJobCounts = vi.fn();
const getOrganizationRole = vi.fn();
const canViewProviderInventoryMock = vi.fn();
const isProviderInventoryAccessEnabledForOrgMock = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    $queryRaw: prismaQueryRaw,
    project: {
      findMany: projectFindMany,
    },
    environment: {
      count: environmentCount,
      findMany: environmentFindMany,
    },
    deployment: {
      count: deploymentCount,
      groupBy: deploymentGroupBy,
      findMany: deploymentFindMany,
    },
    operation: {
      groupBy: operationGroupBy,
    },
  },
}));

vi.mock('../../lib/redis.js', () => ({
  redis: {
    ping: redisPing,
  },
}));

vi.mock('../deployments/deployment.queue.js', () => ({
  deploymentsQueue: {
    getJobCounts: deploymentQueueGetJobCounts,
  },
}));

vi.mock('../operations/operation.queue.js', () => ({
  operationsQueue: {
    getJobCounts: vi.fn(),
  },
}));

vi.mock('../operations/operation-authorization.service.js', () => ({
  operationAuthorizationService: {
    getOrganizationRole,
  },
}));

vi.mock('../integrations/integration-access.service.js', () => ({
  canViewProviderInventory: canViewProviderInventoryMock,
  isProviderInventoryAccessEnabledForOrg: isProviderInventoryAccessEnabledForOrgMock,
}));

vi.mock('../integrations/aws/aws.service.js', () => ({
  awsService: {
    getIdentity: vi.fn(),
  },
  mapAwsToProviderStatus: vi.fn(),
}));

vi.mock('../integrations/docker/docker.service.js', () => ({
  dockerService: {
    getStatus: vi.fn(),
  },
}));

vi.mock('../integrations/infrastructure/infrastructure.service.js', () => ({
  infrastructureService: {
    getStatus: vi.fn(),
  },
}));

vi.mock('../integrations/jenkins/jenkins.service.js', () => ({
  jenkinsService: {
    getStatus: vi.fn(),
  },
}));

vi.mock('../integrations/kubernetes/kubernetes.service.js', () => ({
  kubernetesService: {
    getStatus: vi.fn(),
  },
}));

vi.mock('../incidents/incident.service.js', () => ({
  incidentService: {},
}));

const { opsService } = await import('./ops.service.js');

describe('OpsService summary resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
    projectFindMany.mockResolvedValue(
      Array.from({ length: 13 }, (_, index) => ({ id: `project-${index + 1}` })),
    );
    environmentCount.mockResolvedValue(37);
    deploymentCount.mockResolvedValue(5);
    deploymentGroupBy.mockResolvedValue([]);
    deploymentFindMany.mockResolvedValue([]);
    operationGroupBy.mockResolvedValue([]);
    redisPing.mockResolvedValue('PONG');
    deploymentQueueGetJobCounts.mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    });
    getOrganizationRole.mockResolvedValue('MEMBER');
    canViewProviderInventoryMock.mockReturnValue(false);
    isProviderInventoryAccessEnabledForOrgMock.mockResolvedValue(false);
  });

  it('returns a complete tenant-scoped environment count without per-project fan-out', async () => {
    const summary = await opsService.getSummary('org-a', 'user-a');

    expect(summary.resources).toMatchObject({
      projects: 13,
      environments: 37,
      deployments: 5,
    });
    expect(environmentCount).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        project: {
          organizationId: 'org-a',
          archivedAt: null,
        },
      },
    });
    expect(environmentFindMany).not.toHaveBeenCalled();
  });
});
