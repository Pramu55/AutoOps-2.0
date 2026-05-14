import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

export interface OperationJobData {
  operationId: string;
  organizationId: string;
  requestedByUserId: string;
}

export const OPERATIONS_QUEUE = 'operations';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const operationsQueue = new Queue<OperationJobData>(OPERATIONS_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 200, age: 86_400 },
    removeOnFail: { count: 500, age: 604_800 },
  },
});

export async function enqueueOperationJob(data: OperationJobData): Promise<void> {
  await operationsQueue.add('operation.run', data, {
    jobId: `operation-${data.operationId}`,
  });
}
