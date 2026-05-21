# Controlled Operations Overview

AutoOps controlled operations use real provider APIs through authenticated, tenant-scoped, worker-executed flows. The UI should describe integrations as control connectors or governed operations, not as passive viewing surfaces.

## Current Coverage

| Provider | Actions | Confirmation | Risk | Approval |
| --- | --- | --- | --- | --- |
| Jenkins | Build trigger / re-run for allowlisted jobs | BUILD | LOW | Not required |
| Docker | Start container | START | MEDIUM | Not required |
| Docker | Stop, restart container | STOP, RESTART | MEDIUM | Required by local policy |
| Kubernetes | Scale deployment to 0-2 replicas, rollout restart deployment | SCALE, ROLLOUT | MEDIUM | Not required |
| Kubernetes | Scale deployment above 2 replicas | SCALE | MEDIUM | Required by local policy |

## Safety Rules

- All actions require authentication and organization scope.
- Controllers validate exact confirmation tokens before creating operations.
- Mutating actions create Operation records and run through the worker queue.
- Operations Activity Timeline shows safe derived fields and governance details.
- Jenkins jobs must remain allowlisted.
- Kubernetes protected namespaces remain blocked for mutations.
- Docker exec, shell, delete/remove, image push/delete, volume delete, and network delete are not exposed.
- Kubernetes exec, shell, port-forward, Secret access, arbitrary apply/patch, and delete actions are not exposed.

## Operation Detail and Recovery

- Operation detail views use safe derived DTOs from `/api/v1/ops/activity/:operationId`.
- Raw operation input, result, and error payloads are not rendered in the UI.
- Recovery is provider-specific only: Jenkins BUILD, Docker START/STOP/RESTART, and Kubernetes SCALE/ROLLOUT.
- Recovery actions remain confirmation-gated, audit-backed, and worker-executed.
- AutoOps does not provide generic operation replay, shell access, exec, delete, arbitrary apply, or secret access.

## Observability and Real-Time Operations

- `/api/v1/ops/observability` returns safe platform health, provider health, queue health, active operations, recent failures, and recent operation status breakdowns.
- Queue counts come from BullMQ when safely readable; unavailable queues are reported honestly rather than filled with fake zeroes.
- Provider health uses real Jenkins, Docker, and Kubernetes connector checks, including Kubernetes Metrics API status when available.
- Operations Hub polls at a modest interval for live operation monitoring, and operation detail pages poll only while an operation is queued, running, or pending approval.
- Failed operations show safe error summaries and link to operation detail/recovery where supported.
- Observability responses do not expose raw operation metadata, provider credentials, kubeconfig, tokens, environment values, or stack traces.

## Worker Heartbeat and Runtime Registry

- Workers persist safe heartbeat rows with service name, process id, queue capabilities, started time, and last seen time.
- Worker health is derived from heartbeat age: fresh heartbeats are running, stale heartbeats are degraded, old or stopped heartbeats are offline, and missing rows are unknown.
- Queue coverage is reported from active worker heartbeats for operations, deployments, and system queues.
- AutoOps does not infer worker liveness from Redis alone and does not fake worker health.
- Heartbeat metadata stores only safe runtime facts and does not store environment dumps, URLs, credentials, tokens, kubeconfig, or host secrets.

## Policy and Approval Engine

- Confirmations remain required for all controlled actions; approval is an additional policy gate, not a replacement.
- The local pilot policy keeps Jenkins BUILD, Docker START, Kubernetes ROLLOUT, and Kubernetes SCALE to 0-2 replicas confirmation-only.
- Docker STOP/RESTART and Kubernetes SCALE above 2 replicas enter `PENDING_APPROVAL` and are not enqueued until approved.
- Approving a pending operation records the decision and queues the existing worker-executed operation; rejecting records the decision and prevents worker execution.
- Ops Hub and operation detail expose safe policy reason, risk, confirmation label, approval status, and decision timestamps without rendering raw operation metadata.
- AutoOps does not provide generic replay, unsafe Docker/Kubernetes controls, or fake approval records. Future RBAC can separate requester and approver responsibilities.

