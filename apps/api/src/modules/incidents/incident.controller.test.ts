import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OperationProvider, OperationStatus, OperationType } from '@autoops/types';
import type { Request, Response } from 'express';

const prepareRemediationRecommendation = vi.fn();

vi.mock('./incident.service.js', () => ({
  incidentService: {
    prepareRemediationRecommendation,
  },
}));

const { incidentController } = await import('./incident.controller.js');

describe('IncidentController remediation preparation endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareRemediationRecommendation.mockResolvedValue({
      recommendation: {
        id: '11111111-1111-4111-8111-111111111111:docker-restart-review',
        incidentId: '11111111-1111-4111-8111-111111111111',
        title: 'Review Docker container restart',
        description: 'Docker failure evidence was found.',
        provider: OperationProvider.DOCKER,
        actionType: OperationType.DOCKER_CONTAINER_RESTART,
        reason: 'Docker evidence matched.',
        evidence: [],
        riskLevel: 'MEDIUM',
        confirmationToken: 'RESTART',
        approvalRequired: true,
        canPrepareOperation: true,
      },
      operation: {
        id: '22222222-2222-4222-8222-222222222222',
        organizationId: '33333333-3333-4333-8333-333333333333',
        projectId: null,
        environmentId: null,
        provider: OperationProvider.DOCKER,
        operationType: OperationType.DOCKER_CONTAINER_RESTART,
        status: OperationStatus.PENDING_APPROVAL,
        requestedByUserId: '44444444-4444-4444-8444-444444444444',
        approvedByUserId: null,
        approvedAt: null,
        rejectedByUserId: null,
        rejectedAt: null,
        idempotencyKey: null,
        input: {},
        result: null,
        error: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    });
  });

  it('parses params/body and returns safe operation metadata', async () => {
    const req = {
      auth: {
        orgId: '33333333-3333-4333-8333-333333333333',
        userId: '44444444-4444-4444-8444-444444444444',
        role: 'OWNER',
      },
      params: {
        incidentId: '11111111-1111-4111-8111-111111111111',
        recommendationId: '11111111-1111-4111-8111-111111111111:docker-restart-review',
      },
      body: { confirmationToken: 'RESTART' },
      ip: '127.0.0.1',
      header: vi.fn().mockReturnValue('vitest'),
    } as unknown as Request<{ incidentId: string; recommendationId: string }>;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    await incidentController.prepareRemediationRecommendation(req, res);

    expect(prepareRemediationRecommendation).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      'OWNER',
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111:docker-restart-review',
      { confirmationToken: 'RESTART' },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: expect.objectContaining({
          id: '22222222-2222-4222-8222-222222222222',
          input: {},
        }),
      }),
    });
  });
});
