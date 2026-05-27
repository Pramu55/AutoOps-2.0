-- CreateEnum
CREATE TYPE "IncidentEventType" AS ENUM ('INCIDENT_OPENED', 'INCIDENT_UPDATED', 'SIGNAL_LINKED', 'SEVERITY_CHANGED', 'STATUS_CHANGED', 'ACKNOWLEDGED', 'RESOLVED', 'ARCHIVED', 'NOTE_ADDED', 'CORRELATION_RAN', 'EVIDENCE_ADDED');

-- CreateTable
CREATE TABLE "incident_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "type" "IncidentEventType" NOT NULL,
    "actorUserId" UUID,
    "actorUserEmail" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_events_organizationId_idx" ON "incident_events"("organizationId");

-- CreateIndex
CREATE INDEX "incident_events_organizationId_incidentId_idx" ON "incident_events"("organizationId", "incidentId");

-- CreateIndex
CREATE INDEX "incident_events_organizationId_occurredAt_idx" ON "incident_events"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "incident_events_incidentId_occurredAt_idx" ON "incident_events"("incidentId", "occurredAt");

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
