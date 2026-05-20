# AutoOps 2.0

> Governed DevOps control plane for real runtime visibility, controlled operations, approvals, worker execution, incidents, and safe runbooks.

## Stack

| Layer | Technology |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo |
| API | Express 4 + TypeScript |
| Worker | BullMQ + Redis |
| Web | Next.js 15 + Tailwind |
| Database | PostgreSQL 16 + Prisma |
| Queue/Cache | Redis 7 |
| Observability | Prometheus + Grafana |
| Runtime | Docker Compose |

## Quick Start

```powershell
git clone https://github.com/Pramu55/AutoOps-2.0.git
cd "AutoOps 2.0"
Copy-Item .env.example .env
notepad .env
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-autoops.ps1 -Build
```

Run migrations and local seed when starting with a new database:

```powershell
$env:DATABASE_URL="postgresql://autoops:autoops_dev@localhost:5432/autoops?schema=public"
.\node_modules\.bin\prisma.cmd migrate deploy --schema packages/database/prisma/schema.prisma
pnpm.cmd --filter @autoops/database run seed
```

Open:

| Service | URL |
| --- | --- |
| Web UI | http://localhost:3000 |
| API health | http://localhost:4000/health |
| API readiness | http://localhost:4000/ready |
| Jenkins local controller | http://localhost:8080 |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |

## Local Demo Accounts

These accounts are local demo users only. Do not use them in production.

| Role | Email |
| --- | --- |
| Operator / Requester | `pramod.local@autoops.dev` |
| Admin / Approver | `approver.local@autoops.dev` |

The local seed password is shown in the login page and `.env.example`.

## Current Capabilities

- Authenticated web console and API.
- Tenant-scoped projects, deployments, operations, audit logs, and incidents.
- Jenkins status, jobs, builds, and allowlisted build trigger.
- Docker status, containers, images, networks, volumes, logs, and governed start/stop/restart.
- Kubernetes status, metrics, namespaces, workloads, pods, services, scale, and rollout restart.
- Confirmation tokens for controlled actions.
- Operation policy and approval engine.
- RBAC operation authorization.
- Requester/approver separation.
- Worker heartbeat runtime registry.
- Operations observability.
- Failed-operation incidents and deterministic runbooks.

## Safety Model

AutoOps does not expose provider secrets, kubeconfig content, tokens, certs, Kubernetes Secrets, raw operation metadata, or stack traces in production responses. Docker exec/shell/delete/create and Kubernetes exec/shell/apply/delete/secret controls are intentionally not exposed.

## Release Readiness

Company-pilot guidance:

- [Production Deployment Readiness](./docs/PRODUCTION_DEPLOYMENT_READINESS.md)
- [Security Checklist](./docs/SECURITY_CHECKLIST.md)
- [Controlled Operations Overview](./docs/CONTROLLED_OPERATIONS_OVERVIEW.md)

Release scripts:

```powershell
.\scripts\check-release.ps1
.\scripts\backup-postgres.ps1
.\scripts\restore-postgres.ps1 -BackupPath ".\backups\autoops-YYYY-MM-DD-HHMMSS.dump"
```

## Useful Commands

```powershell
pnpm.cmd build
pnpm.cmd typecheck
.\node_modules\.bin\prisma.cmd migrate status --schema packages/database/prisma/schema.prisma
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps
docker compose -f docker-compose.yml -f docker-compose.k8s.yml logs -f api worker
```

## Project Layout

```text
apps/api        Express API
apps/worker     BullMQ worker
apps/web        Next.js console
packages/*      Shared database, types, logger, and utilities
infra/*         Dockerfiles, nginx, Prometheus, Grafana
scripts/*       Safe local operations scripts
docs/*          Deployment, security, and controlled-operation docs
```
