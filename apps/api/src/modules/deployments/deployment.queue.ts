import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

export interface DeploymentJobData {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  organizationId: string;
  triggeredById: string;
}

export const DEPLOYMENTS_QUEUE = 'deployments';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const deploymentsQueue = new Queue<DeploymentJobData>(DEPLOYMENTS_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 200, age: 86_400 },
    removeOnFail: { count: 500, age: 604_800 },
  },
});

export async function enqueueDeploymentJob(data: DeploymentJobData): Promise<void> {
  await deploymentsQueue.add('deployment.run', data, {
    jobId: `deployment-${data.deploymentId}`,
  });
}
