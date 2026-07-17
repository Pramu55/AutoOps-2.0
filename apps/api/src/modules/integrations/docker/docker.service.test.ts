import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignalSeverity, SignalSource, SignalType } from '@autoops/types';
import type { DockerContainerSummary } from '@autoops/utils';

const ingestSignals = vi.fn();
const resolveSignalsByFingerprints = vi.fn();
const resolveSignalsByTitles = vi.fn();
const buildSignalFingerprint = vi.fn();

vi.mock('../../signals/signal.service.js', () => ({
  signalService: {
    ingestSignals,
    resolveSignalsByFingerprints,
    resolveSignalsByTitles,
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
  _ingestContainerSignals(organizationId: string, containers: DockerContainerSummary[]): Promise<void>;
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
    ingestSignals.mockResolvedValue([]);
    resolveSignalsByFingerprints.mockResolvedValue(0);
    resolveSignalsByTitles.mockResolvedValue(0);
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
  });
});
