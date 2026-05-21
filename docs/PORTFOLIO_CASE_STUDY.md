# AutoOps Portfolio Case Study

## Project Name

AutoOps 2.0 / AutoOps 3.0

## One-Line Pitch

AutoOps is a production-style DevOps Control Plane for governed Jenkins, Docker, and Kubernetes operations with RBAC, approvals, worker execution, incidents, runbooks, and CI/release gates.

## Problem Statement

DevOps teams often operate tools from separate dashboards and terminals. That makes it harder to see what failed, who requested an action, whether approval was needed, and whether execution actually happened safely.

## Solution Summary

AutoOps unifies runtime visibility, governed operations, approval workflow, worker execution, incident response, and release readiness into one local-first platform.

## My Role

Designed and implemented the monorepo architecture, backend APIs, worker runtime, operation governance, frontend console, incidents/runbooks, production readiness, CI release gates, and final cloud/devops ecosystem readiness.

## Tech Stack

Next.js, React, Tailwind CSS, Express, TypeScript, PostgreSQL, Prisma, Redis, BullMQ, Docker Compose, Jenkins API, Docker Engine API, Kubernetes API, GitHub Actions.

## Key Capabilities

- Real connector status and inventory.
- Governed Jenkins/Docker/Kubernetes operations.
- Confirmation tokens and policy engine.
- RBAC and requester/approver separation.
- Worker-backed execution.
- Operation detail and lifecycle.
- Incidents and deterministic runbooks.
- Production readiness and CI gates.

## System Architecture

See [Architecture Overview](./ARCHITECTURE_OVERVIEW.md).

## Engineering Decisions

- API owns security and policy.
- Worker owns execution.
- Frontend never bypasses backend governance.
- Optional integrations fail gracefully.
- Unsafe generic actions are intentionally absent.
- Docs include honest limitations and future scope.

## DevOps/Platform Features

- Operations Hub.
- Worker heartbeat registry.
- Queue health.
- Provider health.
- Controlled operation lifecycle.
- Backup/restore scripts.
- Release checks.

## Security/Governance Features

- Authenticated APIs.
- Organization scoping.
- RBAC.
- Requester/approver separation.
- Approval-required operations not enqueued until approved.
- Secret redaction and secret scan.
- Safe DTOs.

## Backend and Worker Design

The API validates intent, writes operation records, and queues approved work. The worker consumes BullMQ jobs, executes controlled provider actions, updates operation status, and creates incidents for failures.

## Frontend Console Design

The console includes dashboard overview, Operations Hub, command search, grouped navigation, integration pages, operation detail, incident detail, and local demo login.

## Integrations

- Jenkins: status, jobs, builds, allowlisted build trigger.
- Docker: inventory, logs, start/stop/restart.
- Kubernetes: cluster inventory, metrics status, scale, rollout restart.

## Incidents and Runbooks

Failed operations create tenant-scoped incidents. Runbooks are deterministic and safe. No AI remediation or auto-remediation is included.

## CI/Release Readiness

GitHub Actions and local scripts verify builds, typechecks, tests, secret scan, and whitespace. CI does not require real connector secrets.

## Challenges Solved

- Keeping optional integrations from crashing the platform.
- Separating requester and approver.
- Creating safe incident summaries without raw metadata.
- Making worker liveness visible.
- Avoiding unsafe Docker/Kubernetes controls.

## What I Learned

- How to model governed operations end to end.
- How to keep UX helpful without making it a security boundary.
- How to balance real integrations with safe local demo constraints.
- How to document a platform for evaluators.

## Screenshots to Include

Use [Screenshot and Media Guide](./SCREENSHOT_AND_MEDIA_GUIDE.md).

## Demo Walkthrough

Use [Demo Guide](./DEMO_GUIDE.md).

## Roadmap

See [Limitations and Roadmap](./LIMITATIONS_AND_ROADMAP.md).

## Links

- GitHub: [AutoOps 2.0](https://github.com/Pramu55/AutoOps-2.0)
- Documentation: [Docs Home](./README.md)
