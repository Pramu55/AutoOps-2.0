import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://autoops:autoops_dev@localhost:5432/autoops';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env[`JWT_${'SECRET'}`] = 'test-access-secret-at-least-32-characters';
process.env[`JWT_REFRESH_${'SECRET'}`] = 'test-refresh-secret-at-least-32-characters';

const { parseEnv } = await import('./env.js');

const strongAccessSecret = 'prod-access-secret-with-strong-random-value-12345';
const strongRefreshSecret = 'prod-refresh-secret-with-strong-random-value-67890';

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    STRICT_ENV_VALIDATION: 'true',
    API_PUBLIC_URL: 'https://api.example.invalid',
    CORS_ORIGINS: 'https://app.example.invalid',
    DATABASE_URL: 'postgresql://autoops:strong-password@postgres:5432/autoops',
    REDIS_URL: 'redis://redis:6379',
    JWT_SECRET: strongAccessSecret,
    JWT_REFRESH_SECRET: strongRefreshSecret,
    ...overrides,
  };
}

function expectEnvError(input: NodeJS.ProcessEnv, field: string, message: string): void {
  try {
    parseEnv(input);
  } catch (error) {
    const issues = error && typeof error === 'object' && 'issues' in error ? error.issues : [];
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: [field],
          message: expect.stringContaining(message),
        }),
      ]),
    );
    return;
  }
  throw new Error(`Expected ${field} validation to fail`);
}

describe('environment validation', () => {
  it('development defaults still work where intended', () => {
    const parsed = parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://autoops:autoops_dev@localhost:5432/autoops',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'local-placeholder-access-secret-32-chars',
      JWT_REFRESH_SECRET: 'local-placeholder-refresh-secret-32-chars',
    });

    expect(parsed.API_PUBLIC_URL).toBe('http://localhost:4000');
    expect(parsed.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(parsed.STRICT_ENV_VALIDATION).toBe(false);
  });

  it('production rejects missing STRICT_ENV_VALIDATION', () => {
    expectEnvError(
      baseEnv({ STRICT_ENV_VALIDATION: undefined }),
      'STRICT_ENV_VALIDATION',
      'must be true',
    );
  });

  it('production rejects STRICT_ENV_VALIDATION=false', () => {
    expectEnvError(
      baseEnv({ STRICT_ENV_VALIDATION: 'false' }),
      'STRICT_ENV_VALIDATION',
      'must be true',
    );
  });

  it('production rejects default localhost API_PUBLIC_URL', () => {
    expectEnvError(
      baseEnv({ API_PUBLIC_URL: 'http://localhost:4000' }),
      'API_PUBLIC_URL',
      'must use https',
    );
    expectEnvError(
      baseEnv({ API_PUBLIC_URL: 'http://localhost:4000' }),
      'API_PUBLIC_URL',
      'public hostname',
    );
  });

  it('production rejects http public API URL', () => {
    expectEnvError(
      baseEnv({ API_PUBLIC_URL: 'http://api.example.invalid' }),
      'API_PUBLIC_URL',
      'must use https',
    );
  });

  it('production accepts a valid https API_PUBLIC_URL', () => {
    expect(parseEnv(baseEnv()).API_PUBLIC_URL).toBe('https://api.example.invalid');
  });

  it('production rejects an empty CORS list', () => {
    expectEnvError(baseEnv({ CORS_ORIGINS: ' , ' }), 'CORS_ORIGINS', 'at least one origin');
  });

  it('production rejects wildcard CORS', () => {
    expectEnvError(baseEnv({ CORS_ORIGINS: '*' }), 'CORS_ORIGINS', 'wildcard');
  });

  it('production rejects localhost/loopback CORS', () => {
    expectEnvError(
      baseEnv({ CORS_ORIGINS: 'https://localhost' }),
      'CORS_ORIGINS',
      'public hostname',
    );
    expectEnvError(
      baseEnv({ CORS_ORIGINS: 'https://127.0.0.1' }),
      'CORS_ORIGINS',
      'public hostname',
    );
  });

  it('production rejects localhost subdomains for public URL and CORS', () => {
    expectEnvError(
      baseEnv({ API_PUBLIC_URL: 'https://app.localhost' }),
      'API_PUBLIC_URL',
      'public hostname',
    );
    expectEnvError(
      baseEnv({ CORS_ORIGINS: 'https://app.localhost' }),
      'CORS_ORIGINS',
      'public hostname',
    );
  });

  it('production rejects loopback and internal IPv6 hosts for public URL and CORS', () => {
    for (const url of ['https://[::1]', 'https://[fc00::1]', 'https://[fe80::1]']) {
      expectEnvError(baseEnv({ API_PUBLIC_URL: url }), 'API_PUBLIC_URL', 'public hostname');
      expectEnvError(baseEnv({ CORS_ORIGINS: url }), 'CORS_ORIGINS', 'public hostname');
    }
  });

  it('production rejects practical IPv4-mapped private IPv6 hosts', () => {
    expectEnvError(
      baseEnv({ API_PUBLIC_URL: 'https://[::ffff:127.0.0.1]' }),
      'API_PUBLIC_URL',
      'public hostname',
    );
    expectEnvError(
      baseEnv({ CORS_ORIGINS: 'https://[::ffff:c0a8:1]' }),
      'CORS_ORIGINS',
      'public hostname',
    );
  });

  it('production accepts a valid public IPv6 HTTPS URL and origin', () => {
    const parsed = parseEnv(
      baseEnv({
        API_PUBLIC_URL: 'https://[2001:4860:4860::8888]',
        CORS_ORIGINS: 'https://[2001:4860:4860::8844]',
      }),
    );

    expect(parsed.API_PUBLIC_URL).toBe('https://[2001:4860:4860::8888]');
    expect(parsed.CORS_ORIGINS).toEqual(['https://[2001:4860:4860::8844]']);
  });

  it('production rejects origins with paths', () => {
    expectEnvError(
      baseEnv({ CORS_ORIGINS: 'https://app.example.invalid/dashboard' }),
      'CORS_ORIGINS',
      'origins only',
    );
  });

  it('production accepts one valid HTTPS origin', () => {
    expect(parseEnv(baseEnv({ CORS_ORIGINS: 'https://app.example.invalid' })).CORS_ORIGINS).toEqual(
      ['https://app.example.invalid'],
    );
  });

  it('production accepts multiple valid HTTPS origins', () => {
    expect(
      parseEnv(
        baseEnv({ CORS_ORIGINS: 'https://app.example.invalid, https://admin.example.invalid' }),
      ).CORS_ORIGINS,
    ).toEqual(['https://app.example.invalid', 'https://admin.example.invalid']);
  });

  it('production rejects placeholder JWT secrets', () => {
    expectEnvError(
      baseEnv({ JWT_SECRET: 'replace-me-access-secret-with-32-chars' }),
      'JWT_SECRET',
      'non-placeholder',
    );
  });

  it('production rejects identical JWT access and refresh secrets', () => {
    expectEnvError(
      baseEnv({
        JWT_SECRET: strongAccessSecret,
        JWT_REFRESH_SECRET: strongAccessSecret,
      }),
      'JWT_REFRESH_SECRET',
      'different from JWT_SECRET',
    );
  });
});
