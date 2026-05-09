import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { RealtimeEvent } from '@autoops/types';
import { redisPublisher, redisSubscriber } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { verifyToken } from '../lib/jwt.js';
import { env } from '../config/env.js';
import { wsConnections } from '../lib/metrics.js';

export type AutoOpsSocketServer = IOServer;

export function createSocketServer(httpServer: HttpServer): AutoOpsSocketServer {
  const io = new IOServer(httpServer, {
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  io.adapter(createAdapter(redisPublisher, redisSubscriber));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (typeof token !== 'string') {
      return next(new Error('Missing auth token'));
    }
    try {
      const payload = verifyToken('access', token);
      socket.data.userId = payload.sub;
      socket.data.orgId = payload.orgId;
      next();
    } catch {
      next(new Error('Invalid auth token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    wsConnections.inc();
    logger.info({ sid: socket.id, userId: socket.data.userId }, '[ws] connected');

    if (socket.data.userId) {
      socket.join(`user:${socket.data.userId}`);
    }
    if (socket.data.orgId) {
      socket.join(`org:${socket.data.orgId}`);
    }

    socket.on('subscribe', (room: string) => {
      if (typeof room === 'string' && /^[\w:-]{1,128}$/.test(room)) {
        socket.join(room);
      }
    });

    socket.on('unsubscribe', (room: string) => {
      if (typeof room === 'string') socket.leave(room);
    });

    socket.on('disconnect', (reason) => {
      wsConnections.dec();
      logger.info({ sid: socket.id, reason }, '[ws] disconnected');
    });
  });

  return io;
}

/**
 * Fire-and-forget broadcast helper used by service-layer code.
 *   broadcast(io, `project:${projectId}`, { type: 'deployment.status', ... })
 */
export function broadcast(io: AutoOpsSocketServer, room: string, event: RealtimeEvent): void {
  io.to(room).emit('event', event);
}
