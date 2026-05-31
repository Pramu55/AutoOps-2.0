import { OperationProvider, OperationType } from '@autoops/types';
import type { OperationPolicyInput } from './policy.types.js';
import { env } from '../../config/env.js';

type OperationPolicyBuildInput = {
  organizationId: string;
  userId: string;
  role?: string;
  provider: OperationProvider;
  operationType: OperationType | string;
  projectId?: string;
  environmentId?: string;
  environment?: {
    kind: string;
    name: string;
    slug: string;
  };
  input: Record<string, unknown>;
};

export function buildOperationPolicyInput(input: OperationPolicyBuildInput): OperationPolicyInput {
  return {
    organizationId: input.organizationId,
    user: {
      id: input.userId,
      role: input.role,
    },
    operation: {
      provider: input.provider,
      operationType: input.operationType,
    },
    scope: {
      projectId: input.projectId,
      environmentId: input.environmentId,
      environmentKind: input.environment?.kind,
      environmentName: input.environment?.name,
      environmentSlug: input.environment?.slug,
    },
    target: buildTarget(input),
    policy: {
      jenkins: {
        allowedJobs: env.JENKINS_ALLOWED_JOBS,
      },
      kubernetes: {
        protectedNamespaces: env.POLICY_KUBERNETES_PROTECTED_NAMESPACES,
        scaleApprovalThreshold: env.POLICY_KUBERNETES_SCALE_APPROVAL_THRESHOLD,
      },
    },
  };
}

function buildTarget(input: OperationPolicyBuildInput): Record<string, unknown> {
  if (input.provider === OperationProvider.JENKINS) {
    return {
      jobName: stringValue(input.input.jobName),
      parameterCount: objectKeys(input.input.parameters).length,
    };
  }

  if (input.provider === OperationProvider.KUBERNETES) {
    const manifest = recordValue(input.input.manifest);
    const metadata = recordValue(manifest?.metadata);
    const spec = recordValue(manifest?.spec);

    return {
      namespace:
        stringValue(input.input.namespace) ??
        stringValue(metadata?.namespace) ??
        (input.operationType === OperationType.KUBERNETES_MANIFEST_APPLY ? 'default' : undefined),
      name: stringValue(input.input.name) ?? stringValue(metadata?.name),
      action: stringValue(input.input.action) ?? kubernetesAction(input.operationType),
      kind: stringValue(manifest?.kind),
      apiVersion: stringValue(manifest?.apiVersion),
      replicas: numberValue(input.input.replicas) ?? numberValue(spec?.replicas),
    };
  }

  if (input.provider === OperationProvider.DOCKER) {
    return {
      containerName: stringValue(input.input.containerName),
      action: stringValue(input.input.action) ?? dockerAction(input.operationType),
    };
  }

  return {};
}

function kubernetesAction(operationType: OperationType | string): string | undefined {
  if (operationType === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return 'rollout_restart';
  if (operationType === OperationType.KUBERNETES_MANIFEST_APPLY) return 'apply';
  if (operationType === OperationType.KUBERNETES_MANIFEST_DRY_RUN) return 'dry_run';
  return undefined;
}

function dockerAction(operationType: OperationType | string): string | undefined {
  if (operationType === 'DOCKER_CONTAINER_START') return 'start';
  if (operationType === 'DOCKER_CONTAINER_STOP') return 'stop';
  if (operationType === 'DOCKER_CONTAINER_RESTART') return 'restart';
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function objectKeys(value: unknown): string[] {
  const record = recordValue(value);
  return record ? Object.keys(record) : [];
}
