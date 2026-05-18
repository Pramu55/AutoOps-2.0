# Controlled Operations Overview

AutoOps controlled operations use real provider APIs through authenticated, tenant-scoped, worker-executed flows. The UI should describe integrations as control connectors or governed operations, not as passive viewing surfaces.

## Current Coverage

| Provider | Actions | Confirmation | Risk | Approval |
| --- | --- | --- | --- | --- |
| Jenkins | Build trigger / re-run for allowlisted jobs | BUILD | LOW | Not required for local dev |
| Docker | Start, stop, restart container | START, STOP, RESTART | MEDIUM | Not required for local dev |
| Kubernetes | Scale deployment, rollout restart deployment | SCALE, ROLLOUT | MEDIUM | Not required for local dev |

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

## Local Verification Notes

- Use disposable resources for action tests, such as `autoops-docker-smoke` or `default/autoops-k8s-smoke`.
- Do not add create/delete UI for smoke resources.
- Do not print `.env`, tokens, kubeconfig, Authorization headers, or provider credentials.
