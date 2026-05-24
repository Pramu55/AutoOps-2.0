export type AwsGuardrailStatusValue = 'PASSED' | 'WARNED' | 'BLOCKED' | 'NOT_CONFIGURED';
export type AwsGuardrailRiskLevelValue = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

export type AwsGuardrailReason = {
  code: string;
  message: string;
};

export type AwsGuardrailConfig = {
  costGuardrailsEnabled: boolean;
  blastRadiusGuardrailsEnabled: boolean;
  allowedAccountIds: string[];
  allowedRegions: string[];
  maxPlanAddCount: number;
  maxPlanChangeCount: number;
  maxMonthlyCostDeltaUsd: number;
  maxFargateCpu: number;
  maxFargateMemoryMb: number;
  maxDesiredCount: number;
  blockPublicLoadBalancerByDefault: boolean;
  allowPublicLoadBalancer: boolean;
};

export type AwsGuardrailConfigStatus = Omit<AwsGuardrailConfig, 'allowedAccountIds' | 'allowedRegions'> & {
  allowedAccountIdsConfigured: boolean;
  allowedRegionsConfigured: boolean;
  missing: string[];
};

export type AwsGuardrailPlanInput = {
  operationId?: string | null;
  targetSlug: string;
  environmentSlug: string;
  accountId?: string | null;
  region?: string | null;
  addCount: number;
  changeCount: number;
  destroyCount: number;
  planOutput?: string | null;
  resourceChanges?: Array<Record<string, unknown>>;
};

export type AwsGuardrailEvaluation = {
  operationId: string | null;
  targetSlug: string;
  environmentSlug: string;
  status: AwsGuardrailStatusValue;
  riskLevel: AwsGuardrailRiskLevelValue;
  accountAllowed: boolean | null;
  regionAllowed: boolean | null;
  accountIdMasked: string | null;
  region: string | null;
  costEstimate: {
    estimatedMonthlyMinUsd: number;
    estimatedMonthlyMaxUsd: number;
    estimatedMonthlyDeltaUsd: number;
    currency: 'USD';
    confidence: 'LOW' | 'MEDIUM';
    notes: string[];
  };
  blastRadius: {
    addCount: number;
    changeCount: number;
    destroyCount: number;
    replacementCount: number;
    publicLoadBalancerDetected: boolean;
    iamChangeDetected: boolean;
    securityGroupChangeDetected: boolean;
    networkChangeDetected: boolean;
    desiredCount: number | null;
    fargateCpu: number | null;
    fargateMemoryMb: number | null;
    unknownHighImpactResources: string[];
  };
  blockedReasons: AwsGuardrailReason[];
  warnings: AwsGuardrailReason[];
  applyEligible: boolean;
  evaluatedAt: string;
};

export function getAwsGuardrailConfig(env: NodeJS.ProcessEnv = process.env): AwsGuardrailConfig {
  return {
    costGuardrailsEnabled: env.AWS_COST_GUARDRAILS_ENABLED !== 'false',
    blastRadiusGuardrailsEnabled: env.AWS_BLAST_RADIUS_GUARDRAILS_ENABLED !== 'false',
    allowedAccountIds: listEnv(env.AWS_ALLOWED_ACCOUNT_IDS),
    allowedRegions: listEnv(env.AWS_ALLOWED_REGIONS),
    maxPlanAddCount: numberEnv(env.AWS_MAX_PLAN_ADD_COUNT, 10),
    maxPlanChangeCount: numberEnv(env.AWS_MAX_PLAN_CHANGE_COUNT, 20),
    maxMonthlyCostDeltaUsd: numberEnv(env.AWS_MAX_MONTHLY_COST_DELTA_USD, 100),
    maxFargateCpu: numberEnv(env.AWS_MAX_FARGATE_CPU, 1024),
    maxFargateMemoryMb: numberEnv(env.AWS_MAX_FARGATE_MEMORY_MB, 2048),
    maxDesiredCount: numberEnv(env.AWS_MAX_DESIRED_COUNT, 2),
    blockPublicLoadBalancerByDefault: env.AWS_BLOCK_PUBLIC_LOAD_BALANCER_BY_DEFAULT !== 'false',
    allowPublicLoadBalancer: env.AWS_ALLOW_PUBLIC_LOAD_BALANCER === 'true',
  };
}

export function getAwsGuardrailConfigStatus(config = getAwsGuardrailConfig()): AwsGuardrailConfigStatus {
  const missing: string[] = [];
  if (config.allowedAccountIds.length === 0) missing.push('AWS_ALLOWED_ACCOUNT_IDS');
  if (config.allowedRegions.length === 0) missing.push('AWS_ALLOWED_REGIONS');

  return {
    costGuardrailsEnabled: config.costGuardrailsEnabled,
    blastRadiusGuardrailsEnabled: config.blastRadiusGuardrailsEnabled,
    allowedAccountIdsConfigured: config.allowedAccountIds.length > 0,
    allowedRegionsConfigured: config.allowedRegions.length > 0,
    maxPlanAddCount: config.maxPlanAddCount,
    maxPlanChangeCount: config.maxPlanChangeCount,
    maxMonthlyCostDeltaUsd: config.maxMonthlyCostDeltaUsd,
    maxFargateCpu: config.maxFargateCpu,
    maxFargateMemoryMb: config.maxFargateMemoryMb,
    maxDesiredCount: config.maxDesiredCount,
    blockPublicLoadBalancerByDefault: config.blockPublicLoadBalancerByDefault,
    allowPublicLoadBalancer: config.allowPublicLoadBalancer,
    missing,
  };
}

