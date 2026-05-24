import { existsSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Queue, Worker, type Job } from 'bullmq';
import * as k8s from '@kubernetes/client-node';
import { ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
import { prisma as db, type Prisma } from '@autoops/database';
import { OperationProvider, OperationStatus, OperationType } from '@autoops/types';
import {
  DockerEngineClient,
  detectAnsibleTool,
  detectTerraformTool,
  getAnsiblePlaybookBySlug,
  getInfrastructureOutputLimit,
  getInfrastructureTimeoutMs,
  getTerraformWorkspaceBySlug,
  getAwsEcrBuildTargetBySlug,
  isAllowedAwsEcrRepository,
  summarizeCommandOutput,
} from '@autoops/utils';
import { createBullConnection } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { jobsProcessedTotal, jobDurationSeconds } from '../lib/metrics.js';
import { createIncidentForFailedOperation } from '../runtime/operation-incidents.js';

export interface OperationJobData {
  operationId: string;
  organizationId: string;
  requestedByUserId: string;
}

export const OPERATIONS_QUEUE = 'operations';

type MutableCluster = {
  server: string;
  tlsServerName?: string;
};

const execFileAsync = promisify(execFile);

export function createOperationsQueue(): Queue<OperationJobData> {
  return new Queue<OperationJobData>(OPERATIONS_QUEUE, {
    connection: createBullConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 200, age: 86_400 },
      removeOnFail: { count: 500, age: 604_800 },
    },
  });
}

async function processOperation(job: Job<OperationJobData>): Promise<void> {
  const { operationId, organizationId } = job.data;
  const jobLog = logger.child({ queue: OPERATIONS_QUEUE, jobId: job.id, operationId });

  const operation = await db.operation.findFirst({
    where: {
      id: operationId,
      organizationId,
    },
  });

  if (!operation) {
    jobLog.warn('Operation record not found; failing job');
    throw new Error(`Operation not found: ${operationId}`);
  }

  if (operation.status === OperationStatus.SUCCEEDED || operation.status === OperationStatus.FAILED) {
    jobLog.info({ status: operation.status }, 'Operation already terminal; skipping duplicate job');
    return;
  }

  if (operation.status === OperationStatus.PENDING_APPROVAL) {
    jobLog.warn('Operation is pending approval; skipping execution');
    return;
  }

  if (operation.status !== OperationStatus.QUEUED) {
    jobLog.warn({ status: operation.status }, 'Operation is not queued; skipping execution');
    return;
  }

  const claimed = await db.operation.updateMany({
    where: {
      id: operation.id,
      organizationId,
      status: OperationStatus.QUEUED,
    },
    data: {
      status: OperationStatus.RUNNING,
    },
  });

  if (claimed.count !== 1) {
    jobLog.warn('Operation claim lost; skipping duplicate job');
    return;
  }

  try {
    const result = await executeOperation(operation);
    await db.operation.update({
      where: { id: operation.id },
      data: {
        status: OperationStatus.SUCCEEDED,
        result: result as Prisma.InputJsonObject,
        error: undefined,
      },
    });
    jobLog.info({ status: OperationStatus.SUCCEEDED }, 'Operation completed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed';
    const failedOperation = await db.operation.update({
      where: { id: operation.id },
      data: {
        status: OperationStatus.FAILED,
        error: {
          message,
        } as Prisma.InputJsonObject,
      },
    });
    try {
      await createIncidentForFailedOperation(db, failedOperation);
    } catch (incidentError) {
      jobLog.warn({ err: incidentError }, 'Failed to create incident for failed operation');
    }
    jobLog.error({ err: error }, 'Operation failed');
    throw error;
  }
}

async function executeOperation(operation: {
  provider: OperationProvider;
  operationType: OperationType;
  input: unknown;
  approvedAt?: Date | null;
}): Promise<Record<string, unknown>> {
  const input = toRecord(operation.input);
  if (
    operation.provider === OperationProvider.KUBERNETES &&
    operation.operationType === OperationType.KUBERNETES_DEPLOYMENT_SCALE
  ) {
    return scaleDeployment(input);
  }

  if (
    operation.provider === OperationProvider.KUBERNETES &&
    operation.operationType === OperationType.KUBERNETES_DEPLOYMENT_RESTART
  ) {
    return restartDeployment(input);
  }

  if (
    operation.provider === OperationProvider.JENKINS &&
    operation.operationType === OperationType.JENKINS_BUILD_TRIGGER
  ) {
    return triggerJenkinsBuild(input);
  }

  if (
    operation.provider === OperationProvider.DOCKER &&
    (operation.operationType === OperationType.DOCKER_CONTAINER_START ||
      operation.operationType === OperationType.DOCKER_CONTAINER_STOP ||
      operation.operationType === OperationType.DOCKER_CONTAINER_RESTART)
  ) {
    return executeDockerContainerAction(operation.operationType, input);
  }

  if (
    (operation.provider === OperationProvider.INFRASTRUCTURE || operation.provider === OperationProvider.AWS) &&
    (operation.operationType === OperationType.TERRAFORM_VALIDATE ||
      operation.operationType === OperationType.TERRAFORM_PLAN ||
      operation.operationType === OperationType.TERRAFORM_APPLY)
  ) {
    return executeTerraformOperation(operation.operationType, input, operation.approvedAt ?? null);
  }

  if (
    operation.provider === OperationProvider.AWS &&
    (operation.operationType === OperationType.AWS_ECR_IMAGE_BUILD ||
      operation.operationType === OperationType.AWS_ECR_IMAGE_PUSH)
  ) {
    return executeAwsEcrOperation(operation.operationType, input, operation.approvedAt ?? null);
  }

  if (
    operation.provider === OperationProvider.INFRASTRUCTURE &&
    (operation.operationType === OperationType.ANSIBLE_SYNTAX_CHECK ||
      operation.operationType === OperationType.ANSIBLE_CHECK ||
      operation.operationType === OperationType.ANSIBLE_RUN)
  ) {
    return executeAnsibleOperation(operation.operationType, input, operation.approvedAt ?? null);
  }

  throw new Error(`Unsupported operation type: ${operation.operationType}`);
}

async function scaleDeployment(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const namespace = stringField(input, 'namespace');
  const name = stringField(input, 'name');
  const replicas = numberField(input, 'replicas');
  const client = getKubernetesObjectClient();

  const patch: k8s.KubernetesObject & { spec: Record<string, unknown> } = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      namespace,
    },
    spec: {
      replicas,
    },
  };

  const result = await client.patch(
    patch,
    undefined,
    undefined,
    'autoops',
    undefined,
    k8s.PatchStrategy.StrategicMergePatch,
  );

  return {
    action: 'scale',
    namespace,
    kind: 'Deployment',
    name,
    replicas,
    status: 'completed',
    completedAt: new Date().toISOString(),
    resourceVersion: result.metadata?.resourceVersion,
  };
}

