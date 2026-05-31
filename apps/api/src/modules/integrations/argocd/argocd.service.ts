import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { env } from '../../../config/env.js';
import {
  ArgoCdConnectionStatus,
  type ArgoCdApplicationSummary,
  type ArgoCdApplicationsResponse,
  type ArgoCdHealthStatus,
  type ArgoCdStatusResponse,
  type ArgoCdSummaryResponse,
  type ArgoCdSyncStatus,
} from '@autoops/types';

type ArgoCdConfig = {
  configured: boolean;
  serverUrl: string;
  authMode: 'token' | 'username_password' | 'none';
  token: string | null;
  username: string | null;
  password: string | null;
  skipTlsVerify: boolean;
  timeoutMs: number;
};

type ArgoCdApplicationApi = {
  metadata?: {
    name?: string;
    namespace?: string;
  };
  spec?: {
    project?: string;
    source?: {
      repoURL?: string;
      targetRevision?: string;
      path?: string;
    };
    destination?: {
      server?: string;
      namespace?: string;
    };
  };
  status?: {
    sync?: {
      status?: string;
      revision?: string;
    };
    health?: {
      status?: string;
    };
    reconciledAt?: string;
    observedAt?: string;
  };
};

type ArgoCdApplicationsApiResponse = {
  items?: ArgoCdApplicationApi[];
};

type RequestResult<T> =
  | { ok: true; status: ArgoCdConnectionStatus; data: T; message: string }
  | { ok: false; status: ArgoCdConnectionStatus; message: string };

export class ArgoCdService {
  async getStatus(): Promise<ArgoCdStatusResponse> {
    const config = getArgoCdConfig();
    const checkedAt = new Date().toISOString();

    if (!config.configured) {
      return {
        status: ArgoCdConnectionStatus.NOT_CONFIGURED,
        configured: false,
        serverUrl: config.serverUrl || undefined,
        authMode: 'none',
        skipTlsVerify: config.skipTlsVerify,
        checkedAt,
        message:
          'Set ARGOCD_URL and either ARGOCD_AUTH_TOKEN or ARGOCD_USERNAME/ARGOCD_PASSWORD to enable read-only GitOps status.',
      };
    }

    const tokenResult = await this._getBearerToken(config);
    if (!tokenResult.ok) {
      return this._statusFromFailure(config, checkedAt, tokenResult.status, tokenResult.message);
    }

    const response = await requestJson<unknown>(config, '/api/v1/applications?limit=1', tokenResult.token);
    if (!response.ok) {
      return this._statusFromFailure(config, checkedAt, response.status, response.message);
    }

    return {
      status: ArgoCdConnectionStatus.CONNECTED,
      configured: true,
      serverUrl: config.serverUrl,
      authMode: config.authMode,
      skipTlsVerify: config.skipTlsVerify,
      checkedAt,
      message: 'Argo CD API is reachable in read-only mode.',
    };
  }

  async listApplications(): Promise<ArgoCdApplicationsResponse> {
    const config = getArgoCdConfig();
    const checkedAt = new Date().toISOString();
    if (!config.configured) {
      return {
        status: ArgoCdConnectionStatus.NOT_CONFIGURED,
        configured: false,
        serverUrl: config.serverUrl || undefined,
        checkedAt,
        message: 'Argo CD is not configured.',
        items: [],
      };
    }

    const tokenResult = await this._getBearerToken(config);
    if (!tokenResult.ok) {
      return {
        status: tokenResult.status,
        configured: true,
        serverUrl: config.serverUrl,
        checkedAt,
        message: tokenResult.message,
        items: [],
      };
    }

    const response = await requestJson<ArgoCdApplicationsApiResponse>(
      config,
      '/api/v1/applications',
      tokenResult.token,
    );
    if (!response.ok) {
      return {
        status: response.status,
        configured: true,
        serverUrl: config.serverUrl,
        checkedAt,
        message: response.message,
        items: [],
      };
    }

    return {
      status: ArgoCdConnectionStatus.CONNECTED,
      configured: true,
      serverUrl: config.serverUrl,
      checkedAt,
      message: 'Argo CD applications loaded.',
      items: (response.data.items ?? []).map(mapArgoCdApplication),
    };
  }

  async getSummary(): Promise<ArgoCdSummaryResponse> {
    const applications = await this.listApplications();
    return summarizeApplications(applications);
  }

  private async _getBearerToken(
    config: ArgoCdConfig,
  ): Promise<
    | { ok: true; token: string }
    | { ok: false; status: ArgoCdConnectionStatus; message: string }
  > {
    if (config.token) return { ok: true, token: config.token };
    if (!config.username || !config.password) {
      return {
        ok: false,
        status: ArgoCdConnectionStatus.NOT_CONFIGURED,
        message: 'Argo CD credentials are incomplete.',
      };
    }

    const response = await requestJson<{ token?: string }>(
      config,
      '/api/v1/session',
      null,
      'POST',
      { username: config.username, password: config.password },
    );
    if (!response.ok) {
      return { ok: false, status: response.status, message: response.message };
    }
    if (!response.data.token) {
      return {
        ok: false,
        status: ArgoCdConnectionStatus.AUTH_FAILED,
        message: 'Argo CD login did not return a session token.',
      };
    }
    return { ok: true, token: response.data.token };
  }

  private _statusFromFailure(
    config: ArgoCdConfig,
    checkedAt: string,
    status: ArgoCdConnectionStatus,
    message: string,
  ): ArgoCdStatusResponse {
    return {
      status,
      configured: true,
      serverUrl: config.serverUrl,
      authMode: config.authMode,
      skipTlsVerify: config.skipTlsVerify,
      checkedAt,
      message,
    };
  }
}

