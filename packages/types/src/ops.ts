import { z } from 'zod';
import type { Deployment } from './deployment.js';
import type { IncidentSeverity } from './enums.js';
import type { IncidentSummary, IncidentReadinessResponse } from './incident.js';
import {
  OperationProvider,
  OperationStatus,
  OperationType,
  type OperationProvider as OperationProviderValue,
  type OperationStatus as OperationStatusValue,
  type OperationType as OperationTypeValue,
} from './operation.js';

export const RuntimeStatus = {
  READY: 'READY',
  UNKNOWN: 'UNKNOWN',
  NOT_CONNECTED: 'NOT_CONNECTED',
} as const;
export type RuntimeStatus = (typeof RuntimeStatus)[keyof typeof RuntimeStatus];

export const IntegrationStatus = {
  CONNECTED: 'CONNECTED',
  NOT_CONNECTED: 'NOT_CONNECTED',
  COMING_NEXT: 'COMING_NEXT',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNREACHABLE: 'UNREACHABLE',
} as const;
export type IntegrationStatus = (typeof IntegrationStatus)[keyof typeof IntegrationStatus];

export const IntegrationCategory = {
  ORCHESTRATION: 'orchestration',
  CI_CD: 'ci_cd',
  CONFIGURATION: 'configuration',
  INFRASTRUCTURE: 'infrastructure',
  CONTAINER: 'container',
  CLOUD: 'cloud',
} as const;
export type IntegrationCategory = (typeof IntegrationCategory)[keyof typeof IntegrationCategory];

export interface OpsRuntimeCheck {
  status: RuntimeStatus;
}

export interface OpsRuntimeSummary {
  api: OpsRuntimeCheck;
  database: OpsRuntimeCheck;
  redis: OpsRuntimeCheck;
  worker: OpsRuntimeCheck;
  generatedAt: string;
}

export interface OpsResourceSummary {
  projects: number;
  environments: number;
  deployments: number;
}

export interface OpsDeploymentSummary {
  total: number;
  queued: number;
  active: number;
  running: number;
  succeeded: number;
  failed: number;
  latest: Deployment[];
}

export interface OpsQueueSummary {
  status: RuntimeStatus;
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
}

export type PlatformHealthStatus =
  | 'HEALTHY'
  | 'CONNECTED'
  | 'READY'
  | 'RUNNING'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export type WorkerRuntimeStatus = 'RUNNING' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';
export type WorkerHeartbeatState = 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR';
export type WorkerQueueCoverageStatus = 'COVERED' | 'UNCOVERED' | 'UNKNOWN';

export interface OpsHealthCheck {
  status: PlatformHealthStatus;
  message: string;
  checkedAt: string;
}

export interface OpsQueueHealthSummary extends OpsQueueSummary {
  message: string;
}

export interface WorkerRuntimeItem {
  workerId: string;
  service: string;
  status: WorkerHeartbeatState;
  queues: string[];
  startedAt: string;
  lastSeenAt: string;
  heartbeatAgeMs: number;
  runtime: {
    processId?: number;
    environment?: string;
    version?: string | null;
  };
}

export interface WorkerQueueCoverage {
  operations: WorkerQueueCoverageStatus;
  deployments: WorkerQueueCoverageStatus;
  system: WorkerQueueCoverageStatus;
}

export interface WorkerHeartbeatSummary {
  status: WorkerRuntimeStatus;
  message: string;
  activeCount: number;
  staleCount: number;
  offlineCount: number;
  lastSeenAt: string | null;
  staleThresholdMs: number;
  offlineThresholdMs: number;
  queueCoverage: WorkerQueueCoverage;
  workers: WorkerRuntimeItem[];
}

export interface OpsIntegrationReadiness {
  key: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  description: string;
  metrics?: Record<string, string | number | boolean | null>;
  href?: string;
  lastCheckedAt?: string;
}

export interface OpsSummary {
  runtime: OpsRuntimeSummary;
  resources: OpsResourceSummary;
  deployments: OpsDeploymentSummary;
  queues: {
    deployments: OpsQueueSummary;
  };
  integrations: OpsIntegrationReadiness[];
  operations?: {
    total: number;
    pendingApproval: number;
    running: number;
    failed: number;
  };
}

