# AutoOps 2.0

[![AutoOps CI](https://github.com/Pramu55/AutoOps-2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/Pramu55/AutoOps-2.0/actions/workflows/ci.yml)

AutoOps is a production-style DevOps Control Plane for managing, observing, and governing operations across Jenkins, Docker, and Kubernetes. It combines real integrations, RBAC, approval workflows, worker-backed execution, observability, incidents, runbooks, and CI/release gates into one platform.

## What AutoOps Is

AutoOps is a local-first, production-inspired platform engineering project. It gives operators one console to discover runtime status, execute governed operations, audit changes, handle failed operations as incidents, and validate release readiness.

The project is designed as a serious portfolio and company-pilot-ready direction, not as a fake dashboard. Backend records are real, connector status comes from actual connector checks, and controlled actions flow through policy, confirmation, approval, queueing, and worker execution.

## Why It Matters

Real DevOps work is not only clicking buttons. Teams need safe execution, clear ownership, approval separation, observable worker runtime, incident response, and release gates. AutoOps demonstrates those platform engineering concerns in a complete TypeScript monorepo.

## Key Capabilities

- Authenticated web console and Express API.
- Organization-scoped users, projects, deployments, operations, audit logs, and incidents.
- Jenkins status, jobs, builds, and allowlisted build trigger.
- Docker status, containers, images, networks, volumes, logs, and governed start/stop/restart.
- Kubernetes status, Metrics API status, namespaces, workloads, pods, services, scale, and rollout restart.
- Confirmation tokens for all controlled operations.
- Policy engine for approval-required operations.
- RBAC with requester/approver separation.
- BullMQ worker-backed execution.
- Worker heartbeat and runtime registry.
- Operations Hub with runtime, queue, provider, approval, activity, failure, and incident visibility.
- Failed-operation incidents with deterministic safe runbooks.
- Production readiness docs, security checklist, backup/restore scripts, and release checks.
- GitHub Actions CI and secret-scan release gates.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 15, React, Tailwind CSS |
| API | Express 4, TypeScript, Zod |
| Worker | BullMQ, Redis, TypeScript |
| Database | PostgreSQL 16, Prisma |
| Queue/Cache | Redis 7 |
| Observability | Prometheus and Grafana ready local stack |
| Runtime | Docker Compose |
| CI | GitHub Actions |

## Architecture Summary

AutoOps separates control from execution:

- The web console provides authenticated workflows and safe UI hints.
- The API owns authentication, tenant scope, validation, policy, RBAC, approval decisions, safe DTOs, and audit records.
- Redis/BullMQ queues accepted work.
- The worker executes approved operations and writes lifecycle status.
- PostgreSQL stores durable state through Prisma.
- Jenkins, Docker, and Kubernetes are real connectors with intentionally limited safe controls.

See [Architecture Overview](./docs/ARCHITECTURE_OVERVIEW.md).

## Platform Modules

| Module | Purpose |
| --- | --- |
| Dashboard | Command overview for runtime and platform posture |
| Operations Hub | Health, approvals, activity, failures, incidents, queues, worker runtime |
| Incidents | Failed-operation incident lifecycle and runbooks |
| Jenkins | Status, jobs, builds, allowlisted governed build trigger |
| Docker | Inventory, logs, governed start/stop/restart |
| Kubernetes | Cluster inventory, Metrics API, governed scale and rollout restart |
| Projects | Project and environment ownership |
| Deployments | Deployment records and safe simulation workflow |

## Safety and Governance Model

AutoOps intentionally avoids unsafe generic automation. The backend enforces:

- authenticated API access
- organization scoping
- RBAC operation authorization
- requester/approver separation
- exact confirmation tokens
- policy-based approval gates
- worker-only execution
- operation lifecycle tracking
- incident and runbook lifecycle
- secret redaction and safe response DTOs

AutoOps does not expose provider secrets, kubeconfig content, tokens, raw operation metadata, Kubernetes Secret data, Docker shell/exec controls, Kubernetes shell/exec/apply/delete controls, or ungoverned Jenkins mutations.

## Local Demo Accounts

These accounts are for local AutoOps demo/testing only. Do not use them in a real company deployment.

| Demo role | Email | Purpose |
| --- | --- | --- |
| Operator / Requester | `pramod.local@autoops.dev` | Trigger governed operations and request approvals |
| Admin / Approver | `approver.local@autoops.dev` | Review, approve, reject, acknowledge, and resolve |

The local demo password is shown in the login page and `.env.example`. Production should use real organization invites and managed users.

## Quick Start

```powershell
git clone https://github.com/Pramu55/AutoOps-2.0.git
cd "AutoOps 2.0"
Copy-Item .env.example .env
notepad .env
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-autoops.ps1 -Build
```

For a fresh database:

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

## Main Routes

- `/login`
- `/register`
- `/dashboard`
- `/dashboard/operations`
- `/dashboard/operations/:operationId`
- `/dashboard/incidents`
- `/dashboard/incidents/:incidentId`
- `/dashboard/integrations/jenkins`
- `/dashboard/integrations/docker`
- `/dashboard/integrations/kubernetes`
- `/dashboard/projects`
- `/dashboard/deployments`

See [Route Reference](./docs/ROUTE_REFERENCE.md).

## Documentation Map

Start with [Documentation Home](./docs/README.md).

- [Evaluator Quickstart](./docs/EVALUATOR_QUICKSTART.md)
- [Demo Guide](./docs/DEMO_GUIDE.md)
- [Company Pilot Checklist](./docs/COMPANY_PILOT_CHECKLIST.md)
- [Architecture Overview](./docs/ARCHITECTURE_OVERVIEW.md)
- [Feature Matrix](./docs/FEATURE_MATRIX.md)
- [Portfolio Case Study](./docs/PORTFOLIO_CASE_STUDY.md)
- [Screenshot and Media Guide](./docs/SCREENSHOT_AND_MEDIA_GUIDE.md)
- [LinkedIn and Resume Content](./docs/LINKEDIN_AND_RESUME_CONTENT.md)
- [Production Deployment Readiness](./docs/PRODUCTION_DEPLOYMENT_READINESS.md)
- [Security Checklist](./docs/SECURITY_CHECKLIST.md)
- [CI and Release Gates](./docs/CI_AND_RELEASE_GATES.md)
- [Controlled Operations Overview](./docs/CONTROLLED_OPERATIONS_OVERVIEW.md)
- [Limitations and Roadmap](./docs/LIMITATIONS_AND_ROADMAP.md)
- [Demo Data Safety](./docs/DEMO_DATA_SAFETY.md)

## Production Readiness

AutoOps includes:

- safe `.env.example`
- strict production env validation
- secret redaction utility
- logger redaction paths
- production-like compose file
- backup and restore scripts
- release check scripts
- company pilot validation flow
- security checklist

Read [Production Deployment Readiness](./docs/PRODUCTION_DEPLOYMENT_READINESS.md) before any company demo.

## CI and Release Gates

GitHub Actions runs AutoOps CI on push and pull request to `main`. CI verifies builds, typechecks, tests, whitespace, and secret scanning without requiring Jenkins, Docker socket access, kubeconfig, Docker Desktop Kubernetes, or real connector secrets.

Local release checks:

```powershell
.\scripts\check-release.ps1
.\scripts\scan-secrets.ps1
```

See [CI and Release Gates](./docs/CI_AND_RELEASE_GATES.md).

## Screenshots and Demo

Use the [Screenshot and Media Guide](./docs/SCREENSHOT_AND_MEDIA_GUIDE.md) before posting screenshots publicly. Never upload `.env`, tokens, kubeconfig, database credentials, Authorization headers, or raw logs with secrets.

Use the [Demo Guide](./docs/DEMO_GUIDE.md) for 5-minute and 10-minute walkthroughs.

## Current Status

AutoOps is a company-evaluator-ready portfolio project with real local integrations, governed operations, incidents/runbooks, release hardening, and CI gates. It is not claimed to be enterprise-certified or production-certified.

## Roadmap

Planned future work includes broader test coverage, notification integrations, cloud deployment guides, GitHub integration, AWS controls, richer audit exports, and optional AI assistant workflows. See [Limitations and Roadmap](./docs/LIMITATIONS_AND_ROADMAP.md).

## Author Links

- GitHub: [Pramu55](https://github.com/Pramu55)
- Project repository: [AutoOps 2.0](https://github.com/Pramu55/AutoOps-2.0)
