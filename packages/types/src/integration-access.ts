/**
 * Enterprise data boundary — integration access control types.
 *
 * Classifies data as TENANT_DATA, PROVIDER_STATUS, or PROVIDER_INVENTORY
 * and defines who may access each classification.
 */

/**
 * Data classification for enterprise data boundary model.
 *
 * TENANT_DATA:       Always organization-scoped (projects, operations, incidents, approvals).
 * PROVIDER_STATUS:   Safe connection status visible to all authenticated users. Secret-free.
 * PROVIDER_INVENTORY: Detailed provider data restricted to OWNER/ADMIN roles.
 */
export const DataClassification = {
  TENANT_DATA: 'TENANT_DATA',
  PROVIDER_STATUS: 'PROVIDER_STATUS',
  PROVIDER_INVENTORY: 'PROVIDER_INVENTORY',
} as const;
export type DataClassification = (typeof DataClassification)[keyof typeof DataClassification];

/**
 * Integration providers tracked by the platform.
 */
export const IntegrationProviderType = {
  JENKINS: 'JENKINS',
  GITHUB_ACTIONS: 'GITHUB_ACTIONS',
  DOCKER: 'DOCKER',
  KUBERNETES: 'KUBERNETES',
  AWS: 'AWS',
  TERRAFORM: 'TERRAFORM',
  ANSIBLE: 'ANSIBLE',
  PROMETHEUS: 'PROMETHEUS',
  GRAFANA: 'GRAFANA',
  DEVOPS_TOOLS: 'DEVOPS_TOOLS',
} as const;
export type IntegrationProviderType = (typeof IntegrationProviderType)[keyof typeof IntegrationProviderType];

/**
 * Roles allowed to view provider inventory by default.
 */
export const INVENTORY_ACCESS_ROLES = ['OWNER', 'ADMIN'] as const;
