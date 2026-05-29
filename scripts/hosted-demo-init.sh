#!/bin/sh
set -e

echo "========================================"
echo " AutoOps Hosted Demo Init"
echo "========================================"

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma

echo "Running idempotent database seed..."
# We pipe to /dev/null because seed.ts prints the demo passwords by default
npx tsx packages/database/prisma/seed.ts > /dev/null

echo "Initialization complete. Demo users have been seeded securely."
