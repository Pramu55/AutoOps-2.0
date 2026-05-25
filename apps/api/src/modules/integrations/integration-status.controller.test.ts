import { beforeEach, describe, it, expect, vi } from 'vitest';

const { organizationFindUnique } = vi.hoisted(() => ({
  organizationFindUnique: vi.fn(),
}));

vi.mock('@autoops/database', () => ({
  prisma: {
    organization: {
      findUnique: organizationFindUnique,
    },
  },
}));

vi.mock('@autoops/utils', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    loadEnv: vi.fn().mockReturnValue({ NODE_ENV: 'test' }),
  };
});

vi.mock('../../../config/env.js', () => ({
  env: { NODE_ENV: 'test' },
  isProd: false,
  isDev: false,
}));
import type { Request, Response } from 'express';
import { AwsIntegrationStatus } from '@autoops/types';

import { jenkinsController } from './jenkins/jenkins.controller.js';
import { jenkinsService } from './jenkins/jenkins.service.js';
import { kubernetesController } from './kubernetes/kubernetes.controller.js';
import { kubernetesService } from './kubernetes/kubernetes.service.js';
import { awsController } from './aws/aws.controller.js';
import { awsService } from './aws/aws.service.js';
import { observabilityIntegrationController } from './observability/observability-integration.controller.js';
import { observabilityIntegrationService } from './observability/observability-integration.service.js';

describe('Integration Status Controllers Zero-Trust Sanitization', () => {
  const mockReq = {
    auth: {
      userId: 'user-demo',
      orgId: 'org-demo',
      role: 'OWNER',
    },
  } as Request;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = 'autoops-demo';
    delete process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS;
    delete process.env.PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS;
    organizationFindUnique.mockResolvedValue({
      id: 'org-demo',
      slug: 'autoops-demo',
    });
  });

  it('Jenkins status does not include baseUrl, allowedJobs, or node details', async () => {
    vi.spyOn(jenkinsService, 'getStatus').mockResolvedValue({
      status: 'CONNECTED',
      configured: true,
      baseUrl: 'http://internal-jenkins:8080',
      username: 'admin',
      allowedJobs: ['deploy-prod'],
      triggerEnabled: true,
      version: '2.440',
      nodeDescription: 'master',
      nodeName: 'master-node-1',
      numExecutors: 4,
      useCrumbs: true,
      message: 'OK',
      checkedAt: '2023-01-01',
    });

    let responseData: any;
    const mockRes = { json: vi.fn((data) => { responseData = data; }) } as unknown as Response;

    await jenkinsController.status(mockReq, mockRes);
    const result = responseData.data;

    expect(result.status).toBe('CONNECTED');
    expect(result.configured).toBe(true);
    expect(result.triggerEnabled).toBe(true);
    expect(result.version).toBe('2.440');
    expect(result.message).toBe('OK');
    expect(result.checkedAt).toBe('2023-01-01');

    expect(result).not.toHaveProperty('baseUrl');
    expect(result).not.toHaveProperty('username');
    expect(result).not.toHaveProperty('allowedJobs');
    expect(result).not.toHaveProperty('nodeDescription');
    expect(result).not.toHaveProperty('nodeName');
    expect(result).not.toHaveProperty('numExecutors');
    expect(result).not.toHaveProperty('useCrumbs');
  });

  it('Kubernetes status does not include server URL', async () => {
    vi.spyOn(kubernetesService, 'getStatus').mockResolvedValue({
      status: 'CONNECTED',
      context: 'admin@prod-cluster',
      server: 'https://10.0.0.1:6443',
      version: 'v1.28.0',
      nodeCount: 10,
      readyNodeCount: 10,
      namespaceCount: 5,
      readOnly: true,
      checkedAt: '2023-01-01',
      message: 'OK',
    });

    let responseData: any;
    const mockRes = { json: vi.fn((data) => { responseData = data; }) } as unknown as Response;

    await kubernetesController.status(mockReq, mockRes);
    const result = responseData.data;

    expect(result.status).toBe('CONNECTED');
    expect(result.version).toBe('v1.28.0');
    expect(result.readOnly).toBe(true);
    expect(result.message).toBe('OK');

    expect(result).not.toHaveProperty('server');
    expect(result).not.toHaveProperty('context');
    expect(result).not.toHaveProperty('nodeCount');
    expect(result).not.toHaveProperty('readyNodeCount');
    expect(result).not.toHaveProperty('namespaceCount');
  });

  it('AWS status does not include accountId or arn', async () => {
    vi.spyOn(awsService, 'getStatus').mockResolvedValue({
      status: AwsIntegrationStatus.CONNECTED,
      configured: true,
      message: 'OK',
      checkedAt: '2023-01-01',
    } as any);

    let responseData: any;
    const mockRes = { json: vi.fn((data) => { responseData = data; }) } as unknown as Response;

    await awsController.status(mockReq, mockRes);
    const result = responseData.data;

    expect(result.status).toBe('CONNECTED');
    expect(result.configured).toBe(true);
    expect(result.message).toBe('OK');

    expect(result).not.toHaveProperty('accountId');
    expect(result).not.toHaveProperty('region');
    expect(result).not.toHaveProperty('callerArn');
  });

  it('Observability status does not include internal URLs', async () => {
    vi.spyOn(observabilityIntegrationService, 'getStatus').mockResolvedValue({
      prometheus: {
        status: 'CONNECTED',
        configured: true,
        url: 'http://prom.internal:9090',
        checkedAt: '2023-01-01',
        message: 'OK',
      },
      grafana: {
        status: 'CONNECTED',
        configured: true,
        url: 'http://grafana.internal:3000',
        publicUrl: 'https://grafana.example.com',
        version: '10.0.0',
        checkedAt: '2023-01-01',
        message: 'OK',
      },
      generatedAt: '2023-01-01',
    });

    let responseData: any;
    const mockRes = { json: vi.fn((data) => { responseData = data; }) } as unknown as Response;

    await observabilityIntegrationController.status(mockReq, mockRes);
    const result = responseData.data;

    expect(result.prometheus.status).toBe('CONNECTED');
    expect(result.prometheus).not.toHaveProperty('url');
    
    expect(result.grafana.status).toBe('CONNECTED');
    expect(result.grafana).not.toHaveProperty('url');
    expect(result.grafana).not.toHaveProperty('publicUrl');
  });
});
