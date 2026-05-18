import { z } from 'zod';
import { idSchema } from './common.js';
import { OperationStatus, OperationType } from './operation.js';
import type { OperationRiskLevel } from './ops.js';
import type { ProviderConnectionStatus } from './provider.js';

export type JenkinsConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'UNREACHABLE'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'CONNECTED'
  | 'UNKNOWN_ERROR';

export interface JenkinsStatusResponse {
  status: ProviderConnectionStatus | JenkinsConnectionStatus;
  configured: boolean;
  baseUrl?: string;
  username?: string;
  allowedJobs: string[];
  triggerEnabled: boolean;
  version?: string;
  mode?: string;
  nodeDescription?: string;
  nodeName?: string;
  numExecutors?: number;
  useCrumbs?: boolean;
  message: string;
  checkedAt: string;
}

export interface JenkinsBuild {
  jobName: string;
  buildNumber: number;
  url: string;
  result: string | null;
  building: boolean;
  timestamp: string | null;
  duration: number | null;
  estimatedDuration: number | null;
  displayName: string | null;
  fullDisplayName: string | null;
}

export interface JenkinsJob {
  name: string;
  fullName?: string;
  url: string;
  color: string | null;
  status: string;
  buildable?: boolean;
  disabled?: boolean;
  inQueue?: boolean;
  lastBuild?: JenkinsBuild | null;
  lastSuccessfulBuild?: JenkinsBuild | null;
  lastFailedBuild?: JenkinsBuild | null;
  healthReport?: Array<Record<string, unknown>>;
}

export interface JenkinsPartialFailure {
  scope: string;
  message: string;
}

export interface JenkinsSummaryResponse {
  status: ProviderConnectionStatus | JenkinsConnectionStatus;
  configured: boolean;
  allowedJobs: string[];
  triggerEnabled: boolean;
  jobCount: number;
  buildableJobCount: number;
  disabledJobCount: number;
  queueCount: number;
  viewCount: number;
  busyExecutors?: number;
  totalExecutors?: number;
  recentBuilds: JenkinsBuild[];
  checkedAt: string;
  partialFailures: JenkinsPartialFailure[];
}

export interface JenkinsListResponse<T> {
  status: ProviderConnectionStatus | JenkinsConnectionStatus;
  configured: boolean;
  checkedAt: string;
  message?: string;
  items: T[];
}

export const jenkinsOperationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      OperationStatus.PENDING_APPROVAL,
      OperationStatus.QUEUED,
      OperationStatus.RUNNING,
      OperationStatus.SUCCEEDED,
      OperationStatus.FAILED,
      OperationStatus.REJECTED,
      OperationStatus.CANCELLED,
    ])
    .optional(),
  jobName: z.string().trim().min(1).max(500).optional(),
});

export type JenkinsOperationsQuery = z.infer<typeof jenkinsOperationsQuerySchema>;

export interface JenkinsOperation {
  id: string;
  type: typeof OperationType.JENKINS_BUILD_TRIGGER;
  status: OperationStatus;
  jobName: string | null;
  queueUrl: string | null;
  buildNumber: number | null;
  buildUrl: string | null;
  result: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface JenkinsOperationListResponse {
  items: JenkinsOperation[];
}

export const jenkinsTriggerBuildInputSchema = z.object({
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  projectId: idSchema.optional(),
  environmentId: idSchema.optional(),
  confirmationToken: z.literal('BUILD'),
  reason: z.string().trim().max(500).optional(),
});

export type JenkinsTriggerBuildInput = z.infer<typeof jenkinsTriggerBuildInputSchema>;

export interface JenkinsTriggerBuildResponse {
  operationId: string;
  status: OperationStatus;
  approvalRequired: boolean;
  approvalReason: string | null;
  riskLevel: OperationRiskLevel;
  policyName: string | null;
  message: string;
}
