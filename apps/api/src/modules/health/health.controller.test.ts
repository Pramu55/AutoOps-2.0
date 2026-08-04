import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@autoops/database', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue(1) },
}));

vi.mock('../../lib/redis.js', () => ({
  redis: { ping: vi.fn().mockResolvedValue('PONG') },
}));

const fakeAccess = 'test-secret-value-not-real-access-0123456789';
const fakeRefresh = 'test-secret-value-not-real-refresh-0123456789';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.SECRET_PROVIDER_MODE = 'env';
  process.env[`JWT_${'SECRET'}`] = fakeAccess;
  process.env[`JWT_REFRESH_${'SECRET'}`] = fakeRefresh;
  process.env.GITHUB_ACTIONS_ENABLED = 'false';
  process.env.JENKINS_INTEGRATION_ENABLED = 'false';
  process.env[`JENKINS_API_${'TOKEN'}`] = '';
  vi.resetModules();
});

describe('secret-provider readiness', () => {
  it('keeps the existing ready success response and exposes only safe aggregate metadata', async () => {
    const secrets = await import('../../config/application-secrets.js');
    await secrets.initializeApplicationSecrets();
    const { HealthController } = await import('./health.controller.js');
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await new HealthController().ready({} as never, response as never);

    expect(response.status).toHaveBeenCalledWith(200);
    const payload = response.json.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      status: 'ready',
      secretProvider: {
        mode: 'env',
        status: 'READY',
      },
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(fakeAccess);
    expect(serialized).not.toContain(fakeRefresh);
    expect(serialized).not.toContain('JWT_SECRET');
    expect(serialized).not.toContain('auth.jwtAccess');
    expect(serialized).not.toContain('jwt-access');
    expect(serialized).not.toContain('/run/secrets');
  });
});
