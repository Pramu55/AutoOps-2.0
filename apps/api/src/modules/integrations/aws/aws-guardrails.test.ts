import { describe, expect, it } from 'vitest';
import { evaluateAwsGuardrails, getAwsGuardrailConfigStatus } from '@autoops/utils';

const baseConfig = {
  costGuardrailsEnabled: true,
  blastRadiusGuardrailsEnabled: true,
  allowedAccountIds: ['123456789012'],
  allowedRegions: ['ap-south-1'],
  maxPlanAddCount: 10,
  maxPlanChangeCount: 20,
  maxMonthlyCostDeltaUsd: 100,
  maxFargateCpu: 1024,
  maxFargateMemoryMb: 2048,
  maxDesiredCount: 2,
  blockPublicLoadBalancerByDefault: true,
  allowPublicLoadBalancer: false,
};

const baseInput = {
  operationId: 'op-1',
  targetSlug: 'aws-sample-ecs-app',
  environmentSlug: 'staging',
  accountId: '123456789012',
  region: 'ap-south-1',
  addCount: 1,
  changeCount: 0,
  destroyCount: 0,
  planOutput: '',
};

describe('AWS cost and blast-radius guardrails', () => {
  it('reports missing account and region allowlists as required configuration', () => {
    const status = getAwsGuardrailConfigStatus({
      ...baseConfig,
      allowedAccountIds: [],
      allowedRegions: [],
    });

    expect(status.missing).toEqual(['AWS_ALLOWED_ACCOUNT_IDS', 'AWS_ALLOWED_REGIONS']);
    expect(status.allowedAccountIdsConfigured).toBe(false);
    expect(status.allowedRegionsConfigured).toBe(false);
  });

  it('blocks destroy actions', () => {
    const result = evaluateAwsGuardrails({ ...baseInput, destroyCount: 1 }, baseConfig);

    expect(result.status).toBe('BLOCKED');
    expect(result.riskLevel).toBe('BLOCKED');
    expect(result.applyEligible).toBe(false);
    expect(result.blockedReasons.map((item) => item.code)).toContain('DESTROY_DETECTED');
  });

  it('blocks disallowed account and region', () => {
    const result = evaluateAwsGuardrails(
      { ...baseInput, accountId: '999999999999', region: 'us-east-1' },
      baseConfig,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockedReasons.map((item) => item.code)).toEqual(
      expect.arrayContaining(['DISALLOWED_ACCOUNT', 'DISALLOWED_REGION']),
    );
  });

  it('blocks add and change counts above configured limits', () => {
    const result = evaluateAwsGuardrails({ ...baseInput, addCount: 11, changeCount: 21 }, baseConfig);

    expect(result.status).toBe('BLOCKED');
    expect(result.blockedReasons.map((item) => item.code)).toEqual(
      expect.arrayContaining(['ADD_COUNT_LIMIT', 'CHANGE_COUNT_LIMIT']),
    );
  });

  it('blocks public load balancer changes by default', () => {
    const result = evaluateAwsGuardrails(
      { ...baseInput, planOutput: 'resource "aws_lb" "public" { internal = false load_balancer_type = "application" }' },
      baseConfig,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockedReasons.map((item) => item.code)).toContain('PUBLIC_LOAD_BALANCER_BLOCKED');
  });

  it('blocks desired count and Fargate size over limits', () => {
    const result = evaluateAwsGuardrails(
      {
        ...baseInput,
        planOutput: '"desired_count": 4\n"cpu": 2048\n"memory": 4096',
      },
      baseConfig,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockedReasons.map((item) => item.code)).toEqual(
      expect.arrayContaining(['DESIRED_COUNT_LIMIT', 'FARGATE_CPU_LIMIT', 'FARGATE_MEMORY_LIMIT']),
    );
  });

  it('blocks conservative estimated monthly cost over the configured max', () => {
    const result = evaluateAwsGuardrails(
      {
        ...baseInput,
        planOutput: '"desired_count": 2\n"cpu": 1024\n"memory": 2048\naws_nat_gateway.example',
      },
      { ...baseConfig, maxMonthlyCostDeltaUsd: 10 },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockedReasons.map((item) => item.code)).toContain('MONTHLY_COST_LIMIT');
    expect(result.costEstimate.notes).toEqual(
      expect.arrayContaining(['Conservative local estimate only.', 'Not a billing guarantee.']),
    );
  });

  it('warns and escalates risk for unknown high-impact resources', () => {
    const result = evaluateAwsGuardrails(
      { ...baseInput, planOutput: 'resource "aws_db_instance" "main" {}' },
      baseConfig,
    );

    expect(result.status).toBe('WARNED');
    expect(result.riskLevel).toBe('HIGH');
    expect(result.warnings.map((item) => item.code)).toContain('HIGH_IMPACT_RESOURCE');
  });
});
