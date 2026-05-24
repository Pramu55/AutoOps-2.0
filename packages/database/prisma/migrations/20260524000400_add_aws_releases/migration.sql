-- CreateEnum
CREATE TYPE "AwsReleaseStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'ROLLED_BACK', 'FAILED');

-- AlterEnum
ALTER TYPE "OperationType" ADD VALUE 'AWS_ECS_RELEASE_PROMOTE';
ALTER TYPE "OperationType" ADD VALUE 'AWS_ECS_RELEASE_ROLLBACK';

-- CreateTable
CREATE TABLE "aws_releases" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "targetSlug" TEXT NOT NULL,
    "environmentSlug" TEXT NOT NULL,
    "sourceOperationId" UUID,
    "planOperationId" UUID,
    "applyOperationId" UUID NOT NULL,
    "imageUri" TEXT NOT NULL,
    "imageDigest" TEXT,
    "taskDefinitionArn" TEXT,
    "ecsClusterName" TEXT,
    "ecsServiceName" TEXT,
    "releaseVersion" INTEGER NOT NULL,
    "status" "AwsReleaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "promotedFromReleaseId" UUID,
    "rolledBackFromReleaseId" UUID,
    "createdByUserId" UUID,
    "approvedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMPTZ(3),
    "rolledBackAt" TIMESTAMPTZ(3),

    CONSTRAINT "aws_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aws_releases_organizationId_targetSlug_environmentSlug_idx" ON "aws_releases"("organizationId", "targetSlug", "environmentSlug");

-- CreateIndex
CREATE INDEX "aws_releases_createdAt_idx" ON "aws_releases"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "aws_releases" ADD CONSTRAINT "aws_releases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
