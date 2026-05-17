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

## Local Verification Notes

- Use disposable resources for action tests, such as `autoops-docker-smoke` or `default/autoops-k8s-smoke`.
- Do not add create/delete UI for smoke resources.
- Do not print `.env`, tokens, kubeconfig, Authorization headers, or provider credentials.
