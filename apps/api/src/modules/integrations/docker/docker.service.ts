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
  SignalSeverity,
  SignalSource,
  SignalType,
  type SignalIngestInput,
} from '@autoops/types';
import { operationService } from '../../operations/operation.service.js';
import { signalService } from '../../signals/signal.service.js';

type AuditContext = { ipAddress?: string; userAgent?: string };

type DockerActionConfig = {
  action: DockerActionName;
  operationType: OperationType;
  confirmationLabel: 'START' | 'STOP' | 'RESTART';
};

const AUTOOPS_MONITOR_LABEL = 'com.autoops.monitor';
const AUTOOPS_DESIRED_STATE_LABEL = 'com.autoops.desired-state';
const AUTOOPS_EXPECTED_STOPPED_LABEL = 'com.autoops.expected-stopped';
const AUTOOPS_ENVIRONMENT_LABEL = 'com.autoops.environment';
const AUTOOPS_COMPOSE_PROJECT = 'autoops';
const AUTOOPS_CONTAINER_PREFIX = 'autoops-';
const MONITORED_COMPOSE_PROJECTS = new Set(
  (process.env.AUTOOPS_MONITORED_DOCKER_COMPOSE_PROJECTS ?? AUTOOPS_COMPOSE_PROJECT)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

type DockerMonitoringScope = DockerContainer['monitoringScope'];
type DockerDesiredState = DockerContainer['desiredState'];

type DockerContainerObservation = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health: string | null;
  labels: Record<string, string>;
  composeProject: string | null;
  monitoringScope: DockerMonitoringScope;
  monitored: boolean;
  desiredState: DockerDesiredState;
};

type DockerSignalClassification = {
  condition: string;
  severity: SignalSeverity;
  title: string;
  message: string;
} | null;

const RECOVERABLE_DOCKER_CONTAINER_CONDITIONS = [
  'running_unhealthy',
  'restarting',
  'dead',
  'paused',
  'created_not_started',
];
const RECOVERABLE_DOCKER_CONTAINER_CONDITION_PREFIXES = ['unexpected_exit_'];

