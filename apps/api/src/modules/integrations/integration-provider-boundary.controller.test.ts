import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const organizationFindUnique = vi.fn();
const jenkinsGetStatus = vi.fn();
const jenkinsListBuilds = vi.fn();
const dockerGetStatus = vi.fn();
const dockerListContainers = vi.fn();
const kubernetesGetStatus = vi.fn();
const kubernetesListNamespaces = vi.fn();
const awsGetStatus = vi.fn();
const argocdGetStatus = vi.fn();
const devOpsToolsGetStatus = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    organization: {
      findUnique: organizationFindUnique,
    },
  },
}));

vi.mock('./jenkins/jenkins.service.js', () => ({
  jenkinsService: {
    getStatus: jenkinsGetStatus,
    listBuilds: jenkinsListBuilds,
  },
}));

vi.mock('./docker/docker.service.js', () => ({
  dockerService: {
    getStatus: dockerGetStatus,
    listContainers: dockerListContainers,
  },
}));

vi.mock('./kubernetes/kubernetes.service.js', () => ({
  kubernetesService: {
    getStatus: kubernetesGetStatus,
    listNamespaces: kubernetesListNamespaces,
  },
}));

vi.mock('./aws/aws.service.js', () => ({
  awsService: {
    getStatus: awsGetStatus,
  },
  mapAwsToProviderStatus: (status: string) => status,
}));

vi.mock('./argocd/argocd.service.js', () => ({
  argocdService: {
    getStatus: argocdGetStatus,
  },
}));

vi.mock('./devops-tools/devops-tools.service.js', () => ({
  devOpsToolsService: {
    getStatus: devOpsToolsGetStatus,
  },
}));

const { jenkinsController } = await import('./jenkins/jenkins.controller.js');
const { dockerController } = await import('./docker/docker.controller.js');
const { kubernetesController } = await import('./kubernetes/kubernetes.controller.js');
const { providerRegistryController } = await import('./providers/provider-registry.controller.js');
const { devOpsToolsController } = await import('./devops-tools/devops-tools.controller.js');

function requestForOrg(slug: string): Request {
  organizationFindUnique.mockResolvedValue({
    id: `id-${slug}`,
    slug,
  });

  return {
    auth: {
      userId: 'user-new',
      orgId: `id-${slug}`,
      role: 'OWNER',
    },
  } as Request;
}