async function restartDeployment(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const namespace = stringField(input, 'namespace');
  const name = stringField(input, 'name');
  const client = getKubernetesObjectClient();
  const restartedAt = new Date().toISOString();

  const patch: k8s.KubernetesObject & { spec: Record<string, unknown> } = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      namespace,
    },
    spec: {
      template: {
        metadata: {
          annotations: {
            'kubectl.kubernetes.io/restartedAt': restartedAt,
          },
        },
      },
    },
  };

  const result = await client.patch(
    patch,
    undefined,
    undefined,
    'autoops',
    undefined,
    k8s.PatchStrategy.StrategicMergePatch,
  );

  return {
    action: 'rolloutRestart',
    namespace,
    kind: 'Deployment',
    name,
    restartedAt,
    status: 'completed',
    completedAt: new Date().toISOString(),
    resourceVersion: result.metadata?.resourceVersion,
  };
}

function getKubernetesObjectClient(): k8s.KubernetesObjectApi {
  const kubeConfig = new k8s.KubeConfig();
  const kubeconfigPath = process.env.KUBECONFIG?.trim();

  if (!kubeconfigPath || !existsSync(kubeconfigPath)) {
    throw new Error('Kubernetes is not configured for the worker');
  }

  kubeConfig.loadFromFile(kubeconfigPath);
  const cluster = kubeConfig.getCurrentCluster();
  if (cluster) {
    const mutableCluster = cluster as unknown as MutableCluster;
    const serverOverride = process.env.KUBERNETES_API_SERVER_OVERRIDE?.trim();
    const tlsServerNameOverride = process.env.KUBERNETES_TLS_SERVER_NAME_OVERRIDE?.trim();
    if (serverOverride) mutableCluster.server = serverOverride;
    if (tlsServerNameOverride) mutableCluster.tlsServerName = tlsServerNameOverride;
  }

  return k8s.KubernetesObjectApi.makeApiClient(kubeConfig);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Operation input requires ${key}`);
  }
  return value;
}

function optionalStringField(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberField(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Operation input requires integer ${key}`);
  }
  return value;
}