export function evaluateAwsGuardrails(
  input: AwsGuardrailPlanInput,
  config: AwsGuardrailConfig = getAwsGuardrailConfig(),
): AwsGuardrailEvaluation {
  const blockedReasons: AwsGuardrailReason[] = [];
  const warnings: AwsGuardrailReason[] = [];
  const output = input.planOutput ?? '';
  const resourceChanges = input.resourceChanges ?? [];
  const text = `${output}\n${resourceChanges.map((item) => JSON.stringify(item)).join('\n')}`.toLowerCase();
  const isProduction = ['production', 'prod'].includes(input.environmentSlug.trim().toLowerCase());

  const accountAllowed =
    input.accountId && config.allowedAccountIds.length > 0
      ? config.allowedAccountIds.includes(input.accountId)
      : null;
  const regionAllowed =
    input.region && config.allowedRegions.length > 0 ? config.allowedRegions.includes(input.region) : null;

  if (config.allowedAccountIds.length === 0) {
    blockedReasons.push(reason('MISSING_ACCOUNT_ALLOWLIST', 'AWS_ALLOWED_ACCOUNT_IDS is required before AWS mutations.'));
  } else if (!input.accountId) {
    blockedReasons.push(reason('MISSING_ACCOUNT_ID', 'AWS account identity is required before AWS mutations.'));
  } else if (!accountAllowed) {
    blockedReasons.push(reason('DISALLOWED_ACCOUNT', 'AWS account is not in the configured allowlist.'));
  }

  if (config.allowedRegions.length === 0) {
    blockedReasons.push(reason('MISSING_REGION_ALLOWLIST', 'AWS_ALLOWED_REGIONS is required before AWS mutations.'));
  } else if (!input.region) {
    blockedReasons.push(reason('MISSING_REGION', 'AWS region is required before AWS mutations.'));
  } else if (!regionAllowed) {
    blockedReasons.push(reason('DISALLOWED_REGION', 'AWS region is not in the configured allowlist.'));
  }

  if (input.destroyCount > 0) {
    blockedReasons.push(reason('DESTROY_DETECTED', 'Terraform plan includes destroy actions.'));
  }
  if (input.addCount > config.maxPlanAddCount) {
    blockedReasons.push(reason('ADD_COUNT_LIMIT', 'Terraform plan add count exceeds the configured maximum.'));
  }
  if (input.changeCount > config.maxPlanChangeCount) {
    blockedReasons.push(reason('CHANGE_COUNT_LIMIT', 'Terraform plan change count exceeds the configured maximum.'));
  }

  const replacementCount = countMatches(text, ['delete_before_replace', '"replace"', 'must be replaced']);
  const publicLoadBalancerDetected = includesAny(text, ['aws_lb', 'load_balancer_type', 'internet-facing', 'public_load_balancer']);
  const iamChangeDetected = includesAny(text, ['aws_iam_', 'iam_role', 'iam_policy']);
  const securityGroupChangeDetected = includesAny(text, ['aws_security_group', 'security_group']);
  const networkChangeDetected = includesAny(text, ['aws_vpc', 'aws_subnet', 'aws_route', 'aws_nat_gateway', 'aws_internet_gateway']);
  const desiredCount = numberFromText(text, ['desired_count', 'desiredcount']);
  const fargateCpu = numberFromText(text, ['cpu']);
  const fargateMemoryMb = numberFromText(text, ['memory', 'memory_mb', 'memorymb']);
  const unknownHighImpactResources = highImpactResources(text);

  if (replacementCount > 0) warnings.push(reason('REPLACEMENT_DETECTED', 'Terraform plan includes replacement actions.'));
  if (iamChangeDetected) warnings.push(reason('IAM_CHANGE_DETECTED', 'IAM changes require careful review.'));
  if (securityGroupChangeDetected) warnings.push(reason('SECURITY_GROUP_CHANGE_DETECTED', 'Security group changes affect network exposure.'));
  if (networkChangeDetected) warnings.push(reason('NETWORK_CHANGE_DETECTED', 'Network changes affect blast radius.'));
  for (const resource of unknownHighImpactResources) {
    warnings.push(reason('HIGH_IMPACT_RESOURCE', `High-impact resource detected: ${resource}.`));
  }
  if (isProduction) warnings.push(reason('PRODUCTION_ENVIRONMENT', 'Production environment increases deployment risk.'));

  if (publicLoadBalancerDetected && config.blockPublicLoadBalancerByDefault && !config.allowPublicLoadBalancer) {
    blockedReasons.push(reason('PUBLIC_LOAD_BALANCER_BLOCKED', 'Public load balancer changes are denied by default.'));
  }
  if (desiredCount !== null && desiredCount > config.maxDesiredCount) {
    blockedReasons.push(reason('DESIRED_COUNT_LIMIT', 'ECS desired count exceeds the configured maximum.'));
  }
  if (fargateCpu !== null && fargateCpu > config.maxFargateCpu) {
    blockedReasons.push(reason('FARGATE_CPU_LIMIT', 'Fargate CPU exceeds the configured maximum.'));
  }
  if (fargateMemoryMb !== null && fargateMemoryMb > config.maxFargateMemoryMb) {
    blockedReasons.push(reason('FARGATE_MEMORY_LIMIT', 'Fargate memory exceeds the configured maximum.'));
  }

  const estimatedMonthlyDeltaUsd = estimateMonthlyCostDelta({
    desiredCount,
    fargateCpu,
    fargateMemoryMb,
    publicLoadBalancerDetected,
    networkChangeDetected,
    output: text,
  });
  if (estimatedMonthlyDeltaUsd > config.maxMonthlyCostDeltaUsd) {
    blockedReasons.push(reason('MONTHLY_COST_LIMIT', 'Estimated monthly cost delta exceeds the configured maximum.'));
  }

  const riskLevel: AwsGuardrailRiskLevelValue =
    blockedReasons.length > 0
      ? 'BLOCKED'
      : warnings.length > 0 || input.changeCount > 0 || isProduction
        ? 'HIGH'
        : input.addCount > 0
          ? 'MEDIUM'
          : 'LOW';
  const status: AwsGuardrailStatusValue =
    blockedReasons.length > 0 ? 'BLOCKED' : warnings.length > 0 ? 'WARNED' : 'PASSED';

  return {
    operationId: input.operationId ?? null,
    targetSlug: input.targetSlug,
    environmentSlug: input.environmentSlug,
    status,
    riskLevel,
    accountAllowed,
    regionAllowed,
    accountIdMasked: input.accountId ? maskAccountId(input.accountId) : null,
    region: input.region ?? null,
    costEstimate: {
      estimatedMonthlyMinUsd: roundCurrency(estimatedMonthlyDeltaUsd * 0.8),
      estimatedMonthlyMaxUsd: roundCurrency(estimatedMonthlyDeltaUsd * 1.2),
      estimatedMonthlyDeltaUsd,
      currency: 'USD',
      confidence: 'LOW',
      notes: [
        'Conservative local estimate only.',
        'Not a billing guarantee.',
        'AWS Pricing API is intentionally not used in this milestone.',
      ],
    },
    blastRadius: {
      addCount: input.addCount,
      changeCount: input.changeCount,
      destroyCount: input.destroyCount,
      replacementCount,
      publicLoadBalancerDetected,
      iamChangeDetected,
      securityGroupChangeDetected,
      networkChangeDetected,
      desiredCount,
      fargateCpu,
      fargateMemoryMb,
      unknownHighImpactResources,
    },
    blockedReasons,
    warnings,
    applyEligible: blockedReasons.length === 0 && input.destroyCount === 0,
    evaluatedAt: new Date().toISOString(),
  };
}

