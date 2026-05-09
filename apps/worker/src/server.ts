import 'dotenv/config';
import { db } from '@autoops/database';
import { logger } from './lib/logger.js';
import { closeRedis } from './lib/redis.js';
import { createDeploymentsWorker } from './queues/deployments.queue.js';
import { createHealthServer } from './http/health.js';
import type { Worker } from 'bullmq';
import type http from 'node:http';

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('AutoOps Worker starting…');

  // Validate DB connection
  await db.$connect();
  logger.info('Database connected');

  // Start BullMQ workers
  const workers: Worker[] = [
    createDeploymentsWorker(),
    // Phase 2: createBuildsWorker()
    // Phase 4: createAIWorker()
  ];
  logger.info(`Started ${workers.length} queue worker(s)`);

  // Start health/metrics HTTP server
  const healthServer: http.Server = createHealthServer();

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received — draining workers…');

    // Close all BullMQ workers (wait for in-flight jobs)
    await Promise.all(workers.map((w) => w.close()));
    logger.info('BullMQ workers closed');

    // Close health server
    await new Promise<void>((resolve, reject) =>
      healthServer.close((err) => (err ? reject(err) : resolve())),
    );

    // Close Redis + DB
    await closeRedis();
    await db.$disconnect();

    logger.info('Worker shut down cleanly');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });

  logger.info('AutoOps Worker ready');
}

main().catch((err) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
