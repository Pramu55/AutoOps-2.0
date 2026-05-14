import { Worker, type Job } from 'bullmq';
import type { SystemHealthcheckJobInput } from '@autoops/types';
import { createBullConnection } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import {
  jobsProcessedTotal,
  jobDurationSeconds,
} from '../lib/metrics.js';

export const SYSTEM_QUEUE = 'system';
export const WORKER_HEALTHCHECK_JOB = 'worker.healthcheck';

export interface SystemHealthcheckJobData extends SystemHealthcheckJobInput {
  requestedAt: string;
  requestedById?: string;
}

type SystemHealthcheckResult = {
  ok: true;
  processedAt: string;
  attempt: number;
  source: string;
};

async function processSystemHealthcheck(
  job: Job<SystemHealthcheckJobData>,
): Promise<SystemHealthcheckResult> {
  const attempt = job.attemptsMade + 1;

  const jobLog = logger.child({
    queue: SYSTEM_QUEUE,
    jobName: job.name,
    jobId: job.id,
    attempt,
  });

  jobLog.info({ data: job.data }, 'System healthcheck job started');

  if (job.data.failOnce && job.attemptsMade === 0) {
    jobLog.warn('System healthcheck job intentionally failing once');
    throw new Error('Intentional failOnce test failure');
  }

  await job.updateProgress(50);
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  await job.updateProgress(100);

  const result: SystemHealthcheckResult = {
    ok: true,
    processedAt: new Date().toISOString(),
    attempt,
    source: job.data.source,
  };

  jobLog.info({ result }, 'System healthcheck job completed');

  return result;
}

export function createSystemWorker(): Worker<SystemHealthcheckJobData, SystemHealthcheckResult> {
  const worker = new Worker<SystemHealthcheckJobData, SystemHealthcheckResult>(
    SYSTEM_QUEUE,
    async (job) => {
      if (job.name !== WORKER_HEALTHCHECK_JOB) {
        throw new Error(`Unsupported system job: ${job.name}`);
      }

      return processSystemHealthcheck(job);
    },
    {
      connection: createBullConnection(),
      concurrency: env.AI_CONCURRENCY,
    },
  );

  worker.on('active', (job) => {
    logger.info(
      {
        queue: SYSTEM_QUEUE,
        jobName: job.name,
        jobId: job.id,
      },
      '[system] job active',
    );
  });

  worker.on('completed', (job, result) => {
    jobsProcessedTotal.inc({ queue: SYSTEM_QUEUE, status: 'completed' });

    const duration = (Date.now() - job.timestamp) / 1_000;
    jobDurationSeconds.observe({ queue: SYSTEM_QUEUE }, duration);

    logger.info(
      {
        queue: SYSTEM_QUEUE,
        jobName: job.name,
        jobId: job.id,
        duration,
        result,
      },
      '[system] job completed',
    );
  });

  worker.on('failed', (job, err) => {
    jobsProcessedTotal.inc({ queue: SYSTEM_QUEUE, status: 'failed' });

    logger.error(
      {
        queue: SYSTEM_QUEUE,
        jobName: job?.name,
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        err,
      },
      '[system] job failed',
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ queue: SYSTEM_QUEUE, jobId }, '[system] job stalled');
  });

  worker.on('error', (err) => {
    logger.error({ queue: SYSTEM_QUEUE, err }, '[system] worker error');
  });

  return worker;
}