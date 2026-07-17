import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceEdgeType, ResourceKind, ResourceProvider } from '@autoops/types';

const resourceNodeUpsert = vi.fn();
const resourceNodeFindFirst = vi.fn();
const resourceNodeFindMany = vi.fn();
const resourceNodeCount = vi.fn();
const resourceNodeGroupBy = vi.fn();
const resourceNodeUpdateMany = vi.fn();
const resourceEdgeUpsert = vi.fn();
const resourceEdgeFindMany = vi.fn();
const resourceEdgeCount = vi.fn();
const organizationFindUnique = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    resourceNode: {
      upsert: resourceNodeUpsert,
      findFirst: resourceNodeFindFirst,
      findMany: resourceNodeFindMany,
      count: resourceNodeCount,
      groupBy: resourceNodeGroupBy,
      updateMany: resourceNodeUpdateMany,
    },
    resourceEdge: {
      upsert: resourceEdgeUpsert,
      findMany: resourceEdgeFindMany,
      count: resourceEdgeCount,
    },
    organization: { findUnique: organizationFindUnique },
    project: { findFirst: vi.fn() },
    environment: { findFirst: vi.fn() },
  },
}));

const { resourceGraphService } = await import('./resource-graph.service.js');

const now = new Date('2026-05-25T00:00:00.000Z');

