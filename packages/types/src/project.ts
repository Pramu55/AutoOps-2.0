import { z } from 'zod';
import { ProjectVisibility } from './enums.js';
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

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: slugSchema.optional(),
    description: z.string().max(2000).optional(),
    visibility: z.nativeEnum(ProjectVisibility).optional(),
    repositoryUrl: z.string().url().optional(),
    defaultBranch: z.string().max(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

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
