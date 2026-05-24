import {
  IncidentSeverity,
  IncidentStatus,
  OperationType,
  type OperationProvider,
  type Prisma,
} from '@autoops/database';

type IncidentDb = {
  incident: {
    findUnique(args: { where: { operationId: string }; select: { id: true } }): Promise<{ id: string } | null>;
    create(args: { data: Prisma.IncidentCreateInput | Prisma.IncidentUncheckedCreateInput }): Promise<unknown>;
  };
};

type FailedOperationRecord = {
  id: string;
  organizationId: string;
  projectId: string | null;
  provider: OperationProvider;
  operationType: OperationType;
  input: unknown;
  error: unknown;
};

export async function createIncidentForFailedOperation(
  db: IncidentDb,
  operation: FailedOperationRecord,
): Promise<void> {
  const existing = await db.incident.findUnique({
    where: { operationId: operation.id },
    select: { id: true },
  });
  if (existing) return;

  const input = toRecord(operation.input);
  const target = targetForOperation(operation.operationType, input);
  const severity = severityForOperation(operation.operationType, input);

  await db.incident.create({
    data: {
      organizationId: operation.organizationId,
      projectId: operation.projectId,
      operationId: operation.id,
      title: titleForOperation(operation.operationType, target.label),
      description: `AutoOps created this incident from failed operation ${operation.id}.`,
      severity,
      status: IncidentStatus.OPEN,
      source: 'operation',
      provider: operation.provider,
      targetKind: target.kind,
      targetName: target.label,
      safeErrorMessage: safeError(operation.error),
      runbookKey: runbookKey(operation.operationType),
      events: {
        create: {
          type: 'CREATED',
          message: 'Incident created from failed operation.',
          metadata: {},
        },
      },
    },
  });
}

function severityForOperation(type: OperationType, input: Record<string, unknown>): IncidentSeverity {
  if (type === OperationType.DOCKER_CONTAINER_RESTART) return IncidentSeverity.HIGH;
  if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return IncidentSeverity.HIGH;
  if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) {
    const replicas = typeof input.replicas === 'number' ? input.replicas : 0;
    return replicas > 2 ? IncidentSeverity.HIGH : IncidentSeverity.MEDIUM;
  }
  if (
    type === OperationType.TERRAFORM_APPLY ||
    type === OperationType.AWS_TERRAFORM_ECS_APPLY ||
    type === OperationType.ANSIBLE_RUN
  ) {
    return IncidentSeverity.HIGH;
  }
  if (type === OperationType.AWS_ECR_IMAGE_PUSH) return IncidentSeverity.MEDIUM;
  return IncidentSeverity.MEDIUM;
}

function runbookKey(type: OperationType): string {
  if (type === OperationType.JENKINS_BUILD_TRIGGER) return 'jenkins-build-failure';
  if (type === OperationType.DOCKER_CONTAINER_RESTART) return 'docker-restart-failure';
  if (type === OperationType.DOCKER_CONTAINER_START || type === OperationType.DOCKER_CONTAINER_STOP) {
    return 'docker-container-action-failure';
  }
  if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) return 'kubernetes-scale-failure';
  if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return 'kubernetes-rollout-failure';
  if (
    type === OperationType.TERRAFORM_VALIDATE ||
    type === OperationType.TERRAFORM_PLAN ||
    type === OperationType.TERRAFORM_APPLY ||
    type === OperationType.AWS_TERRAFORM_ECS_PLAN ||
    type === OperationType.AWS_TERRAFORM_ECS_APPLY
  ) {
    return 'terraform-operation-failure';
  }
  if (
    type === OperationType.ANSIBLE_SYNTAX_CHECK ||
    type === OperationType.ANSIBLE_CHECK ||
    type === OperationType.ANSIBLE_RUN
  ) {
    return 'ansible-operation-failure';
  }
  if (type === OperationType.AWS_ECR_IMAGE_BUILD || type === OperationType.AWS_ECR_IMAGE_PUSH) {
    return 'aws-ecr-image-operation-failure';
  }
  return 'operation-failure';
}

