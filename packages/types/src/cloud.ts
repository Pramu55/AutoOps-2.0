export const CloudReadinessStatus = {
  CONNECTED: 'CONNECTED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTH_FAILED: 'AUTH_FAILED',
  UNREACHABLE: 'UNREACHABLE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  ERROR: 'ERROR',
} as const;
export type CloudReadinessStatus = (typeof CloudReadinessStatus)[keyof typeof CloudReadinessStatus];

export interface CloudProviderReadiness {
  provider: 'aws' | 'azure' | 'gcp';
  displayName: string;
  status: CloudReadinessStatus;
  configured: boolean;
  checkedAt: string;
  message: string;
  accountSummary?: string | null;
  region?: string | null;
  safeReadChecks: string[];
  writeModel: string;
}

export interface CloudReadinessStatusResponse {
  providers: CloudProviderReadiness[];
  generatedAt: string;
}