export const OperationActivitySource = {
  JENKINS: 'jenkins',
  KUBERNETES: 'kubernetes',
  DOCKER: 'docker',
  INFRASTRUCTURE: 'infrastructure',
  GITHUB: 'github',
  AWS: 'aws',
  DEPLOYMENT: 'deployment',
  SYSTEM: 'system',
} as const;
export type OperationActivitySource =
  (typeof OperationActivitySource)[keyof typeof OperationActivitySource];

export const OperationRiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type OperationRiskLevel = (typeof OperationRiskLevel)[keyof typeof OperationRiskLevel];

export const OperationApprovalStatus = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type OperationApprovalStatus =
  (typeof OperationApprovalStatus)[keyof typeof OperationApprovalStatus];

export const opsActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.nativeEnum(OperationStatus).optional(),
  type: z.nativeEnum(OperationType).optional(),
  source: z.nativeEnum(OperationActivitySource).optional(),
});
export type OpsActivityQuery = z.infer<typeof opsActivityQuerySchema>;

export interface OperationActivityActor {
  id: string;
  name: string | null;
  email: string | null;
}

export interface OperationGovernance {
  riskLevel: OperationRiskLevel;
  confirmationRequired: boolean;
  confirmationTokenLabel: string | null;
  confirmationSatisfied: boolean;
  approvalRequired: boolean;
  approvalStatus: OperationApprovalStatus;
  approvalReason: string | null;
  policyName: string | null;
  approvedAt: string | null;
  approvedBy?: OperationActivityActor | null;
  rejectedAt: string | null;
  rejectedBy?: OperationActivityActor | null;
}

export interface OperationPermissionHints {
  canApprove: boolean;
  canReject: boolean;
  canTriggerRecovery: boolean;
  reason: string | null;
}

export interface OperationActivityItem {
  id: string;
  type: OperationTypeValue;
  source: OperationActivitySource;
  status: OperationStatusValue;
  title: string;
  targetLabel: string | null;
  result: string | null;
  externalUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  actor: OperationActivityActor | null;
  errorMessage: string | null;
  governance: OperationGovernance;
  permissions: OperationPermissionHints;
}

export interface OperationActivityResponse {
  items: OperationActivityItem[];
}

export interface OperationProviderDetails {
  provider: string;
  operationType: string;
  targetKind: string | null;
  targetName: string | null;
  namespace: string | null;
  containerName: string | null;
  containerId: string | null;
  jobName: string | null;
  buildNumber: number | null;
  buildUrl: string | null;
  action: string | null;
  replicas: number | null;
  safeSummary: string[];
}

export interface OperationLifecycleItem {
  label: string;
  status: 'completed' | 'active' | 'pending' | 'failed';
  timestamp: string | null;
  description: string;
}

export interface OperationRetryInfo {
  supported: boolean;
  actionLabel: string | null;
  confirmationTokenLabel: string | null;
  reason: string | null;
}

export interface OperationDetailResponse extends OperationActivityItem {
  updatedAt: string;
  providerDetails: OperationProviderDetails;
  lifecycle: OperationLifecycleItem[];
  retry: OperationRetryInfo;
  incident: Pick<IncidentSummary, 'id' | 'title' | 'severity' | 'status'> | null;
  governanceEvidence: GovernanceEvidenceItem;
}

export interface OpsProviderHealthSummary {
  status: string;
  message: string;
  href: string;
  checkedAt: string | null;
  triggerEnabled?: boolean;
  metricsApiStatus?: string;
}

export interface OperationStatusBreakdown {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  rejected: number;
  cancelled: number;
  pendingApproval: number;
}

export interface OperationObservabilityItem extends OperationActivityItem {
  retry: OperationRetryInfo;
}

