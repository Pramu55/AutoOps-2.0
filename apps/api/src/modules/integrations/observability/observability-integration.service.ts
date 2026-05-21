import type {
  GrafanaIntegrationStatus,
  ObservabilityIntegrationStatusResponse,
  PrometheusIntegrationStatus,
} from '@autoops/types';
import { ObservabilityIntegrationStatus } from '@autoops/types';

export class ObservabilityIntegrationService {
  async getStatus(): Promise<ObservabilityIntegrationStatusResponse> {
    const [prometheus, grafana] = await Promise.all([this.getPrometheus(), this.getGrafana()]);
    return { prometheus, grafana, generatedAt: new Date().toISOString() };
  }

  async getPrometheus(): Promise<PrometheusIntegrationStatus> {
    const url = process.env.PROMETHEUS_URL?.trim() || 'http://prometheus:9090';
    const checkedAt = new Date().toISOString();
    try {
      const [ready, targets, query] = await Promise.all([
        this._fetchJson(`${url}/-/ready`),
        this._fetchJson<{ data?: { activeTargets?: Array<{ health?: string }> } }>(`${url}/api/v1/targets`),
        this._fetchJson<{ data?: { result?: unknown[] } }>(`${url}/api/v1/query?query=up`),
      ]);
      const activeTargets = targets.data?.activeTargets ?? [];
      const healthy = activeTargets.filter((target) => target.health === 'up').length;
      return {
        status: ready.ok ? ObservabilityIntegrationStatus.CONNECTED : ObservabilityIntegrationStatus.UNREACHABLE,
        configured: true,
        url,
        checkedAt,
        message: ready.ok ? 'Prometheus is ready.' : 'Prometheus readiness endpoint did not return success.',
        targets: {
          active: activeTargets.length,
          healthy,
          unhealthy: Math.max(activeTargets.length - healthy, 0),
        },
        query: {
          expression: 'up',
          resultCount: query.data?.result?.length ?? 0,
        },
      };
    } catch {
      return {
        status: ObservabilityIntegrationStatus.UNREACHABLE,
        configured: Boolean(url),
        url,
        checkedAt,
        message: 'Prometheus is not reachable from the API container.',
      };
    }
  }

  async getGrafana(): Promise<GrafanaIntegrationStatus> {
    const url = process.env.GRAFANA_URL?.trim() || 'http://grafana:3000';
    const publicUrl = process.env.GRAFANA_PUBLIC_URL?.trim() || 'http://localhost:3001';
    const checkedAt = new Date().toISOString();
    const headers: Record<string, string> = {};
    const token = process.env.GRAFANA_API_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const response = await fetch(`${url}/api/health`, { headers });
      if (response.status === 401 || response.status === 403) {
        return {
          status: ObservabilityIntegrationStatus.AUTH_REQUIRED,
          configured: true,
          url,
          publicUrl,
          checkedAt,
          message: 'Grafana is reachable but requires authentication.',
        };
      }
      if (!response.ok) {
        return {
          status: ObservabilityIntegrationStatus.UNREACHABLE,
          configured: true,
          url,
          publicUrl,
          checkedAt,
          message: `Grafana health returned HTTP ${response.status}.`,
        };
      }
      const body = (await response.json().catch(() => ({}))) as { version?: string; database?: string };
      return {
        status: ObservabilityIntegrationStatus.CONNECTED,
        configured: true,
        url,
        publicUrl,
        checkedAt,
        message: 'Grafana health endpoint is reachable.',
        version: body.version ?? null,
      };
    } catch {
      return {
        status: ObservabilityIntegrationStatus.UNREACHABLE,
        configured: Boolean(url),
        url,
        publicUrl,
        checkedAt,
        message: 'Grafana is not reachable from the API container.',
      };
    }
  }

  private async _fetchJson<T = unknown>(url: string): Promise<T & { ok?: boolean }> {
    const response = await fetch(url);
    if (!response.ok) return { ok: false } as T & { ok?: boolean };
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return { ok: true } as T & { ok?: boolean };
    return { ok: true, ...((await response.json()) as T) };
  }
}

export const observabilityIntegrationService = new ObservabilityIntegrationService();
