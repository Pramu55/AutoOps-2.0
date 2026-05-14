import * as k8s from '@kubernetes/client-node';
import { parseDocument } from 'yaml';
import {
  KubernetesConnectionStatus,
  KubernetesHealthState,
  OperationProvider,
  OperationType,
  type KubernetesApplyDryRunResult,
  type KubernetesApplyManifestInput,
  type KubernetesConditionSummary,
  type KubernetesListResponse,
  type KubernetesNamespace,
  type KubernetesNode,
  type KubernetesPod,
  type KubernetesRestartDeploymentInput,
  type KubernetesRolloutStatus,
  type KubernetesService as KubernetesServiceDto,
  type KubernetesStatus,
  type KubernetesSummary,
  type KubernetesWorkload,
  type Operation,
} from '@autoops/types';
import { AuditAction, prisma, type Prisma } from '@autoops/database';
import { BadRequestError, ExternalServiceError } from '@autoops/utils';
import { operationService } from '../../operations/operation.service.js';
import { kubernetesClientProvider, type KubernetesClientBundle } from './kubernetes.client.js';

const EMPTY_COUNTS: KubernetesSummary['counts'] = {
  namespaces: 0,
  nodes: 0,
  pods: 0,
  services: 0,
  deployments: 0,
  readyNodes: 0,
  runningPods: 0,
  pendingPods: 0,
  failedPods: 0,
};

const FORBIDDEN_MANIFEST_KINDS = new Set([
  'Secret',
  'ClusterRole',
  'ClusterRoleBinding',
  'Namespace',
]);

type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

export class KubernetesService {
  async getStatus(): Promise<KubernetesStatus> {
    try {
      const client = this._getClient();
      if (!client) return kubernetesClientProvider.notConfiguredStatus();

      const [version, nodes, namespaces] = await Promise.all([
        client.version.getCode({}),
        client.core.listNode({}),
        client.core.listNamespace({}),
      ]);

      const readyNodeCount = nodes.items.filter((node) => this._nodeReady(node)).length;
      return {
        status: KubernetesConnectionStatus.CONNECTED,
        ...kubernetesClientProvider.clusterInfo(client.kubeConfig),
        version: version.gitVersion,
        nodeCount: nodes.items.length,
        readyNodeCount,
        namespaceCount: namespaces.items.length,
        checkedAt: new Date().toISOString(),
        readOnly: true,
        message: 'Kubernetes API is connected in read-only discovery mode.',
      };
    } catch (error) {
      return this._connectionFailure(error);
    }
  }

  async getSummary(): Promise<KubernetesSummary> {
    try {
      const client = this._getClient();
      if (!client) {
        return this._emptySummary(kubernetesClientProvider.notConfiguredStatus());
      }

      const [
        version,
        namespaces,
        nodes,
        pods,
        services,
        deployments,
        statefulSets,
        daemonSets,
        replicaSets,
      ] = await Promise.all([
        client.version.getCode({}),
        client.core.listNamespace({}),
        client.core.listNode({}),
        client.core.listPodForAllNamespaces({}),
        client.core.listServiceForAllNamespaces({}),
        client.apps.listDeploymentForAllNamespaces({}),
        client.apps.listStatefulSetForAllNamespaces({}),
        client.apps.listDaemonSetForAllNamespaces({}),
        client.apps.listReplicaSetForAllNamespaces({}),
      ]);

      const readyNodes = nodes.items.filter((node) => this._nodeReady(node)).length;
      const podStats = this._podStats(pods.items);
      const serviceStats = this._serviceStats(services.items);
      const health = this._clusterHealth(nodes.items.length, readyNodes, podStats);
      const generatedAt = new Date().toISOString();

      return {
        status: KubernetesConnectionStatus.CONNECTED,
        checkedAt: generatedAt,
        generatedAt,
        cluster: {
          ...kubernetesClientProvider.clusterInfo(client.kubeConfig),
          version: version.gitVersion,
        },
        nodes: {
          total: nodes.items.length,
          ready: readyNodes,
          notReady: nodes.items.length - readyNodes,
        },
        namespaces: {
          total: namespaces.items.length,
        },
        pods: podStats,
        workloads: {
          deployments: deployments.items.length,
          statefulSets: statefulSets.items.length,
          daemonSets: daemonSets.items.length,
          replicaSets: replicaSets.items.length,
        },
        services: serviceStats,
        health,
        counts: {
          namespaces: namespaces.items.length,
          nodes: nodes.items.length,
          pods: pods.items.length,
          services: services.items.length,
          deployments: deployments.items.length,
          readyNodes,
          runningPods: podStats.running,
          pendingPods: podStats.pending,
          failedPods: podStats.failed,
        },
      };
    } catch (error) {
      return this._emptySummary(this._connectionFailure(error));
    }
  }

