import { type Prisma } from '@autoops/database';
import {
  DockerEngineClient,
  DockerEngineError,
  type DockerContainerSummary,
  toDockerEngineError,
  BadRequestError,
  NotFoundError,
} from '@autoops/utils';
import {
  DockerActionName,
  DockerActionResponse,
  DockerContainer,
  DockerImage,
  DockerListResponse,
  DockerLogsQuery,
  DockerLogsResponse,
  DockerNetwork,
  DockerStatusResponse,
  DockerVolume,
  OperationProvider,
  OperationStatus,
  OperationType,
  ProviderConnectionStatus,
} from '@autoops/types';
import { operationService } from '../../operations/operation.service.js';

type AuditContext = { ipAddress?: string; userAgent?: string };

type DockerActionConfig = {
  action: DockerActionName;
  operationType: OperationType;
  confirmationLabel: 'START' | 'STOP' | 'RESTART';
};

const AUTOOPS_LABEL_PREFIX = 'com.docker.compose.';

export class DockerService {
  async getStatus(): Promise<DockerStatusResponse> {
    const checkedAt = new Date().toISOString();
    const client = new DockerEngineClient();
    if (!client.isConfigured()) {
      return {
        status: ProviderConnectionStatus.NOT_CONFIGURED,
        configured: false,
        containers: 0,
        images: 0,
        checkedAt,
        message: client.notConfiguredMessage(),
      };
    }

    try {
      const [version, containers, images] = await Promise.all([
        client.version(),
        client.listContainers(),
        client.listImages(),
      ]);

      return {
        status: ProviderConnectionStatus.CONNECTED,
        configured: true,
        version: version.Version,
        apiVersion: version.ApiVersion,
        os: version.Os,
        architecture: version.Arch,
        containers: containers.length,
        images: images.length,
        checkedAt,
        message: 'Docker is connected.',
      };
    } catch (error) {
      return this._connectionFailure(error, checkedAt);
    }
  }

  async listContainers(): Promise<DockerListResponse<DockerContainer>> {
    return this._list(async (client) => {
      const containers = await client.listContainers();
      return containers.map((container) => this._toContainer(container));
    });
  }

  async listImages(): Promise<DockerListResponse<DockerImage>> {
    return this._list(async (client) => {
      const images = await client.listImages();
      return images.map((image) => ({
        id: image.Id ?? 'unknown',
        repoTags: image.RepoTags?.filter(Boolean) ?? [],
        size: image.Size ?? 0,
        createdAt: image.Created ? new Date(image.Created * 1000).toISOString() : null,
      }));
    });
  }

  async listNetworks(): Promise<DockerListResponse<DockerNetwork>> {
    return this._list(async (client) => {
      const networks = await client.listNetworks();
      return networks.map((network) => ({
        id: network.Id ?? 'unknown',
        name: network.Name ?? 'unknown',
        driver: network.Driver ?? 'unknown',
        scope: network.Scope ?? 'unknown',
      }));
    });
  }

  async listVolumes(): Promise<DockerListResponse<DockerVolume>> {
    return this._list(async (client) => {
      const volumes = await client.listVolumes();
      return (volumes.Volumes ?? []).map((volume) => ({
        name: volume.Name ?? 'unknown',
        driver: volume.Driver ?? 'unknown',
        createdAt: volume.CreatedAt ?? null,
      }));
    });
  }

  async getLogs(containerId: string, query: DockerLogsQuery): Promise<DockerLogsResponse> {
    const checkedAt = new Date().toISOString();
    const client = this._requiredClient();
    const container = await this._findContainer(client, containerId);
    const lines = await client.logs(container.id, query.tail, query.timestamps ?? false);

    return {
      status: ProviderConnectionStatus.CONNECTED,
      configured: true,
      checkedAt,
      containerId: container.id,
      containerName: container.name,
      tail: query.tail,
      lines,
    };
  }

  async requestContainerAction(
    containerId: string,
    organizationId: string,
    userId: string,
    role: string | undefined,
    confirmationToken: string,
    config: DockerActionConfig,
    auditContext: AuditContext,
  ): Promise<DockerActionResponse> {
    if (confirmationToken !== config.confirmationLabel) {
      throw new BadRequestError(`confirmationToken must be ${config.confirmationLabel}`);
    }

    const client = this._requiredClient();
    const container = await this._findContainer(client, containerId);
    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        role,
        provider: OperationProvider.DOCKER,
        operationType: config.operationType,
        confirmationToken,
        idempotencyKey: `docker-${config.action}-${container.id}-${Date.now()}`,
        input: {
          action: config.action,
          containerId: container.id,
          containerName: container.name,
          image: container.image,
          confirmationLabel: config.confirmationLabel,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
      },
      auditContext,
    );

