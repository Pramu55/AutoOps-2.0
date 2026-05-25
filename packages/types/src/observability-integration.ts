export const ObservabilityIntegrationStatus = {
  BLOCKED_BY_ORG_POLICY: 'BLOCKED_BY_ORG_POLICY',
  CONNECTED: 'CONNECTED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  UNREACHABLE: 'UNREACHABLE',
  ERROR: 'ERROR',
} as const;
export type ObservabilityIntegrationStatus =
  (typeof ObservabilityIntegrationStatus)[keyof typeof ObservabilityIntegrationStatus];

export interface PrometheusIntegrationStatus {
  status: ObservabilityIntegrationStatus;
  configured: boolean;
  url?: string | null;
  checkedAt: string;
  message: string;
  targets?: {
    active: number;
    healthy: number;
    unhealthy: number;
  };
  query?: {
    expression: string;
    resultCount: number;
  };
}

export interface GrafanaIntegrationStatus {
  status: ObservabilityIntegrationStatus;
  configured: boolean;
  url?: string | null;
  publicUrl?: string | null;
  checkedAt: string;
  message: string;
  version?: string | null;
}

export interface ObservabilityIntegrationStatusResponse {
  prometheus: PrometheusIntegrationStatus;
  grafana: GrafanaIntegrationStatus;
  generatedAt: string;
}
