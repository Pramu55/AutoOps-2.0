import {
  OperationProvider,
  OperationRiskLevel,
  OperationType,
} from '@autoops/types';

export type OperationPolicyInput = {
  provider: OperationProvider;
  operationType: OperationType;
  input: Record<string, unknown>;
};

export type OperationPolicyDecision = {
  riskLevel: OperationRiskLevel;
  confirmationRequired: boolean;
  confirmationTokenLabel: string | null;
  approvalRequired: boolean;
  approvalReason: string | null;
  policyName: string;
};

const LOCAL_POLICY_NAME = 'local-pilot-operation-policy-v1';

export function evaluateOperationPolicy(input: OperationPolicyInput): OperationPolicyDecision {
  if (
    input.provider === OperationProvider.JENKINS &&
    input.operationType === OperationType.JENKINS_BUILD_TRIGGER
  ) {
    return confirmationOnly(OperationRiskLevel.LOW, 'BUILD');
  }

  if (
    input.provider === OperationProvider.DOCKER &&
    input.operationType === OperationType.DOCKER_CONTAINER_START
  ) {
    return confirmationOnly(OperationRiskLevel.MEDIUM, 'START');
  }

  if (
    input.provider === OperationProvider.DOCKER &&
    input.operationType === OperationType.DOCKER_CONTAINER_STOP
  ) {
    return approvalRequired(
      OperationRiskLevel.MEDIUM,
      'STOP',
      'Stopping a running container may interrupt a service.',
    );
  }

  if (
    input.provider === OperationProvider.DOCKER &&
    input.operationType === OperationType.DOCKER_CONTAINER_RESTART
  ) {
    return approvalRequired(
      OperationRiskLevel.MEDIUM,
      'RESTART',
      'Restarting a container may interrupt a service.',
    );
  }

  if (
    input.provider === OperationProvider.KUBERNETES &&
    input.operationType === OperationType.KUBERNETES_DEPLOYMENT_RESTART
  ) {
    return confirmationOnly(OperationRiskLevel.MEDIUM, 'ROLLOUT');
  }

  if (
    input.provider === OperationProvider.KUBERNETES &&
    input.operationType === OperationType.KUBERNETES_DEPLOYMENT_SCALE
  ) {
    const replicas = numberField(input.input, 'replicas');
    if (replicas !== null && replicas > 2) {
      return approvalRequired(
        OperationRiskLevel.MEDIUM,
        'SCALE',
        'Scaling above 2 replicas requires approval in the local policy.',
      );
    }

    return confirmationOnly(OperationRiskLevel.MEDIUM, 'SCALE');
  }

  if (
    (input.provider === OperationProvider.INFRASTRUCTURE || input.provider === OperationProvider.AWS) &&
    input.operationType === OperationType.TERRAFORM_VALIDATE
  ) {
    return confirmationOnly(OperationRiskLevel.LOW, 'VALIDATE');
  }

  if (
    (input.provider === OperationProvider.INFRASTRUCTURE || input.provider === OperationProvider.AWS) &&
    input.operationType === OperationType.TERRAFORM_PLAN
  ) {
    return confirmationOnly(OperationRiskLevel.LOW, 'PLAN');
  }

  if (
    (input.provider === OperationProvider.INFRASTRUCTURE || input.provider === OperationProvider.AWS) &&
    input.operationType === OperationType.TERRAFORM_APPLY
  ) {
    return approvalRequired(
      OperationRiskLevel.HIGH,
      'APPLY',
      'Terraform/OpenTofu apply changes infrastructure and requires approval.',
    );
  }

  if (
    input.provider === OperationProvider.AWS &&
    input.operationType === OperationType.AWS_ECR_IMAGE_BUILD
  ) {
    return confirmationOnly(OperationRiskLevel.MEDIUM, 'BUILD');
  }

  if (
    input.provider === OperationProvider.AWS &&
    input.operationType === OperationType.AWS_ECR_IMAGE_PUSH
  ) {
    const environmentSlug = stringField(input.input, 'environmentSlug')?.toLowerCase();
    const productionPushRequiresApproval = process.env.AWS_ECR_PRODUCTION_PUSH_REQUIRES_APPROVAL !== 'false';
    if (productionPushRequiresApproval && (environmentSlug === 'production' || environmentSlug === 'prod')) {
      return approvalRequired(
        OperationRiskLevel.HIGH,
        'PUSH',
        'Pushing a production image to ECR requires approval.',
      );
    }
    return confirmationOnly(OperationRiskLevel.MEDIUM, 'PUSH');
  }

  if (
    input.provider === OperationProvider.AWS &&
    input.operationType === OperationType.AWS_TERRAFORM_ECS_PLAN
  ) {
    return confirmationOnly(OperationRiskLevel.MEDIUM, 'PLAN');
  }

  if (
    input.provider === OperationProvider.INFRASTRUCTURE &&
    input.operationType === OperationType.ANSIBLE_SYNTAX_CHECK
  ) {
    return confirmationOnly(OperationRiskLevel.LOW, 'SYNTAX');
  }

  if (
    input.provider === OperationProvider.INFRASTRUCTURE &&
    input.operationType === OperationType.ANSIBLE_CHECK
  ) {
    return confirmationOnly(OperationRiskLevel.LOW, 'CHECK');
  }

  if (
    input.provider === OperationProvider.INFRASTRUCTURE &&
    input.operationType === OperationType.ANSIBLE_RUN
  ) {
    return approvalRequired(
      OperationRiskLevel.HIGH,
      'RUN',
      'Ansible run can change managed systems and requires approval.',
    );
  }

  return approvalRequired(
    OperationRiskLevel.HIGH,
    null,
    'Unknown operation type requires approval.',
  );
}

function confirmationOnly(
  riskLevel: OperationRiskLevel,
  confirmationTokenLabel: string | null,
): OperationPolicyDecision {
  return {
    riskLevel,
    confirmationRequired: confirmationTokenLabel !== null,
    confirmationTokenLabel,
    approvalRequired: false,
    approvalReason: null,
    policyName: LOCAL_POLICY_NAME,
  };
}

function approvalRequired(
  riskLevel: OperationRiskLevel,
  confirmationTokenLabel: string | null,
  approvalReason: string,
): OperationPolicyDecision {
  return {
    riskLevel,
    confirmationRequired: confirmationTokenLabel !== null,
    confirmationTokenLabel,
    approvalRequired: true,
    approvalReason,
    policyName: LOCAL_POLICY_NAME,
  };
}

function numberField(input: Record<string, unknown>, key: string): number | null {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringField(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
