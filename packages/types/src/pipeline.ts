import { z } from 'zod';
import { PipelineRunStatus } from './enums.js';

export const pipelineStepKindSchema = z.enum([
  'CHECKOUT',
  'INSTALL',
  'TEST',
  'BUILD',
  'DOCKER_BUILD',
  'DOCKER_PUSH',
  'DEPLOY',
  'CUSTOM',
]);
export type PipelineStepKind = z.infer<typeof pipelineStepKindSchema>;

export const pipelineStepConfigSchema = z.object({
  kind: pipelineStepKindSchema,
  name: z.string().min(1).max(120),
  command: z.string().max(4000).optional(),
  workingDir: z.string().max(255).optional(),
  env: z.record(z.string(), z.string()).optional(),
  continueOnError: z.boolean().default(false),
});
export type PipelineStepConfig = z.infer<typeof pipelineStepConfigSchema>;

export const createPipelineSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2).max(120),
  trigger: z.enum(['PUSH', 'PR', 'MANUAL', 'SCHEDULE']),
  steps: z.array(pipelineStepConfigSchema).min(1).max(50),
});
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: PipelineRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  triggeredById: string | null;
}
