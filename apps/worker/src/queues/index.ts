import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@autoops/shared";
import { redisConnection } from "@/workers/connection.js";

export const incidentQueue = new Queue(QUEUE_NAMES.INCIDENTS, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});

export const workflowQueue = new Queue(QUEUE_NAMES.WORKFLOWS, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});

export const alertQueue = new Queue(QUEUE_NAMES.ALERTS, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});

export const healthCheckQueue = new Queue(QUEUE_NAMES.HEALTH_CHECKS, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 10000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

export const queues = {
  incidents: incidentQueue,
  workflows: workflowQueue,
  alerts: alertQueue,
  healthChecks: healthCheckQueue,
};
