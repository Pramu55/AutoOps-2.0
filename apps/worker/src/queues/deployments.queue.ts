import { Queue, Worker, type Job } from 'bullmq';
import { db } from '@autoops/database';
import { DeploymentStatus } from '@autoops/types';
import { createBullConnection } from '@/lib/redis.js';
import { logger } from '@/lib/logger.js';
import { env } from '@/config/env.js';
import {
  jobsProcessedTotal,
  jobDurationSeconds,
  deploymentsTotal,
} from '@/lib/metrics.js';

// ── Job payload ───────────────────────────────────────────────────────────────

export interface DeploymentJobData {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  organizationId: string;
  triggeredById: string;
}

export const DEPLOYMENTS_QUEUE = 'deployments';

// ── Queue instance (for enqueuing from the API) ───────────────────────────────

export function createDeploymentsQueue(): Queue<DeploymentJobData> {
  return new Queue<DeploymentJobData>(DEPLOYMENTS_QUEUE, {
    connection: createBullConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 200, age: 86_400 },
      removeOnFail: { count: 500, age: 604_800 },
    },
  });
}

// ── Processor ─────────────────────────────────────────────────────────────────

async function processDeployment(job: Job<DeploymentJobData>): Promise<void> {
  const { deploymentId, environmentId } = job.data;
  const jobLog = logger.child({ jobId: job.id, deploymentId, queue: DEPLOYMENTS_QUEUE });

  jobLog.info('Deployment job started');

  // Mark as RUNNING
  await db.deployment.update({
    where: { id: deploymentId },
    data: { status: DeploymentStatus.RUNNING, startedAt: new Date() },
  });

  try {
    // ── Phase 2 will replace this stub with real build/deploy steps ──────────
    await job.updateProgress(10);
    jobLog.info('Step 1/3: resolving image…');

    await job.updateProgress(40);
    jobLog.info('Step 2/3: deploying containers…');

    await job.updateProgress(80);
    jobLog.info('Step 3/3: health-checking…');

    // Simulate async work (remove when real logic lands)
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    await job.updateProgress(100);

    // Mark as SUCCESS
    await db.deployment.update({
      where: { id: deploymentId },
      data: { status: DeploymentStatus.SUCCESS, finishedAt: new Date() },
    });

    deploymentsTotal.inc({ status: 'success', environment: environmentId });
    jobLog.info('Deployment job completed');
  } catch (err) {
    jobLog.error({ err }, 'Deployment job failed');

    await db.deployment.update({
      where: { id: deploymentId },
      data: { status: DeploymentStatus.FAILED, finishedAt: new Date() },
    });

    deploymentsTotal.inc({ status: 'failure', environment: environmentId });
    throw err; // re-throw so BullMQ records the failure + retries
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createDeploymentsWorker(): Worker<DeploymentJobData> {
  const worker = new Worker<DeploymentJobData>(
    DEPLOYMENTS_QUEUE,
    processDeployment,
    {
      connection: createBullConnection(),
      concurrency: env.DEPLOYMENTS_CONCURRENCY,
    },
  );

  worker.on('active', (job) => {
    logger.info({ jobId: job.id }, `[${DEPLOYMENTS_QUEUE}] job active`);
  });

  worker.on('completed', (job, _result) => {
    jobsProcessedTotal.inc({ queue: DEPLOYMENTS_QUEUE, status: 'completed' });
    const duration = (Date.now() - job.timestamp) / 1_000;
    jobDurationSeconds.observe({ queue: DEPLOYMENTS_QUEUE }, duration);
    logger.info({ jobId: job.id, duration }, `[${DEPLOYMENTS_QUEUE}] job completed`);
  });

  worker.on('failed', (job, err) => {
    jobsProcessedTotal.inc({ queue: DEPLOYMENTS_QUEUE, status: 'failed' });
    logger.error({ jobId: job?.id, err }, `[${DEPLOYMENTS_QUEUE}] job failed`);
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, `[${DEPLOYMENTS_QUEUE}] job stalled`);
  });

  return worker;
}