async function executeDockerContainerAction(
  operationType: OperationType,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const containerId = stringField(input, 'containerId');
  const containerName = optionalStringField(input, 'containerName');
  const client = new DockerEngineClient();

  if (operationType === OperationType.DOCKER_CONTAINER_START) {
    await client.startContainer(containerId);
    return dockerActionResult('start', containerId, containerName);
  }

  if (operationType === OperationType.DOCKER_CONTAINER_STOP) {
    await client.stopContainer(containerId);
    return dockerActionResult('stop', containerId, containerName);
  }

  await client.restartContainer(containerId);
  return dockerActionResult('restart', containerId, containerName);
}

function dockerActionResult(
  action: 'start' | 'stop' | 'restart',
  containerId: string,
  containerName: string | null,
): Record<string, unknown> {
  return {
    action,
    containerId,
    containerName,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };
}

async function executeAwsEcrOperation(
  operationType: OperationType,
  input: Record<string, unknown>,
  approvedAt: Date | null,
): Promise<Record<string, unknown>> {
  const targetSlug = stringField(input, 'targetSlug');
  const repositoryName = stringField(input, 'repositoryName');
  const environmentSlug = stringField(input, 'environmentSlug');
  const target = getAwsEcrBuildTargetBySlug(targetSlug);
  if (!target) throw new Error('ECR build target is not allowlisted.');
  if (!isAllowedAwsEcrRepository(repositoryName) || repositoryName !== target.defaultRepository) {
    throw new Error('ECR repository is not allowlisted for this build target.');
  }
  if (!target.allowedEnvironments.includes(environmentSlug)) {
    throw new Error('ECR environment is not allowlisted for this build target.');
  }

  if (operationType === OperationType.AWS_ECR_IMAGE_BUILD) {
    return buildAwsEcrImage(input, target);
  }

  if (isProductionSlug(environmentSlug) && !approvedAt) {
    throw new Error('Production ECR image push requires approval before worker execution.');
  }
  return pushAwsEcrImage(input, target);
}

