-- AlterTable: add passwordHash with a temporary default so existing rows are valid,
-- then remove the default so future inserts must supply a real hash.
ALTER TABLE "users"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';

-- Strip the default; the seed script will backfill the real hash immediately.
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP DEFAULT;
