import { z } from 'zod';
import { DeploymentStatus, DeploymentTrigger, LogLevel } from './enums.js';
import { idSchema } from './common.js';

export const triggerDeploymentSchema = z.object({
  commitSha: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/i, 'Must be a git SHA')
    .optional(),
  branch: z.string().max(255).optional(),
  trigger: z.nativeEnum(DeploymentTrigger).default(DeploymentTrigger.MANUAL),
});
export type TriggerDeploymentInput = z.infer<typeof triggerDeploymentSchema>;

export const deploymentParamsSchema = z.object({
  deploymentId: idSchema,
});

export const environmentDeploymentParamsSchema = z.object({
  projectId: idSchema,
  environmentId: idSchema,
});

export interface Deployment {
  id: string;
  projectId: string;
  environmentId: string;
  status: DeploymentStatus;
  trigger: DeploymentTrigger;
  commitSha: string | null;
  branch: string | null;
  triggeredById: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  imageTag: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentEvent {
  id: string;
  deploymentId: string;
  type: string;
  message: string;
  level: LogLevel;
  metadata: Record<string, unknown>;
  occurredAt: string;
}
