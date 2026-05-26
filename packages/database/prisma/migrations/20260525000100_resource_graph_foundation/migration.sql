-- CreateEnum
CREATE TYPE "ResourceProvider" AS ENUM ('AUTOOPS', 'JENKINS', 'DOCKER', 'KUBERNETES', 'AWS', 'GITHUB_ACTIONS');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('ORGANIZATION', 'PROJECT', 'ENVIRONMENT', 'DEPLOYMENT', 'OPERATION', 'JENKINS_INSTANCE', 'JENKINS_JOB', 'JENKINS_BUILD', 'DOCKER_ENGINE', 'DOCKER_CONTAINER', 'DOCKER_IMAGE', 'DOCKER_NETWORK', 'DOCKER_VOLUME', 'KUBERNETES_CLUSTER', 'KUBERNETES_NAMESPACE', 'KUBERNETES_NODE', 'KUBERNETES_DEPLOYMENT', 'KUBERNETES_POD', 'KUBERNETES_SERVICE', 'AWS_ACCOUNT', 'AWS_REGION', 'AWS_DEPLOYMENT_TARGET', 'AWS_ECR_REPOSITORY', 'GITHUB_REPOSITORY', 'GITHUB_WORKFLOW');

-- CreateEnum
CREATE TYPE "ResourceEdgeType" AS ENUM ('OWNS', 'CONTAINS', 'DEPLOYS_TO', 'RUNS_ON', 'CREATED_BY', 'TRIGGERS', 'AFFECTS', 'DEPENDS_ON', 'EXPOSES', 'BUILDS', 'RELEASES', 'USES_IMAGE', 'ATTACHED_TO', 'PART_OF');

-- CreateTable
CREATE TABLE "resource_nodes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "urn" TEXT NOT NULL,
    "provider" "ResourceProvider" NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "externalId" TEXT,
    "projectId" UUID,
    "environmentId" UUID,
    "deploymentId" UUID,
    "operationId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "labels" JSONB,
    "discoverySource" TEXT,
    "healthStatus" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resource_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_edges" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceNodeId" UUID NOT NULL,
    "targetNodeId" UUID NOT NULL,
    "type" "ResourceEdgeType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "discoverySource" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resource_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_nodes_organizationId_urn_key" ON "resource_nodes"("organizationId", "urn");

-- CreateIndex
CREATE INDEX "resource_nodes_organizationId_idx" ON "resource_nodes"("organizationId");

-- CreateIndex
CREATE INDEX "resource_nodes_organizationId_provider_idx" ON "resource_nodes"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "resource_nodes_organizationId_kind_idx" ON "resource_nodes"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "resource_nodes_organizationId_projectId_idx" ON "resource_nodes"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "resource_nodes_organizationId_environmentId_idx" ON "resource_nodes"("organizationId", "environmentId");

-- CreateIndex
CREATE INDEX "resource_nodes_organizationId_archivedAt_idx" ON "resource_nodes"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "resource_nodes_organizationId_lastSeenAt_idx" ON "resource_nodes"("organizationId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "resource_nodes_organizationId_provider_kind_idx" ON "resource_nodes"("organizationId", "provider", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "resource_edges_organizationId_sourceNodeId_targetNodeId_type_key" ON "resource_edges"("organizationId", "sourceNodeId", "targetNodeId", "type");

-- CreateIndex
CREATE INDEX "resource_edges_organizationId_idx" ON "resource_edges"("organizationId");

-- CreateIndex
CREATE INDEX "resource_edges_sourceNodeId_idx" ON "resource_edges"("sourceNodeId");

-- CreateIndex
CREATE INDEX "resource_edges_targetNodeId_idx" ON "resource_edges"("targetNodeId");

-- CreateIndex
CREATE INDEX "resource_edges_organizationId_archivedAt_idx" ON "resource_edges"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "resource_edges_organizationId_lastSeenAt_idx" ON "resource_edges"("organizationId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "resource_nodes" ADD CONSTRAINT "resource_nodes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_edges" ADD CONSTRAINT "resource_edges_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "resource_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_edges" ADD CONSTRAINT "resource_edges_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "resource_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
