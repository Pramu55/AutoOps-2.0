import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeAccess = 'test-secret-value-not-real-access-0123456789';
const fakeRefresh = 'test-secret-value-not-real-refresh-0123456789';
const original = {
  NODE_ENV: process.env.NODE_ENV,
  GITHUB_ACTIONS_ENABLED: process.env.GITHUB_ACTIONS_ENABLED,
  githubActionsToken: process.env[`GITHUB_ACTIONS_${'TOKEN'}`],
  JENKINS_INTEGRATION_ENABLED: process.env.JENKINS_INTEGRATION_ENABLED,
  jenkinsApiToken: process.env[`JENKINS_API_${'TOKEN'}`],
  jwtAccessSecret: process.env[`JWT_${'SECRET'}`],
  jwtRefreshSecret: process.env[`JWT_REFRESH_${'SECRET'}`],
  SECRET_PROVIDER_MODE: process.env.SECRET_PROVIDER_MODE,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
};

function restore(name: keyof typeof original): void {
  const value = original[name];
  const target =
    name === 'githubActionsToken'
      ? `GITHUB_ACTIONS_${'TOKEN'}`
      : name === 'jenkinsApiToken'
        ? `JENKINS_API_${'TOKEN'}`
        : name === 'jwtAccessSecret'
          ? `JWT_${'SECRET'}`
          : name === 'jwtRefreshSecret'
            ? `JWT_REFRESH_${'SECRET'}`
            : name;
  if (value === undefined) delete process.env[target];
  else process.env[target] = value;
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.SECRET_PROVIDER_MODE = 'env';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env[`JWT_${'SECRET'}`] = fakeAccess;
  process.env[`JWT_REFRESH_${'SECRET'}`] = fakeRefresh;
  process.env.GITHUB_ACTIONS_ENABLED = 'false';
  delete process.env[`GITHUB_ACTIONS_${'TOKEN'}`];
  process.env.JENKINS_INTEGRATION_ENABLED = 'false';
  process.env[`JENKINS_API_${'TOKEN'}`] = '';
  vi.resetModules();
});

afterEach(() => {
  for (const name of Object.keys(original) as Array<keyof typeof original>) restore(name);
});

describe('application secret bootstrap', () => {
  it('keeps JWT access and refresh secrets distinct in environment mode', async () => {
    const secrets = await import('./application-secrets.js');
    await secrets.initializeApplicationSecrets();
    expect(secrets.getJwtSecret('access').revealForUse()).not.toBe(
      secrets.getJwtSecret('refresh').revealForUse(),
    );
  });

  it('requires a GitHub token only when GitHub Actions is enabled', async () => {
    process.env.GITHUB_ACTIONS_ENABLED = 'true';
    vi.resetModules();
    const secrets = await import('./application-secrets.js');
    await expect(secrets.initializeApplicationSecrets()).rejects.toMatchObject({
      code: 'SECRET_REQUIRED_MISSING',
      secretId: 'githubActions.token',
    });
  });

  it('accepts disabled Jenkins with an empty token and exposes only sanitized readiness metadata', async () => {
    const secrets = await import('./application-secrets.js');
    await secrets.initializeApplicationSecrets();
    expect(secrets.getJenkinsApiToken()).toBeNull();
    const readiness = JSON.stringify(secrets.getSecretProviderReadiness());
    expect(readiness).not.toContain(fakeAccess);
    expect(readiness).not.toContain('JWT_SECRET');
    expect(readiness).not.toContain('/run/secrets');
  });

  it('requires a Jenkins token only when Jenkins is explicitly enabled', async () => {
    process.env.JENKINS_INTEGRATION_ENABLED = 'true';
    vi.resetModules();
    const secrets = await import('./application-secrets.js');
    await expect(secrets.initializeApplicationSecrets()).rejects.toMatchObject({
      code: 'SECRET_EMPTY',
      secretId: 'jenkins.apiToken',
    });
  });

  it('rejects repeated initialization and permits reset only in tests', async () => {
    const secrets = await import('./application-secrets.js');
    await secrets.initializeApplicationSecrets();
    await expect(secrets.initializeApplicationSecrets()).rejects.toThrow(
      'already been initialized',
    );
    expect(() => secrets.resetApplicationSecretsForTests()).not.toThrow();
  });

  it('fails required-secret initialization before a listener action can run', async () => {
    delete process.env[`JWT_${'SECRET'}`];
    vi.resetModules();
    const secrets = await import('./application-secrets.js');
    let listenerStarted = false;
    const bootstrap = async (): Promise<void> => {
      await secrets.initializeApplicationSecrets();
      listenerStarted = true;
    };

    await expect(bootstrap()).rejects.toMatchObject({ code: 'SECRET_REQUIRED_MISSING' });
    expect(listenerStarted).toBe(false);
  });
});