function titleForOperation(type: OperationType, target: string | null): string {
  const label = target ? `: ${target}` : '';
  if (type === OperationType.JENKINS_BUILD_TRIGGER) return `Jenkins build failed${label}`;
  if (type === OperationType.DOCKER_CONTAINER_START) return `Docker container start failed${label}`;
  if (type === OperationType.DOCKER_CONTAINER_STOP) return `Docker container stop failed${label}`;
  if (type === OperationType.DOCKER_CONTAINER_RESTART) return `Docker container restart failed${label}`;
  if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE) return `Kubernetes deployment scale failed${label}`;
  if (type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) return `Kubernetes rollout restart failed${label}`;
  if (type === OperationType.TERRAFORM_VALIDATE) return `Terraform/OpenTofu validate failed${label}`;
  if (type === OperationType.TERRAFORM_PLAN) return `Terraform/OpenTofu plan failed${label}`;
  if (type === OperationType.TERRAFORM_APPLY) return `Terraform/OpenTofu apply failed${label}`;
  if (type === OperationType.AWS_TERRAFORM_ECS_PLAN) return `AWS Terraform ECS plan failed${label}`;
  if (type === OperationType.AWS_TERRAFORM_ECS_APPLY) return `AWS Terraform ECS apply failed${label}`;
  if (type === OperationType.ANSIBLE_SYNTAX_CHECK) return `Ansible syntax check failed${label}`;
  if (type === OperationType.ANSIBLE_CHECK) return `Ansible check mode failed${label}`;
  if (type === OperationType.ANSIBLE_RUN) return `Ansible run failed${label}`;
  if (type === OperationType.AWS_ECR_IMAGE_BUILD) return `AWS ECR image build failed${label}`;
  if (type === OperationType.AWS_ECR_IMAGE_PUSH) return `AWS ECR image push failed${label}`;
  return `Operation failed${label}`;
}

function targetForOperation(type: OperationType, input: Record<string, unknown>): { kind: string | null; label: string | null } {
  if (type === OperationType.JENKINS_BUILD_TRIGGER) {
    return { kind: 'Jenkins job', label: stringField(input, 'jobName') };
  }
  if (
    type === OperationType.DOCKER_CONTAINER_START ||
    type === OperationType.DOCKER_CONTAINER_STOP ||
    type === OperationType.DOCKER_CONTAINER_RESTART
  ) {
    return {
      kind: 'Docker container',
      label: stringField(input, 'containerName') ?? stringField(input, 'containerId'),
    };
  }
  if (type === OperationType.KUBERNETES_DEPLOYMENT_SCALE || type === OperationType.KUBERNETES_DEPLOYMENT_RESTART) {
    const namespace = stringField(input, 'namespace');
    const name = stringField(input, 'name');
    return { kind: 'Kubernetes deployment', label: namespace && name ? `${namespace}/${name}` : name };
  }
  if (
    type === OperationType.TERRAFORM_VALIDATE ||
    type === OperationType.TERRAFORM_PLAN ||
    type === OperationType.TERRAFORM_APPLY ||
    type === OperationType.AWS_TERRAFORM_ECS_PLAN ||
    type === OperationType.AWS_TERRAFORM_ECS_APPLY
  ) {
    return { kind: 'Terraform/OpenTofu workspace', label: stringField(input, 'workspaceSlug') };
  }
  if (
    type === OperationType.ANSIBLE_SYNTAX_CHECK ||
    type === OperationType.ANSIBLE_CHECK ||
    type === OperationType.ANSIBLE_RUN
  ) {
    return { kind: 'Ansible playbook', label: stringField(input, 'playbookSlug') };
  }
  if (type === OperationType.AWS_ECR_IMAGE_BUILD || type === OperationType.AWS_ECR_IMAGE_PUSH) {
    const repository = stringField(input, 'repositoryName');
    const tag = stringField(input, 'imageTag');
    return { kind: 'AWS ECR image', label: repository && tag ? `${repository}:${tag}` : repository };
  }
  return { kind: null, label: null };
}

function safeError(value: unknown): string {
  const record = toRecord(value);
  const message = stringField(record, 'message') ?? 'Operation failed.';
  return message.replace(/\s+/g, ' ').slice(0, 500);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