export class DockerService {
  async getStatus(organizationId?: string): Promise<DockerStatusResponse> {
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
      const { version, containers, images } = await this._withCompleteDockerObservation(organizationId, async () => {
        const [version, containers, images] = await Promise.all([
          client.version(),
          client.listContainers(),
          client.listImages(),
        ]);
        return { containers, value: { version, containers, images } };
      });

      if (organizationId) {
        void signalService.ingestSignal(organizationId, {
          source: SignalSource.DOCKER,
          type: SignalType.PROVIDER_CONNECTED,
          severity: SignalSeverity.INFO,
          title: 'Docker Engine Connected',
          message: 'Successfully connected to Docker Engine API.',
          metadata: { version: version.Version, apiVersion: version.ApiVersion },
          dedupeMode: 'DEDUPE',
        });
        void signalService.resolveSignalsByTitles(organizationId, SignalSource.DOCKER, SignalType.PROVIDER_UNREACHABLE, [
          'Docker Provider UNREACHABLE',
        ]);
        void signalService.resolveSignalsByTitles(organizationId, SignalSource.DOCKER, SignalType.PROVIDER_AUTH_FAILED, [
          'Docker Provider AUTH_FAILED',
        ]);
      }

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
      const failure = this._connectionFailure(error, checkedAt);
      if (organizationId) {
        void signalService.ingestSignal(organizationId, {
          source: SignalSource.DOCKER,
          type: failure.status === ProviderConnectionStatus.AUTH_FAILED
            ? SignalType.PROVIDER_AUTH_FAILED
            : SignalType.PROVIDER_UNREACHABLE,
          severity: SignalSeverity.ERROR,
          title: `Docker Provider ${failure.status}`,
          message: failure.message ?? 'Failed to connect to Docker Engine API.',
          metadata: { status: failure.status, error: error instanceof Error ? error.message : String(error) },
          dedupeMode: 'DEDUPE' as const,
        });
      }
      return failure;
    }
  }

  async listContainers(organizationId?: string): Promise<DockerListResponse<DockerContainer>> {
    return this._list(async (client) => {
      return this._withCompleteDockerObservation(organizationId, async () => {
        const containers = await client.listContainers();
        return {
          containers,
          value: containers.map((container) => this._toContainer(container)),
        };
      });
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
    const policy = this._policyFromOperation(operation.input);

    return {
      operationId: operation.id,
      status: operation.status,
      approvalRequired: operation.status === OperationStatus.PENDING_APPROVAL,
      approvalReason: policy.approvalReason,
      riskLevel: policy.riskLevel,
      policyName: policy.policyName,
      message:
        operation.status === OperationStatus.PENDING_APPROVAL
          ? `Docker container ${config.action} operation submitted for approval.`
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

  private async _list<T>(
    loader: (client: DockerEngineClient) => Promise<T[]>,
  ): Promise<DockerListResponse<T>> {
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
    const observation = this._toObservation(container);

    return {
      id: observation.id,
      name: observation.name,
      image: observation.image,
      imageId: container.ImageID ?? null,
      state: observation.state,
      status: observation.status,
      health: observation.health,
      createdAt: container.Created ? new Date(container.Created * 1000).toISOString() : null,
      ports:
        container.Ports?.map((port) => ({
          privatePort: port.PrivatePort ?? 0,
          publicPort: port.PublicPort ?? null,
          type: port.Type ?? 'tcp',
          ip: port.IP ?? null,
        })) ?? [],
      composeProject: observation.composeProject,
      isAutoOpsManaged: observation.monitoringScope === 'managed',
      monitoringScope: observation.monitoringScope,
      monitored: observation.monitored,
      desiredState: observation.desiredState,
      labelsSummary: this._safeDockerLabels(observation.labels),
    };
  }

  private _toObservation(container: DockerContainerSummary): DockerContainerObservation {
    const labels = container.Labels ?? {};
    const name = container.Names?.[0]?.replace(/^\//, '') ?? container.Id?.slice(0, 12) ?? 'unknown';
    const composeProject = labels['com.docker.compose.project'] ?? null;
    const monitorLabel = labels[AUTOOPS_MONITOR_LABEL]?.toLowerCase();
    const isExplicitlyMonitored = monitorLabel === 'true' || monitorLabel === '1' || monitorLabel === 'yes';
    const isExplicitlyIgnored = monitorLabel === 'false' || monitorLabel === '0' || monitorLabel === 'no';
    const isAutoOpsManaged =
      composeProject === AUTOOPS_COMPOSE_PROJECT ||
      name.startsWith(AUTOOPS_CONTAINER_PREFIX) ||
      labels[AUTOOPS_ENVIRONMENT_LABEL] === 'local';
    const isComposeMonitored = composeProject ? MONITORED_COMPOSE_PROJECTS.has(composeProject) : false;
    const monitoringScope: DockerMonitoringScope = isExplicitlyIgnored
      ? 'ignored'
      : isAutoOpsManaged
        ? 'managed'
        : isExplicitlyMonitored || isComposeMonitored
          ? 'monitored'
          : 'unrelated';

    return {
      id: container.Id ?? 'unknown',
      name,
      image: container.Image ?? 'unknown',
      state: container.State ?? 'unknown',
      status: container.Status ?? 'unknown',
      health: this._healthFromStatus(container.Status),
      labels,
      composeProject,
      monitoringScope,
      monitored: monitoringScope === 'managed' || monitoringScope === 'monitored',
      desiredState: this._desiredState(labels),
    };
  }

  private _desiredState(labels: Record<string, string>): DockerDesiredState {
    const explicitDesiredState = labels[AUTOOPS_DESIRED_STATE_LABEL]?.toLowerCase();
    if (explicitDesiredState === 'running' || explicitDesiredState === 'stopped') return explicitDesiredState;
    const expectedStopped = labels[AUTOOPS_EXPECTED_STOPPED_LABEL]?.toLowerCase();
    if (expectedStopped === 'true' || expectedStopped === '1' || expectedStopped === 'yes') return 'stopped';
    return 'running';
  }

  private _safeDockerLabels(labels: Record<string, string>): Record<string, string> {
    const allowedKeys = [
      AUTOOPS_MONITOR_LABEL,
      AUTOOPS_DESIRED_STATE_LABEL,
      AUTOOPS_EXPECTED_STOPPED_LABEL,
      AUTOOPS_ENVIRONMENT_LABEL,
      'com.docker.compose.project',
      'com.docker.compose.service',
    ];
    return Object.fromEntries(
      allowedKeys
        .map((key) => [key, labels[key]] as const)
        .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
    );
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

  private _policyFromOperation(input: Record<string, unknown>): {
    approvalReason: string | null;
    riskLevel: DockerActionResponse['riskLevel'];
    policyName: string | null;
  } {
    const policy = this._toRecord(input.policy);
    return {
      approvalReason: this._stringField(policy, 'approvalReason'),
      riskLevel: this._riskLevel(policy),
      policyName: this._stringField(policy, 'policyName'),
    };
  }

  private async _withCompleteDockerObservation<T>(
    organizationId: string | undefined,
    load: () => Promise<{ containers: DockerContainerSummary[]; value: T }>,
  ): Promise<T> {
    const cycleStartedAt = new Date();
    const result = await load();
    if (organizationId) {
      await this._ingestContainerSignals(organizationId, result.containers, cycleStartedAt);
    }
    return result.value;
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private _stringField(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private _riskLevel(record: Record<string, unknown>): DockerActionResponse['riskLevel'] {
    const value = record.riskLevel;
    return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' ? value : 'MEDIUM';
  }

  private async _ingestContainerSignals(
    organizationId: string,
    containers: DockerContainerSummary[],
    observedAt = new Date(),
  ): Promise<void> {
    const signals: SignalIngestInput[] = [];
    const resolvedFingerprints: string[] = [];
    const resolvedLegacyTitles: string[] = [];
    const resolvedResourceConditions: Array<{ resourceIdentity: string; titles: string[] }> = [];

    for (const container of containers) {
      const observation = this._toObservation(container);
      const classification = this._classifyContainerObservation(observation);
      if (classification) {
        signals.push(this._toContainerSignal(observation, classification, observedAt));
      } else if (observation.monitored) {
        resolvedFingerprints.push(...this._resolutionFingerprints(organizationId, observation));
        resolvedResourceConditions.push({
          resourceIdentity: this._resourceIdentity(observation),
          titles: this._legacyRecoverableContainerSignalTitles(observation),
        });
      } else {
        resolvedLegacyTitles.push(...this._legacyContainerSignalTitles(observation));
      }
    }

    if (signals.length > 0) {
      const ingestedSignals = await signalService.ingestSignals(organizationId, signals);
      if (ingestedSignals.length !== signals.length) {
        throw new Error('Docker signal ingestion was incomplete; historical reconciliation skipped.');
      }
    }
    if (resolvedFingerprints.length > 0) {
      await signalService.resolveSignalsByFingerprints(organizationId, resolvedFingerprints);
    }
    if (resolvedLegacyTitles.length > 0) {
      await signalService.resolveSignalsByTitles(
        organizationId,
        SignalSource.DOCKER,
        SignalType.DOCKER_CONTAINER_STATE_CHANGED,
        resolvedLegacyTitles,
      );
    }
    for (const resolution of resolvedResourceConditions) {
      await signalService.resolveSignalsByResourceConditionFamily(organizationId, {
        source: SignalSource.DOCKER,
        type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
        resourceIdentity: resolution.resourceIdentity,
        conditions: RECOVERABLE_DOCKER_CONTAINER_CONDITIONS,
        conditionPrefixes: RECOVERABLE_DOCKER_CONTAINER_CONDITION_PREFIXES,
        titles: resolution.titles,
      });
    }

    const observedByMonitoringScope = new Map<DockerMonitoringScope, string[]>(
      ['managed', 'monitored'].map((scope) => [scope as DockerMonitoringScope, []]),
    );
    for (const signal of signals) {
      const monitoringScope = signal.metadata?.monitoringScope;
      if (monitoringScope === 'managed' || monitoringScope === 'monitored') {
        observedByMonitoringScope
          .get(monitoringScope)
          ?.push(signalService.buildSignalFingerprint(organizationId, signal, 'DEDUPE'));
      }
    }

    for (const [monitoringScope, observedFingerprints] of observedByMonitoringScope.entries()) {
      await signalService.reconcileHistoricalSignals(organizationId, {
        source: SignalSource.DOCKER,
        type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
        observedFingerprints,
        scope: {
          metadata: { monitoringScope },
        },
        scanCompleted: true,
        observedAt,
      });
    }
  }

  private _classifyContainerObservation(observation: DockerContainerObservation): DockerSignalClassification {
    if (!observation.monitored) return null;

    const normalizedState = observation.state.toLowerCase();
    const normalizedStatus = observation.status.toLowerCase();
    const exitCode = this._exitCode(observation.status);
    const expectedRunning = observation.desiredState === 'running';
    const expectedStopped = observation.desiredState === 'stopped';

    if (normalizedState === 'running' && observation.health === 'unhealthy') {
      return {
        condition: 'running_unhealthy',
        severity: SignalSeverity.ERROR,
        title: `Docker Container ${observation.name} unhealthy`,
        message: `Docker container ${observation.name} is monitored and running, but its health check is unhealthy.`,
      };
    }

    if (normalizedStatus.includes('restarting') || normalizedState === 'restarting') {
      return {
        condition: 'restarting',
        severity: expectedRunning ? SignalSeverity.ERROR : SignalSeverity.WARNING,
        title: `Docker Container ${observation.name} restarting`,
        message: `Docker container ${observation.name} is repeatedly restarting while desired state is ${observation.desiredState}.`,
      };
    }

    if (normalizedState === 'dead') {
      return {
        condition: 'dead',
        severity: SignalSeverity.CRITICAL,
        title: `Docker Container ${observation.name} dead`,
        message: `Docker container ${observation.name} is in dead state and needs operator review.`,
      };
    }

    if (normalizedState === 'paused') {
      return expectedRunning
        ? {
            condition: 'paused',
            severity: SignalSeverity.WARNING,
            title: `Docker Container ${observation.name} paused`,
            message: `Docker container ${observation.name} is paused while desired state is running.`,
          }
        : null;
    }

    if (normalizedState === 'created') {
      return expectedRunning
        ? {
            condition: 'created_not_started',
            severity: SignalSeverity.WARNING,
            title: `Docker Container ${observation.name} not started`,
            message: `Docker container ${observation.name} was created but has not started, while desired state is running.`,
          }
        : null;
    }

    if (normalizedState === 'exited') {
      if (expectedStopped) return null;
      if (exitCode === 143) return null;
      if (exitCode === 137) {
        return {
          condition: 'unexpected_exit_137',
          severity: SignalSeverity.ERROR,
          title: `Docker Container ${observation.name} exited unexpectedly`,
          message: `Docker container ${observation.name} exited with code 137 while desired state is running; investigate OOM kill, host shutdown, or forced stop.`,
        };
      }
      return {
        condition: `unexpected_exit_${exitCode ?? 'unknown'}`,
        severity: SignalSeverity.ERROR,
        title: `Docker Container ${observation.name} exited unexpectedly`,
        message: `Docker container ${observation.name} exited with code ${exitCode ?? 'unknown'} while desired state is running.`,
      };
    }

    return null;
  }

  private _toContainerSignal(
    observation: DockerContainerObservation,
    classification: Exclude<DockerSignalClassification, null>,
    observedAt: Date,
  ): SignalIngestInput {
    return {
      source: SignalSource.DOCKER,
      type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
      severity: classification.severity,
      title: classification.title,
      message: classification.message,
      observedAt,
      metadata: {
        id: observation.id,
        name: observation.name,
        image: observation.image,
        state: observation.state,
        status: observation.status,
        health: observation.health,
        composeProject: observation.composeProject,
        monitoringScope: observation.monitoringScope,
        desiredState: observation.desiredState,
        condition: classification.condition,
        resourceIdentity: this._resourceIdentity(observation),
        exitCode: this._exitCode(observation.status),
      },
      labels: this._safeDockerLabels(observation.labels),
      dedupeMode: 'DEDUPE',
    };
  }

  private _resolutionFingerprints(organizationId: string, observation: DockerContainerObservation): string[] {
    return [
      this._fingerprintForCondition(organizationId, observation, 'running_unhealthy', SignalSeverity.ERROR),
      this._fingerprintForCondition(organizationId, observation, 'restarting', SignalSeverity.ERROR),
      this._fingerprintForCondition(organizationId, observation, 'restarting', SignalSeverity.WARNING),
      this._fingerprintForCondition(organizationId, observation, 'dead', SignalSeverity.CRITICAL),
      this._fingerprintForCondition(organizationId, observation, 'paused', SignalSeverity.WARNING),
      this._fingerprintForCondition(organizationId, observation, 'created_not_started', SignalSeverity.WARNING),
      this._fingerprintForCondition(organizationId, observation, 'unexpected_exit_137', SignalSeverity.ERROR),
      this._fingerprintForCondition(organizationId, observation, 'unexpected_exit_unknown', SignalSeverity.ERROR),
      this._fingerprintForCondition(
        organizationId,
        observation,
        `unexpected_exit_${this._exitCode(observation.status) ?? 'unknown'}`,
        SignalSeverity.ERROR,
      ),
    ];
  }

  private _legacyContainerSignalTitles(observation: DockerContainerObservation): string[] {
    const normalizedState = observation.state.toLowerCase();
    const normalizedStatus = observation.status.toLowerCase();
    if (normalizedState === 'exited' || normalizedState === 'dead' || normalizedStatus.includes('restarting')) {
      return [`Docker Container ${observation.name} ${observation.state}`];
    }
    return [];
  }

  private _legacyRecoverableContainerSignalTitles(observation: DockerContainerObservation): string[] {
    return [
      `Docker Container ${observation.name} exited`,
      `Docker Container ${observation.name} dead`,
      `Docker Container ${observation.name} restarting`,
    ];
  }

  private _fingerprintForCondition(
    organizationId: string,
    observation: DockerContainerObservation,
    condition: string,
    severity: SignalSeverity,
  ): string {
    return signalService.buildSignalFingerprint(
      organizationId,
      {
        source: SignalSource.DOCKER,
        type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
        severity,
        title: `Docker Container ${observation.name} ${condition}`,
        message: condition,
        metadata: {
          resourceIdentity: this._resourceIdentity(observation),
          condition,
        },
      },
      'DEDUPE',
    );
  }

  private _resourceIdentity(observation: DockerContainerObservation): string {
    return observation.composeProject
      ? `compose:${observation.composeProject}:container:${observation.name}`
      : `container:${observation.id.slice(0, 12) || observation.name}`;
  }

  private _exitCode(status: string): number | null {
    const match = status.match(/Exited \((\d+)\)/i);
    return match ? Number(match[1]) : null;
  }
}

export const dockerService = new DockerService();
