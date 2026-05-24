import type { ProviderConnectionStatus } from './provider.js';
import { z } from 'zod';

export enum AwsIntegrationStatus {
  CONNECTED = 'CONNECTED',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  AUTH_FAILED = 'AUTH_FAILED',
  ERROR = 'ERROR',
}

export enum AwsDiagnosticStatus {
  PASS = 'PASS',
  MISSING_PERMISSION = 'MISSING_PERMISSION',
  AUTH_FAILED = 'AUTH_FAILED',
  SKIPPED = 'SKIPPED',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  ERROR = 'ERROR',
}

export enum AwsReadinessStatus {
  READY = 'READY',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  PARTIAL = 'PARTIAL',
  AUTH_FAILED = 'AUTH_FAILED',
  ERROR = 'ERROR',
}

export enum AwsDeploymentTargetType {
  ECS_FARGATE = 'ECS_FARGATE',
}

export interface AwsStatusResponse {
  status: AwsIntegrationStatus;
  configured: boolean;
  region?: string;
  message: string;
  checkedAt: string;
}

export interface AwsIdentityResponse {
  status: AwsIntegrationStatus;
  configured: boolean;
  accountId?: string;
  arn?: string;
  userId?: string;
  region?: string;
  checkedAt: string;
}

export interface AwsReadinessResponse {
  status: AwsReadinessStatus;
  integrationEnabled: boolean;
  regionConfigured: boolean;
  accessKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  sessionTokenConfigured: boolean;
  accountIdConfigured: boolean;
  allowedWorkspacesConfigured: boolean;
  remoteStateBucketConfigured: boolean;
  remoteStateLockTableConfigured: boolean;
  remoteStateRegionConfigured: boolean;
  applyEnabled: boolean;
  missing: string[];
  checkedAt: string;
}

export interface AwsPermissionDiagnostic {
  service: string;
  action: string;
  status: AwsDiagnosticStatus;
  message: string;
  checkedAt: string;
}

export interface AwsPermissionsResponse {
  status: AwsIntegrationStatus;
  diagnostics: AwsPermissionDiagnostic[];
  checkedAt: string;
}

export interface AwsRemoteStateCheck {
  name: string;
  status: AwsDiagnosticStatus | 'MISSING_CONFIG' | 'NOT_FOUND';
  message: string;
}

export interface AwsRemoteStateReadinessResponse {
  status: AwsReadinessStatus;
  bucketConfigured: boolean;
  lockTableConfigured: boolean;
  stateRegionConfigured: boolean;
  bucketReachable: boolean | null;
  lockTableReachable: boolean | null;
  checks: AwsRemoteStateCheck[];
  checkedAt: string;
}

export interface AwsWorkspaceCheck {
  name: string;
  status: AwsDiagnosticStatus | 'FAIL';
  message: string;
}

export interface AwsWorkspaceReadinessResponse {
  status: AwsReadinessStatus;
  targetSlug: string;
  workspaceExists: boolean;
  requiredFiles: Array<{ path: string; present: boolean }>;
  tooling: {
    tofuAvailable: boolean;
    terraformAvailable: boolean;
  };
  checks: AwsWorkspaceCheck[];
  checkedAt: string;
}

export interface AwsDeploymentTarget {
  slug: string;
  name: string;
  type: AwsDeploymentTargetType | string;
  planSupported: boolean;
  applySupported: boolean;
  applyEnabled: boolean;
  requiresApproval: boolean;
  remoteStateRequired: boolean;
  status: 'READINESS_REQUIRED' | 'READY' | 'NOT_CONFIGURED';
}

export interface AwsDeploymentTargetsResponse {
  items: AwsDeploymentTarget[];
  checkedAt: string;
}

// Deprecated old structures, will remove usages.
export interface AwsStatus {
  status: ProviderConnectionStatus;
  configured: boolean;
  accountId?: string;
  region?: string;
  callerArn?: string;
  message: string;
  checkedAt: string;
}

export interface AwsPartialFailure {
  service: string;
  message: string;
}

export interface AwsSummary {
  status: ProviderConnectionStatus;
  accountId?: string;
  region?: string;
  checkedAt: string;
  ec2?: {
    instances: number;
    running: number;
    stopped: number;
  };
  ecs?: {
    clusters: number;
    activeServices: number;
    runningTasks: number;
    pendingTasks: number;
  };
  ecr?: {
    repositories: number;
  };
  cloudWatch?: {
    alarms: number;
    alarmState: number;
    okState: number;
    insufficientData: number;
  };
  lambda?: {
    functions: number;
  };
  partialFailures: AwsPartialFailure[];
}

export interface AwsEc2Instance {
  instanceId: string;
  name: string | null;
  state: string | null;
  instanceType: string | null;
  privateIp: string | null;
  publicIp: string | null;
  availabilityZone: string | null;
  launchTime: string | null;
  tags: Record<string, string>;
  vpcId: string | null;
  subnetId: string | null;
}

export interface AwsEcsCluster {
  clusterArn: string;
  clusterName: string;
  status: string | null;
  runningTasksCount: number;
  pendingTasksCount: number;
  activeServicesCount: number;
  registeredContainerInstancesCount: number;
}

