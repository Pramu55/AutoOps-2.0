/**
 * Canonical string enums shared between API, web, worker, and DB.
 * These mirror the Prisma enums one-for-one.
 */

export const OrgRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const TeamRole = {
  LEAD: 'LEAD',
  CONTRIBUTOR: 'CONTRIBUTOR',
  VIEWER: 'VIEWER',
} as const;
export type TeamRole = (typeof TeamRole)[keyof typeof TeamRole];

export const ProjectVisibility = {
  PRIVATE: 'PRIVATE',
  ORG: 'ORG',
  PUBLIC: 'PUBLIC',
} as const;
export type ProjectVisibility = (typeof ProjectVisibility)[keyof typeof ProjectVisibility];

export const EnvironmentKind = {
  PRODUCTION: 'PRODUCTION',
  STAGING: 'STAGING',
  PREVIEW: 'PREVIEW',
  DEVELOPMENT: 'DEVELOPMENT',
  CUSTOM: 'CUSTOM',
} as const;
export type EnvironmentKind = (typeof EnvironmentKind)[keyof typeof EnvironmentKind];

export const DeploymentStatus = {
  QUEUED: 'QUEUED',
  BUILDING: 'BUILDING',
  DEPLOYING: 'DEPLOYING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  ROLLED_BACK: 'ROLLED_BACK',
} as const;
export type DeploymentStatus = (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

export const DeploymentTrigger = {
  MANUAL: 'MANUAL',
  GIT_PUSH: 'GIT_PUSH',
  SCHEDULE: 'SCHEDULE',
  API: 'API',
} as const;
export type DeploymentTrigger = (typeof DeploymentTrigger)[keyof typeof DeploymentTrigger];

export const LogLevel = {
  TRACE: 'TRACE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  FATAL: 'FATAL',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const PipelineRunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type PipelineRunStatus = (typeof PipelineRunStatus)[keyof typeof PipelineRunStatus];

export const IncidentSeverity = {
  SEV1: 'SEV1',
  SEV2: 'SEV2',
  SEV3: 'SEV3',
  SEV4: 'SEV4',
} as const;
export type IncidentSeverity = (typeof IncidentSeverity)[keyof typeof IncidentSeverity];

export const IncidentStatus = {
  TRIGGERED: 'TRIGGERED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  MITIGATED: 'MITIGATED',
  RESOLVED: 'RESOLVED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const AlertChannelKind = {
  EMAIL: 'EMAIL',
  SLACK: 'SLACK',
  WEBHOOK: 'WEBHOOK',
} as const;
export type AlertChannelKind = (typeof AlertChannelKind)[keyof typeof AlertChannelKind];

export const AIProvider = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  OLLAMA: 'OLLAMA',
} as const;
export type AIProvider = (typeof AIProvider)[keyof typeof AIProvider];

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  GRANT: 'GRANT',
  REVOKE: 'REVOKE',
  DEPLOY: 'DEPLOY',
  ROLLBACK: 'ROLLBACK',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
