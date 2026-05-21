import { z } from 'zod';
import { OperationStatus } from './operation.js';
import { OperationRiskLevel } from './ops.js';

export const InfrastructureToolConnectionStatus = {
  CONNECTED: 'CONNECTED',
  NOT_INSTALLED: 'NOT_INSTALLED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNREACHABLE: 'UNREACHABLE',
  ERROR: 'ERROR',
} as const;
export type InfrastructureToolConnectionStatus =
  (typeof InfrastructureToolConnectionStatus)[keyof typeof InfrastructureToolConnectionStatus];

export const InfrastructureOperationKind = {
  TERRAFORM_VALIDATE: 'TERRAFORM_VALIDATE',
  TERRAFORM_PLAN: 'TERRAFORM_PLAN',
  TERRAFORM_APPLY: 'TERRAFORM_APPLY',
  ANSIBLE_SYNTAX_CHECK: 'ANSIBLE_SYNTAX_CHECK',
  ANSIBLE_CHECK: 'ANSIBLE_CHECK',
  ANSIBLE_RUN: 'ANSIBLE_RUN',
} as const;
export type InfrastructureOperationKind =
  (typeof InfrastructureOperationKind)[keyof typeof InfrastructureOperationKind];

export const infrastructureConfirmationSchema = z.object({
  confirmationToken: z.string().trim().min(1).max(32),
});

export const terraformWorkspaceParamsSchema = z.object({
  workspaceSlug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,63}$/i),
});

export const ansiblePlaybookParamsSchema = z.object({
  playbookSlug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,63}$/i),
});

export type TerraformPlanRequest = z.infer<typeof infrastructureConfirmationSchema>;
export type TerraformApplyRequest = z.infer<typeof infrastructureConfirmationSchema>;
export type AnsibleCheckRequest = z.infer<typeof infrastructureConfirmationSchema>;
export type AnsibleRunRequest = z.infer<typeof infrastructureConfirmationSchema>;

export interface InfrastructureToolStatus {
  status: InfrastructureToolConnectionStatus;
  configured: boolean;
  tool: 'terraform' | 'tofu' | 'ansible-playbook' | null;
  version: string | null;
  checkedAt: string;
  message: string;
}

export interface InfrastructureProviderStatus {
  terraform: InfrastructureToolStatus;
  ansible: InfrastructureToolStatus;
}

export interface TerraformWorkspaceSummary {
  slug: string;
  displayName: string;
  relativePath: string;
  tool: 'terraform' | 'tofu' | null;
  status: InfrastructureToolConnectionStatus;
  version: string | null;
  lastCheckedAt: string;
  allowedActions: Array<'validate' | 'plan' | 'apply'>;
  requiresApproval: {
    validate: false;
    plan: false;
    apply: true;
  };
}

export interface AnsiblePlaybookSummary {
  slug: string;
  displayName: string;
  relativePath: string;
  inventoryRelativePath: string;
  status: InfrastructureToolConnectionStatus;
  version: string | null;
  lastCheckedAt: string;
  allowedActions: Array<'syntax-check' | 'check' | 'run'>;
  requiresApproval: {
    syntaxCheck: false;
    check: false;
    run: true;
  };
}

export interface TerraformRunSummary {
  tool: 'terraform' | 'tofu';
  workspaceSlug: string;
  relativePath: string;
  action: 'validate' | 'plan' | 'apply';
  status: 'completed' | 'failed';
  safeOutputSummary: string;
  durationMs: number;
}

export interface AnsibleRunSummary {
  tool: 'ansible-playbook';
  playbookSlug: string;
  relativePath: string;
  inventoryRelativePath: string;
  action: 'syntax-check' | 'check' | 'run';
  status: 'completed' | 'failed';
  safeOutputSummary: string;
  durationMs: number;
}

export interface TerraformOperationResponse {
  operationId: string;
  status: OperationStatus;
  approvalRequired: boolean;
  approvalReason: string | null;
  riskLevel: OperationRiskLevel;
  policyName: string | null;
  message: string;
}

export interface AnsibleOperationResponse extends TerraformOperationResponse {}

export interface InfrastructureAutomationSummaryResponse {
  status: InfrastructureProviderStatus;
  terraformWorkspaces: TerraformWorkspaceSummary[];
  ansiblePlaybooks: AnsiblePlaybookSummary[];
  recentOperations: Array<{
    operationId: string;
    kind: InfrastructureOperationKind;
    status: OperationStatus;
    target: string | null;
    riskLevel: OperationRiskLevel;
    approvalRequired: boolean;
    createdAt: string;
  }>;
  generatedAt: string;
}
