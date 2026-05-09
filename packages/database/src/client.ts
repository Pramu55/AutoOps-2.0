import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __autoopsPrisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. Hot reloads in dev shouldn't multiply pools.
 * In production, instantiate once per process.
 */
export const prisma: PrismaClient =
  globalThis.__autoopsPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'production'
        ? [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__autoopsPrisma = prisma;
}

export type { PrismaClient } from '@prisma/client';
