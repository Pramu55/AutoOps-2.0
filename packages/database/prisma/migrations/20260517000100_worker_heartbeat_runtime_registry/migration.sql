-- Add worker heartbeat runtime registry for first-class worker observability.
CREATE TYPE "WorkerHeartbeatStatus" AS ENUM ('RUNNING', 'STOPPING', 'STOPPED', 'ERROR');

CREATE TABLE "worker_heartbeats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workerId" TEXT NOT NULL,
    "hostname" TEXT,
    "processId" INTEGER,
    "service" TEXT NOT NULL,
    "version" TEXT,
    "environment" TEXT,
    "queues" JSONB NOT NULL,
    "status" "WorkerHeartbeatStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_heartbeats_workerId_key" ON "worker_heartbeats"("workerId");
CREATE INDEX "worker_heartbeats_status_lastSeenAt_idx" ON "worker_heartbeats"("status", "lastSeenAt");
CREATE INDEX "worker_heartbeats_service_idx" ON "worker_heartbeats"("service");
