import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeToken = 'test-secret-value-not-real-worker-jenkins-token';
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'autoops-worker-secret-provider-'));
  temporaryDirectories.push(directory);
  return directory;
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JENKINS_URL = 'https://jenkins.example.invalid';
  process.env.JENKINS_USERNAME = 'test-user';
  process.env.SECRET_PROVIDER_MODE = 'env';
  process.env.JENKINS_INTEGRATION_ENABLED = 'false';
  delete process.env[`JENKINS_API_${'TOKEN'}`];
  vi.resetModules();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('worker Jenkins secret bootstrap', () => {
  it(
    'resolves an enabled Jenkins token in environment mode through the typed provider',
    async () => {
      process.env.JENKINS_INTEGRATION_ENABLED = 'true';
      process.env[`JENKINS_API_${'TOKEN'}`] = fakeToken;
      const secrets = await import('./application-secrets.js');
      await secrets.initializeWorkerSecrets();

      expect(secrets.getWorkerJenkinsApiToken()?.revealForUse()).toBe(fakeToken);
      const { getWorkerJenkinsConfiguration } = await import('../queues/operations.queue.js');
      const configuration = getWorkerJenkinsConfiguration();
      expect(configuration?.token.revealForUse()).toBe(fakeToken);
      expect(
        JSON.stringify({ configuration, job: { operationId: 'operation-test-id' } }),
      ).not.toContain(fakeToken);
    },
    15_000,
  );

  it('resolves an enabled Jenkins token from a mounted file without an environment token', async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, 'jenkins-api-token'), `${fakeToken}\n`, 'utf8');
    process.env.JENKINS_INTEGRATION_ENABLED = 'true';
    process.env.SECRET_PROVIDER_MODE = 'file';
    process.env.SECRET_PROVIDER_ROOT = root;
    delete process.env[`JENKINS_API_${'TOKEN'}`];
    vi.resetModules();
    const secrets = await import('./application-secrets.js');
    await secrets.initializeWorkerSecrets();

    expect(secrets.getWorkerJenkinsApiToken()?.revealForUse()).toBe(fakeToken);
    const { getWorkerJenkinsConfiguration } = await import('../queues/operations.queue.js');
    expect(getWorkerJenkinsConfiguration()?.token.revealForUse()).toBe(fakeToken);
  });

  it('ignores a stale Jenkins environment token while the integration is disabled', async () => {
    process.env[`JENKINS_API_${'TOKEN'}`] = fakeToken;
    const secrets = await import('./application-secrets.js');
    await secrets.initializeWorkerSecrets();

    expect(secrets.getWorkerJenkinsApiToken()).toBeNull();
    const { getWorkerJenkinsConfiguration } = await import('../queues/operations.queue.js');
    expect(getWorkerJenkinsConfiguration()).toBeNull();
  });

  it('fails before worker processing when enabled Jenkins has no token', async () => {
    process.env.JENKINS_INTEGRATION_ENABLED = 'true';
    delete process.env[`JENKINS_API_${'TOKEN'}`];
    vi.resetModules();
    const secrets = await import('./application-secrets.js');

    await expect(secrets.initializeWorkerSecrets()).rejects.toMatchObject({
      code: 'SECRET_REQUIRED_MISSING',
      secretId: 'jenkins.apiToken',
    });
  });
});
