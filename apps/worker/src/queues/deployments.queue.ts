import { Queue } from "bullmq";
import { redisConnection } from "@/workers/connection.js";
import { createLogger } from "@autoops/shared";

const logger = createLogger("DeploymentQueue");

export const DEPLOYMENTS_QUEUE_NAME = "deployments";

export interface DeploymentJobData {
  jobId: string;
  deploymentId: string;
  serviceId?: string;
  environment: string;
  version?: string;
  commitSha?: string;
  triggeredBy?: string;
  timestamp: string;
}

export const deploymentsQueue = new Queue<DeploymentJobData>(DEPLOYMENTS_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 10_000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

deploymentsQueue.on("error", (err) => {
  logger.error("Deployments queue error", { error: err.message });
});

logger.info("Deployments queue initialized");
