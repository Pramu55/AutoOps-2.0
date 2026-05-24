import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const organizationFindUnique = vi.fn();
const jenkinsListBuilds = vi.fn();
const dockerListContainers = vi.fn();
const kubernetesListNamespaces = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    organization: {
      findUnique: organizationFindUnique,
    },
  },
}));

vi.mock('./jenkins/jenkins.service.js', () => ({
  jenkinsService: {
    listBuilds: jenkinsListBuilds,
  },
}));

vi.mock('./docker/docker.service.js', () => ({
  dockerService: {
    listContainers: dockerListContainers,
  },
}));

vi.mock('./kubernetes/kubernetes.service.js', () => ({
  kubernetesService: {
    listNamespaces: kubernetesListNamespaces,
  },
}));

const { jenkinsController } = await import('./jenkins/jenkins.controller.js');
const { dockerController } = await import('./docker/docker.controller.js');
const { kubernetesController } = await import('./kubernetes/kubernetes.controller.js');

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

  it('blocks a new organization owner from Docker inventory', async () => {
    await expect(
      dockerController.containers(requestForOrg('new-user-workspace'), {} as Response),
    ).rejects.toThrow('Provider inventory is not enabled');

    expect(dockerListContainers).not.toHaveBeenCalled();
  });

  it('blocks a new organization owner from Kubernetes inventory', async () => {
    await expect(
      kubernetesController.namespaces(requestForOrg('new-user-workspace'), {} as Response),
    ).rejects.toThrow('Provider inventory is not enabled');

    expect(kubernetesListNamespaces).not.toHaveBeenCalled();
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
});
