import type { ProviderConnectionStatus } from './provider.js';

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