export interface OpsObservabilityResponse {
  platform: {
    api: OpsHealthCheck;
    database: OpsHealthCheck;
    redis: OpsHealthCheck;
    worker: OpsHealthCheck;
  };
  queues: {
    deployments: OpsQueueHealthSummary;
    operations: OpsQueueHealthSummary;
  };
  workerRuntime: WorkerHeartbeatSummary;
  providers: {
    jenkins: OpsProviderHealthSummary;
    docker: OpsProviderHealthSummary;
    kubernetes: OpsProviderHealthSummary;
    infrastructure?: OpsProviderHealthSummary;
  };
  operations: {
    totalRecent: number;
    recentWindowLabel: string;
    statusBreakdown: OperationStatusBreakdown;
    active: OperationObservabilityItem[];
    recentFailures: OperationObservabilityItem[];
    latest: OperationObservabilityItem[];
  };
  incidents: IncidentReadinessResponse;
  generatedAt: string;
}

export const governanceEvidenceFiltersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  provider: z.nativeEnum(OperationProvider).optional(),
  status: z.nativeEnum(OperationStatus).optional(),
  risk: z.nativeEnum(OperationRiskLevel).optional(),
  approvalStatus: z.nativeEnum(OperationApprovalStatus).optional(),
  operationType: z.nativeEnum(OperationType).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().max(120).optional(),
  actor: z.string().trim().max(120).optional(),
  format: z.literal('json').optional(),
});
export type GovernanceEvidenceFilters = z.infer<typeof governanceEvidenceFiltersSchema>;

export interface GovernanceEvidenceActorSummary {
  id: string;
  name: string | null;
  email: string | null;
}

export interface GovernanceEvidencePolicySummary {
  policyName: string | null;
  policyReason: string | null;
  riskLevel: OperationRiskLevel;
  confirmationTokenRequired: boolean;
  confirmationTokenLabel: string | null;
  approvalRequired: boolean;
  approvalStatus: OperationApprovalStatus;
}

export interface GovernanceEvidenceIncidentSummary {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentSummary['status'];
}

export interface GovernanceEvidenceItem {
  operationId: string;
  provider: OperationProviderValue;
  source: OperationActivitySource;
  operationType: OperationTypeValue;
  status: OperationStatusValue;
  title: string;
  targetDisplayName: string | null;
  requestedBy: GovernanceEvidenceActorSummary | null;
  requestedAt: string;
  approvedBy: GovernanceEvidenceActorSummary | null;
  approvedAt: string | null;
  rejectedBy: GovernanceEvidenceActorSummary | null;
  rejectedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  policy: GovernanceEvidencePolicySummary;
  incident: GovernanceEvidenceIncidentSummary | null;
  safeResultSummary: string | null;
  safeErrorSummary: string | null;
  lifecycleCount: number;
  recoveryAvailable: boolean;
  evidenceSummary: string;
}

export interface GovernanceStatusBreakdown {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  rejected: number;
  cancelled: number;
  pendingApproval: number;
}

export type GovernanceProviderBreakdown = Record<OperationProviderValue, number>;
export type GovernanceRiskBreakdown = Record<OperationRiskLevel, number>;
export type GovernanceApprovalBreakdown = Record<OperationApprovalStatus, number>;

export interface GovernanceSummaryResponse {
  total: number;
  pendingApprovals: number;
  rejected: number;
  failed: number;
  incidentsLinked: number;
  statusBreakdown: GovernanceStatusBreakdown;
  providerBreakdown: GovernanceProviderBreakdown;
  riskBreakdown: GovernanceRiskBreakdown;
  approvalBreakdown: GovernanceApprovalBreakdown;
  meanApprovalTimeMs: number | null;
  medianApprovalTimeMs: number | null;
  meanExecutionDurationMs: number | null;
  medianExecutionDurationMs: number | null;
}

export interface GovernanceEvidenceResponse {
  summary: GovernanceSummaryResponse;
  evidence: GovernanceEvidenceItem[];
  latestHighRiskOperations: GovernanceEvidenceItem[];
  latestRejectedOperations: GovernanceEvidenceItem[];
  latestFailedOperations: GovernanceEvidenceItem[];
  latestIncidentLinkedOperations: GovernanceEvidenceItem[];
  generatedAt: string;
}

export interface GovernanceExportResponse {
  format: 'json';
  generatedAt: string;
  limit: number;
  evidence: GovernanceEvidenceItem[];
  summary: GovernanceSummaryResponse;
}
