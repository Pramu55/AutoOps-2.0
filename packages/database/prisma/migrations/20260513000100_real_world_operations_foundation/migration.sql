ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'KUBERNETES_DEPLOYMENT_RESTART_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'KUBERNETES_MANIFEST_DRY_RUN_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'KUBERNETES_MANIFEST_APPLY_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JENKINS_BUILD_TRIGGER_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'GITHUB_WORKFLOW_DISPATCH_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AWS_DEPLOYMENT_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DEPLOYMENT_ROLLBACK_REQUESTED';

DO $$ BEGIN
  CREATE TYPE "OperationProvider" AS ENUM ('KUBERNETES', 'AWS', 'JENKINS', 'GITHUB', 'DOCKER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OperationType" AS ENUM (
    'KUBERNETES_DEPLOYMENT_RESTART',
    'KUBERNETES_MANIFEST_DRY_RUN',
    'KUBERNETES_MANIFEST_APPLY',
    'JENKINS_BUILD_TRIGGER',
    'GITHUB_WORKFLOW_DISPATCH',
    'AWS_DEPLOYMENT',
    'DEPLOYMENT_ROLLBACK'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OperationStatus" AS ENUM (
    'PENDING_APPROVAL',
    'QUEUED',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'REJECTED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "projectId" UUID,
  "environmentId" UUID,
  "provider" "OperationProvider" NOT NULL,
  "operationType" "OperationType" NOT NULL,
  "status" "OperationStatus" NOT NULL DEFAULT 'QUEUED',
  "requestedByUserId" UUID,
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectedByUserId" UUID,
  "rejectedAt" TIMESTAMPTZ(3),
  "idempotencyKey" TEXT,
  "input" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB,
  "error" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "projectId" UUID;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "environmentId" UUID;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "operationId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "operations_organizationId_idempotencyKey_key"
  ON "operations"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "operations_organizationId_status_createdAt_idx"
  ON "operations"("organizationId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "operations_provider_operationType_idx"
  ON "operations"("provider", "operationType");
CREATE INDEX IF NOT EXISTS "operations_projectId_idx" ON "operations"("projectId");
CREATE INDEX IF NOT EXISTS "operations_environmentId_idx" ON "operations"("environmentId");
CREATE INDEX IF NOT EXISTS "audit_logs_operationId_idx" ON "audit_logs"("operationId");

DO $$ BEGIN
  ALTER TABLE "operations" ADD CONSTRAINT "operations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "operations" ADD CONSTRAINT "operations_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "operations" ADD CONSTRAINT "operations_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "operations" ADD CONSTRAINT "operations_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "operations" ADD CONSTRAINT "operations_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "operations" ADD CONSTRAINT "operations_rejectedByUserId_fkey"
    FOREIGN KEY ("rejectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
