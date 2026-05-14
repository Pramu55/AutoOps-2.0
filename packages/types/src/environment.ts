import { z } from 'zod';
import { EnvironmentKind } from './enums.js';
import { idSchema } from './common.js';
import { slugSchema } from './organization.js';

export const environmentParamsSchema = z.object({
  projectId: idSchema,
  environmentId: idSchema,
});

export const projectEnvironmentParamsSchema = z.object({
  projectId: idSchema,
});

export const createEnvironmentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: slugSchema,
  kind: z.nativeEnum(EnvironmentKind),
  description: z.string().max(2000).optional(),
  url: z.string().url().optional(),
});

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;

export const updateEnvironmentSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    slug: slugSchema.optional(),
    kind: z.nativeEnum(EnvironmentKind).optional(),
    description: z.string().max(2000).optional(),
    url: z.string().url().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  kind: EnvironmentKind;
  description: string | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
}
