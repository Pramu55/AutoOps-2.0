import { beforeEach, describe, expect, it, vi } from 'vitest';

const projectFindMany = vi.fn();
const projectFindFirst = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    project: {
      findMany: projectFindMany,
      findFirst: projectFindFirst,
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const { projectService } = await import('./project.service.js');

describe('ProjectService tenant scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists projects only for the authenticated organization', async () => {
    projectFindMany.mockResolvedValue([]);

    await projectService.listProjects('org-a');

    expect(projectFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-a',
        archivedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  });

  it('gets a project by ID only when it belongs to the authenticated organization', async () => {
    projectFindFirst.mockResolvedValue({
      id: 'project-a',
      organizationId: 'org-a',
      name: 'Project A',
      slug: 'project-a',
      description: null,
      visibility: 'ORG',
      repositoryUrl: null,
      defaultBranch: 'main',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await projectService.getProject('org-a', 'project-a');

    expect(projectFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-a',
        organizationId: 'org-a',
        archivedAt: null,
      },
    });
  });

  it('does not return a project from another organization by direct ID', async () => {
    projectFindFirst.mockResolvedValue(null);

    await expect(projectService.getProject('org-b', 'project-a')).rejects.toThrow('Project');
  });
});
