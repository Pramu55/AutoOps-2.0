# Company Pilot Runbook

This runbook describes a safe path from local demo mode to an internal company pilot. It does not authorize connecting to any real company system by itself.

## Mode 1: Local Demo

1. Clone the repository.
2. Copy `.env.example` to `.env`.
3. Start the local runtime:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-autoops.ps1 -Build
```

4. Log in with the local demo account.
5. Verify Jenkins, Docker, Kubernetes, Infrastructure, AWS, Governance, and Incidents pages.
6. Register a new user and confirm provider pages show `BLOCKED_BY_ORG_POLICY`.

## Mode 2: Internal Company Pilot

Before starting:

- obtain written authorization,
- complete the company security checklist,
- provision credentials through approved secret handling,
- define the tenant organization that may view provider inventory,
- document rollback and support ownership.

## Required Environment Variables

Core:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGINS`
- `PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS` or `PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS`

Jenkins:

- `JENKINS_URL`
- `JENKINS_USERNAME`
- `JENKINS_API_TOKEN`
- `JENKINS_ALLOWED_JOBS`

Kubernetes:

- `KUBECONFIG_HOST_PATH` or mounted kubeconfig/service account
- `KUBERNETES_API_SERVER_OVERRIDE`
- `KUBERNETES_TLS_SERVER_NAME_OVERRIDE`
- approved namespace/workload constraints

Docker:

- `DOCKER_HOST`
- documented socket or remote Docker access risk approval

AWS:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` when required
- `AWS_ALLOWED_ACCOUNT_IDS`
- `AWS_ALLOWED_REGIONS`
- `AWS_ALLOWED_DEPLOYMENT_WORKSPACES`
- `AWS_ECR_ALLOWED_REPOSITORIES`
- `AWS_ECR_ALLOWED_BUILD_TARGETS`
- `AWS_TERRAFORM_STATE_BUCKET`
- `AWS_TERRAFORM_STATE_DYNAMODB_TABLE`
- `AWS_TERRAFORM_STATE_REGION`
- `AWS_ECR_PUSH_ENABLED`
- `AWS_DEPLOYMENT_APPLY_ENABLED`

GitHub Actions:

- `GITHUB_ACTIONS_TOKEN`
- `GITHUB_REPOSITORY_OWNER`
- `GITHUB_REPOSITORY_NAME`
- `GITHUB_ACTIONS_ALLOWED_WORKFLOWS`

Prometheus/Grafana:

- `PROMETHEUS_URL`
- `GRAFANA_URL`
- `GRAFANA_PUBLIC_URL`
- `GRAFANA_API_TOKEN` when required

## Verify Health

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/ready
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps
```

## Verify Provider Connectivity

```powershell
.\scripts\check-provider-connectivity.ps1
.\scripts\show-current-org-context.ps1 -Email "pramod.local@autoops.dev" -Password "StrongPass123"
```

These scripts print presence and organization context only. They must not print tokens.

## Register a New Organization Safely

1. Open `/register`.
2. Create a new user with a new organization.
3. Log in.
4. Confirm projects, deployments, incidents, operations, and governance are empty.
5. Open provider pages and confirm `BLOCKED_BY_ORG_POLICY`.

## Enable Provider Inventory For One Organization

1. Find the organization slug:

```powershell
.\scripts\show-current-org-context.ps1 -Email "operator@example.com" -Password "<password>"
```

2. Add only that slug to `PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS`.
3. Restart the API/web/worker runtime.
4. Confirm the organization can view configured provider inventory.
5. Confirm unrelated organizations remain blocked.

Never enable all organizations globally.

## Required Checks

```powershell
pnpm.cmd --filter @autoops/types build
pnpm.cmd --filter @autoops/utils build
pnpm.cmd --filter @autoops/api typecheck
pnpm.cmd --filter @autoops/api test
pnpm.cmd --filter @autoops/worker typecheck
pnpm.cmd --filter @autoops/web typecheck
pnpm.cmd --filter @autoops/web build
git --no-pager diff --check
.\scripts\scan-secrets.ps1
.\scripts\final-smoke-check.ps1
.\scripts\check-provider-connectivity.ps1
.\scripts\company-readiness-check.ps1
```

## Rollback and Recovery

- Stop runtime with `.\scripts\stop-autoops.ps1`.
- Remove provider allowlist for the affected organization.
- Rotate any exposed credential immediately.
- Restore database only through approved backup/restore procedure.
- Do not delete Docker volumes or reset the database during incident response unless explicitly authorized.

## Evaluator Outputs To Collect

- Final smoke check result.
- Provider connectivity check result.
- Company readiness check result.
- Screenshots of provider blocked onboarding for a new org.
- Screenshots of demo/admin real connector status.
- Governance evidence for a governed operation.
- Secret scan result.