describe('provider inventory API boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS;
    delete process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS;
    delete process.env.PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS;
    process.env.NODE_ENV = 'test';
  });

  it('blocks a new organization owner from Jenkins build history', async () => {
    await expect(
      jenkinsController.builds(requestForOrg('new-user-workspace'), {} as Response),
    ).rejects.toThrow('Provider inventory is not enabled');

    expect(jenkinsListBuilds).not.toHaveBeenCalled();
  });

  it('returns blocked onboarding status for a new organization owner without calling Jenkins', async () => {
    const res = { json: vi.fn() } as unknown as Response;

    await jenkinsController.status(requestForOrg('new-user-workspace'), res);

    expect(jenkinsGetStatus).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'BLOCKED_BY_ORG_POLICY',
        configured: false,
        providerInventoryEnabled: false,
        readiness: expect.objectContaining({
          state: 'DISABLED',
          enabled: false,
          reachable: null,
        }),
        message: 'Provider inventory is disabled for this organization.',
        remediation: expect.arrayContaining([
          'Use the demo/admin workspace for built-in local demo connectors.',
        ]),
      }),
    });
  });

  it('blocks a new organization owner from Docker inventory', async () => {
    await expect(
      dockerController.containers(requestForOrg('new-user-workspace'), {} as Response),
    ).rejects.toThrow('Provider inventory is not enabled');

    expect(dockerListContainers).not.toHaveBeenCalled();
  });

  it('returns blocked onboarding status for Docker without exposing inventory', async () => {
    const res = { json: vi.fn() } as unknown as Response;

    await dockerController.status(requestForOrg('new-user-workspace'), res);

    expect(dockerGetStatus).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'BLOCKED_BY_ORG_POLICY',
        configured: false,
        providerInventoryEnabled: false,
        readiness: expect.objectContaining({
          state: 'DISABLED',
        }),
      }),
    });
  });

  it('blocks a new organization owner from Kubernetes inventory', async () => {
    await expect(
      kubernetesController.namespaces(requestForOrg('new-user-workspace'), {} as Response),
    ).rejects.toThrow('Provider inventory is not enabled');

    expect(kubernetesListNamespaces).not.toHaveBeenCalled();
  });

  it('returns blocked onboarding status for Kubernetes without exposing inventory', async () => {
    const res = { json: vi.fn() } as unknown as Response;

    await kubernetesController.status(requestForOrg('new-user-workspace'), res);

    expect(kubernetesGetStatus).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'BLOCKED_BY_ORG_POLICY',
        configured: false,
        providerInventoryEnabled: false,
        readOnly: true,
        readiness: expect.objectContaining({
          state: 'DISABLED',
        }),
      }),
    });
  });

  it('returns blocked aggregate providers without calling provider status services', async () => {
    const res = { json: vi.fn() } as unknown as Response;

    await providerRegistryController.list(requestForOrg('new-user-workspace'), res);

    expect(kubernetesGetStatus).not.toHaveBeenCalled();
    expect(awsGetStatus).not.toHaveBeenCalled();
    expect(jenkinsGetStatus).not.toHaveBeenCalled();
    expect(dockerGetStatus).not.toHaveBeenCalled();
    expect(argocdGetStatus).not.toHaveBeenCalled();

    const json = res.json as unknown as ReturnType<typeof vi.fn>;
    const payload = json.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> } | undefined;
    expect(payload).toBeDefined();
    if (!payload) throw new Error('Expected provider registry response payload.');
    const providers = payload.data as Array<Record<string, unknown>>;
    expect(providers).toHaveLength(6);

    for (const provider of providers) {
      expect(provider).toEqual(expect.objectContaining({
        status: 'BLOCKED_BY_ORG_POLICY',
        configured: false,
        requiredEnvironment: [],
        capabilities: [],
        readCapabilities: [],
        writeCapabilities: [],
        dangerousCapabilities: [],
        readiness: expect.objectContaining({
          state: 'DISABLED',
          enabled: false,
          configured: false,
          reachable: null,
          checkedAt: null,
          reasonCode: 'BLOCKED_BY_ORG_POLICY',
        }),
      }));
      expect(provider).not.toEqual(expect.objectContaining({ version: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ apiVersion: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ server: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ context: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ url: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ baseUrl: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ endpoint: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ accountId: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ accountSummary: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ cluster: expect.anything() }));
      expect(provider).not.toEqual(expect.objectContaining({ inventory: expect.anything() }));
    }
  });

  it('preserves DevOps Tools top-level status while adding readiness', async () => {
    process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = 'autoops-demo';
    devOpsToolsGetStatus.mockResolvedValue({
      status: 'ERROR',
      configured: false,
      message: 'Tool detection completed with errors.',
      tools: [
        {
          key: 'terraform',
          displayName: 'Terraform',
          status: 'NOT_INSTALLED',
          version: null,
          checkedAt: '2026-07-17T00:00:00.000Z',
          message: 'Terraform is not installed in this runtime.',
          safeActions: ['version'],
        },
      ],
      generatedAt: '2026-07-17T00:00:00.000Z',
    });
    const res = { json: vi.fn() } as unknown as Response;

    await devOpsToolsController.status(requestForOrg('autoops-demo'), res);

    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'ERROR',
        configured: false,
        tools: expect.arrayContaining([
          expect.objectContaining({
            status: 'NOT_INSTALLED',
          }),
        ]),
        readiness: expect.objectContaining({
          state: 'NOT_CONFIGURED',
          reasonCode: 'NOT_INSTALLED',
        }),
      }),
    });
  });

  it('does not treat unknown Kubernetes aggregate status as configured', async () => {
    process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = 'autoops-demo';
    kubernetesGetStatus.mockResolvedValue({
      status: 'SOMETHING_NEW',
      checkedAt: '2026-07-17T00:00:00.000Z',
      message: 'Unknown Kubernetes status.',
    });
    awsGetStatus.mockResolvedValue({
      status: 'NOT_CONFIGURED',
      configured: false,
      message: 'AWS is not configured.',
      checkedAt: '2026-07-17T00:00:00.000Z',
    });
    jenkinsGetStatus.mockResolvedValue({
      status: 'NOT_CONFIGURED',
      configured: false,
      triggerEnabled: false,
      message: 'Jenkins is not configured.',
      checkedAt: '2026-07-17T00:00:00.000Z',
    });
    dockerGetStatus.mockResolvedValue({
      status: 'NOT_CONFIGURED',
      configured: false,
      message: 'Docker is not configured.',
      checkedAt: '2026-07-17T00:00:00.000Z',
    });
    argocdGetStatus.mockResolvedValue({
      status: 'NOT_CONFIGURED',
      configured: false,
      skipTlsVerify: false,
      message: 'Argo CD is not configured.',
      checkedAt: '2026-07-17T00:00:00.000Z',
    });
    const res = { json: vi.fn() } as unknown as Response;

    await providerRegistryController.list(requestForOrg('autoops-demo'), res);

    expect(res.json).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          key: 'kubernetes',
          status: 'SOMETHING_NEW',
          configured: false,
          readiness: expect.objectContaining({
            state: 'UNREACHABLE',
            configured: false,
          }),
        }),
      ]),
    });
  });

  it('allows the explicitly enabled local demo organization to use provider inventory', async () => {
    process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = 'autoops-demo';
    jenkinsListBuilds.mockResolvedValue({ items: [] });
    const res = {
      json: vi.fn(),
    } as unknown as Response;

    await jenkinsController.builds(requestForOrg('autoops-demo'), res);

    expect(jenkinsListBuilds).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: { items: [] } });
  });

  it('calls the real status service for an allowlisted demo organization', async () => {
    process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = 'autoops-demo';
    jenkinsGetStatus.mockResolvedValue({
      status: 'CONNECTED',
      configured: true,
      triggerEnabled: true,
      message: 'Connected.',
      checkedAt: '2026-05-25T00:00:00.000Z',
    });
    const res = { json: vi.fn() } as unknown as Response;

    await jenkinsController.status(requestForOrg('autoops-demo'), res);

    expect(jenkinsGetStatus).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'CONNECTED',
        configured: true,
        readiness: expect.objectContaining({
          state: 'CONNECTED',
          reachable: true,
        }),
      }),
    });
  });
});
