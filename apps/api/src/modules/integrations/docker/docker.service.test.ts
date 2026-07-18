import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderConnectionStatus, SignalSeverity, SignalSource, SignalType } from '@autoops/types';
import type { DockerContainerSummary } from '@autoops/utils';

const dockerClientState = vi.hoisted(() => ({
  client: null as any,
}));

vi.mock('@autoops/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@autoops/utils')>();
  return {
    ...actual,
    DockerEngineClient: vi.fn(() => dockerClientState.client),
  };
});

const ingestSignal = vi.fn();
const ingestSignals = vi.fn();
const resolveSignalsByFingerprints = vi.fn();
const resolveSignalsByResourceConditionFamily = vi.fn();
const resolveSignalsByTitles = vi.fn();
const reconcileHistoricalSignals = vi.fn();
const buildSignalFingerprint = vi.fn();

vi.mock('../../signals/signal.service.js', () => ({
  signalService: {
    ingestSignal,
    ingestSignals,
    resolveSignalsByFingerprints,
    resolveSignalsByResourceConditionFamily,
    resolveSignalsByTitles,
    reconcileHistoricalSignals,
    buildSignalFingerprint,
  },
}));

vi.mock('../../operations/operation.service.js', () => ({
  operationService: {
    createQueuedOperation: vi.fn(),
  },
}));

const { dockerService } = await import('./docker.service.js');

type DockerServiceInternals = {
  _toContainer(container: DockerContainerSummary): unknown;
  _ingestContainerSignals(organizationId: string, containers: DockerContainerSummary[], observedAt?: Date): Promise<void>;
  _withCompleteDockerObservation<T>(
    organizationId: string | undefined,
    load: () => Promise<{ containers: DockerContainerSummary[]; value: T }>,
  ): Promise<T>;
};

const service = dockerService as unknown as DockerServiceInternals;

function container(overrides: Partial<DockerContainerSummary> = {}): DockerContainerSummary {
  return {
    Id: 'container-1234567890abcdef',
    Names: ['/autoops-api-1'],
    Image: 'autoops-api:test',
    ImageID: 'image-1',
    State: 'running',
    Status: 'Up 2 minutes (healthy)',
    Created: 1_782_000_000,
    Labels: {
      'com.docker.compose.project': 'autoops',
      'com.docker.compose.service': 'api',
    },
    Ports: [],
    ...overrides,
  };
}