async function buildAwsEcrImage(
  input: Record<string, unknown>,
  target: NonNullable<ReturnType<typeof getAwsEcrBuildTargetBySlug>>,
): Promise<Record<string, unknown>> {
  const imageTag = stringField(input, 'imageTag');
  const imageUri = stringField(input, 'imageUri');
  const platform = optionalStringField(input, 'platform');
  if (platform && !(target.allowedPlatforms ?? []).includes(platform)) {
    throw new Error('ECR image platform is not allowlisted.');
  }

  const startedAt = Date.now();
  const args = ['build', '--pull=false', '--file', target.absoluteDockerfilePath, '--tag', imageUri];
  if (platform) args.push('--platform', platform);
  args.push(target.absoluteContextPath);
  const output = await runTool('docker', args, process.cwd());
  return {
    action: 'build',
    targetSlug: target.targetSlug,
    repositoryName: target.defaultRepository,
    imageTag,
    imageUri,
    status: 'completed',
    safeOutputSummary: summarizeCommandOutput(output),
    durationMs: Date.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function pushAwsEcrImage(
  input: Record<string, unknown>,
  target: NonNullable<ReturnType<typeof getAwsEcrBuildTargetBySlug>>,
): Promise<Record<string, unknown>> {
  if (process.env.AWS_ECR_PUSH_ENABLED !== 'true') {
    throw new Error('AWS ECR push is disabled in this environment.');
  }

  const repositoryUri = stringField(input, 'repositoryUri');
  const imageUri = stringField(input, 'imageUri');
  const imageTag = stringField(input, 'imageTag');
  const registry = repositoryUri.split('/')[0];
  if (!registry) throw new Error('ECR repository URI is invalid.');

  const startedAt = Date.now();
  const ecrAuthInput = await getEcrLoginPassword();
  await runToolWithInput('docker', ['login', '--username', 'AWS', '--password-stdin', registry], process.cwd(), `${ecrAuthInput}\n`);
  const push = await runTool('docker', ['push', imageUri], process.cwd());
  const inspect = await runTool('docker', ['inspect', '--format', '{{index .RepoDigests 0}}', imageUri], process.cwd()).catch(() => '');
  const digest = parseImageDigest(inspect);

  return {
    action: 'push',
    targetSlug: target.targetSlug,
    repositoryName: target.defaultRepository,
    imageTag,
    imageUri,
    imageDigest: digest,
    status: 'completed',
    safeOutputSummary: summarizeCommandOutput(push),
    durationMs: Date.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function getEcrLoginPassword(): Promise<string> {
  const region = process.env.AWS_REGION?.trim();
  if (!region) throw new Error('AWS_REGION is required for ECR push.');
  const client = new ECRClient({ region });
  const response = await client.send(new GetAuthorizationTokenCommand({}));
  const token = response.authorizationData?.[0]?.authorizationToken;
  if (!token) throw new Error('AWS ECR authorization token was not returned.');
  const decoded = Buffer.from(token, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) throw new Error('AWS ECR authorization token was invalid.');
  return decoded.slice(separator + 1);
}

function parseImageDigest(output: string): string | null {
  const match = output.match(/@sha256:[a-f0-9]{64}/i);
  return match ? match[0].slice(1) : null;
}

function isProductionSlug(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'production' || normalized === 'prod';
}

async function executeTerraformOperation(
  operationType: OperationType,
  input: Record<string, unknown>,
  approvedAt: Date | null,
): Promise<Record<string, unknown>> {
  const workspaceSlug = stringField(input, 'workspaceSlug');
  const workspace = await getTerraformWorkspaceBySlug(workspaceSlug);
  if (!workspace) throw new Error('Terraform workspace is not allowlisted.');

  const toolStatus = await detectTerraformTool();
  if (toolStatus.status !== 'CONNECTED' || (toolStatus.tool !== 'terraform' && toolStatus.tool !== 'tofu')) {
    throw new Error(toolStatus.message);
  }

  const action =
    operationType === OperationType.TERRAFORM_VALIDATE
      ? 'validate'
      : operationType === OperationType.TERRAFORM_PLAN
        ? 'plan'
        : 'apply';

  if (action === 'apply' && !approvedAt) {
    throw new Error('Terraform/OpenTofu apply requires approval before worker execution.');
  }

  const startedAt = Date.now();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'autoops-tf-'));
  const tempWorkspace = path.join(tempRoot, workspace.slug);
  try {
    await cp(workspace.absolutePath, tempWorkspace, { recursive: true });
    const init = await runTool(toolStatus.tool, ['init', '-backend=false', '-input=false', '-no-color'], tempWorkspace);
    const args =
      action === 'validate'
        ? ['validate', '-no-color']
        : action === 'plan'
          ? ['plan', '-input=false', '-no-color', '-lock=false']
          : ['apply', '-auto-approve', '-input=false', '-no-color', '-lock=false'];
    const run = await runTool(toolStatus.tool, args, tempWorkspace);
    return {
      tool: toolStatus.tool,
      action,
      workspaceSlug: workspace.slug,
      relativePath: workspace.relativePath,
      status: 'completed',
      safeOutputSummary: summarizeCommandOutput(`${init}\n${run}`),
      durationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function executeAnsibleOperation(
  operationType: OperationType,
  input: Record<string, unknown>,
  approvedAt: Date | null,
): Promise<Record<string, unknown>> {
  const playbookSlug = stringField(input, 'playbookSlug');
  const playbook = await getAnsiblePlaybookBySlug(playbookSlug);
  if (!playbook) throw new Error('Ansible playbook is not allowlisted.');

  const toolStatus = await detectAnsibleTool();
  if (toolStatus.status !== 'CONNECTED') {
    throw new Error(toolStatus.message);
  }

  const action =
    operationType === OperationType.ANSIBLE_SYNTAX_CHECK
      ? 'syntax-check'
      : operationType === OperationType.ANSIBLE_CHECK
        ? 'check'
        : 'run';

  if (action === 'run' && !approvedAt) {
    throw new Error('Ansible run requires approval before worker execution.');
  }

  const startedAt = Date.now();
  const args = ['-i', playbook.inventoryAbsolutePath, playbook.absolutePath];
  if (action === 'syntax-check') args.unshift('--syntax-check');
  if (action === 'check') args.unshift('--check');
  const output = await runTool('ansible-playbook', args, path.dirname(playbook.absolutePath));

  return {
    tool: 'ansible-playbook',
    action,
    playbookSlug: playbook.slug,
    relativePath: playbook.relativePath,
    inventoryRelativePath: playbook.inventoryRelativePath,
    status: 'completed',
    safeOutputSummary: summarizeCommandOutput(output),
    durationMs: Date.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function runTool(command: string, args: string[], cwd: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: getInfrastructureTimeoutMs(),
      windowsHide: true,
      maxBuffer: getInfrastructureOutputLimit() * 4,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        TF_IN_AUTOMATION: '1',
        CHECKPOINT_DISABLE: '1',
        ANSIBLE_RETRY_FILES_ENABLED: 'false',
      },
    });
    return `${stdout ?? ''}\n${stderr ?? ''}`;
  } catch (error) {
    const record = toRecord(error);
    const stdout = typeof record.stdout === 'string' ? record.stdout : '';
    const stderr = typeof record.stderr === 'string' ? record.stderr : '';
    const message = error instanceof Error ? error.message : 'Infrastructure tool execution failed.';
    throw new Error(summarizeCommandOutput(`${message}\n${stdout}\n${stderr}`, 1_000));
  }
}

async function runToolWithInput(command: string, args: string[], cwd: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
      },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Tool execution timed out.'));
    }, getInfrastructureTimeoutMs());

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > getInfrastructureOutputLimit() * 4) stdout = stdout.slice(-getInfrastructureOutputLimit() * 4);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > getInfrastructureOutputLimit() * 4) stderr = stderr.slice(-getInfrastructureOutputLimit() * 4);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(`${stdout}\n${stderr}`);
        return;
      }
      reject(new Error(summarizeCommandOutput(`Tool failed with exit code ${code}.\n${stdout}\n${stderr}`, 1_000)));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