function node(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-a',
    organizationId: 'org-a',
    urn: 'urn:autoops:docker:local:container/api',
    provider: ResourceProvider.DOCKER,
    kind: ResourceKind.DOCKER_CONTAINER,
    name: 'api',
    displayName: 'API',
    externalId: null,
    projectId: null,
    environmentId: null,
    deploymentId: null,
    operationId: null,
    metadata: {},
    labels: null,
    discoverySource: 'test',
    healthStatus: null,
    firstSeenAt: now,
    lastSeenAt: now,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ResourceGraphService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resourceNodeUpsert.mockResolvedValue(node());
    resourceNodeFindMany.mockResolvedValue([]);
    resourceNodeCount.mockResolvedValue(0);
    resourceNodeGroupBy.mockResolvedValue([]);
    resourceNodeUpdateMany.mockResolvedValue({ count: 0 });
    resourceEdgeFindMany.mockResolvedValue([]);
    resourceEdgeCount.mockResolvedValue(0);
  });

  it('creates or updates a node by organization and URN', async () => {
    await resourceGraphService.upsertResourceNode('org-a', {
      urn: 'urn:autoops:docker:local:container/api',
      provider: ResourceProvider.DOCKER,
      kind: ResourceKind.DOCKER_CONTAINER,
      name: 'api',
      displayName: 'API',
      metadata: { state: 'running' },
    });

    expect(resourceNodeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_urn: {
            organizationId: 'org-a',
            urn: 'urn:autoops:docker:local:container/api',
          },
        },
      }),
    );
  });

  it('allows the same URN in different organizations through the unique key', async () => {
    await resourceGraphService.upsertResourceNode('org-b', {
      urn: 'urn:autoops:docker:local:container/api',
      provider: ResourceProvider.DOCKER,
      kind: ResourceKind.DOCKER_CONTAINER,
      name: 'api',
      displayName: 'API',
    });

    expect(resourceNodeUpsert.mock.calls[0]![0].where.organizationId_urn.organizationId).toBe('org-b');
  });

  it('lists only current organization resources with filters', async () => {
    resourceNodeFindMany.mockResolvedValue([node()]);
    resourceNodeCount.mockResolvedValue(1);

    await resourceGraphService.listResourceNodes('org-a', {
      provider: ResourceProvider.DOCKER,
      kind: ResourceKind.DOCKER_CONTAINER,
      search: 'api',
      limit: 25,
      archived: 'active',
    });

    expect(resourceNodeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          provider: ResourceProvider.DOCKER,
          kind: ResourceKind.DOCKER_CONTAINER,
          archivedAt: null,
        }),
        take: 26,
      }),
    );
  });

  it('does not fetch a cross-org node by ID', async () => {
    resourceNodeFindFirst.mockResolvedValue(null);

    await expect(resourceGraphService.getResourceNode('org-b', 'node-a')).rejects.toThrow('Resource');
    expect(resourceNodeFindFirst).toHaveBeenCalledWith({ where: { id: 'node-a', organizationId: 'org-b' } });
  });

  it('redacts suspicious metadata before storing it', async () => {
    await resourceGraphService.upsertResourceNode('org-a', {
      urn: 'urn:autoops:jenkins:local:job/build',
      provider: ResourceProvider.JENKINS,
      kind: ResourceKind.JENKINS_JOB,
      name: 'build',
      displayName: 'Build',
      metadata: {
        apiToken: 'super-secret-token',
        description: 'x'.repeat(700),
        nested: { password: 'hidden' },
      },
    });

    const create = resourceNodeUpsert.mock.calls[0]![0].create;
    expect(create.metadata.apiToken).toBe('[REDACTED]');
    expect(create.metadata.description).toHaveLength(500);
    expect(create.metadata.nested).toBe('[object]');
  });

  it('upserts edges only when both nodes belong to the same organization', async () => {
    resourceNodeFindFirst.mockResolvedValueOnce(node({ id: 'source' })).mockResolvedValueOnce(node({ id: 'target' }));
    resourceEdgeUpsert.mockResolvedValue({ id: 'edge-a' });

    await resourceGraphService.upsertResourceEdge('org-a', {
      sourceNodeId: 'source',
      targetNodeId: 'target',
      type: ResourceEdgeType.CONTAINS,
    });

    expect(resourceNodeFindFirst).toHaveBeenNthCalledWith(1, { where: { id: 'source', organizationId: 'org-a' } });
    expect(resourceNodeFindFirst).toHaveBeenNthCalledWith(2, { where: { id: 'target', organizationId: 'org-a' } });
    expect(resourceEdgeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_sourceNodeId_targetNodeId_type: {
            organizationId: 'org-a',
            sourceNodeId: 'source',
            targetNodeId: 'target',
            type: ResourceEdgeType.CONTAINS,
          },
        },
      }),
    );
  });

  it('blocks cross-org edges by requiring both nodes in the authenticated organization', async () => {
    resourceNodeFindFirst.mockResolvedValueOnce(node({ id: 'source' })).mockResolvedValueOnce(null);

    await expect(
      resourceGraphService.upsertResourceEdge('org-a', {
        sourceNodeId: 'source',
        targetNodeId: 'other-org-target',
        type: ResourceEdgeType.CONTAINS,
      }),
    ).rejects.toThrow('Resource node');
  });

  it('returns neighbors scoped to the current organization', async () => {
    resourceNodeFindFirst.mockResolvedValue(node());
    resourceEdgeCount.mockResolvedValue(0);
    resourceEdgeFindMany.mockResolvedValue([]);

    await resourceGraphService.getResourceNeighbors('org-a', 'node-a');

    expect(resourceEdgeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a', targetNodeId: 'node-a', archivedAt: null } }),
    );
    expect(resourceEdgeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a', sourceNodeId: 'node-a', archivedAt: null } }),
    );
  });

  it('returns tenant-scoped readiness counts', async () => {
    resourceNodeCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    resourceEdgeCount.mockResolvedValueOnce(1);
    resourceNodeFindFirst.mockResolvedValueOnce(node());
    resourceNodeGroupBy.mockResolvedValueOnce([{ provider: ResourceProvider.DOCKER, _count: { provider: 2 } }]);

    const readiness = await resourceGraphService.getResourceGraphReadiness('org-a');

    expect(readiness.status).toBe('READY');
    expect(readiness.totalResources).toBe(2);
    expect(readiness.totalEdges).toBe(1);
    expect(readiness.providerCounts.DOCKER).toBe(2);
  });

  it('records Docker monitoring scope separately from discovery inventory', async () => {
    resourceNodeUpsert
      .mockResolvedValueOnce(node({ id: 'engine-node', kind: ResourceKind.DOCKER_ENGINE }))
      .mockResolvedValueOnce(node({ id: 'container-node', name: 'cloudshield-frontend-1' }));
    resourceNodeFindFirst
      .mockResolvedValueOnce(node({ id: 'engine-node', kind: ResourceKind.DOCKER_ENGINE }))
      .mockResolvedValueOnce(node({ id: 'container-node', name: 'cloudshield-frontend-1' }));
    resourceEdgeUpsert.mockResolvedValue({ id: 'edge-docker-container' });

    await resourceGraphService.registerDockerInventory('org-a', {
      containers: [
        {
          id: 'cloudshield-container',
          name: 'cloudshield-frontend-1',
          image: 'cloudshield:test',
          imageId: null,
          state: 'exited',
          status: 'Exited (137) 1 hour ago',
          health: null,
          monitoringScope: 'unrelated',
          monitored: false,
          desiredState: 'running',
        },
      ],
    });

    expect(resourceNodeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: expect.objectContaining({
            monitoringScope: 'unrelated',
            monitored: false,
            desiredState: 'running',
          }),
        }),
      }),
    );
  });
});