  async listNamespaces(): Promise<KubernetesListResponse<KubernetesNamespace>> {
    return this._list(async (client) => {
      const [namespaces, pods, services, deployments, statefulSets, daemonSets] = await Promise.all([
        client.core.listNamespace({}),
        client.core.listPodForAllNamespaces({}),
        client.core.listServiceForAllNamespaces({}),
        client.apps.listDeploymentForAllNamespaces({}),
        client.apps.listStatefulSetForAllNamespaces({}),
        client.apps.listDaemonSetForAllNamespaces({}),
      ]);

      return namespaces.items.map((namespace) => {
        const name = namespace.metadata?.name ?? 'unknown';
        return {
          name,
          status: namespace.status?.phase,
          createdAt: this._iso(namespace.metadata?.creationTimestamp),
          age: this._age(namespace.metadata?.creationTimestamp),
          annotationCount: Object.keys(namespace.metadata?.annotations ?? {}).length,
          podCount: pods.items.filter((pod) => pod.metadata?.namespace === name).length,
          serviceCount: services.items.filter((service) => service.metadata?.namespace === name).length,
          workloadCount:
            deployments.items.filter((item) => item.metadata?.namespace === name).length +
            statefulSets.items.filter((item) => item.metadata?.namespace === name).length +
            daemonSets.items.filter((item) => item.metadata?.namespace === name).length,
          labels: this._labels(namespace.metadata?.labels),
        };
      });
    });
  }

