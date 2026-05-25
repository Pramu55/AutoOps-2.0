# Company Provider Connectivity Handoff

AutoOps does not ship with company credentials. Jenkins, Kubernetes, Docker, AWS, GitHub Actions, observability, and other provider connectors must be enabled with credentials and access approved by the company or evaluation environment.

## Provider Inventory Boundary

Provider status endpoints are safe and secret-free. Provider inventory is stricter because it can reveal shared platform resources such as Jenkins builds, Docker containers, Kubernetes workloads, AWS identity, and observability targets.

Blocked organizations receive `BLOCKED_BY_ORG_POLICY` from status endpoints. This is not connector misconfiguration; it means tenant isolation is working and shared provider inventory is intentionally disabled for that organization. Inventory/detail/action endpoints still return `403` while blocked.

To enable provider inventory for an approved tenant organization, set one of:

- `PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS=autoops-demo,pramod-s-ss-workspace`
- `PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS=<organization-id>`

Local Docker Compose defaults the seeded demo organization slug `autoops-demo` for company-demo readiness. New registered organizations remain blocked unless explicitly added.

Use `.\scripts\show-current-org-context.ps1 -Email "pramod.local@autoops.dev" -Password "StrongPass123"` to confirm the current organization slug/id without printing tokens.

## Jenkins

Required configuration:

- `JENKINS_URL`
- `JENKINS_USERNAME`
- `JENKINS_API_TOKEN`
- `JENKINS_ALLOWED_JOBS`

Use a Jenkins API token, not a password. AutoOps never returns the token in API responses or UI.

## Kubernetes

Required configuration:

- `KUBECONFIG=/app/.kube/config`
- `KUBECONFIG_HOST_PATH`
- `KUBERNETES_API_SERVER_OVERRIDE` when Docker Desktop exposes localhost-only API endpoints
- `KUBERNETES_TLS_SERVER_NAME_OVERRIDE=127.0.0.1`

Mount kubeconfig read-only. Do not commit kubeconfig or cluster credentials.

## Docker

Local demo configuration:

- `DOCKER_SOCKET_PATH=/var/run/docker.sock`
- `DOCKER_HOST=unix:///var/run/docker.sock`

Docker socket access is powerful. Keep it limited to approved local/company demo environments.

## AWS

Required only when AWS readiness or governed AWS deployment workflows are being evaluated:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ALLOWED_DEPLOYMENT_WORKSPACES`
- `AWS_ECR_ALLOWED_REPOSITORIES`
- `AWS_ECR_ALLOWED_BUILD_TARGETS`

Mutation gates remain disabled unless explicitly enabled:

- `AWS_ECR_PUSH_ENABLED=false`
- `AWS_DEPLOYMENT_APPLY_ENABLED=false`

Do not add real AWS credentials to the repository.

## GitHub Actions

Configure read-only workflow visibility with:

- `GITHUB_ACTIONS_TOKEN`
- `GITHUB_REPOSITORY_OWNER`
- `GITHUB_REPOSITORY_NAME`
- `GITHUB_ACTIONS_ALLOWED_WORKFLOWS`

Do not expose or log the token.

## Verification

Run:

```powershell
.\scripts\check-provider-connectivity.ps1
.\scripts\final-smoke-check.ps1
```

Manual checks:

1. Login as `pramod.local@autoops.dev`.
2. Confirm provider inventory is not blocked for the demo org when allowlisted.
3. Confirm configured providers show real status/data.
4. Register a new user.
5. Confirm the new organization sees empty tenant data and blocked provider inventory.

## Disable Provider Inventory

Clear both allowlists and restart:

- `PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS=`
- `PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS=`

Provider status remains safe, but inventory and actions remain blocked.
