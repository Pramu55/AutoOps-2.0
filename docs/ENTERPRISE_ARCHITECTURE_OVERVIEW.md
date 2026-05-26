# Enterprise Architecture Overview

AutoOps is a governed DevOps Control Plane built as a TypeScript monorepo. It is local-first for evaluation but designed around company-pilot security boundaries.

## Component Diagram

```text
Browser
  |
  v
Next.js Web
  |
  v
Express API
  |-- Auth and organization membership
  |-- Tenant-scoped services
  |-- Provider onboarding policy
  |-- Operation policy engine
  |-- Approval engine
  |-- Governance evidence mapping
  |
  v
PostgreSQL + Prisma
  |
  v
Redis + BullMQ
  |
  v
Worker Runtime
  |
  v
Provider Connectors
  |-- Jenkins
  |-- Docker
  |-- Kubernetes
  |-- Terraform/OpenTofu
  |-- Ansible
  |-- AWS
  |-- GitHub Actions
  |-- Prometheus/Grafana
```

## Request Flow

```text
UI -> API -> validation -> tenant context -> RBAC -> policy -> operation
operation -> approval when required -> queue -> worker -> provider
provider result -> operation lifecycle -> incident when failed -> governance evidence
```

The API validates tenant context and policy before work is queued. The worker is the execution boundary for provider operations.

## Tenant Flow

```text
user -> membership -> organization -> tenant-owned resources
organization -> provider inventory allowlist -> provider inventory access
```

Tenant-owned resources include projects, environments, deployments, operations, incidents, governance evidence, ECR image metadata, AWS plan/apply history, and release records.

## Connector Flow

- Status endpoints return safe, secret-free state.
- Blocked organizations receive `BLOCKED_BY_ORG_POLICY`.
- Inventory endpoints require explicit organization provider access plus role checks.
- Mutation endpoints require validation, confirmation, policy, and often approval.
- Workers use allowlisted targets and fixed commands or SDK calls.

## Company Deployment Model

A company pilot should use:

- per-organization provider access,
- official company credentials supplied outside Git,
- least-privilege provider accounts,
- configured account/region/workspace/job/namespace allowlists,
- production environment validation,
- secret scanning and smoke checks before handoff.

AutoOps does not ship fake provider data and should not be connected to any company environment without written authorization.

## Policy and Approval Engine

The policy engine decides whether a requested operation is confirmation-only or approval-required. Approval-required operations are not queued until approved. Requester self-approval is blocked.

## Governance Evidence

Governance evidence is generated from real operation records. Evidence includes actor, organization, provider, target, policy, approval status, timestamps, safe result, and incident link when present. It does not expose raw credentials, kubeconfig, Terraform state, provider tokens, or raw secret-like logs.

## Resource Graph Foundation

The Resource Graph is now a database-backed topology read model. AutoOps domain services register projects, environments, deployments, and operations. Authorized provider inventory reads can register Jenkins, Docker, and Kubernetes resources as non-blocking side effects.

The graph sits after authentication, tenant scoping, and provider access checks. It does not grant permissions and does not replace RBAC, approval policy, or provider boundaries.