  async listWorkloads(): Promise<KubernetesListResponse<KubernetesWorkload>> {
    return this._list(async (client) => {
      const [deployments, statefulSets, daemonSets, replicaSets] = await Promise.all([
        client.apps.listDeploymentForAllNamespaces({}),
        client.apps.listStatefulSetForAllNamespaces({}),
        client.apps.listDaemonSetForAllNamespaces({}),
        client.apps.listReplicaSetForAllNamespaces({}),
      ]);

      return [
        ...deployments.items.map((deployment): KubernetesWorkload => {
          const desired = deployment.spec?.replicas ?? 0;
          const ready = deployment.status?.readyReplicas ?? 0;
          const available = deployment.status?.availableReplicas ?? 0;
          return {
            namespace: deployment.metadata?.namespace ?? 'default',
            name: deployment.metadata?.name ?? 'unknown',
            kind: 'Deployment',
            desired,
            ready,
            available,
            updated: deployment.status?.updatedReplicas ?? 0,
            status: this._workloadHealth(desired, ready, available),
            createdAt: this._iso(deployment.metadata?.creationTimestamp),
            age: this._age(deployment.metadata?.creationTimestamp),
            labels: this._labels(deployment.metadata?.labels),
            selector: this._labels(deployment.spec?.selector?.matchLabels),
            containerImages: this._deploymentImages(deployment),
            conditions: this._conditions(deployment.status?.conditions),
          };
        }),
        ...statefulSets.items.map((statefulSet): KubernetesWorkload => {
          const desired = statefulSet.spec?.replicas ?? 0;
          const ready = statefulSet.status?.readyReplicas ?? 0;
          return {
            namespace: statefulSet.metadata?.namespace ?? 'default',
            name: statefulSet.metadata?.name ?? 'unknown',
            kind: 'StatefulSet',
            desired,
            ready,
            available: ready,
            updated: statefulSet.status?.updatedReplicas ?? 0,
            status: this._workloadHealth(desired, ready, ready),
            createdAt: this._iso(statefulSet.metadata?.creationTimestamp),
            age: this._age(statefulSet.metadata?.creationTimestamp),
            labels: this._labels(statefulSet.metadata?.labels),
            selector: this._labels(statefulSet.spec?.selector?.matchLabels),
            containerImages: statefulSet.spec?.template.spec?.containers?.map((container) => container.image ?? 'unknown') ?? [],
            conditions: this._conditions(statefulSet.status?.conditions),
          };
        }),
        ...daemonSets.items.map((daemonSet): KubernetesWorkload => {
          const desired = daemonSet.status?.desiredNumberScheduled ?? 0;
          const ready = daemonSet.status?.numberReady ?? 0;
          const available = daemonSet.status?.numberAvailable ?? 0;
          return {
            namespace: daemonSet.metadata?.namespace ?? 'default',
            name: daemonSet.metadata?.name ?? 'unknown',
            kind: 'DaemonSet',
            desired,
            ready,
            available,
            updated: daemonSet.status?.updatedNumberScheduled ?? 0,
            status: this._workloadHealth(desired, ready, available),
            createdAt: this._iso(daemonSet.metadata?.creationTimestamp),
            age: this._age(daemonSet.metadata?.creationTimestamp),
            labels: this._labels(daemonSet.metadata?.labels),
            selector: this._labels(daemonSet.spec?.selector?.matchLabels),
            containerImages: daemonSet.spec?.template.spec?.containers?.map((container) => container.image ?? 'unknown') ?? [],
            conditions: this._conditions(daemonSet.status?.conditions),
          };
        }),
        ...replicaSets.items.map((replicaSet): KubernetesWorkload => {
          const desired = replicaSet.spec?.replicas ?? 0;
          const ready = replicaSet.status?.readyReplicas ?? 0;
          const available = replicaSet.status?.availableReplicas ?? 0;
          return {
            namespace: replicaSet.metadata?.namespace ?? 'default',
            name: replicaSet.metadata?.name ?? 'unknown',
            kind: 'ReplicaSet',
            desired,
            ready,
            available,
            updated: ready,
            status: this._workloadHealth(desired, ready, available),
            createdAt: this._iso(replicaSet.metadata?.creationTimestamp),
            age: this._age(replicaSet.metadata?.creationTimestamp),
            labels: this._labels(replicaSet.metadata?.labels),
            selector: this._labels(replicaSet.spec?.selector?.matchLabels),
            containerImages: replicaSet.spec?.template?.spec?.containers?.map((container) => container.image ?? 'unknown') ?? [],
            conditions: this._conditions(replicaSet.status?.conditions),
          };
        }),
      ];
    });
  }

  async listPods(): Promise<KubernetesListResponse<KubernetesPod>> {
    return this._list(async (client) => {
      const response = await client.core.listPodForAllNamespaces({});
      return response.items.map((pod) => this._toPod(pod));
    });
  }

  async listServices(): Promise<KubernetesListResponse<KubernetesServiceDto>> {
    return this._list(async (client) => {
      const response = await client.core.listServiceForAllNamespaces({});
      return response.items.map((service) => ({
        namespace: service.metadata?.namespace ?? 'default',
        name: service.metadata?.name ?? 'unknown',
        type: service.spec?.type ?? 'Unknown',
        clusterIP: service.spec?.clusterIP,
        externalIPs: service.spec?.externalIPs ?? [],
        loadBalancerIngress:
          service.status?.loadBalancer?.ingress
            ?.map((ingress) => ingress.ip ?? ingress.hostname)
            .filter((value): value is string => Boolean(value)) ?? [],
        ports:
          service.spec?.ports?.map((port) => ({
            name: port.name,
            protocol: port.protocol,
            port: port.port,
            targetPort: port.targetPort,
            nodePort: port.nodePort,
          })) ?? [],
        selector: this._labels(service.spec?.selector),
        createdAt: this._iso(service.metadata?.creationTimestamp),
        age: this._age(service.metadata?.creationTimestamp),
        status: service.spec?.clusterIP === 'None' ? 'Headless' : 'Active',
      }));
    });
  }

