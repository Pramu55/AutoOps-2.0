# Company Deployment Handoff

AutoOps is a local-first, production-style DevOps Control Plane for governed CI/CD, container, Kubernetes, infrastructure, AWS, observability, approval, and governance workflows. This document explains how a company evaluator, recruiter, platform engineer, or SRE team can review the system safely before any controlled pilot deployment.

AutoOps is ready for company evaluation and controlled pilot planning. Actual company deployment requires official infrastructure access, credentials, security review, network approval, and stakeholder authorization.

## What AutoOps Is

AutoOps combines:

- Next.js App Router web console.
- Express TypeScript API.
- PostgreSQL with Prisma.
- Redis and BullMQ workers.
- Real provider connectors.
- Tenant isolation and provider inventory boundaries.
- Operation policy, confirmation, approval, and governance evidence.
- Secret redaction, release checks, and smoke checks.

It is not a generic terminal, shell runner, or unrestricted cloud console.

## Current Architecture

```text
User
  -> Web console
  -> API authentication and organization context
  -> Policy and RBAC checks
  -> Operation record
  -> Approval gate when required
  -> BullMQ queue
  -> Worker execution
  -> Provider connector
  -> Operation result, incident, and governance evidence
```

The API is the security boundary. The UI helps users understand state, but authorization is enforced in API services and worker execution paths.

## Supported Connectors

- Jenkins: status, jobs, builds, and allowlisted governed build trigger.
- Docker: status, inventory, logs, and governed safe container controls.
- Kubernetes: status, inventory, metrics readiness, governed scale and rollout restart.
- Terraform/OpenTofu and Ansible: allowlisted infrastructure automation through workers.
- AWS: readiness, ECR build/push, ECS plan/apply foundations, rollback/promotion, and cost/blast-radius guardrails.
- GitHub Actions: repository workflow and run readiness when configured.
- Prometheus/Grafana: observability readiness.
- DevOps tools: read-only tool detection for local runtime readiness.

## What Is Real Now

- Provider status is checked against real local or configured providers.
- Jenkins, Docker, and Kubernetes can show real local data for explicitly allowlisted demo/admin organizations.
- AWS checks are safe and read-only unless a governed operation is explicitly enabled and approved.
- Operations are durable database records and worker-backed.
- Governance evidence and incidents are generated from real operation lifecycle data.
- Newly registered organizations are isolated and blocked from shared provider inventory by default.

## What Is Demo-Local Only

- The included demo accounts and local provider credentials are for local evaluation.
- Docker Desktop Kubernetes and local Jenkins are not a company production environment.
- Demo provider allowlists are examples and must not be copied blindly into production.
- Local passwords in `.env.example` are local-only placeholders.

## What Requires Company Credentials

A company pilot must provide official credentials through approved channels:

- Jenkins URL, username, API token, and allowlisted jobs.
- Kubernetes kubeconfig or service account with least privilege and approved namespaces.
- Docker socket or remote Docker endpoint access only if security accepts that risk.
- AWS region, account allowlists, ECR repositories, deployment workspaces, and Terraform remote state.
- GitHub Actions token and repository settings.
- Prometheus/Grafana URLs and optional API token.

Never commit these values to Git.

## Tenant Isolation

Users belong to organizations through memberships. Tenant-owned resources such as projects, deployments, operations, incidents, governance evidence, AWS release history, and ECR metadata are scoped by `organizationId`.

Newly registered users receive a new organization and do not inherit demo provider access or historical data.

## Provider Inventory Allowlisting

Provider status can return safe, secret-free information. Provider inventory and details require:

- authenticated user,
- OWNER or ADMIN role where required,
- explicit organization provider inventory allowlist or provider settings.

Blocked organizations receive `BLOCKED_BY_ORG_POLICY`, which is expected tenant isolation behavior. Do not enable wildcard provider access in production.

## Approvals and Governance

Controlled operations require exact confirmation tokens. Higher-risk actions require approval. Requesters cannot approve their own operations. Operation detail and Governance Center show requester, policy, approver, status, provider, target, and safe result summaries.

## Worker Execution

The API does not execute provider mutations inline. It creates operation records and queues jobs. Workers execute allowlisted actions using fixed command paths or SDK calls, never arbitrary user-provided shell commands.

## Secrets Handling

AutoOps must not expose:

- `.env` values,
- provider tokens,
- kubeconfig contents,
- AWS credentials,
- Docker login passwords,
- raw Terraform state,
- raw provider outputs that may contain secrets.

Scripts and status endpoints report presence or status, not secret values.

## Company Pilot Configuration

Before a pilot:

- complete `docs/COMPANY_SECURITY_REVIEW_CHECKLIST.md`,
- configure provider credentials outside Git,
- define provider inventory allowlists per organization,
- configure allowed Jenkins jobs, Kubernetes namespaces, AWS accounts/regions, ECR repositories, and Terraform workspaces,
- run secret scan, release check, provider connectivity check, and final smoke check,
- document written authorization for any real provider connection.

## Must Never Be Done

- Never share one company cluster across unrelated tenants.
- Never enable wildcard provider inventory in production.
- Never commit `.env`, kubeconfig, AWS keys, Jenkins tokens, or GitHub tokens.
- Never let AI or UI run raw shell, `kubectl`, `docker`, or Terraform directly.
- Never deploy into a company environment without written authorization.
- Never bypass RBAC, approval, or requester/approver separation.

## Handoff Summary

AutoOps is ready for company evaluation and controlled pilot deployment planning. Real company deployment requires official credentials, infrastructure approval, network/VPN/firewall setup, security review, and stakeholder sign-off.
