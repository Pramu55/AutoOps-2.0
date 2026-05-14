import { Queue, Worker, type Job } from 'bullmq';
import { prisma as db } from '@autoops/database';
import { DeploymentStatus, LogLevel } from '@autoops/types';
import { createBullConnection } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import {
  jobsProcessedTotal,
  jobDurationSeconds,
  deploymentsTotal,
} from '../lib/metrics.js';
import { runSimulationDeployment } from '../executors/simulation.executor.js';

export interface DeploymentJobData {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  organizationId: string;
  triggeredById: string;
}

export const DEPLOYMENTS_QUEUE = 'deployments';

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

async function processDeployment(job: Job<DeploymentJobData>): Promise<void> {
  const { deploymentId, environmentId } = job.data;
  const jobLog = logger.child({ jobId: job.id, deploymentId, queue: DEPLOYMENTS_QUEUE });

  jobLog.info('Deployment job started');

  const deployment = await db.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      durationMs: true,
    },
  });

  if (!deployment) {
    jobLog.warn('Deployment record not found; failing job');
    throw new Error(`Deployment not found: ${deploymentId}`);
  }

  if (deployment.status === DeploymentStatus.SUCCEEDED) {
    jobLog.info(
      { status: deployment.status, completedAt: deployment.completedAt, durationMs: deployment.durationMs },
      'Deployment already completed; skipping duplicate job',
    );
    await db.deploymentEvent.create({
      data: {
        deploymentId,
        type: 'deployment.skipped',
        message: 'Deployment already completed; skipping duplicate job.',
        level: LogLevel.INFO,
        metadata: { reason: 'already_succeeded', jobId: job.id },
      },
    });
    return;
  }

  if (deployment.status === DeploymentStatus.FAILED) {
    jobLog.warn({ status: deployment.status }, 'Deployment already failed; skipping retry');
    await db.deploymentEvent.create({
      data: {
        deploymentId,
        type: 'deployment.skipped',
        message: 'Deployment already failed; skipping worker retry.',
        level: LogLevel.WARN,
        metadata: { reason: 'already_failed', jobId: job.id },
      },
    });
    return;
  }

  if (deployment.status === DeploymentStatus.RUNNING) {
    jobLog.warn({ status: deployment.status }, 'Deployment already running; skipping duplicate job');
    await db.deploymentEvent.create({
      data: {
        deploymentId,
        type: 'deployment.skipped',
        message: 'Deployment already running; skipping duplicate job.',
        level: LogLevel.WARN,
        metadata: { reason: 'already_running', jobId: job.id },
      },
    });
    return;
  }

  if (deployment.status !== DeploymentStatus.QUEUED) {
    jobLog.warn({ status: deployment.status }, 'Deployment is not eligible for worker processing');
    await db.deploymentEvent.create({
      data: {
        deploymentId,
        type: 'deployment.skipped',
        message: 'Deployment is not eligible for worker processing.',
        level: LogLevel.WARN,
        metadata: { reason: 'ineligible_status', status: deployment.status, jobId: job.id },
      },
    });
    return;
  }

  const startedAt = new Date();
  const claimed = await db.deployment.updateMany({
    where: {
      id: deploymentId,
      status: DeploymentStatus.QUEUED,
    },
    data: {
      status: DeploymentStatus.RUNNING,
      startedAt,
      errorMessage: null,
    },
  });

  if (claimed.count !== 1) {
    jobLog.warn('Deployment was claimed by another worker; skipping duplicate job');
    await db.deploymentEvent.create({
      data: {
        deploymentId,
        type: 'deployment.skipped',
        message: 'Deployment was already claimed by another worker.',
        level: LogLevel.WARN,
        metadata: { reason: 'claim_lost', jobId: job.id },
      },
    });
    return;
  }

  await db.deploymentEvent.create({
    data: {
      deploymentId,
      type: 'deployment.started',
      message: 'Deployment worker started processing.',
      level: LogLevel.INFO,
      metadata: { jobId: job.id },
    },
  });
  jobLog.info({ status: DeploymentStatus.RUNNING }, 'Deployment transitioned to RUNNING');

  try {
    await runSimulationDeployment({
      deploymentId,
      jobId: job.id,
      updateProgress: (progress) => job.updateProgress(progress),
      log: jobLog,
    });

    const completedAt = new Date();
    await db.deployment.update({
      where: { id: deploymentId },
      data: {
        status: DeploymentStatus.SUCCEEDED,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage: null,
      },
    });

    await db.deploymentEvent.create({
      data: {
        deploymentId,
        type: 'deployment.succeeded',
        message: 'Deployment completed successfully.',
        level: LogLevel.INFO,
        metadata: { jobId: job.id },
      },
    });

    deploymentsTotal.inc({ status: 'success', environment: environmentId });
    jobLog.info({ status: DeploymentStatus.SUCCEEDED }, 'Deployment job completed');
  } catch (err) {
    const completedAt = new Date();
    const message = err instanceof Error ? err.message : 'Deployment worker processing failed';
    jobLog.error({ err, status: DeploymentStatus.FAILED }, 'Deployment job failed');

    await db.deployment.update({
      where: { id: deploymentId },
      data: {
        status: DeploymentStatus.FAILED,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage: message,
      },
    });

    await db.deploymentEvent.create({
      data: {
        deploymentId,
        type: 'deployment.failed',
        message: 'Deployment failed during worker processing.',
        level: LogLevel.ERROR,
        metadata: { jobId: job.id, error: message },
      },
    });

    deploymentsTotal.inc({ status: 'failure', environment: environmentId });
    throw err;
  }
}

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

  worker.on('error', (err) => {
    logger.error({ err }, `[${DEPLOYMENTS_QUEUE}] worker error`);
  });

  return worker;
}
