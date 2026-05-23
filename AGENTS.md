# AutoOps Agent Instructions

This repository is AutoOps, a production-style DevOps Control Plane.

Critical safety rules:
- Never commit .env or secrets.
- Never weaken tenant isolation.
- Never weaken RBAC.
- Never bypass approvals.
- Never allow requester self-approval.
- Never add arbitrary shell execution.
- Never add destructive cloud/Docker/Kubernetes actions.
- Never reset the database or delete volumes.
- Never query tenant-owned data by ID alone.
- Always scope tenant-owned resources by organizationId.
- Provider inventory must be role-restricted.
- Provider status must be secret-free.
- All changes must pass build/typecheck/tests/release/secret checks.

Architecture:
- apps/web: Next.js dashboard
- apps/api: Express API
- apps/worker: BullMQ worker
- packages/types: shared DTOs/contracts
- packages/database: Prisma/PostgreSQL
- packages/utils/logger: shared utilities

Required verification:
- pnpm.cmd --filter @autoops/api test
- pnpm.cmd --filter @autoops/api typecheck
- pnpm.cmd --filter @autoops/web typecheck
- .\scripts\check-release.ps1
- .\scripts\scan-secrets.ps1