import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SignalSeverity, SignalSource, SignalType } from '@autoops/types';

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
});
