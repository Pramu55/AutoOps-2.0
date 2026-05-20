#!/usr/bin/env bash
set -euo pipefail

echo "========================================"
echo " AutoOps Release Check"
echo "========================================"

run_step() {
  local name="$1"
  shift
  echo
  echo "==> ${name}"
  "$@"
}

run_step "Git status" git --no-pager status --short
run_step "Database build" pnpm --filter @autoops/database build
run_step "Types build" pnpm --filter @autoops/types build
run_step "API typecheck" pnpm --filter @autoops/api typecheck
run_step "API build" pnpm --filter @autoops/api build
run_step "API tests" pnpm --filter @autoops/api test
run_step "Worker typecheck" pnpm --filter @autoops/worker typecheck
run_step "Worker build" pnpm --filter @autoops/worker build
run_step "Web typecheck" pnpm --filter @autoops/web typecheck
run_step "Web build" pnpm --filter @autoops/web build
run_step "Secret scan" bash scripts/scan-secrets.sh
run_step "Git whitespace check" git diff --check

if [[ -n "${DATABASE_URL:-}" ]]; then
  run_step "Prisma migration status" pnpm --filter @autoops/database exec prisma migrate status --schema prisma/schema.prisma
else
  echo
  echo "Skipping Prisma migration status because DATABASE_URL is not set."
fi

echo
echo "Release check completed."
