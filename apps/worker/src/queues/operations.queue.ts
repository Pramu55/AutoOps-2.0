import { existsSync } from 'node:fs';
import { Queue, Worker, type Job } from 'bullmq';
import * as k8s from '@kubernetes/client-node';
import { prisma as db, type Prisma } from '@autoops/database';
import { OperationProvider, OperationStatus, OperationType } from '@autoops/types';
import { createBullConnection } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { jobsProcessedTotal, jobDurationSeconds } from '../lib/metrics.js';

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
    await db.operation.update({
      where: { id: operation.id },
      data: {
        status: OperationStatus.FAILED,
          error: {
            message,
          } as Prisma.InputJsonObject,
      },
    });
    jobLog.error({ err: error }, 'Operation failed');
    throw error;
  }
}

async function executeOperation(operation: {
  provider: OperationProvider;
  operationType: OperationType;
  input: unknown;
}): Promise<Record<string, unknown>> {
  const input = toRecord(operation.input);
  if (
    operation.provider === OperationProvider.KUBERNETES &&
    operation.operationType === OperationType.KUBERNETES_DEPLOYMENT_RESTART
  ) {
    return restartDeployment(input);
  }

  if (
    operation.provider === OperationProvider.KUBERNETES &&
    operation.operationType === OperationType.KUBERNETES_MANIFEST_APPLY
  ) {
    return applyManifest(input);
  }

  if (
    operation.provider === OperationProvider.JENKINS &&
    operation.operationType === OperationType.JENKINS_BUILD_TRIGGER
  ) {
    return triggerJenkinsBuild(input);
  }

  throw new Error(`Unsupported operation type: ${operation.operationType}`);
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
    namespace,
    name,
    restartedAt,
    resourceVersion: result.metadata?.resourceVersion,
  };
}

async function applyManifest(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const manifest = input.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Operation manifest is missing or invalid');
  }

  const client = getKubernetesObjectClient();
  const result = await client.patch(
    manifest as k8s.KubernetesObject,
    undefined,
    undefined,
    'autoops',
    undefined,
    k8s.PatchStrategy.ServerSideApply,
  );

  return {
    apiVersion: result.apiVersion,
    kind: result.kind,
    name: result.metadata?.name,
    namespace: result.metadata?.namespace,
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
