import { prisma } from '@autoops/database';
import {
  DeploymentStatus,
  DeploymentTrigger,
  LogLevel,
  type Deployment,
  type DeploymentEvent,
  type TriggerDeploymentInput,
} from '@autoops/types';
import { ConflictError, NotFoundError } from '@autoops/utils';
import { enqueueDeploymentJob } from './deployment.queue.js';
import { resourceGraphService } from '../resources/resource-graph.service.js';

const ACTIVE_DEPLOYMENT_STATUSES = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
  DeploymentStatus.RUNNING,
] as const;

export class DeploymentService {
  async listDeployments(organizationId: string): Promise<Deployment[]> {
    const deployments = await prisma.deployment.findMany({
      where: {
        project: {
          organizationId,
          archivedAt: null,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return deployments.map((deployment) => this._toDeployment(deployment));
  }

  async listEnvironmentDeployments(
    projectId: string,
    environmentId: string,
    organizationId: string,
  ): Promise<Deployment[]> {
    await this._requireEnvironment(projectId, environmentId, organizationId);

    const deployments = await prisma.deployment.findMany({
      where: {
        projectId,
        environmentId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return deployments.map((deployment) => this._toDeployment(deployment));
  }

  async triggerDeployment(
    projectId: string,
    environmentId: string,
    organizationId: string,
    userId: string,
    input: TriggerDeploymentInput,
  ): Promise<Deployment> {
    await this._requireEnvironment(projectId, environmentId, organizationId);

    const activeDeployment = await prisma.deployment.findFirst({
      where: {
        environmentId,
        status: {
          in: [...ACTIVE_DEPLOYMENT_STATUSES],
        },
      },
      select: {
        id: true,
      },
    });

    if (activeDeployment) {
      throw new ConflictError('An active deployment already exists for this environment');
    }

    const deployment = await prisma.$transaction(async (tx) => {
      const created = await tx.deployment.create({
        data: {
          projectId,
          environmentId,
          status: DeploymentStatus.QUEUED,
          trigger: input.trigger ?? DeploymentTrigger.MANUAL,
          commitSha: input.commitSha ?? null,
          branch: input.branch ?? null,
          triggeredById: userId,
        },
      });

      await tx.deploymentEvent.create({
        data: {
          deploymentId: created.id,
          type: 'deployment.queued',
          message: 'Deployment queued. Worker execution is not enabled yet.',
          level: LogLevel.INFO,
          metadata: {},
        },
      });

      return created;
    });

    try {
      await enqueueDeploymentJob({
        deploymentId: deployment.id,
        projectId,
        environmentId,
        organizationId,
        triggeredById: userId,
      });

      await prisma.deploymentEvent.create({
        data: {
          deploymentId: deployment.id,
          type: 'deployment.enqueued',
          message: 'Deployment job enqueued for worker processing.',
          level: LogLevel.INFO,
          metadata: {},
        },
      });
    } catch (err) {
      await prisma.$transaction([
        prisma.deployment.update({
          where: {
            id: deployment.id,
          },
          data: {
            status: DeploymentStatus.FAILED,
            errorMessage: 'Failed to enqueue deployment job.',
          },
        }),
        prisma.deploymentEvent.create({
          data: {
            deploymentId: deployment.id,
            type: 'deployment.enqueue_failed',
            message: 'Failed to enqueue deployment job.',
            level: LogLevel.ERROR,
            metadata: {},
          },
        }),
      ]);

      throw err;
    }

    await this._registerDeploymentNode(organizationId, deployment);
    return this._toDeployment(deployment);
  }

  async getDeployment(deploymentId: string, organizationId: string): Promise<Deployment> {
    const deployment = await prisma.deployment.findFirst({
      where: {
        id: deploymentId,
        project: {
          organizationId,
        },
      },
    });

    if (!deployment) {
      throw new NotFoundError('Deployment');
    }

    return this._toDeployment(deployment);
  }

  async listDeploymentEvents(
    deploymentId: string,
    organizationId: string,
  ): Promise<DeploymentEvent[]> {
    await this.getDeployment(deploymentId, organizationId);

    const events = await prisma.deploymentEvent.findMany({
      where: {
        deploymentId,
      },
      orderBy: {
        occurredAt: 'asc',
      },
    });

    return events.map((event) => this._toDeploymentEvent(event));
  }

  private async _requireEnvironment(
    projectId: string,
    environmentId: string,
    organizationId: string,
  ): Promise<void> {
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        projectId,
        archivedAt: null,
        project: {
          organizationId,
          archivedAt: null,
        },
      },
      select: {
        id: true,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment');
    }
  }

  private _toDeployment(deployment: {
    id: string;
    projectId: string;
    environmentId: string;
    status: Deployment['status'];
    trigger: Deployment['trigger'];
    commitSha: string | null;
    branch: string | null;
    triggeredById: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
    imageTag: string | null;
    errorMessage: string | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): Deployment {
    return {
      id: deployment.id,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      status: deployment.status,
      trigger: deployment.trigger,
      commitSha: deployment.commitSha,
      branch: deployment.branch,
      triggeredById: deployment.triggeredById,
      startedAt: deployment.startedAt?.toISOString() ?? null,
      completedAt: deployment.completedAt?.toISOString() ?? null,
      durationMs: deployment.durationMs,
      imageTag: deployment.imageTag,
      errorMessage: deployment.errorMessage,
      metadata: this._toRecord(deployment.metadata),
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
    };
  }

  private _toDeploymentEvent(event: {
    id: string;
    deploymentId: string;
    type: string;
    message: string;
    level: DeploymentEvent['level'];
    metadata: unknown;
    occurredAt: Date;
  }): DeploymentEvent {
    return {
      id: event.id,
      deploymentId: event.deploymentId,
      type: event.type,
      message: event.message,
      level: event.level,
      metadata: this._toRecord(event.metadata),
      occurredAt: event.occurredAt.toISOString(),
    };
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private async _registerDeploymentNode(
    organizationId: string,
    deployment: {
      id: string;
      projectId: string;
      environmentId: string;
      status: string;
      imageTag?: string | null;
    },
  ): Promise<void> {
    try {
      await resourceGraphService.registerAutoOpsDeploymentNode(organizationId, deployment);
    } catch (error) {
      console.warn('Resource graph deployment registration failed', {
        organizationId,
        deploymentId: deployment.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

export const deploymentService = new DeploymentService();
