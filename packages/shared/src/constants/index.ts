export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const QUEUE_NAMES = {
  INCIDENTS: "incidents",
  WORKFLOWS: "workflows",
  ALERTS: "alerts",
  HEALTH_CHECKS: "health-checks",
} as const;

export const JOB_NAMES = {
  INCIDENT_CREATED: "incident:created",
  INCIDENT_UPDATED: "incident:updated",
  INCIDENT_RESOLVED: "incident:resolved",
  WORKFLOW_EXECUTE: "workflow:execute",
  ALERT_PROCESS: "alert:process",
  ALERT_ESCALATE: "alert:escalate",
  HEALTH_CHECK_RUN: "health-check:run",
} as const;

export const SEVERITY_WEIGHTS: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const CACHE_TTL = {
  SHORT: 60,
  MEDIUM: 300,
  LONG: 3600,
} as const;
