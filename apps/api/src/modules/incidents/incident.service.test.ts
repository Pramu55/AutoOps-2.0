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
const operationFindMany = vi.fn();
const deploymentFindMany = vi.fn();
const deploymentEventFindMany = vi.fn();
const auditLogFindMany = vi.fn();

const userFindUnique = vi.fn();

const orgMembershipFindUnique = vi.fn();

const transactionFn = vi.fn();
const createQueuedOperation = vi.fn();

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
    operation: {
      findMany: operationFindMany,
    },
    deployment: {
      findMany: deploymentFindMany,
    },
    deploymentEvent: {
      findMany: deploymentEventFindMany,
    },
    auditLog: {
      findMany: auditLogFindMany,
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
  DeploymentStatus: {
    QUEUED: 'QUEUED',
    BUILDING: 'BUILDING',
    DEPLOYING: 'DEPLOYING',
    RUNNING: 'RUNNING',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    ROLLED_BACK: 'ROLLED_BACK',
  },
  OperationStatus: {
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
}));

vi.mock('../operations/operation-authorization.service.js', () => ({
  operationAuthorizationService: {
    getOrganizationRole: vi.fn().mockResolvedValue('OWNER'),
  },
}));

vi.mock('../operations/operation.service.js', () => ({
  operationService: {
    createQueuedOperation,
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
    linkedSignals: [],
    acknowledgedBy: null,
    resolvedBy: null,
    ...makeIncident(),
    ...overrides,
  };
}

describe('IncidentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue({ email: 'test@autoops.dev', name: 'Test User' });
    operationFindMany.mockResolvedValue([]);
    deploymentFindMany.mockResolvedValue([]);
    deploymentEventFindMany.mockResolvedValue([]);
    auditLogFindMany.mockResolvedValue([]);
    incidentEventCreate.mockResolvedValue({});
    createQueuedOperation.mockResolvedValue({
      id: 'operation-remediation-1',
      organizationId: ORG_ID,
      projectId: null,
      environmentId: null,
      provider: 'DOCKER',
      operationType: 'DOCKER_CONTAINER_RESTART',
      status: 'PENDING_APPROVAL',
      requestedByUserId: USER_ID,
      approvedByUserId: null,
      approvedAt: null,
      rejectedByUserId: null,
      rejectedAt: null,
      idempotencyKey: `remediation:${INCIDENT_ID}:docker-restart-review`,
      input: {},
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('listIncidentTimeline', () => {
    it('returns events for a valid incident', async () => {
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations());
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
      expect(result.data[0]!.type).toBe('incident_detected');
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
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations());
      incidentEventFindMany.mockResolvedValue([]);

      await incidentService.listIncidentTimeline(ORG_ID, USER_ID, INCIDENT_ID);

      expect(incidentEventFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_ID, incidentId: INCIDENT_ID },
        }),
      );
    });

    it('returns incident lifecycle events when related evidence is empty', async () => {
      const openedAt = new Date('2026-05-31T10:00:00.000Z');
      const acknowledgedAt = new Date('2026-05-31T10:05:00.000Z');
      const resolvedAt = new Date('2026-05-31T10:20:00.000Z');

      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations({ openedAt, firstObservedAt: openedAt, lastObservedAt: resolvedAt }));
      incidentEventFindMany.mockResolvedValue([
        {
          id: 'event-opened',
          type: 'INCIDENT_OPENED',
          title: 'Incident opened',
          message: 'Opened',
          actorUserId: null,
          actorUserEmail: null,
          metadata: {},
          occurredAt: openedAt,
          createdAt: openedAt,
        },
        {
          id: 'event-ack',
          type: 'ACKNOWLEDGED',
          title: 'Incident acknowledged',
          message: 'Ack',
          actorUserId: USER_ID,
          actorUserEmail: 'ops@example.com',
          metadata: {},
          occurredAt: acknowledgedAt,
          createdAt: acknowledgedAt,
        },
        {
          id: 'event-resolved',
          type: 'RESOLVED',
          title: 'Incident resolved',
          message: 'Resolved',
          actorUserId: USER_ID,
          actorUserEmail: 'ops@example.com',
          metadata: {},
          occurredAt: resolvedAt,
          createdAt: resolvedAt,
        },
      ]);

      const result = await incidentService.listIncidentTimeline(ORG_ID, USER_ID, INCIDENT_ID);

      expect(result.data.map((event) => event.type)).toEqual([
        'incident_detected',
        'incident_acknowledged',
        'incident_resolved',
      ]);
      expect(result.data[0]!.relatedIds.incidentId).toBe(INCIDENT_ID);
    });

    it('includes linked signal evidence', async () => {
      const observedAt = new Date('2026-05-31T10:10:00.000Z');
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations({
        openedAt: observedAt,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
        linkedSignals: [
          {
            id: 'incident-signal-1',
            incidentId: INCIDENT_ID,
            organizationId: ORG_ID,
            signalId: 'signal-1',
            role: 'TRIGGER',
            createdAt: observedAt,
            signal: {
              id: 'signal-1',
              organizationId: ORG_ID,
              resourceNodeId: 'resource-1',
              operationId: null,
              deploymentId: null,
              projectId: null,
              environmentId: null,
              source: 'KUBERNETES',
              type: 'KUBERNETES_POD_PHASE_CHANGED',
              severity: 'ERROR',
              status: 'ACTIVE',
              title: 'Pod failing',
              message: 'CrashLoopBackOff',
              fingerprint: 'fingerprint',
              metadata: { namespace: 'payments' },
              labels: null,
              observedAt,
              firstSeenAt: observedAt,
              lastSeenAt: observedAt,
              count: 1,
              archivedAt: null,
              createdAt: observedAt,
              updatedAt: observedAt,
            },
          },
        ],
      }));
      incidentEventFindMany.mockResolvedValue([]);

      const result = await incidentService.listIncidentTimeline(ORG_ID, USER_ID, INCIDENT_ID);

      expect(result.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
          source: 'signal',
          type: 'signal_observed',
          relatedIds: expect.objectContaining({ signalId: 'signal-1', resourceNodeId: 'resource-1' }),
          metadata: expect.objectContaining({ namespace: 'payments' }),
        }),
      ]));
    });

    it('includes related operation evidence and sorts events ascending', async () => {
      const openedAt = new Date('2026-05-31T10:00:00.000Z');
      const updatedAt = new Date('2026-05-31T10:15:00.000Z');
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations({
        operationId: 'operation-1',
        openedAt,
        firstObservedAt: openedAt,
        lastObservedAt: updatedAt,
      }));
      incidentEventFindMany.mockResolvedValue([]);
      operationFindMany.mockResolvedValue([
        {
          id: 'operation-1',
          organizationId: ORG_ID,
          projectId: null,
          environmentId: null,
          provider: 'JENKINS',
          operationType: 'JENKINS_BUILD_TRIGGER',
          status: 'SUCCEEDED',
          requestedByUserId: USER_ID,
          approvedByUserId: null,
          approvedAt: null,
          rejectedByUserId: null,
          rejectedAt: null,
          idempotencyKey: null,
          input: { jobName: 'deploy-api' },
          result: { buildNumber: 42 },
          error: null,
          createdAt: new Date('2026-05-31T10:05:00.000Z'),
          updatedAt,
        },
      ]);

      const result = await incidentService.listIncidentTimeline(ORG_ID, USER_ID, INCIDENT_ID);

      expect(result.data.map((event) => event.timestamp)).toEqual([
        '2026-05-31T10:00:00.000Z',
        '2026-05-31T10:05:00.000Z',
        '2026-05-31T10:15:00.000Z',
      ]);
      expect(result.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'operation_requested', relatedIds: expect.objectContaining({ operationId: 'operation-1' }) }),
        expect.objectContaining({ type: 'operation_succeeded', relatedIds: expect.objectContaining({ operationId: 'operation-1' }) }),
      ]));
    });

    it('redacts sensitive metadata from timeline events', async () => {
      const openedAt = new Date('2026-05-31T10:00:00.000Z');
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations({ openedAt, firstObservedAt: openedAt, lastObservedAt: openedAt }));
      incidentEventFindMany.mockResolvedValue([
        {
          id: 'event-secret',
          type: 'EVIDENCE_ADDED',
          title: 'Provider evidence',
          message: 'Evidence captured',
          actorUserId: null,
          actorUserEmail: null,
          metadata: {
            token: 'super-secret-token',
            password: 'super-secret-password',
            kubeconfig: 'super-secret-kubeconfig',
            safeKey: 'visible',
          },
          occurredAt: openedAt,
          createdAt: openedAt,
        },
      ]);

      const result = await incidentService.listIncidentTimeline(ORG_ID, USER_ID, INCIDENT_ID);
      const serialized = JSON.stringify(result);
      const secretEvent = result.data.find((event) => event.id === 'event-secret');

      expect(serialized).not.toContain('super-secret-token');
      expect(serialized).not.toContain('super-secret-password');
      expect(serialized).not.toContain('super-secret-kubeconfig');
      expect(secretEvent?.metadata).toMatchObject({
        token: '[REDACTED]',
        password: '[REDACTED]',
        kubeconfig: '[REDACTED]',
        safeKey: 'visible',
      });
    });
  });

  describe('addIncidentNote', () => {
    it('creates a NOTE_ADDED event', async () => {
      incidentFindFirst
        .mockResolvedValueOnce({ id: INCIDENT_ID }) // for addIncidentNote
        .mockResolvedValueOnce(makeIncidentWithRelations()); // for listIncidentTimeline
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

  describe('listRemediationRecommendations', () => {
    it('scopes recommendation evidence reads to organization-owned records', async () => {
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations({
        title: 'Kubernetes deployment failing',
        summary: 'Kubernetes pod CrashLoopBackOff',
        severity: 'CRITICAL',
        projectId: 'project-1',
        environmentId: 'environment-1',
        deploymentId: 'deployment-1',
        operationId: 'operation-1',
      }));
      incidentEventFindMany.mockResolvedValue([]);
      deploymentFindMany.mockResolvedValue([]);
      operationFindMany.mockResolvedValue([]);

      await incidentService.listRemediationRecommendations(ORG_ID, USER_ID, INCIDENT_ID);

      expect(incidentFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INCIDENT_ID, organizationId: ORG_ID },
        }),
      );
      expect(deploymentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            project: { organizationId: ORG_ID },
            OR: expect.arrayContaining([
              { id: 'deployment-1' },
              { projectId: 'project-1' },
            ]),
          }),
        }),
      );
      expect(operationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            OR: expect.arrayContaining([
              { id: 'operation-1' },
              { projectId: 'project-1' },
              { environmentId: 'environment-1' },
            ]),
          }),
        }),
      );
    });

    it('prepares a supported Docker recommendation through existing operation governance', async () => {
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations({
        title: 'Docker container failing',
        summary: 'Docker container exited and needs review',
        severity: 'ERROR',
        projectId: 'project-1',
        environmentId: 'environment-1',
      }));
      incidentEventFindMany.mockResolvedValue([
        {
          id: 'event-docker',
          type: 'EVIDENCE_ADDED',
          title: 'Docker container exited',
          message: 'Container exited',
          actorUserId: null,
          actorUserEmail: null,
          metadata: {
            id: 'container-123',
            name: 'api',
            image: 'autoops-api:test',
          },
          occurredAt: new Date('2026-06-01T00:00:00.000Z'),
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);

      const result = await incidentService.prepareRemediationRecommendation(
        ORG_ID,
        USER_ID,
        'OWNER',
        INCIDENT_ID,
        `${INCIDENT_ID}:docker-restart-review`,
        { confirmationToken: 'RESTART' },
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );

      expect(createQueuedOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          userId: USER_ID,
          role: 'OWNER',
          provider: 'DOCKER',
          operationType: 'DOCKER_CONTAINER_RESTART',
          projectId: 'project-1',
          environmentId: 'environment-1',
          confirmationToken: 'RESTART',
          idempotencyKey: `remediation:${INCIDENT_ID}:docker-restart-review`,
          input: expect.objectContaining({
            action: 'restart',
            containerId: 'container-123',
            containerName: 'api',
            preparedFromIncidentId: INCIDENT_ID,
            remediationRecommendationId: `${INCIDENT_ID}:docker-restart-review`,
          }),
        }),
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );
      expect(incidentEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            incidentId: INCIDENT_ID,
            type: 'EVIDENCE_ADDED',
            metadata: expect.objectContaining({
              operationId: 'operation-remediation-1',
              recommendationId: `${INCIDENT_ID}:docker-restart-review`,
            }),
          }),
        }),
      );
      expect(result.operation.id).toBe('operation-remediation-1');
    });

    it('rejects stale recommendation IDs before creating an operation', async () => {
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations());
      incidentEventFindMany.mockResolvedValue([]);

      await expect(
        incidentService.prepareRemediationRecommendation(
          ORG_ID,
          USER_ID,
          'OWNER',
          INCIDENT_ID,
          `${INCIDENT_ID}:missing`,
          { confirmationToken: 'RESTART' },
        ),
      ).rejects.toThrow('Remediation recommendation');

      expect(createQueuedOperation).not.toHaveBeenCalled();
    });

    it('rejects unsupported recommendations before creating an operation', async () => {
      incidentFindFirst.mockResolvedValue(makeIncidentWithRelations({
        title: 'Docker container failing',
        summary: 'Docker container exited and needs review',
        severity: 'ERROR',
      }));
      incidentEventFindMany.mockResolvedValue([
        {
          id: 'event-docker',
          type: 'EVIDENCE_ADDED',
          title: 'Docker container exited',
          message: 'Container exited',
          actorUserId: null,
          actorUserEmail: null,
          metadata: { name: 'api' },
          occurredAt: new Date('2026-06-01T00:00:00.000Z'),
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);

      await expect(
        incidentService.prepareRemediationRecommendation(
          ORG_ID,
          USER_ID,
          'OWNER',
          INCIDENT_ID,
          `${INCIDENT_ID}:docker-restart-review`,
          { confirmationToken: 'RESTART' },
        ),
      ).rejects.toThrow('verified Docker container identifier');

      expect(createQueuedOperation).not.toHaveBeenCalled();
    });

    it('enforces tenant isolation when preparing recommendations', async () => {
      incidentFindFirst.mockResolvedValue(null);

      await expect(
        incidentService.prepareRemediationRecommendation(
          OTHER_ORG_ID,
          USER_ID,
          'OWNER',
          INCIDENT_ID,
          `${INCIDENT_ID}:docker-restart-review`,
          { confirmationToken: 'RESTART' },
        ),
      ).rejects.toThrow('Incident');

      expect(incidentFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INCIDENT_ID, organizationId: OTHER_ORG_ID },
        }),
      );
      expect(createQueuedOperation).not.toHaveBeenCalled();
    });
  });
});
