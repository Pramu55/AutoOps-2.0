import type { Request, Response } from 'express';
import type { CreateProjectInput, Project, UpdateProjectInput } from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { projectService } from './project.service.js';

type ProjectParams = {
  projectId: string;
};

export class ProjectController {
  listProjects = async (
    req: Request,
    res: Response<{ data: Project[] }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);

    const projects = await projectService.listProjects(organizationId);
    res.json({ data: projects });
  };

  getProject = async (
    req: Request<ProjectParams>,
    res: Response<{ data: Project }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);

    const project = await projectService.getProject(organizationId, req.params.projectId);
    res.json({ data: project });
  };

  createProject = async (
    req: Request<Record<string, never>, unknown, CreateProjectInput>,
    res: Response<{ data: Project }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);

    const project = await projectService.createProject(organizationId, req.body);
    res.status(201).json({ data: project });
  };

  updateProject = async (
    req: Request<ProjectParams, unknown, UpdateProjectInput>,
    res: Response<{ data: Project }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);

    const project = await projectService.updateProject(
      organizationId,
      req.params.projectId,
      req.body,
    );

    res.json({ data: project });
  };

  archiveProject = async (
    req: Request<ProjectParams>,
    res: Response<{ data: Project }>,
  ): Promise<void> => {
    const organizationId = this._requireOrganizationId(req);

    const project = await projectService.archiveProject(organizationId, req.params.projectId);
    res.json({ data: project });
  };

  private _requireOrganizationId(req: Request): string {
    if (!req.auth) {
      throw new UnauthenticatedError();
    }

    if (!req.auth.orgId) {
      throw new UnauthorizedError('Organization context is required');
    }

    return req.auth.orgId;
  }
}

export const projectController = new ProjectController();