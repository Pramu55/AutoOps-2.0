import { z } from 'zod';
import { idSchema } from './common.js';
import type { OperationRiskLevel } from './ops.js';

export const KubernetesConnectionStatus = {
  BLOCKED_BY_ORG_POLICY: 'BLOCKED_BY_ORG_POLICY',
  CONNECTED: 'CONNECTED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNREACHABLE: 'UNREACHABLE',
  AUTH_FAILED: 'AUTH_FAILED',
} as const;
export type KubernetesConnectionStatus =
  (typeof KubernetesConnectionStatus)[keyof typeof KubernetesConnectionStatus];

export const KubernetesHealthState = {
  HEALTHY: 'HEALTHY',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type KubernetesHealthState =
  (typeof KubernetesHealthState)[keyof typeof KubernetesHealthState];

export interface KubernetesClusterInfo {
  context?: string;
  server?: string;
  version?: string;
}

export interface KubernetesStatus {
  status: KubernetesConnectionStatus;
  context?: string;
  server?: string;
  version?: string;
  nodeCount?: number;
  readyNodeCount?: number;
  namespaceCount?: number;
  readOnly: true;
  checkedAt: string;
  message?: string;
  configured?: boolean;
  providerInventoryEnabled?: boolean;
  remediation?: string[];
}

export interface KubernetesNamespace {
  name: string;
  status?: string;
  createdAt?: string;
  age?: string;
  annotationCount?: number;
  podCount?: number;
  serviceCount?: number;
  workloadCount?: number;
  labels?: Record<string, string>;
}

export interface KubernetesWorkload {
  namespace: string;
  name: string;
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'ReplicaSet';
  desired: number;
  ready: number;
  available?: number;
  updated?: number;
  status: KubernetesHealthState;
  createdAt?: string;
  age?: string;
  labels?: Record<string, string>;
  selector?: Record<string, string>;
  containerImages: string[];
  conditions: KubernetesConditionSummary[];
}

export interface KubernetesPod {
  namespace: string;
  name: string;
  phase: string;
  readyContainers: number;
  totalContainers: number;
  restarts: number;
  podIP?: string;
  hostIP?: string;
  nodeName?: string;
  containerNames: string[];
  containerImages: string[];
  ownerKind?: string;
  ownerName?: string;
  reason?: string;
  waitingReason?: string;
  createdAt?: string;
  age?: string;
  labels?: Record<string, string>;
  conditions: KubernetesConditionSummary[];
}

export interface KubernetesService {
  namespace: string;
  name: string;
  type: string;
  clusterIP?: string;
  externalIPs: string[];
  loadBalancerIngress: string[];
  ports: KubernetesServicePort[];
  selector?: Record<string, string>;
  createdAt?: string;
  age?: string;
  status: string;
}

export interface KubernetesServicePort {
  name?: string;
  protocol?: string;
  port: number;
  targetPort?: string | number;
  nodePort?: number;
}

export interface KubernetesNode {
  name: string;
  ready: boolean;
  roles: string[];
  kubeletVersion?: string;
  containerRuntimeVersion?: string;
  osImage?: string;
  architecture?: string;
  kernelVersion?: string;
  internalIP?: string;
  externalIP?: string;
  podCIDR?: string;
  allocatable: Record<string, string>;
  capacity: Record<string, string>;
  createdAt?: string;
  age?: string;
  conditions: KubernetesConditionSummary[];
}

export interface KubernetesConditionSummary {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface KubernetesMetricsApiSummary {
  status: 'CONNECTED' | 'NOT_CONNECTED';
  nodeMetricsCount: number;
  podMetricsCount: number;
  message: string;
}

export interface KubernetesSummary {
  status: KubernetesConnectionStatus;
  generatedAt: string;
  checkedAt: string;
  message?: string;
  cluster?: KubernetesClusterInfo;
  nodes: {
    total: number;
    ready: number;
    notReady: number;
  };
  namespaces: {
    total: number;
  };
  pods: {
    total: number;
    running: number;
    pending: number;
    succeeded: number;
    failed: number;
    unknown: number;
    restarting: number;
    crashLoopBackOff: number;
  };
  workloads: {
    deployments: number;
    statefulSets: number;
    daemonSets: number;
    replicaSets: number;
  };
  services: {
    total: number;
    clusterIP: number;
    nodePort: number;
    loadBalancer: number;
    externalName: number;
  };
  metricsApi: KubernetesMetricsApiSummary;
  health: {
    clusterHealth: KubernetesHealthState;
    reasons: string[];
    nodesReady: boolean;
    workloadsHealthy: boolean;
  };
  counts: {
    namespaces: number;
    nodes: number;
    pods: number;
    services: number;
    deployments: number;
    readyNodes: number;
    runningPods: number;
    pendingPods: number;
    failedPods: number;
  };
}

export interface KubernetesListResponse<T> {
  status: KubernetesConnectionStatus;
  checkedAt: string;
  message?: string;
  items: T[];
}

export interface KubernetesRolloutStatus {
  namespace: string;
  name: string;
  generation?: number;
  desired: number;
  updated: number;
  ready: number;
  available: number;
  observedGeneration?: number;
  status: KubernetesHealthState;
  message: string;
  conditions: KubernetesConditionSummary[];
  checkedAt: string;
}

export interface KubernetesActionResponse {
  operationId: string;
  status: 'QUEUED' | 'PENDING_APPROVAL';
  approvalRequired: boolean;
  approvalReason: string | null;
  riskLevel: OperationRiskLevel;
  policyName: string | null;
  message: string;
}

export interface KubernetesApplyDryRunResult {
  dryRun: true;
  namespace: string;
  kind: string;
  name: string;
  apiVersion: string;
  result: Record<string, unknown>;
  checkedAt: string;
}

export const kubernetesWorkloadParamsSchema = z.object({
  namespace: z.string().min(1).max(253),
  name: z.string().min(1).max(253),
});

export const kubernetesRestartDeploymentSchema = z.object({
  confirmationToken: z.literal('RESTART').optional(),
  projectId: idSchema.optional(),
  environmentId: idSchema.optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
export type KubernetesRestartDeploymentInput = z.infer<
  typeof kubernetesRestartDeploymentSchema
>;

export const kubernetesScaleDeploymentSchema = z.object({
  replicas: z.number().int().min(0).max(10),
  confirmationToken: z.literal('SCALE'),
  projectId: idSchema.optional(),
  environmentId: idSchema.optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
export type KubernetesScaleDeploymentInput = z.infer<
  typeof kubernetesScaleDeploymentSchema
>;

export const kubernetesRolloutRestartDeploymentSchema = z.object({
  confirmationToken: z.literal('ROLLOUT'),
  projectId: idSchema.optional(),
  environmentId: idSchema.optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
export type KubernetesRolloutRestartDeploymentInput = z.infer<
  typeof kubernetesRolloutRestartDeploymentSchema
>;

export const kubernetesApplyManifestSchema = z.object({
  namespace: z.string().min(1).max(253).optional(),
  manifest: z.union([z.string().min(1), z.record(z.unknown())]),
  dryRun: z.boolean().default(true),
  projectId: idSchema.optional(),
  environmentId: idSchema.optional(),
  confirmationToken: z.literal('APPLY').optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
export type KubernetesApplyManifestInput = z.infer<typeof kubernetesApplyManifestSchema>;
