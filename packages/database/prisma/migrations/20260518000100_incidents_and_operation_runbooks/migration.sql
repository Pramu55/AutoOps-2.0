-- Add operation-backed incident response fields without removing legacy incident values.
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'LOW';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'MEDIUM';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'HIGH';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'CRITICAL';

ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'OPEN';

ALTER TABLE "incidents"
  ALTER COLUMN "projectId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "organizationId" UUID,
  ADD COLUMN IF NOT EXISTS "operationId" UUID,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'operation',
  ADD COLUMN IF NOT EXISTS "provider" "OperationProvider",
  ADD COLUMN IF NOT EXISTS "targetKind" TEXT,
  ADD COLUMN IF NOT EXISTS "targetName" TEXT,
  ADD COLUMN IF NOT EXISTS "safeErrorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "runbookKey" TEXT,
  ADD COLUMN IF NOT EXISTS "acknowledgedByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "resolvedByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "resolutionNote" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "incidents_operationId_key" ON "incidents"("operationId");
CREATE INDEX IF NOT EXISTS "incidents_organizationId_status_detectedAt_idx" ON "incidents"("organizationId", "status", "detectedAt" DESC);
CREATE INDEX IF NOT EXISTS "incidents_operationId_idx" ON "incidents"("operationId");

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_acknowledgedByUserId_fkey"
  FOREIGN KEY ("acknowledgedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
