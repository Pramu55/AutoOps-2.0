import { prisma } from '@autoops/database';
import {
  ResourceEdgeType,
  ResourceKind,
  ResourceProvider,
  type ResourceGraphFilters,
  type ResourceGraphListResponse,
  type ResourceGraphNeighborResponse,
  type ResourceGraphReadinessResponse,
  type ResourceNodeDetail,
  type ResourceNodeSummary,
} from '@autoops/types';
import {
  buildAutoOpsDeploymentUrn,
  buildAutoOpsEnvironmentUrn,
  buildAutoOpsOperationUrn,
  buildAutoOpsOrganizationUrn,
  buildAutoOpsProjectUrn,
  buildDockerContainerUrn,
  buildDockerEngineUrn,
  buildDockerImageUrn,
  buildDockerNetworkUrn,
  buildDockerVolumeUrn,
  buildJenkinsBuildUrn,
  buildJenkinsInstanceUrn,
  buildJenkinsJobUrn,
  buildKubernetesClusterUrn,
  buildKubernetesDeploymentUrn,
  buildKubernetesNamespaceUrn,
  buildKubernetesNodeUrn,
  buildKubernetesPodUrn,
  buildKubernetesServiceUrn,
} from '@autoops/utils';
import { BadRequestError, NotFoundError } from '@autoops/utils';
import { Prisma, type ResourceEdge } from '@prisma/client';
import { mapResourceEdgeSummary, mapResourceNodeDetail, mapResourceNodeSummary, sanitizeResourceMetadata } from './resource-graph.mapper.js';

type ResourceNodeInput = {
  urn: string;
  provider: ResourceProvider;
  kind: ResourceKind;
  name: string;
  displayName: string;
  externalId?: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  deploymentId?: string | null;
  operationId?: string | null;
  metadata?: Record<string, unknown>;
  labels?: Record<string, unknown> | null;
  discoverySource?: string | null;
  healthStatus?: string | null;
};

