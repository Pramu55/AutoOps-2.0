# Provider Onboarding and Organization Access

AutoOps separates tenant-owned data from shared local provider inventory. New organizations are blocked from shared Jenkins, Docker, Kubernetes, AWS, GitHub Actions, and other provider inventory by design.

## Readiness States

Provider responses now include a canonical `readiness` object alongside the existing backward-compatible `status` field. `status` keeps provider-specific diagnostic strings such as `AUTH_FAILED`, `FORBIDDEN`, or `BLOCKED_BY_ORG_POLICY`; `readiness.state` normalizes provider availability into four UI/API states:

- `DISABLED`: provider access is intentionally blocked by tenant policy, feature policy, or explicit provider disablement. This must not expose restricted provider configuration or inventory.
- `NOT_CONFIGURED`: provider use is allowed, but required configuration is incomplete.
- `UNREACHABLE`: required configuration exists, but a safe read-only validation failed, timed out, was forbidden, failed authentication, or produced a sanitized provider error.
- `CONNECTED`: required configuration exists and an actual provider-specific, non-mutating read-only validation passed. Configuration presence alone is not enough.

## Legacy Status Meanings

- `BLOCKED_BY_ORG_POLICY`: the organization is not explicitly enabled for shared provider inventory. This is expected for new users and protects tenant isolation.
- `NOT_CONFIGURED`: the organization is enabled, but required connector configuration is missing.
- `CONNECTED`: the organization is enabled and the connector reached the provider.
- `UNREACHABLE`: the organization is enabled, but the provider could not be reached.
- `AUTH_FAILED`: the organization is enabled, but provider credentials were rejected.

Status endpoints return safe onboarding data for blocked organizations. Inventory/detail/action endpoints still return `403` for blocked organizations.

## Why New Users Are Blocked

Shared local provider inventory can include Jenkins jobs, Docker containers, Kubernetes resources, cloud account details, and observability targets. A new tenant owner should not automatically see this data. Tenant `OWNER` or `ADMIN` role is not enough; provider inventory must also be explicitly enabled for the organization.

## Enabling Demo Provider Access

For local demo use, allowlist only the intended demo/admin organization:

```powershell
PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS=autoops-demo,pramod-s-ss-workspace
```

You can also allowlist a specific organization ID:

```powershell
PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS=
```

Do not use `*` for company or multi-tenant deployments.

## Production Guidance

For production, prefer per-organization provider credentials through the approved deployment process. Never share one company cluster, Docker host, Jenkins controller, or cloud account inventory with unrelated tenants unless the platform team has explicitly approved that access boundary.

## Operator Helper

Use the safe helper to confirm which organization a user is logging into:

```powershell
.\scripts\show-current-org-context.ps1 -Email "pramod.local@autoops.dev" -Password "StrongPass123"
```

The script prints user/org context and never prints access or refresh tokens.

## Verification

1. Log in as the demo/admin org and verify Jenkins, Docker, and Kubernetes show connected local data when configured.
2. Register a new user and verify provider pages show `BLOCKED_BY_ORG_POLICY` onboarding.
3. Call inventory endpoints as the new user and verify they return `403`.
4. Confirm no secrets, tokens, kubeconfig contents, Docker socket details, or cloud credentials appear in API responses or UI.
