# OPA Policy-as-Code Foundation

AutoOps evaluates mutating operations against Open Policy Agent before an operation can be created as `QUEUED` and before any BullMQ job is enqueued.

## Runtime

Start OPA with the Docker Compose overlay:

```powershell
docker compose -f docker-compose.yml -f docker-compose.opa.yml up -d --build opa api worker web
```

OPA serves the bundled policy from:

```text
infra/opa/policies/operation.rego
```

The API calls:

```text
POST ${OPA_URL}${OPA_POLICY_PATH}
```

with an input object containing tenant, actor, operation, validated project/environment scope, policy-safe target metadata, and non-secret policy configuration.

## Modes

`OPA_ENFORCEMENT_MODE=shadow`

The API still calls OPA and records the decision in audit metadata. Successful policy denies or approval requests are observed, while existing AutoOps approval behavior remains in control. OPA unavailability is still fail-closed.

`OPA_ENFORCEMENT_MODE=enforce`

The OPA decision is enforced:

- `allow=true` and `approvalRequired=false`: create `QUEUED`, enqueue BullMQ.
- `allow=true` and `approvalRequired=true`: create `PENDING_APPROVAL`, do not enqueue.
- `allow=false`: reject safely, audit the policy denial, do not enqueue.

Existing environment approval still applies. A production environment can require approval even if OPA returns `approvalRequired=false`.

## Decision Contract

OPA must return:

```json
{
  "allow": true,
  "approvalRequired": false,
  "risk": "low",
  "reasons": ["Operation allowed by policy."],
  "controls": ["jenkins_allowed_jobs"]
}
```

If OPA is unavailable, times out, returns non-2xx, or returns malformed data, the API normalizes the result to a fail-closed deny.

## Tenant And Secret Boundaries

Before policy evaluation, the API validates supplied `projectId` and `environmentId` with `organizationId` scoped queries. Tenant-owned resources are not queried by ID alone.

The API does not send credentials to OPA. Policy input only includes safe metadata such as Jenkins job name and parameter count, Kubernetes namespace/kind/name/replica count, Docker action/container name, actor role, organization ID, and policy thresholds. It does not send tokens, passwords, kubeconfig, `DATABASE_URL`, `REDIS_URL`, GitHub tokens, Jenkins tokens, or secret values.

## Foundation Rules

The bundled Rego policy covers:

- Jenkins: requested job must be in `JENKINS_ALLOWED_JOBS`.
- Kubernetes: protected namespaces are denied.
- Kubernetes: scale operations above `POLICY_KUBERNETES_SCALE_APPROVAL_THRESHOLD` require approval.
- Docker: start is allowed.
- Docker: stop and restart require approval.

Docker policy support is present for the policy foundation. Docker execution remains bounded by the existing provider implementation status.