async function triggerJenkinsBuild(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const jobName = stringField(input, 'jobName');
  const allowedJobs = parseAllowedJobs(process.env.JENKINS_ALLOWED_JOBS);
  if (!allowedJobs.length) {
    throw new Error('Jenkins build triggering is disabled because JENKINS_ALLOWED_JOBS is empty.');
  }
  if (!allowedJobs.includes(jobName)) {
    throw new Error('Jenkins job is not allowlisted for AutoOps triggering.');
  }
  const parameters = toStringRecord(input.parameters);
  const client = new WorkerJenkinsClient();
  const trigger = await client.triggerBuild(jobName, parameters);
  const startedAt = Date.now();

  if (!trigger.queueUrl) {
    return {
      jobName,
      triggerAccepted: true,
      queueUrl: null,
      buildVerified: false,
      message: 'Jenkins accepted the build request but did not return a queue location.',
    };
  }

  while (Date.now() - startedAt < client.pollTimeoutMs) {
    await sleep(client.pollIntervalMs);
    const queueItem = await client.getQueueItem(trigger.queueUrl);
    if (queueItem.cancelled) {
      throw new Error('Jenkins queue item was cancelled.');
    }

    const buildNumber = queueItem.executable?.number;
    if (typeof buildNumber === 'number') {
      const build = await client.getBuild(jobName, buildNumber);
      return {
        jobName,
        triggerAccepted: true,
        queueUrl: trigger.queueUrl,
        buildVerified: true,
        buildNumber,
        buildUrl: build.url,
        result: build.result ?? null,
        building: build.building ?? false,
      };
    }
  }

  return {
    jobName,
    triggerAccepted: true,
    queueUrl: trigger.queueUrl,
    buildVerified: false,
    message: 'Jenkins build was queued, but no executable build was observed before the poll timeout.',
  };
}

type JenkinsQueueItem = {
  cancelled?: boolean;
  executable?: {
    number?: number;
    url?: string;
  };
};

type JenkinsBuildResult = {
  number?: number;
  url?: string;
  result?: string | null;
  building?: boolean;
};

type JenkinsCrumb = {
  crumbRequestField: string;
  crumb: string;
};

