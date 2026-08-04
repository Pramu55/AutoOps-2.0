import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSecretProvider,
  getSecretDescriptor,
  redactSecrets,
  SECRET_DESCRIPTORS,
  SecretProviderError,
  type SecretDescriptor,
} from '@autoops/utils';

const FAKE_SECRET = 'test-secret-value-not-real';
const cleanup: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'autoops-secret-provider-'));
  cleanup.push(directory);
  return directory;
}

async function createDirectoryLink(target: string, link: string): Promise<void> {
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('typed SecretProvider', () => {
  it('resolves required values from the environment provider', async () => {
    const provider = createSecretProvider({
      mode: 'env',
      environment: { JWT_SECRET: FAKE_SECRET },
    });
    const value = await provider.resolve(getSecretDescriptor('auth.jwtAccess'));
    expect(value?.revealForUse()).toBe(FAKE_SECRET);
  });

  it('reports missing required environment values safely', async () => {
    const provider = createSecretProvider({ mode: 'env', environment: {} });
    await expect(provider.resolve(getSecretDescriptor('auth.jwtAccess'))).rejects.toMatchObject({
      code: 'SECRET_REQUIRED_MISSING',
      secretId: 'auth.jwtAccess',
    } satisfies Partial<SecretProviderError>);
  });

  it('returns optional environment absence safely', async () => {
    const provider = createSecretProvider({ mode: 'env', environment: {} });
    await expect(provider.resolve(getSecretDescriptor('githubActions.token'))).resolves.toBeNull();
  });

  it('resolves a mounted file and strips one trailing newline', async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, 'jwt-access'), `${FAKE_SECRET}\n`, 'utf8');
    const provider = createSecretProvider({ mode: 'file', fileRoot: root });
    await expect(provider.resolve(getSecretDescriptor('auth.jwtAccess'))).resolves.toMatchObject(
      {},
    );
    const value = await provider.resolve(getSecretDescriptor('auth.jwtAccess'));
    expect(value?.revealForUse()).toBe(FAKE_SECRET);
  });

  it('rejects a missing required mounted file and accepts optional absence', async () => {
    const root = await temporaryDirectory();
    const provider = createSecretProvider({ mode: 'file', fileRoot: root });
    await expect(provider.resolve(getSecretDescriptor('auth.jwtAccess'))).rejects.toMatchObject({
      code: 'SECRET_REQUIRED_MISSING',
    } satisfies Partial<SecretProviderError>);
    await expect(provider.resolve(getSecretDescriptor('githubActions.token'))).resolves.toBeNull();
  });

  it('rejects empty and NUL-containing required file content', async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, 'jwt-access'), '', 'utf8');
    const provider = createSecretProvider({ mode: 'file', fileRoot: root });
    await expect(provider.resolve(getSecretDescriptor('auth.jwtAccess'))).rejects.toMatchObject({
      code: 'SECRET_EMPTY',
    } satisfies Partial<SecretProviderError>);

    await writeFile(path.join(root, 'jwt-access'), `${FAKE_SECRET}\0`, 'utf8');
    await expect(provider.resolve(getSecretDescriptor('auth.jwtAccess'))).rejects.toMatchObject({
      code: 'SECRET_FILE_READ_FAILED',
    } satisfies Partial<SecretProviderError>);
  });

  it('prevents caller-supplied path traversal and never falls back to env in file mode', async () => {
    const root = await temporaryDirectory();
    const provider = createSecretProvider({
      mode: 'file',
      fileRoot: root,
      environment: { JWT_SECRET: FAKE_SECRET },
    });
    const unsafe = {
      ...getSecretDescriptor('auth.jwtAccess'),
      fileName: '../outside',
    } as SecretDescriptor;
    await expect(provider.resolve(unsafe)).rejects.toMatchObject({
      code: 'SECRET_RESOLUTION_FAILED',
    });
    await expect(provider.resolve(getSecretDescriptor('auth.jwtAccess'))).rejects.toMatchObject({
      code: 'SECRET_REQUIRED_MISSING',
    });
  });

  it('uses an immutable closed descriptor registry and rejects non-file targets', async () => {
    expect(Object.isFrozen(SECRET_DESCRIPTORS)).toBe(true);
    expect(Object.isFrozen(getSecretDescriptor('auth.jwtAccess'))).toBe(true);
    const root = await temporaryDirectory();
    await mkdir(path.join(root, 'jwt-access'));
    const provider = createSecretProvider({ mode: 'file', fileRoot: root });
    await expect(provider.resolve(getSecretDescriptor('auth.jwtAccess'))).rejects.toMatchObject({
      code: 'SECRET_FILE_INVALID_TYPE',
    });
  });

  it('blocks an escape symlink or junction outside the mounted-secret root', async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await createDirectoryLink(outside, path.join(root, 'jwt-access'));
    const provider = createSecretProvider({ mode: 'file', fileRoot: root });
    await expect(provider.resolve(getSecretDescriptor('auth.jwtAccess'))).rejects.toMatchObject({
      code: 'SECRET_FILE_OUTSIDE_ROOT',
    });
  });

  it('accepts an internal projected-volume symlink or junction root', async () => {
    const containerRoot = await temporaryDirectory();
    const projectedRoot = path.join(containerRoot, 'projected');
    const mountedRoot = path.join(containerRoot, 'mounted');
    await mkdir(projectedRoot);
    await writeFile(path.join(projectedRoot, 'jwt-access'), FAKE_SECRET, 'utf8');
    await createDirectoryLink(projectedRoot, mountedRoot);

    const provider = createSecretProvider({ mode: 'file', fileRoot: mountedRoot });
    const resolved = await provider.resolve(getSecretDescriptor('auth.jwtAccess'));
    expect(resolved?.revealForUse()).toBe(FAKE_SECRET);
  });

  it('fails closed for an invalid provider mode', () => {
    expect(() => createSecretProvider({ mode: 'unsupported' })).toThrow(
      expect.objectContaining({ code: 'SECRET_PROVIDER_MODE_INVALID' }),
    );
  });

  it('reports only sanitized production environment-mode readiness', async () => {
    const provider = createSecretProvider({
      mode: 'env',
      production: true,
      environment: { JWT_SECRET: FAKE_SECRET },
    });
    await provider.resolve(getSecretDescriptor('auth.jwtAccess'));
    const readiness = JSON.stringify(provider.readiness());
    expect(readiness).toContain('DEGRADED_LEGACY_ENV_MODE');
    expect(readiness).not.toContain(FAKE_SECRET);
    expect(readiness).not.toContain('jwt-access');
    expect(readiness).not.toContain('JWT_SECRET');
  });

  it('keeps provider errors and structured Error logging free of values and paths', async () => {
    const root = await temporaryDirectory();
    const provider = createSecretProvider({ mode: 'file', fileRoot: root });
    let captured: unknown;
    try {
      await provider.resolve(getSecretDescriptor('auth.jwtAccess'));
    } catch (error) {
      captured = error;
    }
    const serialized = JSON.stringify({ error: captured, nested: new Error(FAKE_SECRET) });
    expect(serialized).not.toContain(FAKE_SECRET);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('jwt-access');
  });

  it('redacts SecretValue strings, JSON, inspection, nested structures, errors, URLs, and headers', async () => {
    const provider = createSecretProvider({
      mode: 'env',
      environment: { JWT_SECRET: FAKE_SECRET },
    });
    const secret = await provider.resolve(getSecretDescriptor('auth.jwtAccess'));
    expect(String(secret)).toBe('[REDACTED]');
    expect(JSON.stringify(secret)).toBe('"[REDACTED]"');
    expect(inspect(secret)).toContain('[REDACTED]');
    expect(Object.keys(secret ?? {})).toEqual([]);
    expect({ ...(secret ?? {}) }).toEqual({});

    const redacted = redactSecrets({
      nested: [secret, new Error(FAKE_SECRET, { cause: new Error(FAKE_SECRET) })],
      headers: { Authorization: `Bearer ${FAKE_SECRET}` },
      target: new URL(`https://user:${FAKE_SECRET}@example.invalid/resource`),
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain(FAKE_SECRET);
    expect(serialized).toContain('[REDACTED]');
  });
});
