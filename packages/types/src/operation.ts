import { z } from 'zod';
import { idSchema } from './common.js';

export const OperationProvider = {
  KUBERNETES: 'KUBERNETES',
  AWS: 'AWS',
  JENKINS: 'JENKINS',
  GITHUB: 'GITHUB',
  DOCKER: 'DOCKER',
  INFRASTRUCTURE: 'INFRASTRUCTURE',
} as const;
export type OperationProvider = (typeof OperationProvider)[keyof typeof OperationProvider];

export const OperationType = {
  KUBERNETES_DEPLOYMENT_SCALE: 'KUBERNETES_DEPLOYMENT_SCALE',
  KUBERNETES_DEPLOYMENT_RESTART: 'KUBERNETES_DEPLOYMENT_RESTART',
  KUBERNETES_MANIFEST_DRY_RUN: 'KUBERNETES_MANIFEST_DRY_RUN',
  KUBERNETES_MANIFEST_APPLY: 'KUBERNETES_MANIFEST_APPLY',
  JENKINS_BUILD_TRIGGER: 'JENKINS_BUILD_TRIGGER',
  DOCKER_CONTAINER_START: 'DOCKER_CONTAINER_START',
  DOCKER_CONTAINER_STOP: 'DOCKER_CONTAINER_STOP',
  DOCKER_CONTAINER_RESTART: 'DOCKER_CONTAINER_RESTART',
  TERRAFORM_VALIDATE: 'TERRAFORM_VALIDATE',
  TERRAFORM_PLAN: 'TERRAFORM_PLAN',
  TERRAFORM_APPLY: 'TERRAFORM_APPLY',
  ANSIBLE_SYNTAX_CHECK: 'ANSIBLE_SYNTAX_CHECK',
  ANSIBLE_CHECK: 'ANSIBLE_CHECK',
  ANSIBLE_RUN: 'ANSIBLE_RUN',
  GITHUB_WORKFLOW_DISPATCH: 'GITHUB_WORKFLOW_DISPATCH',
  AWS_DEPLOYMENT: 'AWS_DEPLOYMENT',
  DEPLOYMENT_ROLLBACK: 'DEPLOYMENT_ROLLBACK',
} as const;
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export const OperationStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type OperationStatus = (typeof OperationStatus)[keyof typeof OperationStatus];

export interface Operation {
  id: string;
  organizationId: string;
  projectId: string | null;
  environmentId: string | null;
  provider: OperationProvider;
  operationType: OperationType;
  status: OperationStatus;
  requestedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectedByUserId: string | null;
  rejectedAt: string | null;
  idempotencyKey: string | null;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const operationParamsSchema = z.object({
  operationId: idSchema,
});

export const approvalDecisionSchema = z.object({
  reason: z.string().max(500).optional(),
});
