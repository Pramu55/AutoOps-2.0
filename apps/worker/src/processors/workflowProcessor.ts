import type { Job } from "bullmq";
import { prisma } from "@autoops/database";
import { Prisma } from "@prisma/client";
import type { WorkflowJobPayload } from "@autoops/shared";
import { createLogger, sleep } from "@autoops/shared";

const logger = createLogger("WorkflowProcessor");

interface WorkflowStep {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface WorkflowDefinition {
  steps: WorkflowStep[];
}

export async function processWorkflowJob(job: Job<WorkflowJobPayload>) {
  const { data } = job.data;
  const { workflowId, runId, input } = data;

  logger.info("Processing workflow job", { jobId: job.id, workflowId, runId });

  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const definition = workflow.definition as unknown as WorkflowDefinition;
    const steps = definition.steps ?? [];
    const stepResults: Record<string, unknown> = {};

    for (const step of steps) {
      logger.info("Executing workflow step", {
        runId,
        stepId: step.id,
        stepType: step.type,
      });

      await job.updateProgress(
        Math.round(((steps.indexOf(step) + 1) / steps.length) * 100)
      );

      const result = await executeStep(step, { input, previousResults: stepResults });
      stepResults[step.id] = result;

      await sleep(100);
    }

    await prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        output: stepResults as unknown as Prisma.InputJsonValue,
      },
    });

    logger.info("Workflow completed successfully", { runId, workflowId });
    return { success: true, runId, output: stepResults };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: errorMessage,
      },
    });

    logger.error("Workflow execution failed", { runId, workflowId, error: errorMessage });
    throw error;
  }
}

async function executeStep(
  step: WorkflowStep,
  context: {
    input: Record<string, unknown>;
    previousResults: Record<string, unknown>;
  }
): Promise<unknown> {
  switch (step.type) {
    case "notification":
      logger.info("Sending notification", { channel: step.config["channel"] });
      return { sent: true, channel: step.config["channel"] };

    case "assignment":
      logger.info("Assigning task", { strategy: step.config["strategy"] });
      return { assigned: true, strategy: step.config["strategy"] };

    case "escalation":
      logger.info("Setting up escalation", {
        timeout: step.config["timeoutMinutes"],
      });
      return { scheduled: true, timeoutMinutes: step.config["timeoutMinutes"] };

    case "condition":
      logger.info("Evaluating condition", { condition: step.config["expression"] });
      return { result: true };

    case "wait":
      const delayMs = (step.config["delaySeconds"] as number ?? 1) * 1000;
      await sleep(Math.min(delayMs, 5000));
      return { waited: true };

    default:
      logger.warn("Unknown step type", { stepType: step.type });
      return { skipped: true, reason: `Unknown step type: ${step.type}` };
  }
}