export function getArgoCdConfig(): ArgoCdConfig {
  const serverUrl = env.ARGOCD_URL.trim().replace(/\/+$/, '');
  const token = env.ARGOCD_AUTH_TOKEN.trim() || null;
  const username = env.ARGOCD_USERNAME.trim() || null;
  const password = env.ARGOCD_PASSWORD.trim() || null;
  const hasLogin = Boolean(username && password);

  return {
    configured: Boolean(serverUrl && (token || hasLogin)),
    serverUrl,
    authMode: token ? 'token' : hasLogin ? 'username_password' : 'none',
    token,
    username,
    password,
    skipTlsVerify: env.ARGOCD_SKIP_TLS_VERIFY,
    timeoutMs: env.ARGOCD_REQUEST_TIMEOUT_MS,
  };
}

export function mapArgoCdApplication(app: ArgoCdApplicationApi): ArgoCdApplicationSummary {
  const syncStatus = normalizeSyncStatus(app.status?.sync?.status);
  const healthStatus = normalizeHealthStatus(app.status?.health?.status);
  return {
    name: app.metadata?.name ?? 'unknown',
    namespace: app.metadata?.namespace ?? null,
    project: app.spec?.project ?? null,
    repoUrl: app.spec?.source?.repoURL ?? null,
    targetRevision: app.spec?.source?.targetRevision ?? null,
    path: app.spec?.source?.path ?? null,
    destinationServer: app.spec?.destination?.server ?? null,
    destinationNamespace: app.spec?.destination?.namespace ?? null,
    syncStatus,
    healthStatus,
    revision: app.status?.sync?.revision ?? null,
    observedAt: app.status?.reconciledAt ?? app.status?.observedAt ?? new Date().toISOString(),
    outOfSync: syncStatus === 'OutOfSync',
    healthDegraded: healthStatus === 'Degraded' || healthStatus === 'Missing',
  };
}

export function summarizeApplications(
  response: ArgoCdApplicationsResponse,
): ArgoCdSummaryResponse {
  const summary: ArgoCdSummaryResponse = {
    status: response.status,
    configured: response.configured,
    serverUrl: response.serverUrl,
    checkedAt: response.checkedAt,
    message: response.message,
    appCount: response.items.length,
    sync: { synced: 0, outOfSync: 0, unknown: 0 },
    health: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
    drift: { outOfSync: 0, degraded: 0 },
  };

  for (const app of response.items) {
    if (app.syncStatus === 'Synced') summary.sync.synced += 1;
    else if (app.syncStatus === 'OutOfSync') summary.sync.outOfSync += 1;
    else summary.sync.unknown += 1;

    if (app.healthStatus === 'Healthy') summary.health.healthy += 1;
    else if (app.healthStatus === 'Degraded') summary.health.degraded += 1;
    else if (app.healthStatus === 'Progressing') summary.health.progressing += 1;
    else if (app.healthStatus === 'Missing') summary.health.missing += 1;
    else summary.health.unknown += 1;

    if (app.outOfSync) summary.drift.outOfSync += 1;
    if (app.healthDegraded) summary.drift.degraded += 1;
  }

  return summary;
}

async function requestJson<T>(
  config: ArgoCdConfig,
  path: string,
  token: string | null,
  method = 'GET',
  body?: unknown,
): Promise<RequestResult<T>> {
  try {
    const url = new URL(path, `${config.serverUrl}/`);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'AutoOps-Control-Plane',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();

    const data = await rawRequest(url, {
      method,
      headers,
      body: payload,
      timeoutMs: config.timeoutMs,
      skipTlsVerify: config.skipTlsVerify,
    });

    if (data.statusCode === 401 || data.statusCode === 403) {
      return {
        ok: false,
        status: ArgoCdConnectionStatus.AUTH_FAILED,
        message: 'Argo CD credentials were rejected or lack read access.',
      };
    }
    if (data.statusCode < 200 || data.statusCode >= 300) {
      return {
        ok: false,
        status: ArgoCdConnectionStatus.UNREACHABLE,
        message: `Argo CD API returned HTTP ${data.statusCode}.`,
      };
    }

    const parsed = data.body ? (JSON.parse(data.body) as T) : ({} as T);
    return {
      ok: true,
      status: ArgoCdConnectionStatus.CONNECTED,
      message: 'Argo CD API is reachable.',
      data: parsed,
    };
  } catch {
    return {
      ok: false,
      status: ArgoCdConnectionStatus.UNREACHABLE,
      message: 'Argo CD API is unreachable.',
    };
  }
}

function rawRequest(
  url: URL,
  opts: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
    skipTlsVerify: boolean;
  },
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const request = transport.request(
      url,
      {
        method: opts.method,
        headers: opts.headers,
        timeout: opts.timeoutMs,
        rejectUnauthorized: isHttps ? !opts.skipTlsVerify : undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('Argo CD request timed out'));
    });
    request.on('error', reject);
    if (opts.body) request.write(opts.body);
    request.end();
  });
}

function normalizeSyncStatus(status: string | undefined): ArgoCdSyncStatus {
  if (status === 'Synced' || status === 'OutOfSync') return status;
  return status ?? 'Unknown';
}

function normalizeHealthStatus(status: string | undefined): ArgoCdHealthStatus {
  if (status === 'Healthy' || status === 'Degraded' || status === 'Progressing' || status === 'Missing') {
    return status;
  }
  return status ?? 'Unknown';
}

export const argocdService = new ArgoCdService();
