import type { Job } from "bullmq";
import { prisma } from "@autoops/database";
import type { IncidentJobPayload } from "@autoops/shared";
import { JOB_NAMES, createLogger } from "@autoops/shared";

const logger = createLogger("IncidentProcessor");

export async function processIncidentJob(job: Job<IncidentJobPayload>) {
  const { type, data } = job.data;

  logger.info("Processing incident job", {
    jobId: job.id,
    jobName: job.name,
    incidentId: data.incidentId,
    action: data.action,
  });

  const incident = await prisma.incident.findUnique({
    where: { id: data.incidentId },
    include: {
      service: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
    },
  });

  if (!incident) {
    logger.warn("Incident not found", { incidentId: data.incidentId });
    return { skipped: true, reason: "Incident not found" };
  }

  switch (job.name) {
    case JOB_NAMES.INCIDENT_CREATED: {
      logger.info("Handling incident created", {
        incidentId: incident.id,
        title: incident.title,
        severity: incident.severity,
        service: incident.service.name,
      });

      await prisma.incidentTimeline.create({
        data: {
          incidentId: incident.id,
          message: `Incident created with severity ${incident.severity}`,
        },
      });

      return { processed: true, action: "created" };
    }

    case JOB_NAMES.INCIDENT_UPDATED: {
      logger.info("Handling incident updated", {
        incidentId: incident.id,
        status: incident.status,
      });

      await prisma.incidentTimeline.create({
        data: {
          incidentId: incident.id,
          message: `Incident status updated to ${incident.status}`,
        },
      });

      return { processed: true, action: "updated" };
    }

    case JOB_NAMES.INCIDENT_RESOLVED: {
      logger.info("Handling incident resolved", {
        incidentId: incident.id,
        resolvedAt: incident.resolvedAt,
      });

      await prisma.incidentTimeline.create({
        data: {
          incidentId: incident.id,
          message: "Incident resolved",
        },
      });

      if (incident.severity === "CRITICAL" || incident.severity === "HIGH") {
        logger.info("High severity incident resolved - sending notification", {
          incidentId: incident.id,
          severity: incident.severity,
        });
      }

      return { processed: true, action: "resolved" };
    }

    default:
      logger.warn("Unknown incident job name", { jobName: job.name });
      return { skipped: true, reason: `Unknown job name: ${job.name}` };
  }
}
