import type { OperationProvider, OperationType } from '@autoops/types';

export type OpaEnforcementMode = 'shadow' | 'enforce';
export type PolicyRisk = 'low' | 'medium' | 'high' | 'critical';

export type OperationPolicyInput = {
  organizationId: string;
  user: {
    id: string;
    role?: string;
  };
  operation: {
    provider: OperationProvider;
    operationType: OperationType | string;
  };
  scope: {
    projectId?: string;
    environmentId?: string;
    environmentKind?: string;
    environmentName?: string;
    environmentSlug?: string;
  };
  target: Record<string, unknown>;
  policy: {
    jenkins: {
      allowedJobs: string[];
    };
    kubernetes: {
      protectedNamespaces: string[];
      scaleApprovalThreshold: number;
    };
  };
};

export type OperationPolicyDecision = {
  allow: boolean;
  approvalRequired: boolean;
  risk: PolicyRisk;
  reasons: string[];
  controls: string[];
};

export type EvaluatedOperationPolicy = {
  mode: OpaEnforcementMode;
  input: OperationPolicyInput;
  decision: OperationPolicyDecision;
  enforcedDecision: OperationPolicyDecision;
};
