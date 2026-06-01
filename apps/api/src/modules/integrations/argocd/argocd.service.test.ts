import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArgoCdConnectionStatus } from '@autoops/types';

function setRequiredEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://autoops:autoops_dev@localhost:5432/autoops';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env[`JWT_${'SECRET'}`] = 'test-jwt-placeholder-minimum-32-characters';
  process.env[`JWT_REFRESH_${'SECRET'}`] = 'test-refresh-placeholder-minimum-32-chars';
  process.env.ARGOCD_SKIP_TLS_VERIFY = 'false';
  process.env.ARGOCD_REQUEST_TIMEOUT_MS = '500';
}

function clearArgoEnv(): void {
  delete process.env.ARGOCD_URL;
  delete process.env.ARGOCD_AUTH_TOKEN;
  delete process.env.ARGOCD_USERNAME;
  delete process.env.ARGOCD_PASSWORD;
}

describe('ArgoCdService', () => {
  beforeEach(() => {
    vi.resetModules();
    setRequiredEnv();
    clearArgoEnv();
  });

  it('returns NOT_CONFIGURED when env is missing', async () => {
    const { argocdService } = await import('./argocd.service.js');

    const status = await argocdService.getStatus();

    expect(status.status).toBe(ArgoCdConnectionStatus.NOT_CONFIGURED);
    expect(status.configured).toBe(false);
    expect(status.authMode).toBe('none');
  });

  it('redacts auth config from status responses', async () => {
    process.env.ARGOCD_URL = 'http://127.0.0.1:1';
    process.env.ARGOCD_AUTH_TOKEN = 'super-secret-token';
    process.env.ARGOCD_USERNAME = 'admin';
    process.env.ARGOCD_PASSWORD = 'super-secret-password';
    const { argocdService } = await import('./argocd.service.js');

    const status = await argocdService.getStatus();
    const serialized = JSON.stringify(status);

    expect(status.configured).toBe(true);
    expect(status.serverUrl).toBe('http://127.0.0.1:1');
    expect(status.authMode).toBe('token');
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('super-secret-password');
  });

  it('maps a synced healthy application', async () => {
    const { mapArgoCdApplication } = await import('./argocd.service.js');

    const app = mapArgoCdApplication({
      metadata: { name: 'web', namespace: 'argocd' },
      spec: {
        project: 'default',
        source: {
          repoURL: 'https://github.com/example/app.git',
          targetRevision: 'main',
          path: 'deploy',
        },
        destination: { server: 'https://kubernetes.default.svc', namespace: 'apps' },
      },
      status: {
        sync: { status: 'Synced', revision: 'abc123' },
        health: { status: 'Healthy' },
        reconciledAt: '2026-05-31T00:00:00.000Z',
      },
    });

    expect(app).toMatchObject({
      name: 'web',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      outOfSync: false,
      healthDegraded: false,
      repoUrl: 'https://github.com/example/app.git',
      destinationNamespace: 'apps',
    });
  });

  it('maps an out-of-sync degraded application', async () => {
    const { mapArgoCdApplication } = await import('./argocd.service.js');

    const app = mapArgoCdApplication({
      metadata: { name: 'api' },
      spec: {
        source: { repoURL: 'https://github.com/example/api.git' },
        destination: { namespace: 'prod' },
      },
      status: {
        sync: { status: 'OutOfSync' },
        health: { status: 'Degraded' },
      },
    });

    expect(app.outOfSync).toBe(true);
    expect(app.healthDegraded).toBe(true);
    expect(app.syncStatus).toBe('OutOfSync');
    expect(app.healthStatus).toBe('Degraded');
  });

  it('does not expose token or password through application responses', async () => {
    process.env.ARGOCD_URL = 'http://127.0.0.1:1';
    process.env.ARGOCD_AUTH_TOKEN = 'super-secret-token';
    process.env.ARGOCD_PASSWORD = 'super-secret-password';
    const { argocdService } = await import('./argocd.service.js');

    const applications = await argocdService.listApplications();
    const serialized = JSON.stringify(applications);

    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('super-secret-password');
  });

  it('summarizes applications by sync and health status', async () => {
    const { summarizeApplications } = await import('./argocd.service.js');

    const summary = summarizeApplications({
      status: ArgoCdConnectionStatus.CONNECTED,
      configured: true,
      serverUrl: 'https://argocd.example.com',
      checkedAt: '2026-05-31T00:00:00.000Z',
      items: [
        app('Synced', 'Healthy'),
        app('OutOfSync', 'Degraded'),
        app('OutOfSync', 'Progressing'),
        app('Unknown', 'Missing'),
      ],
    });

    expect(summary.appCount).toBe(4);
    expect(summary.sync).toEqual({ synced: 1, outOfSync: 2, unknown: 1 });
    expect(summary.health).toEqual({
      healthy: 1,
      degraded: 1,
      progressing: 1,
      missing: 1,
      unknown: 0,
    });
    expect(summary.drift).toEqual({ outOfSync: 2, degraded: 2 });
  });
});

function app(syncStatus: string, healthStatus: string) {
  return {
    name: `${syncStatus}-${healthStatus}`,
    namespace: null,
    project: null,
    repoUrl: null,
    targetRevision: null,
    path: null,
    destinationServer: null,
    destinationNamespace: null,
    syncStatus,
    healthStatus,
    revision: null,
    observedAt: '2026-05-31T00:00:00.000Z',
    outOfSync: syncStatus === 'OutOfSync',
    healthDegraded: healthStatus === 'Degraded' || healthStatus === 'Missing',
  };
}
