import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IncidentEventType, SignalSeverity, SignalSource, SignalType } from '@autoops/types';

// --- Mocks ---

const incidentFindFirst = vi.fn();
const incidentFindMany = vi.fn();
const incidentCount = vi.fn();
const incidentGroupBy = vi.fn();
const incidentCreate = vi.fn();
const incidentUpdate = vi.fn();

const incidentSignalFindUnique = vi.fn();
const incidentSignalCreate = vi.fn();

const incidentEventCreate = vi.fn();
const incidentEventFindMany = vi.fn();

const resourceSignalFindFirst = vi.fn();
const resourceSignalFindMany = vi.fn();

const userFindUnique = vi.fn();

const orgMembershipFindUnique = vi.fn();

const transactionFn = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    incident: {
      findFirst: incidentFindFirst,
      findMany: incidentFindMany,
      count: incidentCount,
      groupBy: incidentGroupBy,
      create: incidentCreate,
      update: incidentUpdate,
    },
    incidentSignal: {
      findUnique: incidentSignalFindUnique,
      create: incidentSignalCreate,
    },
    incidentEvent: {
      create: incidentEventCreate,
      findMany: incidentEventFindMany,
    },
    resourceSignal: {
      findFirst: resourceSignalFindFirst,
      findMany: resourceSignalFindMany,
    },
    user: {
      findUnique: userFindUnique,
    },
    orgMembership: {
      findUnique: orgMembershipFindUnique,
    },
    $transaction: transactionFn,
  },
  IncidentSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR', CRITICAL: 'CRITICAL' },
  IncidentStatus: { OPEN: 'OPEN', ACKNOWLEDGED: 'ACKNOWLEDGED', RESOLVED: 'RESOLVED', ARCHIVED: 'ARCHIVED' },
  IncidentSource: { SIGNAL_CORRELATION: 'SIGNAL_CORRELATION', MANUAL: 'MANUAL', SYSTEM: 'SYSTEM' },
  IncidentSignalRole: { TRIGGER: 'TRIGGER', RELATED: 'RELATED', EVIDENCE: 'EVIDENCE' },
  IncidentEventType: {
    INCIDENT_OPENED: 'INCIDENT_OPENED',
    INCIDENT_UPDATED: 'INCIDENT_UPDATED',
    SIGNAL_LINKED: 'SIGNAL_LINKED',
    SEVERITY_CHANGED: 'SEVERITY_CHANGED',
    STATUS_CHANGED: 'STATUS_CHANGED',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    RESOLVED: 'RESOLVED',
    ARCHIVED: 'ARCHIVED',
    NOTE_ADDED: 'NOTE_ADDED',
    CORRELATION_RAN: 'CORRELATION_RAN',
    EVIDENCE_ADDED: 'EVIDENCE_ADDED',
  },
  OrgRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
}));

vi.mock('../operations/operation-authorization.service.js', () => ({
  operationAuthorizationService: {
    getOrganizationRole: vi.fn().mockResolvedValue('OWNER'),
  },
}));

const { incidentService } = await import('./incident.service.js');

const ORG_ID = 'org-111';
const OTHER_ORG_ID = 'org-222';
const USER_ID = 'user-111';
const INCIDENT_ID = 'incident-111';

function makeIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: INCIDENT_ID,
    organizationId: ORG_ID,
    title: 'Test incident',
    summary: 'Test summary',
    severity: 'ERROR',
    status: 'OPEN',
    source: 'SIGNAL_CORRELATION',
    correlationKey: 'test:key',
    primaryResourceNodeId: null,
    projectId: null,
    environmentId: null,
    deploymentId: null,
    operationId: null,
    signalCount: 1,
    firstObservedAt: new Date(),
    lastObservedAt: new Date(),
    openedAt: new Date(),
    acknowledgedByUserId: null,
    acknowledgedAt: null,
    resolvedByUserId: null,
    resolvedAt: null,
    archivedAt: null,
    metadata: {},
    labels: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeIncidentWithRelations(overrides: Record<string, unknown> = {}) {
  return {
    ...makeIncident(overrides),
    linkedSignals: [],
    acknowledgedBy: null,
    resolvedBy: null,
  };
}