## RBAC and Operation Authorization

- Operation authorization is role-aware and enforced in the backend; frontend permission hints are UX only.
- OWNER and ADMIN users can trigger controlled operations and approve or reject approval-required operations.
- MEMBER users can view operations and trigger controlled operations, but cannot approve or reject approval-required operations.
- VIEWER users can view safe operation activity, but cannot trigger, approve, or reject operations.
- Requesters cannot approve or reject their own approval-required operation; a separate authorized approver is required.
- Permission decisions are derived from real organization memberships and no fake roles, fake approvals, or generic unsafe execution paths are created.

## Incidents and Runbooks

- Failed worker-executed operations create tenant-scoped incident records linked to the failed operation.
- Incidents use an `OPEN` -> `ACKNOWLEDGED` -> `RESOLVED` response lifecycle with safe acknowledger, resolver, and timestamp fields.
- Incident severity and runbook keys are deterministic from the provider and operation type; no fake impact metrics are generated.
- Runbooks are fixed, safe guidance for observe, verify, recover, and escalate steps. AutoOps does not use AI-generated runbooks yet.
- Incident views show safe error summaries only and never expose raw operation input, result, error metadata, stack traces, credentials, or provider secrets.
- Recovery remains controlled by existing confirmation, policy, RBAC, and worker execution. AutoOps does not perform automatic remediation or unsafe shell/exec/apply/delete actions.

## Governance Center and Audit-Style Evidence

- `/api/v1/ops/governance` derives tenant-scoped governance evidence from real operation, approval, worker, and incident records.
- `/dashboard/governance` gives admins and reviewers a table-first evidence view across Jenkins, Docker, Kubernetes, and other operation providers.
- Evidence includes requester, approver/rejecter, policy name, policy reason, risk, approval status, provider, target, lifecycle timing, incident linkage, and safe result/error summaries.
- Owner/admin users can export safe JSON evidence for review; exports are intentionally limited and exclude raw metadata.
- Governance evidence is compliance-supporting review material, not an immutable audit ledger or certification claim.
- Raw operation input, raw provider results, raw error objects, stack traces, environment values, tokens, kubeconfig, Authorization headers, and secret-like metadata are never returned by governance evidence endpoints.

## Local Demo Accounts for Approval Testing

- Operator / Requester: `pramod.local@autoops.dev`
- Admin / Approver: `approver.local@autoops.dev`
- Both accounts are local demo accounts created by the idempotent database seed for approval workflow testing.
- The requester can trigger approval-required operations, but cannot approve or reject their own requested operation.
- The admin/approver can review, approve, or reject pending operations through the real authenticated API flow.
- Production deployments should use real organization invites and managed users, not local demo credentials.
- RBAC remains enforced by the backend; login page account buttons only prefill credentials and do not bypass authentication.

## Local Verification Notes

- Use disposable resources for action tests, such as `autoops-docker-smoke` or `default/autoops-k8s-smoke`.
- Do not add create/delete UI for smoke resources.
- Do not print `.env`, tokens, kubeconfig, Authorization headers, or provider credentials.

## Production Release Hardening

- `.env.example` is a safe template only; `.env` must never be committed and production secrets must be rotated.
- `docker-compose.prod.yml` is production-like and intentionally omits Docker socket and kubeconfig mounts by default.
- Production startup rejects placeholder JWT secrets and requires access and refresh secrets to be different.
- Backup and restore are explicit script-driven flows; restore requires typing `RESTORE` and never deletes Docker volumes.
- `scripts/check-release.ps1` runs build, typecheck, migration status when configured, and whitespace checks without destructive commands.
- Production deployment and security checklists live in `docs/PRODUCTION_DEPLOYMENT_READINESS.md` and `docs/SECURITY_CHECKLIST.md`.
