import path from 'node:path';

export type AwsEcrBuildTarget = {
  targetSlug: string;
  displayName: string;
  contextPath: string;
  dockerfilePath: string;
  defaultRepository: string;
  allowedEnvironments: string[];
  allowedPlatforms?: string[];
  absoluteContextPath: string;
  absoluteDockerfilePath: string;
};

const BUILT_IN_TARGETS: Array<Omit<AwsEcrBuildTarget, 'absoluteContextPath' | 'absoluteDockerfilePath'>> = [
  {
    targetSlug: 'aws-sample-ecs-app',
    displayName: 'AWS Sample ECS App',
    contextPath: 'infra/terraform/aws-sample-ecs-app/app',
    dockerfilePath: 'infra/terraform/aws-sample-ecs-app/app/Dockerfile',
    defaultRepository: 'autoops-sample-app',
    allowedEnvironments: ['development', 'staging', 'production'],
    allowedPlatforms: ['linux/amd64'],
  },
];

export function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function listAllowedAwsEcrRepositories(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseCsv(env.AWS_ECR_ALLOWED_REPOSITORIES).filter(isSafeRepositoryName);
}

export function isAllowedAwsEcrRepository(repositoryName: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return listAllowedAwsEcrRepositories(env).includes(repositoryName);
}

export function listAwsEcrBuildTargets(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = process.cwd(),
): AwsEcrBuildTarget[] {
  const allowedSlugs = new Set(parseCsv(env.AWS_ECR_ALLOWED_BUILD_TARGETS));
  const allowedRepos = new Set(listAllowedAwsEcrRepositories(env));

  return BUILT_IN_TARGETS.filter((target) => allowedSlugs.has(target.targetSlug))
    .filter((target) => allowedRepos.has(target.defaultRepository))
    .map((target) => ({
      ...target,
      absoluteContextPath: resolveInsideRoot(repoRoot, target.contextPath),
      absoluteDockerfilePath: resolveInsideRoot(repoRoot, target.dockerfilePath),
    }));
}

export function getAwsEcrBuildTargetBySlug(
  targetSlug: string,
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = process.cwd(),
): AwsEcrBuildTarget | null {
  return listAwsEcrBuildTargets(env, repoRoot).find((target) => target.targetSlug === targetSlug) ?? null;
}

export function isSafeEcrEnvironmentSlug(value: string): boolean {
  return /^[a-z][a-z0-9-]{1,31}$/.test(value);
}

export function isProductionEnvironment(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'production' || normalized === 'prod';
}

export function isSafeEcrImageTag(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value);
}

export function createEcrImageTag(input: { environmentSlug: string; timestamp?: Date }): string {
  const timestamp = (input.timestamp ?? new Date()).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${input.environmentSlug}-${timestamp}`;
}

function isSafeRepositoryName(value: string): boolean {
  return /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value);
}

function resolveInsideRoot(repoRoot: string, relativePath: string): string {
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('ECR build target path must stay inside the AutoOps repository.');
  }
  return resolved;
}
