import type { ProviderReadiness } from './provider.js';

export const DevOpsToolStatus = {
  BLOCKED_BY_ORG_POLICY: 'BLOCKED_BY_ORG_POLICY',
  CONNECTED: 'CONNECTED',
  NOT_INSTALLED: 'NOT_INSTALLED',
  ERROR: 'ERROR',
} as const;
export type DevOpsToolStatus = (typeof DevOpsToolStatus)[keyof typeof DevOpsToolStatus];

export interface DevOpsToolSummary {
  key: 'tofu' | 'terraform' | 'ansible' | 'kubectl' | 'helm' | 'kustomize' | 'docker' | 'node' | 'pnpm';
  displayName: string;
  status: DevOpsToolStatus;
  version: string | null;
  checkedAt: string;
  message: string;
  safeActions: string[];
}

export interface DevOpsToolsStatusResponse {
  status?: DevOpsToolStatus;
  configured?: boolean;
  providerInventoryEnabled?: boolean;
  message?: string;
  remediation?: string[];
  readiness?: ProviderReadiness;
  tools: DevOpsToolSummary[];
  generatedAt: string;
}
