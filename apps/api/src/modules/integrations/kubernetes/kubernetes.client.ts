import { existsSync } from 'node:fs';
import * as k8s from '@kubernetes/client-node';
import {
  KubernetesConnectionStatus,
  type KubernetesStatus,
} from '@autoops/types';

const IN_CLUSTER_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';

export interface KubernetesClientBundle {
  kubeConfig: k8s.KubeConfig;
  core: k8s.CoreV1Api;
  apps: k8s.AppsV1Api;
  customObjects: k8s.CustomObjectsApi;
  object: k8s.KubernetesObjectApi;
  version: k8s.VersionApi;
}

type MutableCluster = {
  server: string;
  tlsServerName?: string;
};

export class KubernetesClientProvider {
  getConfiguredClient(): KubernetesClientBundle | null {
    const kubeConfig = new k8s.KubeConfig();
    const kubeconfigPath = process.env.KUBECONFIG?.trim();

    if (kubeconfigPath) {
      if (!existsSync(kubeconfigPath)) {
        return null;
      }

      kubeConfig.loadFromFile(kubeconfigPath);
      this._applyRuntimeOverrides(kubeConfig);
      return this._toBundle(kubeConfig);
    }

    if (existsSync(IN_CLUSTER_TOKEN_PATH)) {
      kubeConfig.loadFromCluster();
      this._applyRuntimeOverrides(kubeConfig);
      return this._toBundle(kubeConfig);
    }

    return null;
  }

  notConfiguredStatus(): KubernetesStatus {
    return {
      status: KubernetesConnectionStatus.NOT_CONFIGURED,
      checkedAt: new Date().toISOString(),
      readOnly: true,
      message:
        'Set KUBECONFIG for the API container and mount the kubeconfig file read-only to enable Kubernetes discovery.',
    };
  }

  authFailedStatus(message = 'Kubernetes API rejected the configured credentials or RBAC policy.'): KubernetesStatus {
    return {
      status: KubernetesConnectionStatus.AUTH_FAILED,
      checkedAt: new Date().toISOString(),
      readOnly: true,
      message,
    };
  }

  unreachableStatus(
    diagnostic = 'UNKNOWN',
    message = 'Kubernetes API is configured but unreachable.',
  ): KubernetesStatus {
    return {
      status: KubernetesConnectionStatus.UNREACHABLE,
      checkedAt: new Date().toISOString(),
      readOnly: true,
      message: `${message} Diagnostic: ${diagnostic}.`,
    };
  }

  classifyConnectionError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();

    if (
      normalized.includes('econnrefused') ||
      normalized.includes('connection refused') ||
      normalized.includes('actively refused')
    ) {
      return 'CONNECTION_REFUSED';
    }

    if (
      normalized.includes('hostname') ||
      normalized.includes('altname') ||
      normalized.includes('subject alternative name') ||
      normalized.includes('certificate')
    ) {
      return 'TLS_HOSTNAME_MISMATCH';
    }

    if (
      normalized.includes('enotfound') ||
      normalized.includes('eai_again') ||
      normalized.includes('getaddrinfo') ||
      normalized.includes('dns')
    ) {
      return 'DNS_UNREACHABLE';
    }

    if (
      normalized.includes('unauthorized') ||
      normalized.includes('forbidden') ||
      normalized.includes('rbac') ||
      normalized.includes('401') ||
      normalized.includes('403')
    ) {
      return 'AUTH_FAILED';
    }

    return 'UNKNOWN';
  }

  clusterInfo(kubeConfig: k8s.KubeConfig): Pick<KubernetesStatus, 'context' | 'server'> {
    const cluster = kubeConfig.getCurrentCluster();
    return {
      context: kubeConfig.getCurrentContext() || undefined,
      server: cluster?.server,
    };
  }

  private _toBundle(kubeConfig: k8s.KubeConfig): KubernetesClientBundle {
    return {
      kubeConfig,
      core: kubeConfig.makeApiClient(k8s.CoreV1Api),
      apps: kubeConfig.makeApiClient(k8s.AppsV1Api),
      customObjects: kubeConfig.makeApiClient(k8s.CustomObjectsApi),
      object: k8s.KubernetesObjectApi.makeApiClient(kubeConfig),
      version: kubeConfig.makeApiClient(k8s.VersionApi),
    };
  }

  private _applyRuntimeOverrides(kubeConfig: k8s.KubeConfig): void {
    const cluster = kubeConfig.getCurrentCluster();
    if (!cluster) return;

    const mutableCluster = cluster as unknown as MutableCluster;
    const serverOverride = process.env.KUBERNETES_API_SERVER_OVERRIDE?.trim();
    const tlsServerNameOverride = process.env.KUBERNETES_TLS_SERVER_NAME_OVERRIDE?.trim();

    if (serverOverride) {
      mutableCluster.server = serverOverride;
    }

    if (tlsServerNameOverride) {
      mutableCluster.tlsServerName = tlsServerNameOverride;
    }
  }
}

export const kubernetesClientProvider = new KubernetesClientProvider();
