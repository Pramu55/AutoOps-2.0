import { prisma as db } from '@autoops/database';
import { LogLevel } from '@autoops/types';

interface SimulationLogger {
  info(message: string): void;
  info(fields: Record<string, unknown>, message: string): void;
}

interface RunSimulationDeploymentInput {
  deploymentId: string;
  jobId: string | undefined;
  updateProgress: (progress: number) => Promise<void>;
  log: SimulationLogger;
}

const SIMULATION_DELAY_MS = 25;

const simulationPhases = [
  {
    progress: 20,
    name: 'resolve_artifact',
    eventType: 'deployment.simulation.artifact_resolved',
    message: 'Simulation resolved the deployment artifact.',
  },
  {
    progress: 40,
    name: 'prepare_runtime',
    eventType: 'deployment.simulation.runtime_prepared',
    message: 'Simulation prepared the target runtime.',
  },
  {
    progress: 60,
    name: 'apply_deployment',
    eventType: 'deployment.simulation.applied',
    message: 'Simulation applied the deployment plan.',
  },
  {
    progress: 80,
    name: 'health_check',
    eventType: 'deployment.simulation.health_checked',
    message: 'Simulation completed health checks.',
  },
  {
    progress: 95,
    name: 'finalize',
    eventType: 'deployment.simulation.finalized',
    message: 'Simulation finalized the deployment.',
  },
] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSimulationDeployment({
  deploymentId,
  jobId,
  updateProgress,
  log,
}: RunSimulationDeploymentInput): Promise<void> {
  log.info('Simulation executor started');
  await updateProgress(10);
  await db.deploymentEvent.create({
    data: {
      deploymentId,
      type: 'deployment.simulation.started',
      message: 'Simulation executor started.',
      level: LogLevel.INFO,
      metadata: { jobId },
    },
  });

  for (const phase of simulationPhases) {
    log.info({ phase: phase.name }, 'Simulation phase completed');
    await delay(SIMULATION_DELAY_MS);
    await updateProgress(phase.progress);
    await db.deploymentEvent.create({
      data: {
        deploymentId,
        type: phase.eventType,
        message: phase.message,
        level: LogLevel.INFO,
        metadata: { jobId, phase: phase.name, simulated: true },
      },
    });
  }

  await updateProgress(100);
  await db.deploymentEvent.create({
    data: {
      deploymentId,
      type: 'deployment.simulation.completed',
      message: 'Simulation executor completed successfully.',
      level: LogLevel.INFO,
      metadata: {
        jobId,
        phases: simulationPhases.map((phase) => phase.name),
      },
    },
  });
  log.info({ phaseCount: simulationPhases.length }, 'Simulation executor completed');
}
