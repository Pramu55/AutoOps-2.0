import { z } from 'zod';
import { ProjectVisibility, EnvironmentKind } from './enums.js';
import { slugSchema } from './organization.js';

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  description: z.string().max(2000).optional(),
  visibility: z.nativeEnum(ProjectVisibility).default(ProjectVisibility.ORG),
  repositoryUrl: z.string().url().optional(),
  defaultBranch: z.string().max(120).default('main'),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const createEnvironmentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.nativeEnum(EnvironmentKind),
  variables: z.record(z.string(), z.string()).default({}),
});
export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: ProjectVisibility;
  repositoryUrl: string | null;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  kind: EnvironmentKind;
  createdAt: string;
}
