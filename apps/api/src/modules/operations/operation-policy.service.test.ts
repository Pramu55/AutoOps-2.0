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
});
