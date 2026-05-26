import type { Request, Response } from 'express';
import {
  OperationType,
  type DockerActionResponse,
  type DockerContainer,
  type DockerImage,
  type DockerListResponse,
  type DockerLogsQuery,
  type DockerLogsResponse,
  type DockerNetwork,
  type DockerRestartContainerInput,
  type DockerStartContainerInput,
  type DockerStatusResponse,
  type DockerStopContainerInput,
  type DockerVolume,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { dockerService } from './docker.service.js';
import { getProviderInventoryBlockedStatus, requireProviderInventoryAccess } from '../integration-access.service.js';
import { resourceGraphService } from '../../resources/resource-graph.service.js';

type ContainerParams = {
  containerId: string;
};

export class DockerController {
  status = async (req: Request, res: Response<{ data: DockerStatusResponse }>): Promise<void> => {
    const blocked = await getProviderInventoryBlockedStatus(req.auth);
    if (blocked) {
      res.json({ data: blocked as unknown as DockerStatusResponse });
      return;
    }

    const raw = await dockerService.getStatus();
    const safeStatus = {
      status: raw.status,
      configured: raw.configured,
      version: raw.version,
      apiVersion: raw.apiVersion,
      os: raw.os,
      architecture: raw.architecture,
      checkedAt: raw.checkedAt,
      message: raw.message,
    };
    res.json({ data: safeStatus as unknown as DockerStatusResponse });
  };

  containers = async (
    req: Request,
    res: Response<{ data: DockerListResponse<DockerContainer> }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await dockerService.listContainers();
    await this._registerDocker(auth.orgId, { containers: data.items });
    res.json({ data });
  };

  images = async (req: Request, res: Response<{ data: DockerListResponse<DockerImage> }>): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await dockerService.listImages();
    await this._registerDocker(auth.orgId, { images: data.items });
    res.json({ data });
  };

  networks = async (
    req: Request,
    res: Response<{ data: DockerListResponse<DockerNetwork> }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await dockerService.listNetworks();
    await this._registerDocker(auth.orgId, { networks: data.items });
    res.json({ data });
  };

  volumes = async (req: Request, res: Response<{ data: DockerListResponse<DockerVolume> }>): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await dockerService.listVolumes();
    await this._registerDocker(auth.orgId, { volumes: data.items });
    res.json({ data });
  };

  logs = async (
    req: Request<ContainerParams, unknown, unknown, DockerLogsQuery>,
    res: Response<{ data: DockerLogsResponse }>,
  ): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({
      data: await dockerService.getLogs(req.params.containerId, req.query),
    });
  };

  start = async (
    req: Request<ContainerParams>,
    res: Response<{ data: DockerActionResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const input = req.body as DockerStartContainerInput;
    const data = await dockerService.requestContainerAction(
      req.params.containerId,
      auth.orgId,
      auth.userId,
      auth.role,
      input.confirmationToken,
      {
        action: 'start',
        operationType: OperationType.DOCKER_CONTAINER_START,
        confirmationLabel: 'START',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  stop = async (
    req: Request<ContainerParams>,
    res: Response<{ data: DockerActionResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const input = req.body as DockerStopContainerInput;
    const data = await dockerService.requestContainerAction(
      req.params.containerId,
      auth.orgId,
      auth.userId,
      auth.role,
      input.confirmationToken,
      {
        action: 'stop',
        operationType: OperationType.DOCKER_CONTAINER_STOP,
        confirmationLabel: 'STOP',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  restart = async (
    req: Request<ContainerParams>,
    res: Response<{ data: DockerActionResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const input = req.body as DockerRestartContainerInput;
    const data = await dockerService.requestContainerAction(
      req.params.containerId,
      auth.orgId,
      auth.userId,
      auth.role,
      input.confirmationToken,
      {
        action: 'restart',
        operationType: OperationType.DOCKER_CONTAINER_RESTART,
        confirmationLabel: 'RESTART',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  private _requireAuth(req: Request): { userId: string; orgId: string; role?: string } {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.orgId) throw new UnauthorizedError('Organization context is required');
    return { userId: req.auth.userId, orgId: req.auth.orgId, role: req.auth.role };
  }

  private _auditContext(req: Request): { ipAddress?: string; userAgent?: string } {
    return {
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    };
  }

  private async _registerDocker(
    organizationId: string,
    input: {
      containers?: DockerContainer[];
      images?: DockerImage[];
      networks?: DockerNetwork[];
      volumes?: DockerVolume[];
    },
  ): Promise<void> {
    try {
      await resourceGraphService.registerDockerInventory(organizationId, input);
    } catch (error) {
      console.warn('Resource graph Docker registration failed', {
        organizationId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

export const dockerController = new DockerController();
