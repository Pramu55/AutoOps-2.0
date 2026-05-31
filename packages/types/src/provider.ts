export const ProviderConnectionStatus = {
  BLOCKED_BY_ORG_POLICY: 'BLOCKED_BY_ORG_POLICY',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNREACHABLE: 'UNREACHABLE',
  AUTH_FAILED: 'AUTH_FAILED',
  FORBIDDEN: 'FORBIDDEN',
  CONNECTED: 'CONNECTED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;
export type ProviderConnectionStatus =
  (typeof ProviderConnectionStatus)[keyof typeof ProviderConnectionStatus];

export const ProviderKey = {
  KUBERNETES: 'kubernetes',
  AWS: 'aws',
  JENKINS: 'jenkins',
  GITHUB: 'github',
  ARGOCD: 'argocd',
  DOCKER: 'docker',
} as const;
export type ProviderKey = (typeof ProviderKey)[keyof typeof ProviderKey];

export const ProviderCategory = {
  ORCHESTRATION: 'orchestration',
  CLOUD: 'cloud',
  CI_CD: 'ci_cd',
  GITOPS: 'gitops',
  CONTAINER: 'container',
} as const;
export type ProviderCategory = (typeof ProviderCategory)[keyof typeof ProviderCategory];

export interface IntegrationProvider {
  key: ProviderKey;
  displayName: string;
  category: ProviderCategory;
  status: ProviderConnectionStatus;
  configured: boolean;
  capabilities: string[];
  readCapabilities: string[];
  writeCapabilities: string[];
  dangerousCapabilities: string[];
  requiredEnvironment: string[];
  lastCheckedAt: string;
  message: string;
  source: 'environment' | 'runtime';
}
