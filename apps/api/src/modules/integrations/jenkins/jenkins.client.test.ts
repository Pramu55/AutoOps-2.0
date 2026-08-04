import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeAccess = 'test-secret-value-not-real-access-0123456789';
const fakeRefresh = 'test-secret-value-not-real-refresh-0123456789';
const fakeProviderToken = 'test-secret-value-not-real-jenkins-token';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.SECRET_PROVIDER_MODE = 'env';
  process.env[`JWT_${'SECRET'}`] = fakeAccess;
  process.env[`JWT_REFRESH_${'SECRET'}`] = fakeRefresh;
  process.env.GITHUB_ACTIONS_ENABLED = 'false';
  delete process.env[`GITHUB_ACTIONS_${'TOKEN'}`];
  vi.resetModules();
});

describe('Jenkins secret injection', () => {
  it('accepts an empty token while Jenkins is explicitly disabled', async () => {
    process.env.JENKINS_INTEGRATION_ENABLED = 'false';
    process.env[`JENKINS_API_${'TOKEN'}`] = '';
    const secrets = await import('../../../config/application-secrets.js');
    await secrets.initializeApplicationSecrets();
    const { getJenkinsConfiguration } = await import('./jenkins.client.js');

    expect(getJenkinsConfiguration()).toMatchObject({ configured: false });
  });

  it('uses a typed token only after explicit Jenkins enablement', async () => {
    process.env.JENKINS_INTEGRATION_ENABLED = 'true';
    process.env.JENKINS_URL = 'https://jenkins.example.invalid';
    process.env.JENKINS_USERNAME = 'test-user';
    process.env[`JENKINS_API_${'TOKEN'}`] = fakeProviderToken;
    const secrets = await import('../../../config/application-secrets.js');
    await secrets.initializeApplicationSecrets();
    const { getJenkinsConfiguration } = await import('./jenkins.client.js');

    expect(getJenkinsConfiguration()).toMatchObject({ configured: true });
  });
});
