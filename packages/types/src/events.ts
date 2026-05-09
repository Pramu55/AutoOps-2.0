/**
 * Realtime event contracts (api ↔ web over WebSocket and api ↔ worker over Redis pub/sub).
 *
 * Event names follow domain.action: deployment.status, log.line, metric.tick, incident.opened.
 */

export type RealtimeEvent =
  | { type: 'deployment.status'; deploymentId: string; status: string; at: string }
  | { type: 'deployment.event'; deploymentId: string; message: string; level: 'info' | 'warn' | 'error'; at: string }
  | { type: 'log.line'; deploymentId: string; line: string; stream: 'stdout' | 'stderr'; at: string }
  | { type: 'pipeline.status'; pipelineRunId: string; status: string; at: string }
  | { type: 'metric.tick'; projectId: string; metric: string; value: number; at: string }
  | { type: 'incident.opened'; incidentId: string; severity: string; at: string }
  | { type: 'incident.resolved'; incidentId: string; at: string }
  | { type: 'ai.token'; conversationId: string; messageId: string; token: string };

export const REALTIME_CHANNELS = {
  org: (orgId: string) => `org:${orgId}`,
  project: (projectId: string) => `project:${projectId}`,
  deployment: (deploymentId: string) => `deployment:${deploymentId}`,
  user: (userId: string) => `user:${userId}`,
} as const;