type ResourceEdgeInput = {
  sourceNodeId: string;
  targetNodeId: string;
  type: ResourceEdgeType;
  metadata?: Record<string, unknown>;
  discoverySource?: string | null;
};

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export class ResourceGraphService {
  async upsertResourceNode(organizationId: string, input: ResourceNodeInput): Promise<ResourceNodeSummary> {
    const now = new Date();
    const node = await prisma.resourceNode.upsert({
      where: {
        organizationId_urn: {
          organizationId,
          urn: input.urn,
        },
      },
      create: this._nodeCreateData(organizationId, input, now),
      update: {
        provider: input.provider,
        kind: input.kind,
        name: input.name,
        displayName: input.displayName,
        externalId: input.externalId ?? null,
        projectId: input.projectId ?? null,
        environmentId: input.environmentId ?? null,
        deploymentId: input.deploymentId ?? null,
        operationId: input.operationId ?? null,
        metadata: sanitizeResourceMetadata(input.metadata ?? {}),
        labels: input.labels ? sanitizeResourceMetadata(input.labels) : Prisma.JsonNull,
        discoverySource: input.discoverySource ?? null,
        healthStatus: input.healthStatus ?? null,
        lastSeenAt: now,
        archivedAt: null,
      },
    });

    return mapResourceNodeSummary(node);
  }

  async upsertResourceNodes(organizationId: string, inputs: ResourceNodeInput[]): Promise<ResourceNodeSummary[]> {
    const results: ResourceNodeSummary[] = [];
    for (const input of inputs) {
      results.push(await this.upsertResourceNode(organizationId, input));
    }
    return results;
  }

  async upsertResourceEdge(organizationId: string, input: ResourceEdgeInput): Promise<ResourceEdge> {
    if (input.sourceNodeId === input.targetNodeId) {
      throw new BadRequestError('Resource edge cannot point to the same node.');
    }

    const [source, target] = await Promise.all([
      prisma.resourceNode.findFirst({ where: { id: input.sourceNodeId, organizationId } }),
      prisma.resourceNode.findFirst({ where: { id: input.targetNodeId, organizationId } }),
    ]);
    if (!source || !target) {
      throw new NotFoundError('Resource node');
    }

    const now = new Date();
    return prisma.resourceEdge.upsert({
      where: {
        organizationId_sourceNodeId_targetNodeId_type: {
          organizationId,
          sourceNodeId: input.sourceNodeId,
          targetNodeId: input.targetNodeId,
          type: input.type,
        },
      },
      create: {
        organizationId,
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        type: input.type,
        metadata: sanitizeResourceMetadata(input.metadata ?? {}),
        discoverySource: input.discoverySource ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        metadata: sanitizeResourceMetadata(input.metadata ?? {}),
        discoverySource: input.discoverySource ?? null,
        lastSeenAt: now,
        archivedAt: null,
      },
    });
  }

  async upsertResourceEdges(organizationId: string, inputs: ResourceEdgeInput[]): Promise<ResourceEdge[]> {
    const results: ResourceEdge[] = [];
    for (const input of inputs) {
      results.push(await this.upsertResourceEdge(organizationId, input));
    }
    return results;
  }

  async listResourceNodes(organizationId: string, filters: ResourceGraphFilters): Promise<ResourceGraphListResponse> {
    const limit = filters.limit ?? 50;
    const where = this._filterWhere(organizationId, filters);
    const items = await prisma.resourceNode.findMany({
      where,
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
    const total = await prisma.resourceNode.count({ where });
    const page = items.slice(0, limit);
    return {
      items: page.map(mapResourceNodeSummary),
      nextCursor: items.length > limit ? items[limit]?.id ?? null : null,
      total,
    };
  }

  async getResourceNode(organizationId: string, resourceId: string): Promise<ResourceNodeDetail> {
    const node = await prisma.resourceNode.findFirst({ where: { id: resourceId, organizationId } });
    if (!node) throw new NotFoundError('Resource');
    const [incomingEdgeCount, outgoingEdgeCount] = await Promise.all([
      prisma.resourceEdge.count({ where: { organizationId, targetNodeId: node.id, archivedAt: null } }),
      prisma.resourceEdge.count({ where: { organizationId, sourceNodeId: node.id, archivedAt: null } }),
    ]);
    return mapResourceNodeDetail(node, { incomingEdgeCount, outgoingEdgeCount });
  }

  async getResourceNeighbors(organizationId: string, resourceId: string): Promise<ResourceGraphNeighborResponse> {
    const resource = await this.getResourceNode(organizationId, resourceId);
    const [incoming, outgoing] = await Promise.all([
      prisma.resourceEdge.findMany({
        where: { organizationId, targetNodeId: resourceId, archivedAt: null },
        include: { sourceNode: true, targetNode: true },
        orderBy: { lastSeenAt: 'desc' },
        take: 50,
      }),
      prisma.resourceEdge.findMany({
        where: { organizationId, sourceNodeId: resourceId, archivedAt: null },
        include: { sourceNode: true, targetNode: true },
        orderBy: { lastSeenAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      resource,
      incoming: incoming.map(mapResourceEdgeSummary),
      outgoing: outgoing.map(mapResourceEdgeSummary),
    };
  }

  async getResourceGraphReadiness(organizationId: string): Promise<ResourceGraphReadinessResponse> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const [totalResources, totalEdges, staleCount, archivedCount, latest, grouped] = await Promise.all([
      prisma.resourceNode.count({ where: { organizationId, archivedAt: null } }),
      prisma.resourceEdge.count({ where: { organizationId, archivedAt: null } }),
      prisma.resourceNode.count({ where: { organizationId, archivedAt: null, lastSeenAt: { lt: cutoff } } }),
      prisma.resourceNode.count({ where: { organizationId, archivedAt: { not: null } } }),
      prisma.resourceNode.findFirst({ where: { organizationId }, orderBy: { lastSeenAt: 'desc' } }),
      prisma.resourceNode.groupBy({
        by: ['provider'],
        where: { organizationId, archivedAt: null },
        _count: { provider: true },
      }),
    ]);
    const providerCounts = Object.fromEntries(
      Object.values(ResourceProvider).map((provider) => [provider, 0]),
    ) as ResourceGraphReadinessResponse['providerCounts'];
    for (const row of grouped) {
      providerCounts[row.provider] = row._count.provider;
    }
    return {
      status: totalResources === 0 ? 'EMPTY' : staleCount > 0 ? 'DEGRADED' : 'READY',
      totalResources,
      totalEdges,
      providerCounts,
      staleCount,
      archivedCount,
      lastSeenAt: latest?.lastSeenAt.toISOString() ?? null,
      checkedAt: new Date().toISOString(),
    };
  }

  async archiveStaleResources(organizationId: string, provider: ResourceProvider, olderThan: Date): Promise<number> {
    const result = await prisma.resourceNode.updateMany({
      where: { organizationId, provider, archivedAt: null, lastSeenAt: { lt: olderThan } },
      data: { archivedAt: new Date() },
    });
    return result.count;
  }

  async registerAutoOpsOrganizationNode(organizationId: string, name: string): Promise<ResourceNodeSummary> {
    return this.upsertResourceNode(organizationId, {
      urn: buildAutoOpsOrganizationUrn(),
      provider: ResourceProvider.AUTOOPS,
      kind: ResourceKind.ORGANIZATION,
      name: 'current',
      displayName: name,
      discoverySource: 'autoops',
    });
  }

  async registerAutoOpsProjectNode(organizationId: string, project: { id: string; name: string; slug: string }): Promise<ResourceNodeSummary> {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    const orgNode = await this.registerAutoOpsOrganizationNode(organizationId, org?.name ?? 'Organization');
    const projectNode = await this.upsertResourceNode(organizationId, {
      urn: buildAutoOpsProjectUrn(project.id),
      provider: ResourceProvider.AUTOOPS,
      kind: ResourceKind.PROJECT,
      name: project.slug,
      displayName: project.name,
      externalId: project.id,
      projectId: project.id,
      discoverySource: 'autoops.project',
    });
    await this.upsertResourceEdge(organizationId, {
      sourceNodeId: orgNode.id,
      targetNodeId: projectNode.id,
      type: ResourceEdgeType.OWNS,
      discoverySource: 'autoops.project',
    });
    return projectNode;
  }

  async registerAutoOpsEnvironmentNode(
    organizationId: string,
    environment: { id: string; name: string; slug: string; projectId: string },
  ): Promise<ResourceNodeSummary> {
    const project = await prisma.project.findFirst({ where: { id: environment.projectId, organizationId } });
    if (!project) throw new NotFoundError('Project');
    const projectNode = await this.registerAutoOpsProjectNode(organizationId, project);
    const environmentNode = await this.upsertResourceNode(organizationId, {
      urn: buildAutoOpsEnvironmentUrn(environment.id),
      provider: ResourceProvider.AUTOOPS,
      kind: ResourceKind.ENVIRONMENT,
      name: environment.slug,
      displayName: environment.name,
      externalId: environment.id,
      projectId: environment.projectId,
      environmentId: environment.id,
      discoverySource: 'autoops.environment',
    });
    await this.upsertResourceEdge(organizationId, {
      sourceNodeId: projectNode.id,
      targetNodeId: environmentNode.id,
      type: ResourceEdgeType.CONTAINS,
      discoverySource: 'autoops.environment',
    });
    return environmentNode;
  }

  async registerAutoOpsDeploymentNode(
    organizationId: string,
    deployment: { id: string; projectId: string; environmentId: string; status: string; imageTag?: string | null },
  ): Promise<ResourceNodeSummary> {
    const environment = await prisma.environment.findFirst({
      where: { id: deployment.environmentId, project: { organizationId } },
    });
    if (!environment) throw new NotFoundError('Environment');
    const environmentNode = await this.registerAutoOpsEnvironmentNode(organizationId, environment);
    const deploymentNode = await this.upsertResourceNode(organizationId, {
      urn: buildAutoOpsDeploymentUrn(deployment.id),
      provider: ResourceProvider.AUTOOPS,
      kind: ResourceKind.DEPLOYMENT,
      name: deployment.id,
      displayName: `Deployment ${deployment.id.slice(0, 8)}`,
      externalId: deployment.id,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      deploymentId: deployment.id,
      healthStatus: deployment.status,
      metadata: { status: deployment.status, imageTag: deployment.imageTag ?? null },
      discoverySource: 'autoops.deployment',
    });
    await this.upsertResourceEdge(organizationId, {
      sourceNodeId: environmentNode.id,
      targetNodeId: deploymentNode.id,
      type: ResourceEdgeType.CONTAINS,
      discoverySource: 'autoops.deployment',
    });
    return deploymentNode;
  }

  async registerAutoOpsOperationNode(
    organizationId: string,
    operation: { id: string; provider: string; operationType: string; status: string; projectId?: string | null; environmentId?: string | null },
  ): Promise<ResourceNodeSummary> {
    return this.upsertResourceNode(organizationId, {
      urn: buildAutoOpsOperationUrn(operation.id),
      provider: ResourceProvider.AUTOOPS,
      kind: ResourceKind.OPERATION,
      name: operation.id,
      displayName: `${operation.provider} ${operation.operationType}`,
      externalId: operation.id,
      operationId: operation.id,
      projectId: operation.projectId ?? null,
      environmentId: operation.environmentId ?? null,
      healthStatus: operation.status,
      metadata: { provider: operation.provider, operationType: operation.operationType, status: operation.status },
      discoverySource: 'autoops.operation',
    });
  }

  async registerJenkinsInventory(
    organizationId: string,
    input: {
      instanceSlug?: string;
      jobs?: Array<{ name: string; fullName?: string; status?: string; buildable?: boolean; disabled?: boolean }>;
      builds?: Array<{ jobName: string; buildNumber: number; result: string | null; building: boolean; duration: number | null; timestamp: string | null }>;
    },
  ): Promise<void> {
    const instanceSlug = input.instanceSlug ?? 'local';
    const instance = await this.upsertResourceNode(organizationId, {
      urn: buildJenkinsInstanceUrn(instanceSlug),
      provider: ResourceProvider.JENKINS,
      kind: ResourceKind.JENKINS_INSTANCE,
      name: instanceSlug,
      displayName: `Jenkins ${instanceSlug}`,
      discoverySource: 'jenkins',
    });
    for (const job of input.jobs ?? []) {
      const jobNode = await this.upsertResourceNode(organizationId, {
        urn: buildJenkinsJobUrn(instanceSlug, job.fullName ?? job.name),
        provider: ResourceProvider.JENKINS,
        kind: ResourceKind.JENKINS_JOB,
        name: job.fullName ?? job.name,
        displayName: job.fullName ?? job.name,
        healthStatus: job.status,
        metadata: { buildable: job.buildable ?? null, disabled: job.disabled ?? null },
        discoverySource: 'jenkins.jobs',
      });
      await this.upsertResourceEdge(organizationId, {
        sourceNodeId: instance.id,
        targetNodeId: jobNode.id,
        type: ResourceEdgeType.CONTAINS,
        discoverySource: 'jenkins.jobs',
      });
    }
    for (const build of input.builds ?? []) {
      const jobNode = await this.upsertResourceNode(organizationId, {
        urn: buildJenkinsJobUrn(instanceSlug, build.jobName),
        provider: ResourceProvider.JENKINS,
        kind: ResourceKind.JENKINS_JOB,
        name: build.jobName,
        displayName: build.jobName,
        discoverySource: 'jenkins.builds',
      });
      const buildNode = await this.upsertResourceNode(organizationId, {
        urn: buildJenkinsBuildUrn(instanceSlug, build.jobName, build.buildNumber),
        provider: ResourceProvider.JENKINS,
        kind: ResourceKind.JENKINS_BUILD,
        name: String(build.buildNumber),
        displayName: `${build.jobName} #${build.buildNumber}`,
        healthStatus: build.result ?? (build.building ? 'BUILDING' : null),
        metadata: { number: build.buildNumber, result: build.result, building: build.building, durationMs: build.duration, timestamp: build.timestamp },
        discoverySource: 'jenkins.builds',
      });
      await this.upsertResourceEdge(organizationId, {
        sourceNodeId: jobNode.id,
        targetNodeId: buildNode.id,
        type: ResourceEdgeType.BUILDS,
        discoverySource: 'jenkins.builds',
      });
    }
  }

  async registerDockerInventory(
    organizationId: string,
    input: {
      engineSlug?: string;
      containers?: Array<{ id: string; name: string; image: string; imageId: string | null; state: string; status: string; health: string | null }>;
      images?: Array<{ id: string; repoTags: string[]; size: number; createdAt: string | null }>;
      networks?: Array<{ id: string; name: string; driver: string; scope: string }>;
      volumes?: Array<{ name: string; driver: string; createdAt: string | null }>;
    },
  ): Promise<void> {
    const engineSlug = input.engineSlug ?? 'local';
    const engine = await this.upsertResourceNode(organizationId, {
      urn: buildDockerEngineUrn(engineSlug),
      provider: ResourceProvider.DOCKER,
      kind: ResourceKind.DOCKER_ENGINE,
      name: engineSlug,
      displayName: `Docker ${engineSlug}`,
      discoverySource: 'docker',
    });
    const imageNodes = new Map<string, ResourceNodeSummary>();
    for (const image of input.images ?? []) {
      const name = image.repoTags[0] ?? image.id;
      const imageNode = await this.upsertResourceNode(organizationId, {
        urn: buildDockerImageUrn(engineSlug, name),
        provider: ResourceProvider.DOCKER,
        kind: ResourceKind.DOCKER_IMAGE,
        name,
        displayName: name,
        externalId: image.id,
        metadata: { size: image.size, createdAt: image.createdAt, repoTagCount: image.repoTags.length },
        discoverySource: 'docker.images',
      });
      imageNodes.set(name, imageNode);
      imageNodes.set(image.id, imageNode);
      await this.upsertResourceEdge(organizationId, { sourceNodeId: engine.id, targetNodeId: imageNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'docker.images' });
    }
    for (const container of input.containers ?? []) {
      const containerNode = await this.upsertResourceNode(organizationId, {
        urn: buildDockerContainerUrn(engineSlug, container.name || container.id),
        provider: ResourceProvider.DOCKER,
        kind: ResourceKind.DOCKER_CONTAINER,
        name: container.name || container.id,
        displayName: container.name || container.id,
        externalId: container.id,
        healthStatus: container.health ?? container.state,
        metadata: { state: container.state, status: container.status, imageName: container.image },
        discoverySource: 'docker.containers',
      });
      await this.upsertResourceEdge(organizationId, { sourceNodeId: engine.id, targetNodeId: containerNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'docker.containers' });
      const imageNode = imageNodes.get(container.image) ?? imageNodes.get(container.imageId ?? '');
      if (imageNode) {
        await this.upsertResourceEdge(organizationId, { sourceNodeId: containerNode.id, targetNodeId: imageNode.id, type: ResourceEdgeType.USES_IMAGE, discoverySource: 'docker.containers' });
      }
    }
    for (const network of input.networks ?? []) {
      const networkNode = await this.upsertResourceNode(organizationId, {
        urn: buildDockerNetworkUrn(engineSlug, network.name || network.id),
        provider: ResourceProvider.DOCKER,
        kind: ResourceKind.DOCKER_NETWORK,
        name: network.name || network.id,
        displayName: network.name || network.id,
        externalId: network.id,
        metadata: { driver: network.driver, scope: network.scope },
        discoverySource: 'docker.networks',
      });
      await this.upsertResourceEdge(organizationId, { sourceNodeId: engine.id, targetNodeId: networkNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'docker.networks' });
    }
    for (const volume of input.volumes ?? []) {
      const volumeNode = await this.upsertResourceNode(organizationId, {
        urn: buildDockerVolumeUrn(engineSlug, volume.name),
        provider: ResourceProvider.DOCKER,
        kind: ResourceKind.DOCKER_VOLUME,
        name: volume.name,
        displayName: volume.name,
        metadata: { driver: volume.driver, createdAt: volume.createdAt },
        discoverySource: 'docker.volumes',
      });
      await this.upsertResourceEdge(organizationId, { sourceNodeId: engine.id, targetNodeId: volumeNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'docker.volumes' });
    }
  }

  async registerKubernetesInventory(
    organizationId: string,
    input: {
      clusterSlug?: string;
      namespaces?: Array<{ name: string; status?: string; podCount?: number; serviceCount?: number; workloadCount?: number }>;
      nodes?: Array<{ name: string; ready: boolean; roles: string[]; kubeletVersion?: string }>;
      workloads?: Array<{ namespace: string; name: string; kind: string; desired: number; ready: number; status: string; containerImages: string[] }>;
      pods?: Array<{ namespace: string; name: string; phase: string; readyContainers: number; totalContainers: number; restarts: number; nodeName?: string; ownerKind?: string; ownerName?: string }>;
      services?: Array<{ namespace: string; name: string; type: string; status: string; selector?: Record<string, string> }>;
    },
  ): Promise<void> {
    const clusterSlug = input.clusterSlug ?? 'docker-desktop';
    const cluster = await this.upsertResourceNode(organizationId, {
      urn: buildKubernetesClusterUrn(clusterSlug),
      provider: ResourceProvider.KUBERNETES,
      kind: ResourceKind.KUBERNETES_CLUSTER,
      name: clusterSlug,
      displayName: `Kubernetes ${clusterSlug}`,
      discoverySource: 'kubernetes',
    });
    const namespaceNodes = new Map<string, ResourceNodeSummary>();
    for (const namespace of input.namespaces ?? []) {
      const namespaceNode = await this.upsertResourceNode(organizationId, {
        urn: buildKubernetesNamespaceUrn(clusterSlug, namespace.name),
        provider: ResourceProvider.KUBERNETES,
        kind: ResourceKind.KUBERNETES_NAMESPACE,
        name: namespace.name,
        displayName: namespace.name,
        healthStatus: namespace.status ?? null,
        metadata: { podCount: namespace.podCount ?? null, serviceCount: namespace.serviceCount ?? null, workloadCount: namespace.workloadCount ?? null },
        discoverySource: 'kubernetes.namespaces',
      });
      namespaceNodes.set(namespace.name, namespaceNode);
      await this.upsertResourceEdge(organizationId, { sourceNodeId: cluster.id, targetNodeId: namespaceNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'kubernetes.namespaces' });
    }
    for (const node of input.nodes ?? []) {
      const nodeNode = await this.upsertResourceNode(organizationId, {
        urn: buildKubernetesNodeUrn(clusterSlug, node.name),
        provider: ResourceProvider.KUBERNETES,
        kind: ResourceKind.KUBERNETES_NODE,
        name: node.name,
        displayName: node.name,
        healthStatus: node.ready ? 'READY' : 'NOT_READY',
        metadata: { roles: node.roles.join(','), kubeletVersion: node.kubeletVersion ?? null },
        discoverySource: 'kubernetes.nodes',
      });
      await this.upsertResourceEdge(organizationId, { sourceNodeId: cluster.id, targetNodeId: nodeNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'kubernetes.nodes' });
    }
    for (const workload of input.workloads ?? []) {
      const namespaceNode = namespaceNodes.get(workload.namespace) ?? await this.upsertResourceNode(organizationId, {
        urn: buildKubernetesNamespaceUrn(clusterSlug, workload.namespace),
        provider: ResourceProvider.KUBERNETES,
        kind: ResourceKind.KUBERNETES_NAMESPACE,
        name: workload.namespace,
        displayName: workload.namespace,
        discoverySource: 'kubernetes.workloads',
      });
      const workloadNode = await this.upsertResourceNode(organizationId, {
        urn: buildKubernetesDeploymentUrn(clusterSlug, workload.namespace, workload.name),
        provider: ResourceProvider.KUBERNETES,
        kind: ResourceKind.KUBERNETES_DEPLOYMENT,
        name: workload.name,
        displayName: `${workload.namespace}/${workload.name}`,
        healthStatus: workload.status,
        metadata: { kind: workload.kind, desired: workload.desired, ready: workload.ready, containerCount: workload.containerImages.length },
        discoverySource: 'kubernetes.workloads',
      });
      await this.upsertResourceEdge(organizationId, { sourceNodeId: namespaceNode.id, targetNodeId: workloadNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'kubernetes.workloads' });
    }
    for (const pod of input.pods ?? []) {
      const namespaceNode = namespaceNodes.get(pod.namespace);
      const podNode = await this.upsertResourceNode(organizationId, {
        urn: buildKubernetesPodUrn(clusterSlug, pod.namespace, pod.name),
        provider: ResourceProvider.KUBERNETES,
        kind: ResourceKind.KUBERNETES_POD,
        name: pod.name,
        displayName: `${pod.namespace}/${pod.name}`,
        healthStatus: pod.phase,
        metadata: { phase: pod.phase, restartCount: pod.restarts, ready: `${pod.readyContainers}/${pod.totalContainers}`, nodeName: pod.nodeName ?? null, ownerKind: pod.ownerKind ?? null, ownerName: pod.ownerName ?? null },
        discoverySource: 'kubernetes.pods',
      });
      if (namespaceNode) await this.upsertResourceEdge(organizationId, { sourceNodeId: namespaceNode.id, targetNodeId: podNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'kubernetes.pods' });
    }
    for (const service of input.services ?? []) {
      const namespaceNode = namespaceNodes.get(service.namespace);
      const serviceNode = await this.upsertResourceNode(organizationId, {
        urn: buildKubernetesServiceUrn(clusterSlug, service.namespace, service.name),
        provider: ResourceProvider.KUBERNETES,
        kind: ResourceKind.KUBERNETES_SERVICE,
        name: service.name,
        displayName: `${service.namespace}/${service.name}`,
        healthStatus: service.status,
        metadata: { type: service.type, selectorCount: service.selector ? Object.keys(service.selector).length : 0 },
        discoverySource: 'kubernetes.services',
      });
      if (namespaceNode) await this.upsertResourceEdge(organizationId, { sourceNodeId: namespaceNode.id, targetNodeId: serviceNode.id, type: ResourceEdgeType.CONTAINS, discoverySource: 'kubernetes.services' });
    }
  }

  private _nodeCreateData(organizationId: string, input: ResourceNodeInput, now: Date): Prisma.ResourceNodeCreateInput {
    return {
      organization: { connect: { id: organizationId } },
      urn: input.urn,
      provider: input.provider,
      kind: input.kind,
      name: input.name,
      displayName: input.displayName,
      externalId: input.externalId ?? null,
      projectId: input.projectId ?? null,
      environmentId: input.environmentId ?? null,
      deploymentId: input.deploymentId ?? null,
      operationId: input.operationId ?? null,
      metadata: sanitizeResourceMetadata(input.metadata ?? {}),
      labels: input.labels ? sanitizeResourceMetadata(input.labels) : Prisma.JsonNull,
      discoverySource: input.discoverySource ?? null,
      healthStatus: input.healthStatus ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    };
  }

  private _filterWhere(organizationId: string, filters: ResourceGraphFilters): Prisma.ResourceNodeWhereInput {
    const where: Prisma.ResourceNodeWhereInput = { organizationId };
    if (filters.provider) where.provider = filters.provider;
    if (filters.kind) where.kind = filters.kind;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.environmentId) where.environmentId = filters.environmentId;
    if (filters.deploymentId) where.deploymentId = filters.deploymentId;
    if (filters.archived === 'archived') where.archivedAt = { not: null };
    if (filters.archived === 'active' || !filters.archived) where.archivedAt = null;
    if (filters.search) {
      where.OR = [
        { urn: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
        { displayName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}

export const resourceGraphService = new ResourceGraphService();