export interface AwsEcsService {
  clusterName: string;
  serviceName: string;
  status: string | null;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  taskDefinition: string | null;
  deployments: Array<Record<string, unknown>>;
  loadBalancers: Array<Record<string, unknown>>;
}

export interface AwsEcrRepository {
  repositoryName: string;
  repositoryUri: string | null;
  createdAt: string | null;
  imageTagMutability: string | null;
  scanOnPush: boolean | null;
  encryptionType: string | null;
}

export interface AwsEcrBuildTarget {
  targetSlug: string;
  displayName: string;
  contextPath: string;
  dockerfilePath: string;
  defaultRepository: string;
  allowedEnvironments: string[];
  allowedPlatforms?: string[];
}

export interface AwsEcrReadinessResponse {
  status: AwsReadinessStatus;
  integrationConfigured: boolean;
  regionConfigured: boolean;
  pushEnabled: boolean;
  productionPushRequiresApproval: boolean;
  allowedRepositoriesConfigured: boolean;
  allowedBuildTargetsConfigured: boolean;
  repositories: Array<{
    repositoryName: string;
    repositoryUri: string | null;
    exists: boolean | null;
    scanOnPush: boolean | null;
    encryptionType: string | null;
    lifecyclePolicyConfigured: boolean | null;
  }>;
  buildTargets: AwsEcrBuildTarget[];
  missing: string[];
  checkedAt: string;
}

export interface AwsEcrImageMetadata {
  operationId: string;
  targetSlug: string;
  repositoryName: string;
  repositoryUri: string | null;
  imageTag: string;
  imageUri: string | null;
  imageDigest?: string | null;
  environmentSlug: string;
  status: string;
  action: 'build' | 'push';
  requestedAt: string;
  completedAt?: string | null;
}

export enum AwsTerraformPlanRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum AwsTerraformPlanStatus {
  READY = 'READY',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  BLOCKED = 'BLOCKED',
  ERROR = 'ERROR',
}

export interface AwsTerraformPlanSummary {
  operationId: string;
  targetSlug: string;
  environmentSlug: string;
  imageUri: string | null;
  imageDigest: string | null;
  addCount: number;
  changeCount: number;
  destroyCount: number;
  riskLevel: AwsTerraformPlanRiskLevel;
  blockedReasons: string[];
  applyEligible: boolean;
  planGeneratedAt: string;
  safeOutputSummary?: string;
}

export interface AwsTerraformPlanReadinessResponse {
  status: AwsTerraformPlanStatus;
  awsConfigured: boolean;
  regionConfigured: boolean;
  remoteStateBucketConfigured: boolean;
  remoteStateLockTableConfigured: boolean;
  remoteStateRegionConfigured: boolean;
  allowedWorkspaceConfigured: boolean;
  workspaceExists: boolean;
  terraformToolAvailable: boolean;
  safeImageAvailable: boolean;
  targetSlug: string | null;
  environmentSlug: string | null;
  latestImageOperationId: string | null;
  missing: string[];
  blockedReasons: string[];
  checkedAt: string;
}

export interface AwsCloudWatchAlarm {
  alarmName: string;
  stateValue: string | null;
  stateReason: string | null;
  metricName: string | null;
  namespace: string | null;
  updatedAt: string | null;
}

export interface AwsListResponse<T> {
  status: ProviderConnectionStatus;
  configured: boolean;
  region?: string;
  message?: string;
  checkedAt: string;
  items: T[];
}

export interface AwsDeploymentPlanRequest {
  confirmationToken: string;
}

export const awsTerraformEcsPlanRequestSchema = z.object({
  targetSlug: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  environmentSlug: z.string().min(2).max(32).regex(/^[a-z][a-z0-9-]+$/),
  imageOperationId: z.string().uuid(),
  confirmationToken: z.literal('PLAN'),
}).strict();

export type AwsTerraformEcsPlanRequest = z.infer<typeof awsTerraformEcsPlanRequestSchema>;

export interface AwsTerraformEcsPlanResponse extends AwsDeploymentOperationResponse {
  planSummary?: AwsTerraformPlanSummary | null;
}

export const awsEcrImageBuildRequestSchema = z.object({
  targetSlug: z.string().min(1).max(80),
  environmentSlug: z.string().min(2).max(32).regex(/^[a-z][a-z0-9-]+$/),
  platform: z.string().max(32).optional(),
  confirmationToken: z.literal('BUILD'),
});

export type AwsEcrImageBuildRequest = z.infer<typeof awsEcrImageBuildRequestSchema>;

export const awsEcrImagePushRequestSchema = z.object({
  targetSlug: z.string().min(1).max(80),
  repositoryName: z.string().min(1).max(256),
  environmentSlug: z.string().min(2).max(32).regex(/^[a-z][a-z0-9-]+$/),
  imageTag: z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
  confirmationToken: z.literal('PUSH'),
});

export type AwsEcrImagePushRequest = z.infer<typeof awsEcrImagePushRequestSchema>;

export interface AwsDeploymentOperationResponse {
  operationId: string;
  status: string;
  provider: string;
  type: string;
}

export interface AwsDeploymentSummary {
  workspaceSlug: string;
  status: string;
  lastOperationId?: string;
  lastOperationType?: string;
}
