import { Worker } from "bullmq";
import { QUEUE_NAMES } from "@autoops/shared";
import { createLogger } from "@autoops/shared";
import { redisConnection } from "./connection.js";
import { config } from "@/config/index.js";
import { processIncidentJob } from "@/processors/incidentProcessor.js";
import { processWorkflowJob } from "@/processors/workflowProcessor.js";
import { processAlertJob } from "@/processors/alertProcessor.js";

const logger = createLogger("Workers");

export function createWorkers() {
  const incidentWorker = new Worker(
    QUEUE_NAMES.INCIDENTS,
    processIncidentJob,
    {
      connection: redisConnection,
      concurrency: config.worker.concurrency,
    }
  );

  incidentWorker.on("completed", (job) => {
    logger.info("Incident job completed", { jobId: job.id, jobName: job.name });
  });

  incidentWorker.on("failed", (job, err) => {
    logger.error("Incident job failed", {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
    });
  });

  const workflowWorker = new Worker(
    QUEUE_NAMES.WORKFLOWS,
    processWorkflowJob,
    {
      connection: redisConnection,
      concurrency: Math.ceil(config.worker.concurrency / 2),
    }
  );

  workflowWorker.on("completed", (job) => {
    logger.info("Workflow job completed", { jobId: job.id, jobName: job.name });
  });

  workflowWorker.on("failed", (job, err) => {
    logger.error("Workflow job failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  workflowWorker.on("progress", (job, progress) => {
    logger.debug("Workflow job progress", { jobId: job.id, progress });
  });

  const alertWorker = new Worker(
    QUEUE_NAMES.ALERTS,
    processAlertJob,
    {
      connection: redisConnection,
      concurrency: config.worker.concurrency,
    }
  );

  alertWorker.on("completed", (job) => {
    logger.info("Alert job completed", { jobId: job.id, jobName: job.name });
  });

  alertWorker.on("failed", (job, err) => {
    logger.error("Alert job failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info("All workers started", {
    workers: [QUEUE_NAMES.INCIDENTS, QUEUE_NAMES.WORKFLOWS, QUEUE_NAMES.ALERTS],
    concurrency: config.worker.concurrency,
  });

  return {
    incidentWorker,
    workflowWorker,
    alertWorker,
  };
}