describe('DockerService signal scope and classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    dockerClientState.client = {
      isConfigured: vi.fn(() => true),
      notConfiguredMessage: vi.fn(() => 'Docker connector is configured.'),
      version: vi.fn().mockResolvedValue({
        Version: '26.0.0',
        ApiVersion: '1.45',
        Os: 'linux',
        Arch: 'x86_64',
      }),
      listContainers: vi.fn().mockResolvedValue([]),
      listImages: vi.fn().mockResolvedValue([]),
    };
    ingestSignal.mockResolvedValue({});
    ingestSignals.mockImplementation(async (_organizationId, signals) => signals.map(() => ({})));
    resolveSignalsByFingerprints.mockResolvedValue(0);
    resolveSignalsByResourceConditionFamily.mockResolvedValue(0);
    resolveSignalsByTitles.mockResolvedValue(0);
    reconcileHistoricalSignals.mockResolvedValue({ scanned: 0, observed: 0, resolved: 0, skipped: false });
    buildSignalFingerprint.mockImplementation((_organizationId, input) => {
      const metadata = input.metadata ?? {};
      return `${metadata.resourceIdentity ?? 'unknown'}:${metadata.condition ?? input.title}:${input.severity}`;
    });
  });

  it('classifies unrelated CloudShield containers as inventory-only, not monitored signals', async () => {
    const cloudShield = container({
      Names: ['/cloudshield-frontend-1'],
      Image: 'cloudshield-frontend:test',
      State: 'exited',
      Status: 'Exited (137) 2 hours ago',
      Labels: { 'com.docker.compose.project': 'cloudshield' },
    });

    const dto = service._toContainer(cloudShield) as { monitoringScope: string; monitored: boolean };
    await service._ingestContainerSignals('org-a', [cloudShield]);

    expect(dto.monitoringScope).toBe('unrelated');
    expect(dto.monitored).toBe(false);
    expect(ingestSignals).not.toHaveBeenCalled();
    expect(resolveSignalsByFingerprints).not.toHaveBeenCalled();
    expect(resolveSignalsByResourceConditionFamily).not.toHaveBeenCalled();
    expect(resolveSignalsByTitles).toHaveBeenCalledWith(
      'org-a',
      SignalSource.DOCKER,
      SignalType.DOCKER_CONTAINER_STATE_CHANGED,
      ['Docker Container cloudshield-frontend-1 exited'],
    );
  });

  it('classifies unrelated TrustFabric containers as inventory-only, not monitored signals', async () => {
    const trustFabric = container({
      Names: ['/trustfabric-postgres'],
      Image: 'postgres:16',
      State: 'exited',
      Status: 'Exited (0) 1 day ago',
      Labels: { 'com.docker.compose.project': 'trustfabric' },
    });

    const dto = service._toContainer(trustFabric) as { monitoringScope: string; monitored: boolean };
    await service._ingestContainerSignals('org-a', [trustFabric]);

    expect(dto.monitoringScope).toBe('unrelated');
    expect(dto.monitored).toBe(false);
    expect(ingestSignals).not.toHaveBeenCalled();
    expect(resolveSignalsByTitles).toHaveBeenCalledWith(
      'org-a',
      SignalSource.DOCKER,
      SignalType.DOCKER_CONTAINER_STATE_CHANGED,
      ['Docker Container trustfabric-postgres exited'],
    );
  });

  it('keeps explicitly monitored AutoOps containers actionable', async () => {
    await service._ingestContainerSignals('org-a', [
      container({
        Names: ['/autoops-worker-1'],
        State: 'exited',
        Status: 'Exited (137) 3 seconds ago',
      }),
    ]);

    expect(ingestSignals).toHaveBeenCalledWith('org-a', [
      expect.objectContaining({
        source: SignalSource.DOCKER,
        type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
        severity: SignalSeverity.ERROR,
        metadata: expect.objectContaining({
          condition: 'unexpected_exit_137',
          monitoringScope: 'managed',
          desiredState: 'running',
          exitCode: 137,
        }),
      }),
    ]);
  });

  it('does not create a critical signal for expected stopped containers', async () => {
    await service._ingestContainerSignals('org-a', [
      container({
        Names: ['/autoops-demo-paused-1'],
        State: 'exited',
        Status: 'Exited (0) 5 minutes ago',
        Labels: {
          'com.docker.compose.project': 'autoops',
          'com.autoops.desired-state': 'stopped',
        },
      }),
    ]);

    expect(ingestSignals).not.toHaveBeenCalled();
    expect(resolveSignalsByFingerprints).toHaveBeenCalled();
  });

  it('treats expected SIGTERM 143 shutdown as non-critical', async () => {
    await service._ingestContainerSignals('org-a', [
      container({
        Names: ['/autoops-api-1'],
        State: 'exited',
        Status: 'Exited (143) 1 minute ago',
      }),
    ]);

    expect(ingestSignals).not.toHaveBeenCalled();
  });

  it('deduplicates repeated identical observations with a stable resource condition fingerprint', async () => {
    await service._ingestContainerSignals('org-a', [
      container({
        Names: ['/autoops-api-1'],
        State: 'exited',
        Status: 'Exited (137) 1 minute ago',
      }),
      container({
        Id: 'different-runtime-id',
        Names: ['/autoops-api-1'],
        State: 'exited',
        Status: 'Exited (137) 2 minutes ago',
      }),
    ]);

    const signals = ingestSignals.mock.calls[0]![1];
    expect(signals).toHaveLength(2);
    expect(signals[0].metadata.resourceIdentity).toBe('compose:autoops:container:autoops-api-1');
    expect(signals[1].metadata.resourceIdentity).toBe('compose:autoops:container:autoops-api-1');
    expect(signals[0].metadata.condition).toBe('unexpected_exit_137');
    expect(signals[1].metadata.condition).toBe('unexpected_exit_137');
  });

  it('resolves prior active Docker condition fingerprints when the monitored container recovers', async () => {
    await service._ingestContainerSignals('org-a', [
      container({
        Names: ['/autoops-api-1'],
        State: 'running',
        Status: 'Up 2 minutes (healthy)',
      }),
    ]);

    expect(ingestSignals).not.toHaveBeenCalled();
    expect(resolveSignalsByFingerprints).toHaveBeenCalledWith(
      'org-a',
      expect.arrayContaining([
        'compose:autoops:container:autoops-api-1:running_unhealthy:ERROR',
        'compose:autoops:container:autoops-api-1:unexpected_exit_137:ERROR',
      ]),
    );
    expect(resolveSignalsByResourceConditionFamily).toHaveBeenCalledWith('org-a', {
      source: SignalSource.DOCKER,
      type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
      resourceIdentity: 'compose:autoops:container:autoops-api-1',
      conditions: ['running_unhealthy', 'restarting', 'dead', 'paused', 'created_not_started'],
      conditionPrefixes: ['unexpected_exit_'],
      titles: [
        'Docker Container autoops-api-1 exited',
        'Docker Container autoops-api-1 dead',
        'Docker Container autoops-api-1 restarting',
      ],
    });
    expect(reconcileHistoricalSignals).toHaveBeenCalledWith('org-a', {
      source: SignalSource.DOCKER,
      type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
      observedFingerprints: [],
      scope: {
        metadata: { monitoringScope: 'managed' },
      },
      scanCompleted: true,
      observedAt: expect.any(Date),
    });
  });

  it('captures the reconciliation cutoff before Docker observation starts', async () => {
    const cycleStartedAt = new Date('2026-07-18T10:00:00.000Z');
    const listCompletedAt = new Date('2026-07-18T10:00:05.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(cycleStartedAt);
    ingestSignals.mockImplementation(async (_organizationId, signals) => signals.map(() => ({})));
    buildSignalFingerprint.mockReturnValue('canonical-fingerprint');

    await service._withCompleteDockerObservation('org-a', async () => {
      vi.setSystemTime(listCompletedAt);
      return {
        containers: [
          container({
            State: 'exited',
            Status: 'Exited (137) 1 minute ago',
          }),
        ],
        value: 'complete',
      };
    });

    expect(ingestSignals.mock.calls[0]![1][0].observedAt).toEqual(cycleStartedAt);
    expect(reconcileHistoricalSignals).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({ observedAt: cycleStartedAt }),
    );
  });

  it('Docker API failure causes no reconciliation', async () => {
    await expect(
      service._withCompleteDockerObservation('org-a', async () => {
        throw new Error('Docker list failed');
      }),
    ).rejects.toThrow('Docker list failed');

    expect(reconcileHistoricalSignals).not.toHaveBeenCalled();
  });

  it('ingestion failure causes no unsafe reconciliation', async () => {
    ingestSignals.mockResolvedValue([]);

    await expect(
      service._withCompleteDockerObservation('org-a', async () => ({
        containers: [
          container({
            State: 'exited',
            Status: 'Exited (137) 1 minute ago',
          }),
        ],
        value: 'complete',
      })),
    ).rejects.toThrow('Docker signal ingestion was incomplete');

    expect(reconcileHistoricalSignals).not.toHaveBeenCalled();
  });

  it('passes the exact canonical ingestion fingerprint to reconciliation', async () => {
    ingestSignals.mockImplementation(async (_organizationId, signals) => signals.map(() => ({})));
    buildSignalFingerprint.mockReturnValue('canonical-ingest-fingerprint');

    await service._withCompleteDockerObservation('org-a', async () => ({
      containers: [
        container({
          State: 'exited',
          Status: 'Exited (137) 1 minute ago',
        }),
      ],
      value: 'complete',
    }));

    const ingestedSignal = ingestSignals.mock.calls[0]![1][0];
    expect(buildSignalFingerprint).toHaveBeenCalledWith('org-a', ingestedSignal, 'DEDUPE');
    expect(reconcileHistoricalSignals).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        observedFingerprints: ['canonical-ingest-fingerprint'],
      }),
    );
  });

  it('getStatus does not reconcile after a partial Docker status inventory failure', async () => {
    dockerClientState.client.listContainers.mockResolvedValue([
      container({
        State: 'exited',
        Status: 'Exited (137) 1 minute ago',
      }),
    ]);
    dockerClientState.client.listImages.mockRejectedValue(new Error('image list failed'));
    ingestSignals.mockImplementation(async (_organizationId, signals) => signals.map(() => ({})));

    const status = await dockerService.getStatus('org-a');

    expect(status.status).toBe(ProviderConnectionStatus.UNKNOWN_ERROR);
    expect(reconcileHistoricalSignals).not.toHaveBeenCalled();
  });

  it('getStatus performs one complete container reconciliation cycle', async () => {
    dockerClientState.client.listContainers.mockResolvedValue([
      container({
        State: 'exited',
        Status: 'Exited (137) 1 minute ago',
      }),
    ]);
    ingestSignals.mockImplementation(async (_organizationId, signals) => signals.map(() => ({})));
    buildSignalFingerprint.mockReturnValue('managed-fingerprint');

    const status = await dockerService.getStatus('org-a');

    expect(status.status).toBe(ProviderConnectionStatus.CONNECTED);
    expect(dockerClientState.client.listContainers).toHaveBeenCalledTimes(1);
    expect(reconcileHistoricalSignals).toHaveBeenCalledTimes(2);
    expect(reconcileHistoricalSignals).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        scope: { metadata: { monitoringScope: 'managed' } },
        observedFingerprints: ['managed-fingerprint'],
      }),
    );
  });

  it('keeps managed and monitored reconciliation scopes isolated', async () => {
    ingestSignals.mockImplementation(async (_organizationId, signals) => signals.map(() => ({})));
    buildSignalFingerprint.mockImplementation((_organizationId, input) => `${input.metadata.monitoringScope}:${input.metadata.name}`);

    await service._withCompleteDockerObservation('org-a', async () => ({
      containers: [
        container({
          Names: ['/autoops-api-1'],
          State: 'exited',
          Status: 'Exited (137) 1 minute ago',
        }),
        container({
          Names: ['/third-party-worker'],
          State: 'exited',
          Status: 'Exited (137) 1 minute ago',
          Labels: {
            'com.autoops.monitor': 'true',
          },
        }),
        container({
          Names: ['/unrelated-worker'],
          State: 'exited',
          Status: 'Exited (137) 1 minute ago',
          Labels: {},
        }),
      ],
      value: 'complete',
    }));

    expect(reconcileHistoricalSignals).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        observedFingerprints: ['managed:autoops-api-1'],
        scope: { metadata: { monitoringScope: 'managed' } },
      }),
    );
    expect(reconcileHistoricalSignals).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        observedFingerprints: ['monitored:third-party-worker'],
        scope: { metadata: { monitoringScope: 'monitored' } },
      }),
    );
    expect(reconcileHistoricalSignals).not.toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        scope: { metadata: { monitoringScope: 'unrelated' } },
      }),
    );
  });

  it('empty successful scan reconciles stale managed and monitored scopes with empty observed sets', async () => {
    await service._withCompleteDockerObservation('org-a', async () => ({
      containers: [],
      value: 'complete',
    }));

    expect(reconcileHistoricalSignals).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        observedFingerprints: [],
        scope: { metadata: { monitoringScope: 'managed' } },
        scanCompleted: true,
      }),
    );
    expect(reconcileHistoricalSignals).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        observedFingerprints: [],
        scope: { metadata: { monitoringScope: 'monitored' } },
        scanCompleted: true,
      }),
    );
  });
});
