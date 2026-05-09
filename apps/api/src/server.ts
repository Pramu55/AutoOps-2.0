import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectRedis } from './lib/redis.js';
import { prisma } from '@autoops/database';
import { createSocketServer } from './realtime/socket.js';

async function bootstrap(): Promise<void> {
  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  // Make the io instance available to services if needed.
  app.set('io', io);

  await prisma.$connect();

  httpServer.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(
      { host: env.API_HOST, port: env.API_PORT, env: env.NODE_ENV },
      `[api] listening on http://${env.API_HOST}:${env.API_PORT}`,
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, '[api] shutdown initiated');
    httpServer.close(() => logger.info('[api] http closed'));
    io.close();
    try {
      await prisma.$disconnect();
      await disconnectRedis();
    } catch (err) {
      logger.error({ err }, '[api] error during shutdown');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, '[api] uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, '[api] unhandled rejection');
    process.exit(1);
  });
}

void bootstrap();
