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

type ContainerParams = {
  containerId: string;
};

export class DockerController {
  status = async (_req: Request, res: Response<{ data: DockerStatusResponse }>): Promise<void> => {
    res.json({ data: await dockerService.getStatus() });
  };

  containers = async (_req: Request, res: Response<{ data: DockerListResponse<DockerContainer> }>): Promise<void> => {
    res.json({ data: await dockerService.listContainers() });
  };

  images = async (_req: Request, res: Response<{ data: DockerListResponse<DockerImage> }>): Promise<void> => {
    res.json({ data: await dockerService.listImages() });
  };

  networks = async (_req: Request, res: Response<{ data: DockerListResponse<DockerNetwork> }>): Promise<void> => {
    res.json({ data: await dockerService.listNetworks() });
  };

  volumes = async (_req: Request, res: Response<{ data: DockerListResponse<DockerVolume> }>): Promise<void> => {
    res.json({ data: await dockerService.listVolumes() });
  };

  logs = async (
    req: Request<ContainerParams>,
    res: Response<{ data: DockerLogsResponse }>,
  ): Promise<void> => {
    const query = req.query as unknown as DockerLogsQuery;
    res.json({ data: await dockerService.getLogs(req.params.containerId, query) });
  };

  start = async (
    req: Request<ContainerParams>,
    res: Response<{ data: DockerActionResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
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
}

export const dockerController = new DockerController();
