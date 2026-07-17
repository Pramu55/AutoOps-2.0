import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SignalSeverity, SignalSource, SignalStatus, SignalType } from '@autoops/types';

const upsert = vi.fn();
const findFirst = vi.fn();
const findMany = vi.fn();
const count = vi.fn();
const groupBy = vi.fn();
const updateMany = vi.fn();
const findFirstNode = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    resourceSignal: {
      upsert,
      findFirst,
      findMany,
      count,
      groupBy,
      updateMany,
    },
    resourceNode: {
      findFirst: findFirstNode,
    },
  },
}));

const { signalService } = await import('./signal.service.js');

describe('SignalService', () => {
  const ORG_ID = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ingestSignal', () => {
    it('creates a new signal with dedupe fingerprint', async () => {
      upsert.mockResolvedValue({
        id: 'sig-1',
        source: SignalSource.KUBERNETES,
        type: SignalType.KUBERNETES_POD_PHASE_CHANGED,
        severity: SignalSeverity.ERROR,
        status: 'ACTIVE',
        title: 'Pod Failed',
        message: 'Pod xyz failed',
        resourceNodeId: null,
        operationId: null,
        deploymentId: null,
        projectId: null,
        environmentId: null,
        observedAt: new Date(),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        count: 1,
        metadata: {},
        labels: null,
        archivedAt: null,
      });

      await signalService.ingestSignal(ORG_ID, {
        source: SignalSource.KUBERNETES,
        type: SignalType.KUBERNETES_POD_PHASE_CHANGED,
        severity: SignalSeverity.ERROR,
        title: 'Pod Failed',
        message: 'Pod xyz failed',
        dedupeMode: 'DEDUPE',
      });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId_fingerprint: expect.any(Object),
          }),
        }),
      );
    });

    it('safely skips resource linking if node not owned by org', async () => {
      findFirstNode.mockResolvedValue(null);
      upsert.mockResolvedValue({
        id: 'sig-1',
        observedAt: new Date(),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        metadata: {},
      });

      await signalService.ingestSignal(ORG_ID, {
        source: SignalSource.DOCKER,
        type: SignalType.RESOURCE_CHANGED,
        severity: SignalSeverity.INFO,
        title: 'Node changed',
        message: '...',
        resourceNodeId: 'node-from-other-org',
      });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            resourceNodeId: null,
          }),
        }),
      );
    });
  });

  describe('tenant isolation', () => {
    it('listSignals filters by organizationId', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);

      await signalService.listSignals(ORG_ID, { limit: 50, archived: 'active' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('getSignal filters by organizationId', async () => {
      findFirst.mockResolvedValue({
        id: 'sig-1',
        organizationId: ORG_ID,
        source: SignalSource.SYSTEM,
        type: SignalType.SYSTEM_HEALTH_CHANGED,
        severity: SignalSeverity.INFO,
        status: 'ACTIVE',
        title: 'Title',
        message: 'Message',
        observedAt: new Date(),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        count: 1,
        metadata: {},
        archivedAt: null,
      });

      await signalService.getSignal(ORG_ID, 'sig-1');

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sig-1', organizationId: ORG_ID },
        }),
      );
    });
  });

  describe('deduplication and lifecycle', () => {
    it('uses stable resource identity and normalized condition for dedupe fingerprints', () => {
      const first = signalService.buildSignalFingerprint(
        ORG_ID,
        {
          source: SignalSource.DOCKER,
          type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
          severity: SignalSeverity.ERROR,
          title: 'Docker Container autoops-api-1 exited unexpectedly',
          message: 'Observed 1 minute ago',
          metadata: {
            resourceIdentity: 'compose:autoops:container:autoops-api-1',
            condition: 'unexpected_exit_137',
          },
        },
        'DEDUPE',
      );
      const second = signalService.buildSignalFingerprint(
        ORG_ID,
        {
          source: SignalSource.DOCKER,
          type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
          severity: SignalSeverity.ERROR,
          title: 'Docker Container autoops-api-1 exited unexpectedly',
          message: 'Observed 5 minutes ago',
          metadata: {
            resourceIdentity: 'compose:autoops:container:autoops-api-1',
            condition: 'unexpected_exit_137',
          },
        },
        'DEDUPE',
      );

      expect(first).toBe(second);
    });

    it('resolves only active signals for the current tenant and requested fingerprints', async () => {
      updateMany.mockResolvedValue({ count: 1 });

      const countResolved = await signalService.resolveSignalsByFingerprints(ORG_ID, [
        'fingerprint-a',
        'fingerprint-a',
        'fingerprint-b',
      ]);

      expect(countResolved).toBe(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          fingerprint: { in: ['fingerprint-a', 'fingerprint-b'] },
          status: SignalStatus.ACTIVE,
          archivedAt: null,
        },
        data: {
          status: SignalStatus.RESOLVED,
          archivedAt: null,
        },
      });
    });

    it('resolves only active signals for the current tenant, source, type and requested titles', async () => {
      updateMany.mockResolvedValue({ count: 2 });

      const countResolved = await signalService.resolveSignalsByTitles(
        ORG_ID,
        SignalSource.DOCKER,
        SignalType.DOCKER_CONTAINER_STATE_CHANGED,
        ['Docker Container cloudshield-frontend-1 exited', 'Docker Container cloudshield-frontend-1 exited'],
      );

      expect(countResolved).toBe(2);
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          source: SignalSource.DOCKER,
          type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
          title: { in: ['Docker Container cloudshield-frontend-1 exited'] },
          status: SignalStatus.ACTIVE,
          archivedAt: null,
        },
        data: {
          status: SignalStatus.RESOLVED,
          archivedAt: null,
        },
      });
    });

    it('resolves active or acknowledged matching resource condition families without touching unrelated signals', async () => {
      findMany.mockResolvedValue([
        {
          id: 'sig-exit-1',
          title: 'Docker Container autoops-api-1 exited unexpectedly',
          metadata: {
            resourceIdentity: 'compose:autoops:container:autoops-api-1',
            condition: 'unexpected_exit_1',
          },
        },
        {
          id: 'sig-legacy',
          title: 'Docker Container autoops-api-1 exited',
          metadata: {},
        },
        {
          id: 'sig-other-condition',
          title: 'Docker Container autoops-api-1 changed',
          metadata: {
            resourceIdentity: 'compose:autoops:container:autoops-api-1',
            condition: 'unrelated_inventory_state',
          },
        },
        {
          id: 'sig-other-resource',
          title: 'Docker Container other exited unexpectedly',
          metadata: {
            resourceIdentity: 'compose:autoops:container:other',
            condition: 'unexpected_exit_1',
          },
        },
      ]);
      updateMany.mockResolvedValue({ count: 2 });

      const countResolved = await signalService.resolveSignalsByResourceConditionFamily(ORG_ID, {
        source: SignalSource.DOCKER,
        type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
        resourceIdentity: 'compose:autoops:container:autoops-api-1',
        conditions: ['running_unhealthy'],
        conditionPrefixes: ['unexpected_exit_'],
        titles: ['Docker Container autoops-api-1 exited'],
      });

      expect(countResolved).toBe(2);
      expect(findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          source: SignalSource.DOCKER,
          type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
          status: { in: [SignalStatus.ACTIVE, SignalStatus.ACKNOWLEDGED] },
          archivedAt: null,
          OR: [
            {
              metadata: {
                path: ['resourceIdentity'],
                equals: 'compose:autoops:container:autoops-api-1',
              },
            },
            { title: { in: ['Docker Container autoops-api-1 exited'] } },
          ],
        },
        select: {
          id: true,
          title: true,
          metadata: true,
        },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          id: { in: ['sig-exit-1', 'sig-legacy'] },
          status: { in: [SignalStatus.ACTIVE, SignalStatus.ACKNOWLEDGED] },
          archivedAt: null,
        },
        data: {
          status: SignalStatus.RESOLVED,
          archivedAt: null,
        },
      });
    });
  });
});
