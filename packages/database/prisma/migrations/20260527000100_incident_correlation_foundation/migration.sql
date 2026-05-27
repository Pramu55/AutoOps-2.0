-- CreateEnum
CREATE TYPE "IncidentSource" AS ENUM ('SIGNAL_CORRELATION', 'MANUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "IncidentSignalRole" AS ENUM ('TRIGGER', 'RELATED', 'EVIDENCE');

-- AlterEnum
CREATE TYPE "IncidentSeverity_new" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');
ALTER TABLE "incidents" ALTER COLUMN "severity" DROP DEFAULT;
ALTER TABLE "incidents" ALTER COLUMN "severity" TYPE "IncidentSeverity_new" USING (
  CASE 
    WHEN "severity"::text = 'HIGH' THEN 'ERROR'::"IncidentSeverity_new"
    WHEN "severity"::text = 'MEDIUM' THEN 'WARNING'::"IncidentSeverity_new"
    WHEN "severity"::text = 'LOW' THEN 'INFO'::"IncidentSeverity_new"
    ELSE "severity"::text::"IncidentSeverity_new"
  END
);
ALTER TYPE "IncidentSeverity" RENAME TO "IncidentSeverity_old";
ALTER TYPE "IncidentSeverity_new" RENAME TO "IncidentSeverity";
DROP TYPE "IncidentSeverity_old";
ALTER TABLE "incidents" ALTER COLUMN "severity" SET DEFAULT 'ERROR';


-- AlterEnum
CREATE TYPE "IncidentStatus_new" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ARCHIVED');
ALTER TABLE "incidents" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "incidents" ALTER COLUMN "status" TYPE "IncidentStatus_new" USING (
  CASE 
    WHEN "status"::text = 'MITIGATED' THEN 'ACKNOWLEDGED'::"IncidentStatus_new"
    WHEN "status"::text = 'CLOSED' THEN 'ARCHIVED'::"IncidentStatus_new"
    ELSE "status"::text::"IncidentStatus_new"
  END
);
ALTER TYPE "IncidentStatus" RENAME TO "IncidentStatus_old";
ALTER TYPE "IncidentStatus_new" RENAME TO "IncidentStatus";
DROP TYPE "IncidentStatus_old";
ALTER TABLE "incidents" ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- DropForeignKey
ALTER TABLE "incident_events" DROP CONSTRAINT "incident_events_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_projectId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "incidents_operationId_idx";

-- DropIndex
DROP INDEX IF EXISTS "incidents_operationId_key";

-- DropIndex
DROP INDEX IF EXISTS "incidents_organizationId_status_detectedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "incidents_projectId_status_detectedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "incidents_severity_idx";

-- AlterTable
ALTER TABLE "incidents" DROP COLUMN IF EXISTS "description",
DROP COLUMN IF EXISTS "detectedAt",
DROP COLUMN IF EXISTS "provider",
DROP COLUMN IF EXISTS "resolutionNote",
DROP COLUMN IF EXISTS "rootCause",
DROP COLUMN IF EXISTS "runbookKey",
DROP COLUMN IF EXISTS "safeErrorMessage",
DROP COLUMN IF EXISTS "targetKind",
DROP COLUMN IF EXISTS "targetName",
ADD COLUMN     "archivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "correlationKey" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deploymentId" UUID,
ADD COLUMN     "environmentId" UUID,
ADD COLUMN     "firstObservedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "labels" JSONB,
ADD COLUMN     "lastObservedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "primaryResourceNodeId" UUID,
ADD COLUMN     "signalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summary" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "severity" SET DEFAULT 'ERROR',
ALTER COLUMN "organizationId" SET NOT NULL,
DROP COLUMN IF EXISTS "source",
ADD COLUMN     "source" "IncidentSource" NOT NULL DEFAULT 'SIGNAL_CORRELATION',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE IF EXISTS "incident_events";

-- CreateTable
CREATE TABLE "incident_signals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "signalId" UUID NOT NULL,
    "role" "IncidentSignalRole" NOT NULL DEFAULT 'RELATED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_signals_organizationId_idx" ON "incident_signals"("organizationId");

-- CreateIndex
CREATE INDEX "incident_signals_organizationId_incidentId_idx" ON "incident_signals"("organizationId", "incidentId");

-- CreateIndex
CREATE INDEX "incident_signals_organizationId_signalId_idx" ON "incident_signals"("organizationId", "signalId");

-- CreateIndex
CREATE UNIQUE INDEX "incident_signals_incidentId_signalId_key" ON "incident_signals"("incidentId", "signalId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_idx" ON "incidents"("organizationId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_status_idx" ON "incidents"("organizationId", "status");

-- CreateIndex
CREATE INDEX "incidents_organizationId_severity_idx" ON "incidents"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "incidents_organizationId_source_idx" ON "incidents"("organizationId", "source");

-- CreateIndex
CREATE INDEX "incidents_organizationId_correlationKey_idx" ON "incidents"("organizationId", "correlationKey");

-- CreateIndex
CREATE INDEX "incidents_organizationId_primaryResourceNodeId_idx" ON "incidents"("organizationId", "primaryResourceNodeId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_projectId_idx" ON "incidents"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_environmentId_idx" ON "incidents"("organizationId", "environmentId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_deploymentId_idx" ON "incidents"("organizationId", "deploymentId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_operationId_idx" ON "incidents"("organizationId", "operationId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_openedAt_idx" ON "incidents"("organizationId", "openedAt");

-- CreateIndex
CREATE INDEX "incidents_organizationId_lastObservedAt_idx" ON "incidents"("organizationId", "lastObservedAt");

-- CreateIndex
CREATE INDEX "incidents_organizationId_archivedAt_idx" ON "incidents"("organizationId", "archivedAt");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_primaryResourceNodeId_fkey" FOREIGN KEY ("primaryResourceNodeId") REFERENCES "resource_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_signals" ADD CONSTRAINT "incident_signals_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_signals" ADD CONSTRAINT "incident_signals_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "resource_signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
