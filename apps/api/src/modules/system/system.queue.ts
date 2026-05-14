import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { SystemHealthcheckJobInput } from '@autoops/types';
import { env } from '../../config/env.js';

export const SYSTEM_QUEUE = 'system';
export const WORKER_HEALTHCHECK_JOB = 'worker.healthcheck';

export interface SystemHealthcheckJobData extends SystemHealthcheckJobInput {
  requestedAt: string;
  requestedById?: string;
}

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const systemQueue = new Queue<SystemHealthcheckJobData>(SYSTEM_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1_000,
    },
    removeOnComplete: {
      count: 100,
      age: 86_400,
    },
    removeOnFail: {
      count: 100,
      age: 604_800,
    },
  },
});

export async function enqueueWorkerHealthcheckJob(
  input: SystemHealthcheckJobInput,
  requestedById?: string,
): Promise<{
  jobId: string | null;
  queue: typeof SYSTEM_QUEUE;
  name: typeof WORKER_HEALTHCHECK_JOB;
}> {
  const job = await systemQueue.add(WORKER_HEALTHCHECK_JOB, {
    requestedAt: new Date().toISOString(),
    requestedById,
    source: input.source,
    failOnce: input.failOnce,
  });

  return {
    jobId: job.id ?? null,
    queue: SYSTEM_QUEUE,
    name: WORKER_HEALTHCHECK_JOB,
  };
}