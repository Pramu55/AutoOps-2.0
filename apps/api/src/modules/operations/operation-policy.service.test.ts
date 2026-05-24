import { describe, expect, it } from 'vitest';
import { OperationProvider, OperationRiskLevel, OperationType } from '@autoops/types';
import { evaluateOperationPolicy } from './operation-policy.service.js';

describe('evaluateOperationPolicy', () => {
  it('keeps Jenkins build confirmation-only', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.JENKINS,
      operationType: OperationType.JENKINS_BUILD_TRIGGER,
      input: {},
    });

    expect(decision.approvalRequired).toBe(false);
    expect(decision.confirmationTokenLabel).toBe('BUILD');
    expect(decision.riskLevel).toBe(OperationRiskLevel.LOW);
  });

  it('keeps Docker start confirmation-only', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.DOCKER,
      operationType: OperationType.DOCKER_CONTAINER_START,
      input: {},
    });

    expect(decision.approvalRequired).toBe(false);
    expect(decision.confirmationTokenLabel).toBe('START');
  });

  it.each([
    [OperationType.DOCKER_CONTAINER_STOP, 'STOP'],
    [OperationType.DOCKER_CONTAINER_RESTART, 'RESTART'],
  ])('requires approval for Docker %s', (operationType, confirmationTokenLabel) => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.DOCKER,
      operationType,
      input: {},
    });

    expect(decision.approvalRequired).toBe(true);
    expect(decision.confirmationTokenLabel).toBe(confirmationTokenLabel);
    expect(decision.approvalReason).toContain('interrupt a service');
  });

  it.each([0, 1, 2])('does not require approval for Kubernetes scale to %s replicas', (replicas) => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.KUBERNETES,
      operationType: OperationType.KUBERNETES_DEPLOYMENT_SCALE,
      input: { replicas },
    });

    expect(decision.approvalRequired).toBe(false);
    expect(decision.confirmationTokenLabel).toBe('SCALE');
  });

  it('requires approval for Kubernetes scale above 2 replicas', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.KUBERNETES,
      operationType: OperationType.KUBERNETES_DEPLOYMENT_SCALE,
      input: { replicas: 3 },
    });

    expect(decision.approvalRequired).toBe(true);
    expect(decision.confirmationTokenLabel).toBe('SCALE');
    expect(decision.approvalReason).toContain('Scaling above 2 replicas');
  });

  it('keeps Kubernetes rollout restart confirmation-only', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.KUBERNETES,
      operationType: OperationType.KUBERNETES_DEPLOYMENT_RESTART,
      input: {},
    });

    expect(decision.approvalRequired).toBe(false);
    expect(decision.confirmationTokenLabel).toBe('ROLLOUT');
  });

  it('defaults unknown operation types to safe approval required', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.AWS,
      operationType: OperationType.AWS_DEPLOYMENT,
      input: {},
    });

    expect(decision.approvalRequired).toBe(true);
    expect(decision.riskLevel).toBe(OperationRiskLevel.HIGH);
    expect(decision.approvalReason).toContain('Unknown operation type');
  });

  it.each([
    [OperationType.TERRAFORM_VALIDATE, 'VALIDATE'],
    [OperationType.TERRAFORM_PLAN, 'PLAN'],
    [OperationType.ANSIBLE_SYNTAX_CHECK, 'SYNTAX'],
    [OperationType.ANSIBLE_CHECK, 'CHECK'],
  ])('keeps infrastructure %s confirmation-only', (operationType, confirmationTokenLabel) => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.INFRASTRUCTURE,
      operationType,
      input: {},
    });

    expect(decision.approvalRequired).toBe(false);
    expect(decision.confirmationTokenLabel).toBe(confirmationTokenLabel);
    expect(decision.riskLevel).toBe(OperationRiskLevel.LOW);
  });

  it('requires approval for Terraform/OpenTofu apply', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.INFRASTRUCTURE,
      operationType: OperationType.TERRAFORM_APPLY,
      input: {},
    });

    expect(decision.approvalRequired).toBe(true);
    expect(decision.confirmationTokenLabel).toBe('APPLY');
    expect(decision.riskLevel).toBe(OperationRiskLevel.HIGH);
  });

  it('requires approval for Ansible run', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.INFRASTRUCTURE,
      operationType: OperationType.ANSIBLE_RUN,
      input: {},
    });

    expect(decision.approvalRequired).toBe(true);
    expect(decision.confirmationTokenLabel).toBe('RUN');
    expect(decision.riskLevel).toBe(OperationRiskLevel.HIGH);
  });

  it('keeps AWS ECR image build confirmation-only', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.AWS,
      operationType: OperationType.AWS_ECR_IMAGE_BUILD,
      input: { environmentSlug: 'staging' },
    });

    expect(decision.approvalRequired).toBe(false);
    expect(decision.confirmationTokenLabel).toBe('BUILD');
    expect(decision.riskLevel).toBe(OperationRiskLevel.MEDIUM);
  });

  it('keeps non-production AWS ECR image push confirmation-only', () => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.AWS,
      operationType: OperationType.AWS_ECR_IMAGE_PUSH,
      input: { environmentSlug: 'staging' },
    });

    expect(decision.approvalRequired).toBe(false);
    expect(decision.confirmationTokenLabel).toBe('PUSH');
    expect(decision.riskLevel).toBe(OperationRiskLevel.MEDIUM);
  });

  it.each(['production', 'prod'])('requires approval for %s AWS ECR image push', (environmentSlug) => {
    const decision = evaluateOperationPolicy({
      provider: OperationProvider.AWS,
      operationType: OperationType.AWS_ECR_IMAGE_PUSH,
      input: { environmentSlug },
    });

    expect(decision.approvalRequired).toBe(true);
    expect(decision.confirmationTokenLabel).toBe('PUSH');
    expect(decision.riskLevel).toBe(OperationRiskLevel.HIGH);
    expect(decision.approvalReason).toContain('production image');
  });
});
