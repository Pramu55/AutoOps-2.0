import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

export interface RedisClients {
  client: Redis;
  publisher: Redis;
  subscriber: Redis;
}

let clients: RedisClients | null = null;

const buildClient = (label: string): Redis => {
  const r = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ requires this
    enableReadyCheck: true,
    lazyConnect: false,
  });
  r.on('error', (err) => logger.error({ err, label }, 'redis error'));
  r.on('connect', () => logger.info({ label }, 'redis connected'));
  r.on('reconnecting', () => logger.warn({ label }, 'redis reconnecting'));
  return r;
};

export function getRedis(): RedisClients {
  if (!clients) {
    clients = {
      client: buildClient('redis:client'),
      publisher: buildClient('redis:pub'),
      subscriber: buildClient('redis:sub'),
    };
  }
  return clients;
}

export async function disconnectRedis(): Promise<void> {
  if (!clients) return;
  await Promise.all([
    clients.client.quit().catch(() => undefined),
    clients.publisher.quit().catch(() => undefined),
    clients.subscriber.quit().catch(() => undefined),
  ]);
  clients = null;
}
