import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeAccess = 'test-secret-value-not-real-access-0123456789';
const fakeRefresh = 'test-secret-value-not-real-refresh-0123456789';
const fakeProviderToken = 'test-secret-value-not-real-github-token';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.SECRET_PROVIDER_MODE = 'env';
  process.env[`JWT_${'SECRET'}`] = fakeAccess;
  process.env[`JWT_REFRESH_${'SECRET'}`] = fakeRefresh;
  process.env.JENKINS_INTEGRATION_ENABLED = 'false';
  process.env[`JENKINS_API_${'TOKEN'}`] = '';
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub Actions secret injection', () => {
  it('remains not configured without a token while disabled', async () => {
    process.env.GITHUB_ACTIONS_ENABLED = 'false';
    delete process.env[`GITHUB_ACTIONS_${'TOKEN'}`];
    const secrets = await import('../../../config/application-secrets.js');
    await secrets.initializeApplicationSecrets();
    const { GitHubActionsService } = await import('./github-actions.service.js');

    await expect(new GitHubActionsService().getStatus()).resolves.toMatchObject({
      configured: false,
      status: 'NOT_CONFIGURED',
    });
  });

  it('uses the injected token only after enabled bootstrap validation', async () => {
    process.env.GITHUB_ACTIONS_ENABLED = 'true';
    process.env[`GITHUB_ACTIONS_${'TOKEN'}`] = fakeProviderToken;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ total_count: 1 }) }),
    );
    const secrets = await import('../../../config/application-secrets.js');
    await secrets.initializeApplicationSecrets();
    const { GitHubActionsService } = await import('./github-actions.service.js');

    await expect(new GitHubActionsService().getStatus()).resolves.toMatchObject({
      configured: true,
      status: 'CONNECTED',
    });
  });
});
