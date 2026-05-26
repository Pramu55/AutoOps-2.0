-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('AUTOOPS', 'JENKINS', 'DOCKER', 'KUBERNETES', 'AWS', 'GITHUB_ACTIONS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SignalSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('DEPLOYMENT_CREATED', 'DEPLOYMENT_STATUS_CHANGED', 'OPERATION_CREATED', 'OPERATION_STATUS_CHANGED', 'APPROVAL_REQUIRED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'PROVIDER_CONNECTED', 'PROVIDER_UNREACHABLE', 'PROVIDER_AUTH_FAILED', 'RESOURCE_DISCOVERED', 'RESOURCE_CHANGED', 'RESOURCE_STALE', 'RESOURCE_ARCHIVED', 'KUBERNETES_POD_PHASE_CHANGED', 'KUBERNETES_RESTART_COUNT_CHANGED', 'DOCKER_CONTAINER_STATE_CHANGED', 'JENKINS_BUILD_STARTED', 'JENKINS_BUILD_SUCCEEDED', 'JENKINS_BUILD_FAILED', 'AWS_GUARDRAIL_BLOCKED', 'AWS_PLAN_READY', 'AWS_APPLY_BLOCKED', 'SECURITY_POLICY_BLOCKED', 'SYSTEM_HEALTH_CHANGED');

-- CreateTable
CREATE TABLE "resource_signals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "resourceNodeId" UUID,
    "operationId" UUID,
    "deploymentId" UUID,
    "projectId" UUID,
    "environmentId" UUID,
    "source" "SignalSource" NOT NULL,
    "type" "SignalType" NOT NULL,
    "severity" "SignalSeverity" NOT NULL DEFAULT 'INFO',
    "status" "SignalStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "labels" JSONB,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resource_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_signals_organizationId_idx" ON "resource_signals"("organizationId");
CREATE INDEX "resource_signals_organizationId_observedAt_idx" ON "resource_signals"("organizationId", "observedAt");
CREATE INDEX "resource_signals_organizationId_severity_idx" ON "resource_signals"("organizationId", "severity");
CREATE INDEX "resource_signals_organizationId_source_idx" ON "resource_signals"("organizationId", "source");
CREATE INDEX "resource_signals_organizationId_type_idx" ON "resource_signals"("organizationId", "type");
CREATE INDEX "resource_signals_organizationId_status_idx" ON "resource_signals"("organizationId", "status");
CREATE INDEX "resource_signals_organizationId_resourceNodeId_idx" ON "resource_signals"("organizationId", "resourceNodeId");
CREATE INDEX "resource_signals_organizationId_operationId_idx" ON "resource_signals"("organizationId", "operationId");
CREATE INDEX "resource_signals_organizationId_deploymentId_idx" ON "resource_signals"("organizationId", "deploymentId");
CREATE INDEX "resource_signals_organizationId_projectId_idx" ON "resource_signals"("organizationId", "projectId");
CREATE INDEX "resource_signals_organizationId_environmentId_idx" ON "resource_signals"("organizationId", "environmentId");
CREATE INDEX "resource_signals_organizationId_archivedAt_idx" ON "resource_signals"("organizationId", "archivedAt");
CREATE UNIQUE INDEX "resource_signals_organizationId_fingerprint_key" ON "resource_signals"("organizationId", "fingerprint");

-- AddForeignKey
ALTER TABLE "resource_signals" ADD CONSTRAINT "resource_signals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_signals" ADD CONSTRAINT "resource_signals_resourceNodeId_fkey" FOREIGN KEY ("resourceNodeId") REFERENCES "resource_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
