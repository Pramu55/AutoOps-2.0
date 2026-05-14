import type { Deployment } from './deployment.js';

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