function estimateMonthlyCostDelta(input: {
  desiredCount: number | null;
  fargateCpu: number | null;
  fargateMemoryMb: number | null;
  publicLoadBalancerDetected: boolean;
  networkChangeDetected: boolean;
  output: string;
}): number {
  const desiredCount = input.desiredCount ?? 1;
  const cpuUnits = input.fargateCpu ?? 512;
  const memoryMb = input.fargateMemoryMb ?? 1024;
  const vcpu = cpuUnits / 1024;
  const memoryGb = memoryMb / 1024;
  let total = desiredCount * ((vcpu * 0.04 + memoryGb * 0.0045) * 730);
  if (input.publicLoadBalancerDetected) total += 18;
  if (input.networkChangeDetected && includesAny(input.output, ['nat_gateway', 'aws_nat_gateway'])) total += 32;
  if (includesAny(input.output, ['aws_cloudwatch_log_group', 'log_group'])) total += 3;
  return roundCurrency(total);
}

function listEnv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function numberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function reason(code: string, message: string): AwsGuardrailReason {
  return { code, message };
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle.toLowerCase()));
}

function countMatches(value: string, needles: string[]): number {
  return needles.reduce((count, needle) => count + (value.split(needle.toLowerCase()).length - 1), 0);
}

function numberFromText(value: string, keys: string[]): number | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = value.match(new RegExp(`${escaped}["\\s:=]+(\\d+)`, 'i'));
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function highImpactResources(value: string): string[] {
  const resources = ['aws_db_instance', 'aws_rds_cluster', 'aws_eks_cluster', 'aws_elasticache_cluster'];
  return resources.filter((resource) => value.includes(resource));
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function maskAccountId(value: string): string {
  return value.length <= 4 ? '****' : `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}