class WorkerJenkinsClient {
  readonly baseUrl: string;
  readonly username: string;
  readonly token: string;
  readonly timeoutMs: number;
  readonly pollTimeoutMs: number;
  readonly pollIntervalMs: number;

  constructor() {
    const baseUrl = process.env.JENKINS_URL?.trim().replace(/\/+$/, '');
    const username = process.env.JENKINS_USERNAME?.trim();
    const token = process.env.JENKINS_API_TOKEN?.trim();
    if (!baseUrl || !username || !token) {
      throw new Error('Jenkins is not configured for the worker.');
    }
    this.baseUrl = baseUrl;
    this.username = username;
    this.token = token;
    this.timeoutMs = positiveNumberEnv('JENKINS_REQUEST_TIMEOUT_MS', 10_000);
    this.pollTimeoutMs = positiveNumberEnv('JENKINS_TRIGGER_POLL_TIMEOUT_MS', 120_000);
    this.pollIntervalMs = positiveNumberEnv('JENKINS_TRIGGER_POLL_INTERVAL_MS', 2_000);
  }

  async triggerBuild(
    jobName: string,
    parameters: Record<string, string>,
  ): Promise<{ queueUrl: string | null }> {
    const crumb = await this.getCrumb();
    const headers: Record<string, string> = {};
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;

    let body: URLSearchParams | undefined;
    const hasParameters = Object.keys(parameters).length > 0;
    if (hasParameters) {
      body = new URLSearchParams(parameters);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const response = await this.request(
      `${this.jobUrl(jobName)}${hasParameters ? '/buildWithParameters' : '/build'}`,
      { method: 'POST', headers, body },
    );
    return { queueUrl: response.headers.get('location') };
  }

  async getQueueItem(queueUrl: string): Promise<JenkinsQueueItem> {
    return this.getJson<JenkinsQueueItem>(`${queueUrl.replace(/\/+$/, '')}/api/json?tree=cancelled,executable[number,url]`);
  }

  async getBuild(jobName: string, buildNumber: number): Promise<JenkinsBuildResult> {
    return this.getJson<JenkinsBuildResult>(
      `${this.jobUrl(jobName)}/${buildNumber}/api/json?tree=number,url,result,building`,
    );
  }

  private async getCrumb(): Promise<JenkinsCrumb | null> {
    try {
      const crumb = await this.getJson<JenkinsCrumb>(`${this.baseUrl}/crumbIssuer/api/json`);
      return crumb.crumb && crumb.crumbRequestField ? crumb : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('404') || message.includes('403')) return null;
      throw error;
    }
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await this.request(url, { method: 'GET' });
    return (await response.json()) as T;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.username}:${this.token}`, 'utf8').toString('base64')}`,
          Accept: 'application/json',
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Jenkins request failed with HTTP ${response.status}.`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private jobUrl(jobName: string): string {
    return `${this.baseUrl}${jobName
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `/job/${encodeURIComponent(part)}`)
      .join('')}`;
  }
}

function toStringRecord(value: unknown): Record<string, string> {
  const record = toRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, String(item)]),
  );
}

function positiveNumberEnv(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseAllowedJobs(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOperationsWorker(): Worker<OperationJobData> {
  const worker = new Worker<OperationJobData>(OPERATIONS_QUEUE, processOperation, {
    connection: createBullConnection(),
    concurrency: env.DEPLOYMENTS_CONCURRENCY,
  });

  worker.on('active', (job) => {
    logger.info({ queue: OPERATIONS_QUEUE, jobId: job.id }, '[operations] job active');
  });

  worker.on('completed', (job) => {
    jobsProcessedTotal.inc({ queue: OPERATIONS_QUEUE, status: 'completed' });
    const duration = (Date.now() - job.timestamp) / 1_000;
    jobDurationSeconds.observe({ queue: OPERATIONS_QUEUE }, duration);
    logger.info({ queue: OPERATIONS_QUEUE, jobId: job.id, duration }, '[operations] job completed');
  });

  worker.on('failed', (job, err) => {
    jobsProcessedTotal.inc({ queue: OPERATIONS_QUEUE, status: 'failed' });
    logger.error({ queue: OPERATIONS_QUEUE, jobId: job?.id, err }, '[operations] job failed');
  });

  worker.on('error', (err) => {
    logger.error({ queue: OPERATIONS_QUEUE, err }, '[operations] worker error');
  });

  return worker;
}