  async listNodes(): Promise<KubernetesListResponse<KubernetesNode>> {
    return this._list(async (client) => {
      const response = await client.core.listNode({});
      return response.items.map((node) => ({
        name: node.metadata?.name ?? 'unknown',
        ready: this._nodeReady(node),
        roles: this._nodeRoles(node.metadata?.labels),
        kubeletVersion: node.status?.nodeInfo?.kubeletVersion,
        containerRuntimeVersion: node.status?.nodeInfo?.containerRuntimeVersion,
        osImage: node.status?.nodeInfo?.osImage,
        architecture: node.status?.nodeInfo?.architecture,
        kernelVersion: node.status?.nodeInfo?.kernelVersion,
        internalIP: node.status?.addresses?.find((address) => address.type === 'InternalIP')?.address,
        externalIP: node.status?.addresses?.find((address) => address.type === 'ExternalIP')?.address,
        podCIDR: node.spec?.podCIDR,
        allocatable: this._quantityMap(node.status?.allocatable),
        capacity: this._quantityMap(node.status?.capacity),
        createdAt: this._iso(node.metadata?.creationTimestamp),
        age: this._age(node.metadata?.creationTimestamp),
        conditions: this._conditions(node.status?.conditions),
      }));
    });
  }

  async getRolloutStatus(namespace: string, name: string): Promise<KubernetesRolloutStatus> {
    try {
      const client = this._getRequiredClient();
      const deployment = await client.apps.readNamespacedDeployment({ namespace, name });
      const desired = deployment.spec?.replicas ?? 0;
      const updated = deployment.status?.updatedReplicas ?? 0;
      const ready = deployment.status?.readyReplicas ?? 0;
      const available = deployment.status?.availableReplicas ?? 0;
      const status = this._workloadHealth(desired, ready, available);
      return {
        namespace,
        name,
        desired,
        updated,
        ready,
        available,
        observedGeneration: deployment.status?.observedGeneration,
        status,
        message:
          status === KubernetesHealthState.HEALTHY
            ? 'Deployment rollout is healthy.'
            : 'Deployment rollout is not fully healthy.',
        conditions: this._conditions(deployment.status?.conditions),
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw this._providerError(error);
    }
  }

  async requestDeploymentRestart(
    namespace: string,
    name: string,
    organizationId: string,
    userId: string,
    role: string | undefined,
    input: KubernetesRestartDeploymentInput,
    auditContext: AuditContext,
  ): Promise<Operation> {
    const client = this._getRequiredClient();
    await client.apps.readNamespacedDeployment({ namespace, name });

    if (input.confirmationToken !== 'RESTART') {
      throw new BadRequestError('confirmationToken must be RESTART');
    }

    return operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        role,
        provider: OperationProvider.KUBERNETES,
        operationType: OperationType.KUBERNETES_DEPLOYMENT_RESTART,
        projectId: input.projectId,
        environmentId: input.environmentId,
        idempotencyKey: input.idempotencyKey ?? `k8s-restart-${namespace}-${name}-${Date.now()}`,
        confirmationToken: input.confirmationToken,
        input: {
          namespace,
          name,
          action: 'rollout_restart',
        },
      },
      auditContext,
    );
  }

  async applyManifest(
    organizationId: string,
    userId: string,
    role: string | undefined,
    input: KubernetesApplyManifestInput,
    auditContext: AuditContext,
  ): Promise<KubernetesApplyDryRunResult | Operation> {
    const manifest = this._parseManifest(input.manifest, input.namespace);
    this._validateManifest(manifest);

    if (input.dryRun !== false) {
      const result = await this._serverSideApply(manifest, true);
      await prisma.auditLog.create({
        data: {
          organizationId,
          actorId: userId,
          action: AuditAction.KUBERNETES_MANIFEST_DRY_RUN_REQUESTED,
          provider: OperationProvider.KUBERNETES,
          projectId: input.projectId ?? null,
          environmentId: input.environmentId ?? null,
          resourceType: 'kubernetes_manifest',
          resourceId: `${manifest.kind}/${manifest.metadata?.namespace ?? 'default'}/${manifest.metadata?.name}`,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: {
            dryRun: true,
            kind: manifest.kind,
            namespace: manifest.metadata?.namespace,
            name: manifest.metadata?.name,
          },
        },
      });

      return {
        dryRun: true,
        namespace: manifest.metadata?.namespace ?? 'default',
        kind: manifest.kind ?? 'Unknown',
        name: manifest.metadata?.name ?? 'unknown',
        apiVersion: manifest.apiVersion ?? 'v1',
        result: result as Record<string, unknown>,
        checkedAt: new Date().toISOString(),
      };
    }

    if (input.confirmationToken !== 'APPLY') {
      throw new BadRequestError('confirmationToken must be APPLY for real manifest apply');
    }

    return operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        role,
        provider: OperationProvider.KUBERNETES,
        operationType: OperationType.KUBERNETES_MANIFEST_APPLY,
        projectId: input.projectId,
        environmentId: input.environmentId,
        idempotencyKey:
          input.idempotencyKey ??
          `k8s-apply-${manifest.kind}-${manifest.metadata?.namespace ?? 'default'}-${manifest.metadata?.name}-${Date.now()}`,
        confirmationToken: input.confirmationToken,
          input: {
            manifest,
            dryRun: false,
          } as unknown as Prisma.InputJsonObject,
      },
      auditContext,
    );
  }

  private async _serverSideApply(
    manifest: k8s.KubernetesObject,
    dryRun: boolean,
  ): Promise<k8s.KubernetesObject> {
    try {
      const client = this._getRequiredClient();
      return client.object.patch(
        manifest,
        undefined,
        dryRun ? 'All' : undefined,
        'autoops',
        undefined,
        k8s.PatchStrategy.ServerSideApply,
      );
    } catch (error) {
      throw this._providerError(error);
    }
  }

  private _getClient(): KubernetesClientBundle | null {
    return kubernetesClientProvider.getConfiguredClient();
  }

  private _getRequiredClient(): KubernetesClientBundle {
    const client = this._getClient();
    if (!client) throw new BadRequestError('Kubernetes is not configured');
    return client;
  }

  private async _list<T>(
    loader: (client: KubernetesClientBundle) => Promise<T[]>,
  ): Promise<KubernetesListResponse<T>> {
    try {
      const client = this._getClient();
      if (!client) {
        const status = kubernetesClientProvider.notConfiguredStatus();
        return { ...status, items: [] };
      }

      const items = await loader(client);
      return {
        status: KubernetesConnectionStatus.CONNECTED,
        checkedAt: new Date().toISOString(),
        items,
      };
    } catch (error) {
      const status = this._connectionFailure(error);
      return { ...status, items: [] };
    }
  }

  private _emptySummary(status: KubernetesStatus): KubernetesSummary {
    return {
      status: status.status,
      checkedAt: status.checkedAt,
      generatedAt: status.checkedAt,
      message: status.message,
      nodes: { total: 0, ready: 0, notReady: 0 },
      namespaces: { total: 0 },
      pods: {
        total: 0,
        running: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        unknown: 0,
        restarting: 0,
        crashLoopBackOff: 0,
      },
      workloads: {
        deployments: 0,
        statefulSets: 0,
        daemonSets: 0,
        replicaSets: 0,
      },
      services: {
        total: 0,
        clusterIP: 0,
        nodePort: 0,
        loadBalancer: 0,
        externalName: 0,
      },
      health: {
        clusterHealth: KubernetesHealthState.UNKNOWN,
        reasons: [status.message ?? 'Kubernetes is not connected.'],
        nodesReady: false,
        workloadsHealthy: false,
      },
      counts: EMPTY_COUNTS,
    };
  }

  private _connectionFailure(error: unknown): KubernetesStatus {
    const diagnostic = kubernetesClientProvider.classifyConnectionError(error);
    if (diagnostic === 'AUTH_FAILED') {
      return kubernetesClientProvider.authFailedStatus();
    }
    return kubernetesClientProvider.unreachableStatus(diagnostic);
  }

  private _providerError(error: unknown): ExternalServiceError {
    const message = error instanceof Error ? error.message : 'Kubernetes provider request failed';
    return new ExternalServiceError('Kubernetes', message, error);
  }

  private _parseManifest(value: KubernetesApplyManifestInput['manifest'], namespace?: string): k8s.KubernetesObject {
    const parsed = typeof value === 'string' ? parseDocument(value).toJSON() : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestError('Manifest must be a Kubernetes object');
    }

    const manifest = parsed as k8s.KubernetesObject;
    if (!manifest.apiVersion || !manifest.kind || !manifest.metadata?.name) {
      throw new BadRequestError('Manifest requires apiVersion, kind, and metadata.name');
    }

    manifest.metadata = {
      ...manifest.metadata,
      namespace: manifest.metadata.namespace ?? namespace,
    };

    return manifest;
  }

  private _validateManifest(manifest: k8s.KubernetesObject): void {
    if (manifest.kind && FORBIDDEN_MANIFEST_KINDS.has(manifest.kind)) {
      throw new BadRequestError(`${manifest.kind} manifests are not allowed in this milestone`);
    }
  }

  private _podStats(pods: k8s.V1Pod[]): KubernetesSummary['pods'] {
    return pods.reduce<KubernetesSummary['pods']>(
      (stats, pod) => {
        stats.total += 1;
        const phase = pod.status?.phase ?? 'Unknown';
        if (phase === 'Running') stats.running += 1;
        else if (phase === 'Pending') stats.pending += 1;
        else if (phase === 'Succeeded') stats.succeeded += 1;
        else if (phase === 'Failed') stats.failed += 1;
        else stats.unknown += 1;

        const waitingReasons = this._waitingReasons(pod);
        if (waitingReasons.length > 0) stats.restarting += 1;
        if (waitingReasons.includes('CrashLoopBackOff')) stats.crashLoopBackOff += 1;
        return stats;
      },
      {
        total: 0,
        running: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        unknown: 0,
        restarting: 0,
        crashLoopBackOff: 0,
      },
    );
  }

  private _serviceStats(services: k8s.V1Service[]): KubernetesSummary['services'] {
    return services.reduce<KubernetesSummary['services']>(
      (stats, service) => {
        stats.total += 1;
        if (service.spec?.type === 'NodePort') stats.nodePort += 1;
        else if (service.spec?.type === 'LoadBalancer') stats.loadBalancer += 1;
        else if (service.spec?.type === 'ExternalName') stats.externalName += 1;
        else stats.clusterIP += 1;
        return stats;
      },
      { total: 0, clusterIP: 0, nodePort: 0, loadBalancer: 0, externalName: 0 },
    );
  }

  private _clusterHealth(
    nodeCount: number,
    readyNodes: number,
    pods: KubernetesSummary['pods'],
  ): KubernetesSummary['health'] {
    const reasons: string[] = [];
    if (nodeCount === 0 || readyNodes === 0) reasons.push('No ready Kubernetes nodes were returned.');
    if (readyNodes < nodeCount) reasons.push(`${nodeCount - readyNodes} node(s) are not ready.`);
    if (pods.failed > 0) reasons.push(`${pods.failed} pod(s) are failed.`);
    if (pods.crashLoopBackOff > 0) reasons.push(`${pods.crashLoopBackOff} pod(s) are in CrashLoopBackOff.`);
    if (pods.pending > 0 || pods.restarting > 0) reasons.push('Some pods are pending or restarting.');

    const clusterHealth =
      nodeCount === 0 || readyNodes === 0 || pods.failed > 0
        ? KubernetesHealthState.CRITICAL
        : readyNodes < nodeCount || pods.pending > 0 || pods.restarting > 0
          ? KubernetesHealthState.WARNING
          : KubernetesHealthState.HEALTHY;

    return {
      clusterHealth,
      reasons: reasons.length > 0 ? reasons : ['All nodes are ready and no failed/restarting pods were detected.'],
      nodesReady: nodeCount > 0 && readyNodes === nodeCount,
      workloadsHealthy: clusterHealth === KubernetesHealthState.HEALTHY,
    };
  }

  private _toPod(pod: k8s.V1Pod): KubernetesPod {
    const containerStatuses = pod.status?.containerStatuses ?? [];
    const owner = pod.metadata?.ownerReferences?.[0];
    const waitingReasons = this._waitingReasons(pod);
    return {
      namespace: pod.metadata?.namespace ?? 'default',
      name: pod.metadata?.name ?? 'unknown',
      phase: pod.status?.phase ?? 'Unknown',
      readyContainers: containerStatuses.filter((status) => status.ready).length,
      totalContainers: pod.spec?.containers?.length ?? containerStatuses.length,
      restarts: containerStatuses.reduce((total, status) => total + status.restartCount, 0),
      podIP: pod.status?.podIP,
      hostIP: pod.status?.hostIP,
      nodeName: pod.spec?.nodeName,
      containerNames: pod.spec?.containers?.map((container) => container.name) ?? [],
      containerImages: pod.spec?.containers?.map((container) => container.image ?? 'unknown') ?? [],
      ownerKind: owner?.kind,
      ownerName: owner?.name,
      reason: pod.status?.reason,
      waitingReason: waitingReasons[0],
      createdAt: this._iso(pod.metadata?.creationTimestamp),
      age: this._age(pod.metadata?.creationTimestamp),
      labels: this._labels(pod.metadata?.labels),
      conditions: this._conditions(pod.status?.conditions),
    };
  }

  private _waitingReasons(pod: k8s.V1Pod): string[] {
    return (pod.status?.containerStatuses ?? [])
      .map((status) => status.state?.waiting?.reason)
      .filter((reason): reason is string => Boolean(reason));
  }

  private _workloadHealth(desired: number, ready: number, available = ready): KubernetesHealthState {
    if (desired === 0) return KubernetesHealthState.UNKNOWN;
    if (ready >= desired && available >= desired) return KubernetesHealthState.HEALTHY;
    if (ready === 0) return KubernetesHealthState.CRITICAL;
    return KubernetesHealthState.WARNING;
  }

  private _nodeReady(node: k8s.V1Node): boolean {
    return node.status?.conditions?.some(
      (condition) => condition.type === 'Ready' && condition.status === 'True',
    ) ?? false;
  }

  private _nodeRoles(labels: Record<string, string> | undefined): string[] {
    const roles = Object.keys(labels ?? {})
      .filter((key) => key.startsWith('node-role.kubernetes.io/'))
      .map((key) => key.replace('node-role.kubernetes.io/', '') || 'control-plane');
    return roles.length > 0 ? roles : ['worker'];
  }

  private _conditions(
    conditions:
      | Array<{
          type?: string;
          status?: string;
          reason?: string;
          message?: string;
        }>
      | undefined,
  ): KubernetesConditionSummary[] {
    return (
      conditions?.map((condition) => ({
        type: condition.type ?? 'Unknown',
        status: condition.status ?? 'Unknown',
        reason: condition.reason,
        message: condition.message,
      })) ?? []
    );
  }

  private _deploymentImages(deployment: k8s.V1Deployment): string[] {
    return deployment.spec?.template.spec?.containers?.map((container) => container.image ?? 'unknown') ?? [];
  }

  private _quantityMap(value: Record<string, unknown> | undefined): Record<string, string> {
    return Object.fromEntries(
      Object.entries(value ?? {}).map(([key, quantity]) => [key, String(quantity)]),
    );
  }

  private _iso(value: Date | string | undefined): string | undefined {
    if (!value) return undefined;
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }

  private _age(value: Date | string | undefined): string | undefined {
    if (!value) return undefined;
    const createdAt = value instanceof Date ? value : new Date(value);
    const ageMs = Date.now() - createdAt.getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0) return undefined;
    const minutes = Math.floor(ageMs / 60_000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  private _labels(value: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!value || Object.keys(value).length === 0) return undefined;
    return value;
  }
}

export const kubernetesService = new KubernetesService();
