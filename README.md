# AutoOps 2.0

[![AutoOps CI](https://github.com/Pramu55/AutoOps-2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/Pramu55/AutoOps-2.0/actions/workflows/ci.yml)

AutoOps is a production-grade DevOps control plane, acting as an incident-aware operations platform, governed operations platform, and deterministic remediation recommendation platform. It combines real integrations, RBAC, approval workflows, worker-backed execution, observability, incidents, runbooks, and CI/release gates into one portfolio and company-demo ready project.

AutoOps is a governed remediation preparation platform. It is **not** an autonomous auto-fix bot.

## What AutoOps Is

AutoOps gives operators one console to discover runtime status, execute governed operations, audit changes, handle failed operations as incidents, and validate release readiness.

The project is designed as a serious portfolio and company-pilot-ready direction, not as a fake dashboard. Backend records are real, connector status comes from actual connector checks, and controlled actions flow through policy, confirmation, approval, queueing, and worker execution.

## Why It Matters

Real DevOps work is not only clicking buttons. Teams need safe execution, clear ownership, approval separation, observable worker runtime, incident response, and release gates. AutoOps demonstrates those platform engineering concerns in a complete TypeScript monorepo.

## Quick Install

To quickly set up and run AutoOps locally using Docker Compose, open Windows PowerShell and run the following commands:

```powershell
git clone https://github.com/Pramu55/AutoOps-2.0.git
cd AutoOps-2.0
copy .env.example .env
docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build
```

### Local URLs

Once the services are started, you can access the following local endpoints:

- **Web Dashboard**: [http://localhost:3000](http://localhost:3000)
- **API Health Check**: [http://localhost:4000/health](http://localhost:4000/health)
- **Grafana Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Prometheus Dashboard**: [http://localhost:9090](http://localhost:9090)

### Important Setup Notes

- **Provider Credentials**: Real cloud or infrastructure provider credentials (e.g., AWS, Kubernetes, Jenkins tokens) are completely optional and are not bundled with the local setup.
- **Unconfigured Providers**: Any modules or providers that are not configured with environment credentials will safely display `NOT_CONFIGURED` status badges and screens in the UI rather than showing mock/fake data.
- **Security Warning**: Do not commit the local `.env` file or any credentials to the git repository.

For more detailed instructions, see the [Docker Compose Deployment Guide](./docs/DOCKER_INSTALL.md).

## Key Capabilities

- Authenticated web console and Express API.
- Organization-scoped users, projects, deployments, operations, audit logs, and incidents.
- Jenkins status, jobs, builds, and allowlisted build trigger.
- Docker status, containers, images, networks, volumes, logs, and governed start/stop/restart.
- Kubernetes status, Metrics API status, namespaces, workloads, pods, services, scale, and rollout restart.
- Infrastructure Automation Center for allowlisted Terraform/OpenTofu validate/plan/apply and Ansible workflows.
- GitHub Actions workflow/run visibility for a configured repository.
- Resource Graph for tenant-scoped infrastructure topology discovery.
- Signal Ingest for normalized, deduplicated observation stream.
- DevOps tools readiness and Cloud Provider Readiness Center without unsafe direct cloud writes.
- AWS ECS Terraform/OpenTofu plan-only workflow using remote state and tenant-scoped ECR pushes.
- Confirmation tokens for all controlled operations and policy engine for approval-required operations.
- RBAC with requester/approver separation.
- BullMQ worker-backed execution.
- Operations Hub with runtime, queue, provider, approval, activity, failure, and incident visibility.
- Failed-operation incidents with deterministic safe runbooks, recommended remediation, and governed preparation.
- Production readiness docs, security checklist, backup/restore scripts, and release checks.

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
- Connectors (Jenkins, Docker, Kubernetes, AWS, Infrastructure) are real with intentionally limited safe controls.

See [Architecture Overview](./docs/ARCHITECTURE_OVERVIEW.md).

## Safety and Governance Model

AutoOps intentionally avoids unsafe generic automation. The backend enforces:
- authenticated API access and organization scoping
- RBAC operation authorization and requester/approver separation
- exact confirmation tokens and policy-based approval gates
- worker-only execution
- operation lifecycle tracking
- incident and runbook lifecycle with governed remediation
- secret redaction and safe response DTOs

AutoOps does not expose provider secrets, raw operation metadata, Kubernetes Secret data, Docker shell/exec controls, Kubernetes shell/exec/apply/delete controls, or ungoverned Jenkins mutations.

## Hosted Browser Demo Plan

- Hosted demo is planned as a safe demo/read-only mode.
- No real Docker socket, Kubernetes credentials, Jenkins token, AWS credentials, or destructive provider actions will be exposed publicly.

## Evaluator / Interviewer Path

If you are evaluating this project:
1. Review the [Evaluator Quickstart](./docs/EVALUATOR_QUICKSTART.md).
2. Follow the [AutoOps Demo Script](./docs/AUTOOPS_DEMO_SCRIPT.md).
3. Read the [Final Freeze Report](./docs/FINAL_COMPANY_READY_FREEZE_REPORT.md).

## Portfolio and Interview Positioning

AutoOps is a production-grade DevOps control plane that unifies incident workflows, provider integrations, governed operations, audit evidence, and deterministic remediation recommendations. It focuses on enterprise safety through tenant isolation, approval gates, confirmation tokens, worker-based execution, and honest non-autonomous remediation.

## Current Status and Limitations

AutoOps is a company-evaluator-ready portfolio project. It is not claimed to be enterprise-certified or production-certified. Future work may include broader test coverage, advanced RBAC, and deeper integrations. See [Limitations and Roadmap](./docs/LIMITATIONS_AND_ROADMAP.md).
