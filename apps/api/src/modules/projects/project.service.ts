import { prisma } from '@autoops/database';
import type { CreateProjectInput, Project, UpdateProjectInput } from '@autoops/types';
import { BadRequestError, ConflictError, NotFoundError } from '@autoops/utils';

export class ProjectService {
  async listProjects(organizationId: string): Promise<Project[]> {
    const projects = await prisma.project.findMany({
      where: {
        organizationId,
        archivedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return projects.map((project) => this._toProject(project));
  }

  async getProject(organizationId: string, projectId: string): Promise<Project> {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        archivedAt: null,
      },
    });

    if (!project) {
      throw new NotFoundError('Project');
    }

    return this._toProject(project);
  }

  async createProject(organizationId: string, input: CreateProjectInput): Promise<Project> {
    const existing = await prisma.project.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new ConflictError('A project with this slug already exists');
    }

    const project = await prisma.project.create({
      data: {
        organizationId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        visibility: input.visibility,
        repositoryUrl: input.repositoryUrl ?? null,
        defaultBranch: input.defaultBranch,
      },
    });

    return this._toProject(project);
  }

  async updateProject(
    organizationId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    if (Object.keys(input).length === 0) {
      throw new BadRequestError('At least one field must be provided');
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        archivedAt: null,
      },
    });

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (input.slug && input.slug !== project.slug) {
      const existing = await prisma.project.findUnique({
        where: {
          organizationId_slug: {
            organizationId,
            slug: input.slug,
          },
        },
      });

      if (existing) {
        throw new ConflictError('A project with this slug already exists');
      }
    }

    const updated = await prisma.project.update({
      where: {
        id: project.id,
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.repositoryUrl !== undefined ? { repositoryUrl: input.repositoryUrl } : {}),
        ...(input.defaultBranch !== undefined ? { defaultBranch: input.defaultBranch } : {}),
      },
    });

    return this._toProject(updated);
  }

  async archiveProject(organizationId: string, projectId: string): Promise<Project> {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
      },
    });

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (project.archivedAt) {
      return this._toProject(project);
    }

    const archived = await prisma.project.update({
      where: {
        id: project.id,
      },
      data: {
        archivedAt: new Date(),
      },
    });

    return this._toProject(archived);
  }

  private _toProject(project: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    description: string | null;
    visibility: Project['visibility'];
    repositoryUrl: string | null;
    defaultBranch: string;
    createdAt: Date;
    updatedAt: Date;
  }): Project {
    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      visibility: project.visibility,
      repositoryUrl: project.repositoryUrl,
      defaultBranch: project.defaultBranch,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}

export const projectService = new ProjectService();