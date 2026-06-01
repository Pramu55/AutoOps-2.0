import { describe, expect, it } from 'vitest';
import {
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  OperationProvider,
  OperationType,
  type IncidentDetail,
} from '@autoops/types';
import { buildRemediationRecommendations, type RemediationRulesContext } from './remediation-rules.service.js';

const baseIncident: IncidentDetail = {
  id: 'incident-1',
  title: 'Checkout latency elevated',
  summary: 'Latency alert fired.',
  severity: IncidentSeverity.WARNING,
  status: IncidentStatus.OPEN,
  source: IncidentSource.SIGNAL_CORRELATION,
  correlationKey: 'signal:test',
  primaryResourceNodeId: null,
  projectId: 'project-1',
  environmentId: null,
  deploymentId: null,
  operationId: null,
  signalCount: 1,
  firstObservedAt: '2026-06-01T00:00:00.000Z',
  lastObservedAt: '2026-06-01T00:00:00.000Z',
  openedAt: '2026-06-01T00:00:00.000Z',
  acknowledgedAt: null,
  resolvedAt: null,
  archivedAt: null,
  metadataSummary: {},
  labelsSummary: {},
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  evidence: [],
  acknowledgedBy: null,
  resolvedBy: null,
};

const baseContext: RemediationRulesContext = {
  incident: baseIncident,
  timeline: [],
  failedDeployments: [],
  recentOperations: [],
};

describe('incident remediation rules', () => {
  it('recommends Kubernetes rollout review for high-severity workload evidence', () => {
    const recommendations = buildRemediationRecommendations({
      ...baseContext,
      incident: {
        ...baseIncident,
        severity: IncidentSeverity.CRITICAL,
        summary: 'Kubernetes deployment api has pods in CrashLoopBackOff.',
        evidence: [
          {
            id: 'incident-signal-1',
            signalId: 'signal-1',
            role: 'TRIGGER',
            type: 'KUBERNETES_POD_PHASE_CHANGED',
            title: 'Pod failing',
            severity: 'CRITICAL',
            observedAt: '2026-06-01T00:01:00.000Z',
          },
        ],
      },
      timeline: [
        {
          id: 'timeline-1',
          source: 'signal',
          type: 'signal_observed',
          severity: 'CRITICAL',
          status: 'ACTIVE',
          title: 'Kubernetes pod failed',
          description: 'CrashLoopBackOff in namespace prod',
          relatedIds: { incidentId: 'incident-1', signalId: 'signal-1' },
          message: 'CrashLoopBackOff',
          actorUserId: null,
          actorUserEmail: null,
          metadata: { namespace: 'prod', token: 'must-not-leak' },
          timestamp: '2026-06-01T00:01:00.000Z',
          occurredAt: '2026-06-01T00:01:00.000Z',
          createdAt: '2026-06-01T00:01:00.000Z',
        },
      ],
    });

    expect(recommendations[0]).toMatchObject({
      provider: OperationProvider.KUBERNETES,
      actionType: OperationType.KUBERNETES_DEPLOYMENT_RESTART,
      confirmationToken: 'ROLLOUT',
      approvalRequired: true,
      canPrepareOperation: false,
    });
    expect(JSON.stringify(recommendations)).not.toContain('must-not-leak');
  });

  it('uses failed deployment evidence for CI investigation without preparing a build', () => {
    const recommendations = buildRemediationRecommendations({
      ...baseContext,
      failedDeployments: [
        {
          id: 'deployment-1',
          status: 'FAILED',
          errorMessage: 'Build failed during test stage.',
          imageTag: null,
          branch: 'main',
          commitSha: 'abc123',
          updatedAt: '2026-06-01T00:02:00.000Z',
          metadata: {},
        },
      ],
    });

    expect(recommendations).toContainEqual(
      expect.objectContaining({
        provider: OperationProvider.JENKINS,
        actionType: OperationType.JENKINS_BUILD_TRIGGER,
        confirmationToken: 'BUILD',
        canPrepareOperation: false,
      }),
    );
  });

  it('returns investigation-only recommendation when no deterministic rule matches', () => {
    const recommendations = buildRemediationRecommendations(baseContext);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      provider: 'AUTOOPS',
      actionType: 'INVESTIGATE',
      confirmationToken: null,
      approvalRequired: false,
      canPrepareOperation: false,
    });
  });
});
