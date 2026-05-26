import { prisma } from '@autoops/database';
import type {
  CreateEnvironmentInput,
  Environment,
  UpdateEnvironmentInput,
} from '@autoops/types';
import { BadRequestError, ConflictError, NotFoundError } from '@autoops/utils';
import { resourceGraphService } from '../resources/resource-graph.service.js';

export class EnvironmentService {
  async listEnvironments(projectId: string, organizationId: string): Promise<Environment[]> {
    await this._requireProject(projectId, organizationId);

    const environments = await prisma.environment.findMany({
      where: {
        projectId,
        archivedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return environments.map((environment) => this._toEnvironment(environment));
  }

  async createEnvironment(
    projectId: string,
    organizationId: string,
    input: CreateEnvironmentInput,
  ): Promise<Environment> {
    await this._requireProject(projectId, organizationId);
    await this._assertUnique(projectId, input.name, input.slug);

    const environment = await prisma.environment.create({
      data: {
        projectId,
        name: input.name,
        slug: input.slug,
        kind: input.kind,
        description: input.description ?? null,
        url: input.url ?? null,
      },
    });

    await this._registerEnvironmentNode(organizationId, environment);
    return this._toEnvironment(environment);
  }

  async getEnvironment(
    projectId: string,
    environmentId: string,
    organizationId: string,
  ): Promise<Environment> {
    await this._requireProject(projectId, organizationId);

    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        projectId,
        archivedAt: null,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment');
    }

    return this._toEnvironment(environment);
  }

  async updateEnvironment(
    projectId: string,
    environmentId: string,
    organizationId: string,
    input: UpdateEnvironmentInput,
  ): Promise<Environment> {
    if (Object.keys(input).length === 0) {
      throw new BadRequestError('At least one field must be provided');
    }

    await this._requireProject(projectId, organizationId);

    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        projectId,
        archivedAt: null,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment');
    }

    await this._assertUnique(
      projectId,
      input.name && input.name !== environment.name ? input.name : undefined,
      input.slug && input.slug !== environment.slug ? input.slug : undefined,
    );

    const updated = await prisma.environment.update({
      where: {
        id: environment.id,
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
      },
    });

    await this._registerEnvironmentNode(organizationId, updated);
    return this._toEnvironment(updated);
  }

  async archiveEnvironment(
    projectId: string,
    environmentId: string,
    organizationId: string,
  ): Promise<Environment> {
    await this._requireProject(projectId, organizationId);

    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        projectId,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment');
    }

    if (environment.archivedAt) {
      return this._toEnvironment(environment);
    }

    const archived = await prisma.environment.update({
      where: {
        id: environment.id,
      },
      data: {
        archivedAt: new Date(),
      },
    });

    await this._registerEnvironmentNode(organizationId, archived).catch(() => undefined);
    return this._toEnvironment(archived);
  }

  private async _registerEnvironmentNode(
    organizationId: string,
    environment: { id: string; name: string; slug: string; projectId: string },
  ): Promise<void> {
    try {
      await resourceGraphService.registerAutoOpsEnvironmentNode(organizationId, environment);
    } catch (error) {
      console.warn('Resource graph environment registration failed', {
        organizationId,
        environmentId: environment.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private async _requireProject(projectId: string, organizationId: string): Promise<void> {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      throw new NotFoundError('Project');
    }
  }

  private async _assertUnique(projectId: string, name?: string, slug?: string): Promise<void> {
    if (!name && !slug) return;

    const existing = await prisma.environment.findFirst({
      where: {
        projectId,
        archivedAt: null,
        OR: [
          ...(name ? [{ name }] : []),
          ...(slug ? [{ slug }] : []),
        ],
      },
      select: {
        name: true,
        slug: true,
      },
    });

    if (!existing) return;
    if (name && existing.name === name) {
      throw new ConflictError('An environment with this name already exists');
    }
    throw new ConflictError('An environment with this slug already exists');
  }

  private _toEnvironment(environment: {
    id: string;
    projectId: string;
    name: string;
    slug: string;
    kind: Environment['kind'];
    description: string | null;
    url: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Environment {
    return {
      id: environment.id,
      projectId: environment.projectId,
      name: environment.name,
      slug: environment.slug,
      kind: environment.kind,
      description: environment.description,
      url: environment.url,
      createdAt: environment.createdAt.toISOString(),
      updatedAt: environment.updatedAt.toISOString(),
    };
  }
}

export const environmentService = new EnvironmentService();
