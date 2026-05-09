export type Role = "USER" | "ADMIN" | "OPERATOR";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type IncidentStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";

export type ServiceStatus = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "MAINTENANCE";

export type WorkflowStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
}

export interface IncidentDto {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: IncidentStatus;
  assigneeId: string | null;
  serviceId: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface ServiceDto {
  id: string;
  name: string;
  description: string | null;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDto {
  id: string;
  name: string;
  description: string | null;
  definition: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunDto {
  id: string;
  workflowId: string;
  triggeredBy: string | null;
  userId: string | null;
  status: WorkflowStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AlertDto {
  id: string;
  title: string;
  message: string;
  severity: Severity;
  source: string;
  status: AlertStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIncidentDto {
  title: string;
  description?: string;
  severity: Severity;
  serviceId: string;
  assigneeId?: string;
}

export interface UpdateIncidentDto {
  title?: string;
  description?: string;
  severity?: Severity;
  status?: IncidentStatus;
  assigneeId?: string | null;
}

export interface UpdateServiceDto {
  name?: string;
  description?: string;
  status?: ServiceStatus;
  url?: string | null;
}

export interface CreateServiceDto {
  name: string;
  description?: string;
  status?: ServiceStatus;
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  definition: Record<string, unknown>;
  isActive?: boolean;
}

export interface CreateAlertDto {
  title: string;
  message: string;
  severity: Severity;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface JobPayload {
  jobId: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowJobPayload extends JobPayload {
  type: "workflow";
  data: {
    workflowId: string;
    runId: string;
    input: Record<string, unknown>;
  };
}

export interface AlertJobPayload extends JobPayload {
  type: "alert";
  data: {
    alertId: string;
    severity: Severity;
  };
}

export interface IncidentJobPayload extends JobPayload {
  type: "incident";
  data: {
    incidentId: string;
    action: "created" | "updated" | "resolved";
  };
}