describe('IncidentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue({ email: 'test@autoops.dev', name: 'Test User' });
  });

  describe('listIncidentTimeline', () => {
    it('returns events for a valid incident', async () => {
      incidentFindFirst.mockResolvedValue({ id: INCIDENT_ID });
      const mockEvent = {
        id: 'event-1',
        type: IncidentEventType.INCIDENT_OPENED,
        title: 'Incident opened',
        message: 'Opened by correlation',
        actorUserId: null,
        actorUserEmail: null,
        metadata: {},
        occurredAt: new Date(),
        createdAt: new Date(),
      };
      incidentEventFindMany.mockResolvedValue([mockEvent]);

      const result = await incidentService.listIncidentTimeline(ORG_ID, USER_ID, INCIDENT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.type).toBe(IncidentEventType.INCIDENT_OPENED);
      expect(incidentFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INCIDENT_ID, organizationId: ORG_ID },
        }),
      );
    });

    it('returns 404 for cross-org timeline access', async () => {
      incidentFindFirst.mockResolvedValue(null);

      await expect(
        incidentService.listIncidentTimeline(OTHER_ORG_ID, USER_ID, INCIDENT_ID),
      ).rejects.toThrow('Incident');
    });

    it('timeline events are filtered by organizationId', async () => {
      incidentFindFirst.mockResolvedValue({ id: INCIDENT_ID });
      incidentEventFindMany.mockResolvedValue([]);

      await incidentService.listIncidentTimeline(ORG_ID, USER_ID, INCIDENT_ID);

      expect(incidentEventFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_ID, incidentId: INCIDENT_ID },
        }),
      );
    });
  });

  describe('addIncidentNote', () => {
    it('creates a NOTE_ADDED event', async () => {
      incidentFindFirst
        .mockResolvedValueOnce({ id: INCIDENT_ID }) // for addIncidentNote
        .mockResolvedValueOnce({ id: INCIDENT_ID }); // for listIncidentTimeline
      incidentEventCreate.mockResolvedValue({});
      incidentEventFindMany.mockResolvedValue([]);

      await incidentService.addIncidentNote(ORG_ID, USER_ID, INCIDENT_ID, { message: 'Operator note here' });

      expect(incidentEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            incidentId: INCIDENT_ID,
            type: 'NOTE_ADDED',
            message: 'Operator note here',
          }),
        }),
      );
    });

    it('returns 404 for cross-org note addition', async () => {
      incidentFindFirst.mockResolvedValue(null);

      await expect(
        incidentService.addIncidentNote(OTHER_ORG_ID, USER_ID, INCIDENT_ID, { message: 'Cross-org note' }),
      ).rejects.toThrow('Incident');
    });
  });

  describe('acknowledgeIncident', () => {
    it('creates ACKNOWLEDGED and STATUS_CHANGED events in transaction', async () => {
      incidentFindFirst.mockResolvedValue(makeIncident({ status: 'OPEN' }));

      const txCreate = vi.fn().mockResolvedValue({});
      const txUpdate = vi.fn().mockResolvedValue(makeIncidentWithRelations({
        status: 'ACKNOWLEDGED',
        acknowledgedByUserId: USER_ID,
        acknowledgedAt: new Date(),
      }));

      transactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          incident: { update: txUpdate },
          incidentEvent: { create: txCreate },
        });
      });

      await incidentService.acknowledgeIncident(ORG_ID, USER_ID, INCIDENT_ID);

      // Should have 2 event creates: ACKNOWLEDGED + STATUS_CHANGED
      expect(txCreate).toHaveBeenCalledTimes(2);
      expect(txCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'ACKNOWLEDGED' }),
        }),
      );
      expect(txCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'STATUS_CHANGED' }),
        }),
      );
    });

    it('rejects acknowledging non-OPEN incidents', async () => {
      incidentFindFirst.mockResolvedValue(makeIncident({ status: 'ACKNOWLEDGED' }));

      await expect(
        incidentService.acknowledgeIncident(ORG_ID, USER_ID, INCIDENT_ID),
      ).rejects.toThrow('Only open incidents can be acknowledged');
    });
  });

  describe('resolveIncident', () => {
    it('creates RESOLVED and STATUS_CHANGED events in transaction', async () => {
      incidentFindFirst.mockResolvedValue(makeIncident({ status: 'OPEN' }));

      const txCreate = vi.fn().mockResolvedValue({});
      const txUpdate = vi.fn().mockResolvedValue(makeIncidentWithRelations({
        status: 'RESOLVED',
        resolvedByUserId: USER_ID,
        resolvedAt: new Date(),
      }));

      transactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          incident: { update: txUpdate },
          incidentEvent: { create: txCreate },
        });
      });

      await incidentService.resolveIncident(ORG_ID, USER_ID, INCIDENT_ID);

      expect(txCreate).toHaveBeenCalledTimes(2);
      expect(txCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'RESOLVED' }),
        }),
      );
    });

    it('rejects resolving already-resolved incidents', async () => {
      incidentFindFirst.mockResolvedValue(makeIncident({ status: 'RESOLVED' }));

      await expect(
        incidentService.resolveIncident(ORG_ID, USER_ID, INCIDENT_ID),
      ).rejects.toThrow('already resolved');
    });

    it('rejects resolving archived incidents', async () => {
      incidentFindFirst.mockResolvedValue(makeIncident({ status: 'ARCHIVED', archivedAt: new Date() }));

      await expect(
        incidentService.resolveIncident(ORG_ID, USER_ID, INCIDENT_ID),
      ).rejects.toThrow('Archived incidents cannot be resolved');
    });
  });

  describe('archiveIncident', () => {
    it('creates ARCHIVED and STATUS_CHANGED events in transaction', async () => {
      incidentFindFirst.mockResolvedValue(makeIncident({ status: 'RESOLVED' }));

      const txCreate = vi.fn().mockResolvedValue({});
      const txUpdate = vi.fn().mockResolvedValue(makeIncidentWithRelations({
        archivedAt: new Date(),
      }));

      transactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          incident: { update: txUpdate },
          incidentEvent: { create: txCreate },
        });
      });

      await incidentService.archiveIncident(ORG_ID, USER_ID, INCIDENT_ID);

      expect(txCreate).toHaveBeenCalledTimes(2);
      expect(txCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'ARCHIVED' }),
        }),
      );
    });

    it('rejects archiving already-archived incidents', async () => {
      incidentFindFirst.mockResolvedValue(makeIncident({ archivedAt: new Date() }));

      await expect(
        incidentService.archiveIncident(ORG_ID, USER_ID, INCIDENT_ID),
      ).rejects.toThrow('already archived');
    });
  });

  describe('correlateSignal', () => {
    it('creates INCIDENT_OPENED and SIGNAL_LINKED events for new incidents', async () => {
      const signal = {
        id: 'sig-1',
        organizationId: ORG_ID,
        type: SignalType.KUBERNETES_POD_PHASE_CHANGED,
        source: SignalSource.KUBERNETES,
        severity: SignalSeverity.ERROR,
        title: 'Pod CrashLoopBackOff',
        message: 'Pod failed',
        resourceNodeId: 'node-1',
        resourceNode: { urn: 'autoops://org/k8s/pod/test', displayName: 'test-pod' },
        operationId: null,
        deploymentId: null,
        projectId: null,
        environmentId: null,
        observedAt: new Date(),
      };

      resourceSignalFindFirst.mockResolvedValue(signal);
      incidentFindFirst.mockResolvedValue(null); // no existing incident

      const txIncidentCreate = vi.fn().mockResolvedValue({ id: 'new-incident-1' });
      const txSignalCreate = vi.fn().mockResolvedValue({});
      const txEventCreate = vi.fn().mockResolvedValue({});

      transactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          incident: { create: txIncidentCreate },
          incidentSignal: { create: txSignalCreate },
          incidentEvent: { create: txEventCreate },
        });
      });

      const result = await incidentService.correlateSignal(ORG_ID, 'sig-1');

      expect(result.action).toBe('CREATED');
      // Should create: INCIDENT_OPENED + SIGNAL_LINKED
      expect(txEventCreate).toHaveBeenCalledTimes(2);
      expect(txEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'INCIDENT_OPENED' }),
        }),
      );
      expect(txEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'SIGNAL_LINKED' }),
        }),
      );
    });

    it('creates INCIDENT_UPDATED and SIGNAL_LINKED events for existing incidents', async () => {
      const signal = {
        id: 'sig-2',
        organizationId: ORG_ID,
        type: SignalType.DOCKER_CONTAINER_STATE_CHANGED,
        source: SignalSource.DOCKER,
        severity: SignalSeverity.WARNING,
        title: 'Container stopped',
        message: 'Container exited',
        resourceNodeId: null,
        resourceNode: null,
        operationId: null,
        deploymentId: null,
        projectId: null,
        environmentId: null,
        observedAt: new Date(),
      };

      resourceSignalFindFirst.mockResolvedValue(signal);
      incidentFindFirst.mockResolvedValue(makeIncident({ id: 'existing-1' })); // existing incident
      incidentSignalFindUnique.mockResolvedValue(null); // not yet linked

      const txSignalCreate = vi.fn().mockResolvedValue({});
      const txIncidentUpdate = vi.fn().mockResolvedValue({});
      const txEventCreate = vi.fn().mockResolvedValue({});

      transactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          incidentSignal: { create: txSignalCreate },
          incident: { update: txIncidentUpdate },
          incidentEvent: { create: txEventCreate },
        });
      });

      const result = await incidentService.correlateSignal(ORG_ID, 'sig-2');

      expect(result.action).toBe('UPDATED');
      // Should create: INCIDENT_UPDATED + SIGNAL_LINKED (no severity change for same)
      expect(txEventCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('tenant isolation', () => {
    it('listIncidents filters by organizationId', async () => {
      incidentCount.mockResolvedValue(0);
      incidentFindMany.mockResolvedValue([]);

      await incidentService.listIncidents(ORG_ID, USER_ID, { limit: 50 });

      expect(incidentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('getIncident returns 404 for cross-org access', async () => {
      incidentFindFirst.mockResolvedValue(null);

      await expect(
        incidentService.getIncident(OTHER_ORG_ID, USER_ID, INCIDENT_ID),
      ).rejects.toThrow('Incident');
    });
  });
});
