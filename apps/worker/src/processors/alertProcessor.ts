import type { Job } from "bullmq";
import { prisma } from "@autoops/database";
import type { AlertJobPayload } from "@autoops/shared";
import { JOB_NAMES, SEVERITY_WEIGHTS, createLogger } from "@autoops/shared";

const logger = createLogger("AlertProcessor");

export async function processAlertJob(job: Job<AlertJobPayload>) {
  const { data } = job.data;
  const { alertId, severity } = data;

  logger.info("Processing alert job", {
    jobId: job.id,
    jobName: job.name,
    alertId,
    severity,
  });

  const alert = await prisma.alert.findUnique({ where: { id: alertId } });

  if (!alert) {
    logger.warn("Alert not found", { alertId });
    return { skipped: true, reason: "Alert not found" };
  }

  switch (job.name) {
    case JOB_NAMES.ALERT_PROCESS: {
      const weight = SEVERITY_WEIGHTS[severity] ?? 1;

      logger.info("Processing alert", {
        alertId: alert.id,
        title: alert.title,
        severity: alert.severity,
        source: alert.source,
        weight,
      });

      if (weight >= SEVERITY_WEIGHTS["HIGH"]!) {
        logger.warn("High severity alert detected", {
          alertId: alert.id,
          severity: alert.severity,
        });
      }

      return { processed: true, weight };
    }

    case JOB_NAMES.ALERT_ESCALATE: {
      logger.warn("Escalating alert", {
        alertId: alert.id,
        severity: alert.severity,
      });

      return { escalated: true };
    }

    default:
      logger.warn("Unknown alert job name", { jobName: job.name });
      return { skipped: true, reason: `Unknown job name: ${job.name}` };
  }
}
