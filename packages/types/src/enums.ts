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
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
} as const;
export type IncidentSeverity = (typeof IncidentSeverity)[keyof typeof IncidentSeverity];

export const IncidentStatus = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const IncidentSource = {
  SIGNAL_CORRELATION: 'SIGNAL_CORRELATION',
  MANUAL: 'MANUAL',
  SYSTEM: 'SYSTEM',
} as const;
export type IncidentSource = (typeof IncidentSource)[keyof typeof IncidentSource];

export const IncidentSignalRole = {
  TRIGGER: 'TRIGGER',
  RELATED: 'RELATED',
  EVIDENCE: 'EVIDENCE',
} as const;
export type IncidentSignalRole = (typeof IncidentSignalRole)[keyof typeof IncidentSignalRole];

export const IncidentEventType = {
  INCIDENT_OPENED: 'INCIDENT_OPENED',
  INCIDENT_UPDATED: 'INCIDENT_UPDATED',
  SIGNAL_LINKED: 'SIGNAL_LINKED',
  SEVERITY_CHANGED: 'SEVERITY_CHANGED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
  ARCHIVED: 'ARCHIVED',
  NOTE_ADDED: 'NOTE_ADDED',
  CORRELATION_RAN: 'CORRELATION_RAN',
  EVIDENCE_ADDED: 'EVIDENCE_ADDED',
} as const;
export type IncidentEventType = (typeof IncidentEventType)[keyof typeof IncidentEventType];

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

export const SignalSource = {
  AUTOOPS: 'AUTOOPS',
  JENKINS: 'JENKINS',
  DOCKER: 'DOCKER',
  KUBERNETES: 'KUBERNETES',
  AWS: 'AWS',
  GITHUB_ACTIONS: 'GITHUB_ACTIONS',
  SYSTEM: 'SYSTEM',
} as const;
export type SignalSource = (typeof SignalSource)[keyof typeof SignalSource];

export const SignalSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
} as const;
export type SignalSeverity = (typeof SignalSeverity)[keyof typeof SignalSeverity];

export const SignalStatus = {
  ACTIVE: 'ACTIVE',
  RESOLVED: 'RESOLVED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type SignalStatus = (typeof SignalStatus)[keyof typeof SignalStatus];

export const SignalType = {
  DEPLOYMENT_CREATED: 'DEPLOYMENT_CREATED',
  DEPLOYMENT_STATUS_CHANGED: 'DEPLOYMENT_STATUS_CHANGED',
  OPERATION_CREATED: 'OPERATION_CREATED',
  OPERATION_STATUS_CHANGED: 'OPERATION_STATUS_CHANGED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  APPROVAL_APPROVED: 'APPROVAL_APPROVED',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
  PROVIDER_CONNECTED: 'PROVIDER_CONNECTED',
  PROVIDER_UNREACHABLE: 'PROVIDER_UNREACHABLE',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
  RESOURCE_DISCOVERED: 'RESOURCE_DISCOVERED',
  RESOURCE_CHANGED: 'RESOURCE_CHANGED',
  RESOURCE_STALE: 'RESOURCE_STALE',
  RESOURCE_ARCHIVED: 'RESOURCE_ARCHIVED',
  KUBERNETES_POD_PHASE_CHANGED: 'KUBERNETES_POD_PHASE_CHANGED',
  KUBERNETES_RESTART_COUNT_CHANGED: 'KUBERNETES_RESTART_COUNT_CHANGED',
  DOCKER_CONTAINER_STATE_CHANGED: 'DOCKER_CONTAINER_STATE_CHANGED',
  JENKINS_BUILD_STARTED: 'JENKINS_BUILD_STARTED',
  JENKINS_BUILD_SUCCEEDED: 'JENKINS_BUILD_SUCCEEDED',
  JENKINS_BUILD_FAILED: 'JENKINS_BUILD_FAILED',
  AWS_GUARDRAIL_BLOCKED: 'AWS_GUARDRAIL_BLOCKED',
  AWS_PLAN_READY: 'AWS_PLAN_READY',
  AWS_APPLY_BLOCKED: 'AWS_APPLY_BLOCKED',
  SECURITY_POLICY_BLOCKED: 'SECURITY_POLICY_BLOCKED',
  SYSTEM_HEALTH_CHANGED: 'SYSTEM_HEALTH_CHANGED',
} as const;
export type SignalType = (typeof SignalType)[keyof typeof SignalType];