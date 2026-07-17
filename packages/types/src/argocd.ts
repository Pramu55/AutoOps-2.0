import type { ProviderReadiness } from './provider.js';

export const ArgoCdConnectionStatus = {
  BLOCKED_BY_ORG_POLICY: 'BLOCKED_BY_ORG_POLICY',
  CONNECTED: 'CONNECTED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTH_FAILED: 'AUTH_FAILED',
  UNREACHABLE: 'UNREACHABLE',
} as const;
export type ArgoCdConnectionStatus =
  (typeof ArgoCdConnectionStatus)[keyof typeof ArgoCdConnectionStatus];

export type ArgoCdSyncStatus = 'Synced' | 'OutOfSync' | 'Unknown' | string;
export type ArgoCdHealthStatus =
  | 'Healthy'
  | 'Degraded'
  | 'Progressing'
  | 'Missing'
  | 'Suspended'
  | 'Unknown'
  | string;

export interface ArgoCdStatusResponse {
  status: ArgoCdConnectionStatus;
  configured: boolean;
  serverUrl?: string;
  authMode?: 'token' | 'username_password' | 'none';
  skipTlsVerify: boolean;
  checkedAt: string;
  message: string;
  providerInventoryEnabled?: boolean;
  remediation?: string[];
  readiness?: ProviderReadiness;
}

export interface ArgoCdApplicationSummary {
  name: string;
  namespace: string | null;
  project: string | null;
  repoUrl: string | null;
  targetRevision: string | null;
  path: string | null;
  destinationServer: string | null;
  destinationNamespace: string | null;
  syncStatus: ArgoCdSyncStatus;
  healthStatus: ArgoCdHealthStatus;
  revision: string | null;
  observedAt: string;
  outOfSync: boolean;
  healthDegraded: boolean;
}

export interface ArgoCdApplicationsResponse {
  status: ArgoCdConnectionStatus;
  configured: boolean;
  serverUrl?: string;
  checkedAt: string;
  message?: string;
  items: ArgoCdApplicationSummary[];
}

export interface ArgoCdSummaryResponse {
  status: ArgoCdConnectionStatus;
  configured: boolean;
  serverUrl?: string;
  checkedAt: string;
  message?: string;
  appCount: number;
  sync: {
    synced: number;
    outOfSync: number;
    unknown: number;
  };
  health: {
    healthy: number;
    degraded: number;
    progressing: number;
    missing: number;
    unknown: number;
  };
  drift: {
    outOfSync: number;
    degraded: number;
  };
}
