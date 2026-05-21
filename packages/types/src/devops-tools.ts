export const DevOpsToolStatus = {
  CONNECTED: 'CONNECTED',
  NOT_INSTALLED: 'NOT_INSTALLED',
  ERROR: 'ERROR',
} as const;
export type DevOpsToolStatus = (typeof DevOpsToolStatus)[keyof typeof DevOpsToolStatus];

export interface DevOpsToolSummary {
  key: 'tofu' | 'terraform' | 'ansible' | 'kubectl' | 'helm' | 'kustomize' | 'docker' | 'node' | 'pnpm';
  displayName: string;
  status: DevOpsToolStatus;
  version: string | null;
  checkedAt: string;
  message: string;
  safeActions: string[];
}

export interface DevOpsToolsStatusResponse {
  tools: DevOpsToolSummary[];
  generatedAt: string;
}
