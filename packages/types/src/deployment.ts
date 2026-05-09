import { z } from 'zod';
import { DeploymentStatus } from './enums.js';

export const triggerDeploymentSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid(),
  commitSha: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/i, 'Must be a git SHA')
    .optional(),
  branch: z.string().max(255).optional(),
  trigger: z.enum(['MANUAL', 'GIT_PUSH', 'SCHEDULE', 'API']).default('MANUAL'),
});
export type TriggerDeploymentInput = z.infer<typeof triggerDeploymentSchema>;

export interface Deployment {
  id: string;
  projectId: string;
  environmentId: string;
  status: DeploymentStatus;
  commitSha: string | null;
  branch: string | null;
  triggeredById: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  imageTag: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface DeploymentEvent {
  id: string;
  deploymentId: string;
  type: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