    return {
      operationId: operation.id,
      status: operation.status,
      approvalRequired: operation.status === OperationStatus.PENDING_APPROVAL,
      message:
        operation.status === OperationStatus.PENDING_APPROVAL
          ? `Docker container ${config.action} operation is pending approval.`
          : `Docker container ${config.action} operation queued.`,
    };
  }

  private _requiredClient(): DockerEngineClient {
    const client = new DockerEngineClient();
    if (!client.isConfigured()) {
      throw new BadRequestError(client.notConfiguredMessage());
    }
    return client;
  }

  private async _findContainer(
    client: DockerEngineClient,
    containerId: string,
  ): Promise<DockerContainer> {
    const containers = await client.listContainers();
    const normalized = containerId.trim();
    const container = containers
      .map((item) => this._toContainer(item))
      .find(
        (item) =>
          item.id === normalized ||
          item.id.startsWith(normalized) ||
          item.name === normalized ||
          item.name === normalized.replace(/^\//, ''),
      );

    if (!container) throw new NotFoundError('Docker container');
    return container;
  }

  private async _list<T>(loader: (client: DockerEngineClient) => Promise<T[]>): Promise<DockerListResponse<T>> {
    const checkedAt = new Date().toISOString();
    const client = new DockerEngineClient();
    if (!client.isConfigured()) {
      return {
        status: ProviderConnectionStatus.NOT_CONFIGURED,
        configured: false,
        checkedAt,
        message: client.notConfiguredMessage(),
        items: [],
      };
    }

    try {
      return {
        status: ProviderConnectionStatus.CONNECTED,
        configured: true,
        checkedAt,
        items: await loader(client),
      };
    } catch (error) {
      const failure = this._connectionFailure(error, checkedAt);
      return {
        status: failure.status,
        configured: failure.configured,
        checkedAt,
        message: failure.message,
        items: [],
      };
    }
  }

  private _toContainer(container: DockerContainerSummary): DockerContainer {
    const labels = container.Labels ?? {};
    const name = container.Names?.[0]?.replace(/^\//, '') ?? container.Id?.slice(0, 12) ?? 'unknown';
    const composeProject = labels['com.docker.compose.project'] ?? null;

    return {
      id: container.Id ?? 'unknown',
      name,
      image: container.Image ?? 'unknown',
      imageId: container.ImageID ?? null,
      state: container.State ?? 'unknown',
      status: container.Status ?? 'unknown',
      health: this._healthFromStatus(container.Status),
      createdAt: container.Created ? new Date(container.Created * 1000).toISOString() : null,
      ports:
        container.Ports?.map((port) => ({
          privatePort: port.PrivatePort ?? 0,
          publicPort: port.PublicPort ?? null,
          type: port.Type ?? 'tcp',
          ip: port.IP ?? null,
        })) ?? [],
      composeProject,
      isAutoOpsManaged:
        composeProject === 'autoops' ||
        name.startsWith('autoops-') ||
        Object.keys(labels).some((key) => key.startsWith(AUTOOPS_LABEL_PREFIX)),
    };
  }

  private _healthFromStatus(status: string | undefined): string | null {
    if (!status) return null;
    const match = status.match(/\(([^)]+)\)/);
    return match?.[1] ?? null;
  }

  private _connectionFailure(error: unknown, checkedAt: string): DockerStatusResponse {
    const dockerError = toDockerEngineError(error);
    return {
      status: this._statusForError(dockerError),
      configured: dockerError.code !== 'NOT_CONFIGURED',
      containers: 0,
      images: 0,
      checkedAt,
      message: dockerError.message,
    };
  }

  private _statusForError(error: DockerEngineError): ProviderConnectionStatus {
    if (error.code === 'NOT_CONFIGURED') return ProviderConnectionStatus.NOT_CONFIGURED;
    if (error.code === 'PERMISSION_DENIED') return ProviderConnectionStatus.AUTH_FAILED;
    if (error.code === 'UNREACHABLE' || error.code === 'TIMEOUT') return ProviderConnectionStatus.UNREACHABLE;
    return ProviderConnectionStatus.UNKNOWN_ERROR;
  }
}

export const dockerService = new DockerService();
