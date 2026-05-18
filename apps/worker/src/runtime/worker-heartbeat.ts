import os from 'node:os';
import { prisma as db, WorkerHeartbeatStatus, type Prisma } from '@autoops/database';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const HEARTBEAT_INTERVAL_MS = 10_000;

type WorkerHeartbeatOptions = {
  queues: string[];
  service?: string;
  version?: string | null;
};

export class WorkerHeartbeatRegistry {
  private readonly workerId: string;
  private readonly hostname = os.hostname();
  private readonly processId = process.pid;
  private readonly service: string;
  private readonly version: string | null;
  private readonly queues: string[];
  private readonly startedAt = new Date();
  private intervalId: NodeJS.Timeout | null = null;

  constructor(options: WorkerHeartbeatOptions) {
    this.service = options.service ?? 'autoops-worker';
    this.version = options.version ?? null;
    this.queues = [...new Set(options.queues)].sort();
    this.workerId = `${this.service}:${this.hostname}:${this.processId}:${this.startedAt.toISOString()}`;
  }

  async start(): Promise<void> {
    await this.writeHeartbeat(WorkerHeartbeatStatus.RUNNING);
    this.intervalId = setInterval(() => {
      void this.writeHeartbeat(WorkerHeartbeatStatus.RUNNING);
    }, HEARTBEAT_INTERVAL_MS);
    this.intervalId.unref?.();
  }

  async markStopping(): Promise<void> {
    this.stopInterval();
    await this.writeHeartbeat(WorkerHeartbeatStatus.STOPPING);
  }

  async markStopped(): Promise<void> {
    this.stopInterval();
    await this.writeHeartbeat(WorkerHeartbeatStatus.STOPPED);
  }

  private stopInterval(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private async writeHeartbeat(status: WorkerHeartbeatStatus): Promise<void> {
    const now = new Date();
    const metadata: Prisma.InputJsonObject = {
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    };

    try {
      await db.workerHeartbeat.upsert({
        where: {
          workerId: this.workerId,
        },
        create: {
          workerId: this.workerId,
          hostname: this.hostname,
          processId: this.processId,
          service: this.service,
          version: this.version,
          environment: env.NODE_ENV,
          queues: this.queues,
          status,
          startedAt: this.startedAt,
          lastSeenAt: now,
          metadata,
        },
        update: {
          hostname: this.hostname,
          processId: this.processId,
          service: this.service,
          version: this.version,
          environment: env.NODE_ENV,
          queues: this.queues,
          status,
          lastSeenAt: now,
          metadata,
        },
      });
    } catch (error) {
      logger.warn({ err: error, status }, 'Worker heartbeat write failed safely');
    }
  }
}

export function createWorkerHeartbeatRegistry(
  options: WorkerHeartbeatOptions,
): WorkerHeartbeatRegistry {
  return new WorkerHeartbeatRegistry(options);
}
