import { z } from 'zod';
import type { OperationStatus } from './operation.js';
import type { OperationRiskLevel } from './ops.js';
import type { ProviderConnectionStatus } from './provider.js';

export type DockerConnectionStatus = ProviderConnectionStatus;

export interface DockerStatusResponse {
  status: DockerConnectionStatus;
  configured: boolean;
  version?: string;
  apiVersion?: string;
  os?: string;
  architecture?: string;
  containers?: number;
  images?: number;
  checkedAt: string;
  message: string;
  providerInventoryEnabled?: boolean;
  remediation?: string[];
}

export interface DockerPort {
  privatePort: number;
  publicPort: number | null;
  type: string;
  ip: string | null;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  imageId: string | null;
  state: string;
  status: string;
  health: string | null;
  createdAt: string | null;
  ports: DockerPort[];
  composeProject: string | null;
  isAutoOpsManaged: boolean;
  monitoringScope: 'managed' | 'monitored' | 'ignored' | 'unrelated';
  monitored: boolean;
  desiredState: 'running' | 'stopped' | 'unknown';
  labelsSummary: Record<string, string>;
}

export interface DockerImage {
  id: string;
  repoTags: string[];
  size: number;
  createdAt: string | null;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  createdAt: string | null;
}

export interface DockerListResponse<T> {
  status: DockerConnectionStatus;
  configured: boolean;
  checkedAt: string;
  message?: string;
  items: T[];
}

export interface DockerLogsResponse {
  status: DockerConnectionStatus;
  configured: boolean;
  checkedAt: string;
  containerId: string;
  containerName: string | null;
  tail: number;
  lines: string[];
}

export type DockerActionName = 'start' | 'stop' | 'restart';

export interface DockerActionResponse {
  operationId: string;
  status: OperationStatus;
  approvalRequired: boolean;
  approvalReason: string | null;
  riskLevel: OperationRiskLevel;
  policyName: string | null;
  message: string;
}

export const dockerContainerParamsSchema = z.object({
  containerId: z.string().trim().min(1).max(256),
});

export const dockerLogsQuerySchema = z.object({
  tail: z.coerce.number().int().min(1).max(500).default(100),
  timestamps: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type DockerLogsQuery = z.infer<typeof dockerLogsQuerySchema>;

export const dockerStartContainerSchema = z.object({
  confirmationToken: z.literal('START'),
});
export type DockerStartContainerInput = z.infer<typeof dockerStartContainerSchema>;

export const dockerStopContainerSchema = z.object({
  confirmationToken: z.literal('STOP'),
});
export type DockerStopContainerInput = z.infer<typeof dockerStopContainerSchema>;

export const dockerRestartContainerSchema = z.object({
  confirmationToken: z.literal('RESTART'),
});
export type DockerRestartContainerInput = z.infer<typeof dockerRestartContainerSchema>;
