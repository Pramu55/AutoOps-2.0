# AutoOps Production Deployment Readiness

## Purpose

This guide prepares AutoOps for a company pilot or recruiter evaluation. It explains how to configure, start, verify, back up, restore, and release AutoOps without exposing secrets or weakening governed operations.

## Current Architecture

AutoOps runs as a Next.js web console, Express API, BullMQ worker, PostgreSQL database, Redis queue/cache, and optional Prometheus/Grafana observability stack. Jenkins, Docker, and Kubernetes are optional connectors. Missing optional connector configuration should show `NOT_CONFIGURED`, not crash the platform.

## Service Map

| Service | Purpose | Local URL |
| --- | --- | --- |
| web | AutoOps console | http://localhost:3000 |
| api | REST API, auth, health, readiness | http://localhost:4000 |
| worker | BullMQ operation execution and heartbeat | http://localhost:4001/healthz |
| postgres | Durable data store | internal or localhost:5432 in local compose |
| redis | Queue/cache/rate-limit store | internal or localhost:6379 in local compose |
| prometheus | Metrics scrape | http://localhost:9090 |
| grafana | Dashboards | http://localhost:3001 |

## Required Runtime Services

- Docker Desktop or Docker Engine
- Node.js 20+ and pnpm 9+ for local build checks
- PostgreSQL 16
- Redis 7
- Optional: Jenkins controller
- Optional: Kubernetes current context

## Local vs Production Differences

- Local compose exposes Postgres and Redis ports for development.
- `docker-compose.prod.yml` keeps Postgres and Redis internal and omits Docker socket and kubeconfig mounts by default.
- Local demo seed users are for testing only.
- Production should use managed users/invites, a reverse proxy with HTTPS, and a real secret manager.

## Required Environment Variables

Copy `.env.example` to `.env` and set real values.

```powershell
Copy-Item .env.example .env
notepad .env
```

Required core variables:

- `NODE_ENV`
- `API_PORT`
- `API_HOST`
- `API_PUBLIC_URL`
- `NEXT_PUBLIC_API_URL`
- `API_INTERNAL_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGINS`
- `STRICT_ENV_VALIDATION=true` for production/company-pilot secret checks

With `STRICT_ENV_VALIDATION=true`, production rejects placeholder JWT secrets and requires access and refresh secrets to differ. Keep this disabled only for the default local demo compose unless local secrets have been rotated.

## Optional Integration Environment Variables

Jenkins:

- `JENKINS_URL`
- `JENKINS_USERNAME`
- `JENKINS_API_TOKEN`
- `JENKINS_ALLOWED_JOBS`

Docker:

- `DOCKER_SOCKET_PATH`
- `DOCKER_HOST`

Kubernetes:

- `KUBECONFIG`
- `KUBECONFIG_HOST_PATH`
- `KUBERNETES_API_SERVER_OVERRIDE`
- `KUBERNETES_TLS_SERVER_NAME_OVERRIDE`
- `KUBERNETES_ALLOWED_NAMESPACES`
- `KUBERNETES_MAX_REPLICAS`

Leave optional connector values blank when not used.

## Secret Management

- Never commit `.env`.
- Rotate JWT secrets before production.
- Use different access and refresh JWT secrets.
- Store Jenkins tokens, database passwords, Redis passwords, kubeconfig, and TLS secrets in a secret manager where possible.
- Do not print `.env`, tokens, kubeconfig, Authorization headers, or connection URLs in support requests.

## Docker Compose Deployment

Local full stack with Kubernetes connector:

```powershell
$KUBE_SERVER = kubectl config view --minify -o jsonpath="{.clusters[0].cluster.server}"
$PORT = ($KUBE_SERVER -replace "https://127.0.0.1:", "" -replace "https://localhost:", "")
$env:KUBECONFIG_HOST_PATH="$env:USERPROFILE\.kube\config"
$env:KUBERNETES_API_SERVER_OVERRIDE="https://host.docker.internal:$PORT"
$env:KUBERNETES_TLS_SERVER_NAME_OVERRIDE="127.0.0.1"

docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build
```

Production-like company pilot:

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

The production compose file does not mount Docker socket or kubeconfig by default.

## Migration Flow

Do not run `prisma migrate reset`.

```powershell
$env:DATABASE_URL="postgresql://autoops:autoops_dev@localhost:5432/autoops?schema=public"
.\node_modules\.bin\prisma.cmd migrate status --schema packages/database/prisma/schema.prisma
.\node_modules\.bin\prisma.cmd migrate deploy --schema packages/database/prisma/schema.prisma
.\node_modules\.bin\prisma.cmd migrate status --schema packages/database/prisma/schema.prisma
```

Expected final state:

```text
Database schema is up to date!
```

## Start Flow

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-autoops.ps1 -Build
```

## Stop Flow

```powershell
.\scripts\stop-autoops.ps1
```

The stop script stops containers only. It does not delete volumes, images, or database data.

## Health and Readiness Verification

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/ready
```

Authenticated readiness:

```powershell
$BASE="http://localhost:4000/api/v1"
$loginBody = @{ email = "pramod.local@autoops.dev"; password = "StrongPass123" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$BASE/auth/login" -ContentType "application/json" -Body $loginBody
$HEADERS = @{ Authorization = "Bearer $($login.data.tokens.accessToken)" }

Invoke-RestMethod -Method Get -Uri "$BASE/ops/observability" -Headers $HEADERS
Invoke-RestMethod -Method Get -Uri "$BASE/integrations/jenkins/status" -Headers $HEADERS
Invoke-RestMethod -Method Get -Uri "$BASE/integrations/docker/status" -Headers $HEADERS
Invoke-RestMethod -Method Get -Uri "$BASE/integrations/kubernetes/status" -Headers $HEADERS
Invoke-RestMethod -Method Get -Uri "$BASE/incidents" -Headers $HEADERS
```

## Worker Runtime Verification

- Open Operations Hub and check Worker Runtime.
- Confirm worker heartbeat is fresh.
- Confirm operations/deployments/system queue coverage.

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps worker
```

## Jenkins Connector Setup

Use a Jenkins API token and restrict `JENKINS_ALLOWED_JOBS`.

```powershell
docker ps --filter "name=autoops-jenkins"
```

Expected status values: `CONNECTED`, `NOT_CONFIGURED`, `AUTH_FAILED`, or `UNREACHABLE`.

## Docker Connector Setup

Local controlled Docker operations require Docker socket access. Do not enable this in production unless the risk is explicitly accepted.

```powershell
docker ps
```

AutoOps exposes start, stop, restart, logs, and inventory only. It does not expose exec, shell, create, delete, volume delete, or network delete.

## Kubernetes Connector Setup

```powershell
kubectl get nodes
kubectl get pods -A
```

Mount kubeconfig read-only and use local API override values for Docker Desktop clusters. AutoOps does not list Kubernetes Secrets and does not expose exec, apply, delete, shell, or port-forward controls.

## Backup Procedure

```powershell
.\scripts\backup-postgres.ps1
```

Backups are written to `backups\autoops-<timestamp>.dump`.

## Restore Procedure

```powershell
.\scripts\restore-postgres.ps1 -BackupPath ".\backups\autoops-2026-05-20-113000.dump"
```

The restore script requires typing `RESTORE`. It does not delete Docker volumes and does not run `prisma migrate reset`.

## Demo Users and Production Admin Safety

Local demo accounts:

- Operator / Requester: `pramod.local@autoops.dev`
- Admin / Approver: `approver.local@autoops.dev`

These are local demo accounts only. Do not use demo users in production. Production admins should be created through a controlled bootstrap or invite process. Requester and approver must remain different people for approval-required operations.

## Company Pilot Validation Flow

1. Start AutoOps.
2. Verify containers are healthy.
3. Apply/check Prisma migrations.
4. Login as Operator / Requester.
5. Login as Admin / Approver.
6. Open dashboard.
7. Open Ops Hub.
8. Verify API, PostgreSQL, Redis, and Worker runtime.
9. Verify Jenkins connected or honestly `NOT_CONFIGURED`.
10. Verify Docker connected or honestly unavailable.
11. Verify Kubernetes connected or honestly unavailable.
12. Trigger Jenkins build.
13. Verify Jenkins operation succeeds or records a safe failure.
14. Trigger Docker restart that requires approval if policy applies.
15. Verify requester cannot approve own operation.
16. Login as approver.
17. Approver approves.
18. Worker executes.
19. Operation detail shows governance and lifecycle.
20. Failed operation creates incident.
21. Incident runbook is visible.
22. Incident can be acknowledged.
23. Incident can be resolved.
24. Confirm UI exposes no raw secrets.
25. Confirm logs expose no secrets.

## Release Checklist

```powershell
.\scripts\check-release.ps1
git --no-pager diff --stat
git diff --check
```

Confirm migration status:

```powershell
$env:DATABASE_URL="postgresql://autoops:autoops_dev@localhost:5432/autoops?schema=public"
.\node_modules\.bin\prisma.cmd migrate status --schema packages/database/prisma/schema.prisma
```

## Security Checklist

See `docs/SECURITY_CHECKLIST.md`.

## Troubleshooting

### Web not opening

Symptom: `http://localhost:3000` fails. Likely cause: web container is unhealthy or port 3000 is busy.

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps web
docker compose -f docker-compose.yml -f docker-compose.k8s.yml logs --tail 100 web
```

Safe fix: free the port, rebuild web, or restart only web.

### API unhealthy

Symptom: `/health` fails. Likely cause: API container not running.

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps api
docker compose -f docker-compose.yml -f docker-compose.k8s.yml logs --tail 100 api
```

Safe fix: verify `.env`, database, and Redis, then rebuild API.

### Worker not running

Symptom: worker heartbeat stale. Likely cause: worker container stopped or Redis/DB unavailable.

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps worker
docker compose -f docker-compose.yml -f docker-compose.k8s.yml logs --tail 100 worker
```

Safe fix: start worker after Postgres and Redis are healthy.

### Postgres connection failure

Symptom: `/ready` reports Postgres error. Likely cause: wrong `DATABASE_URL` or unhealthy DB.

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps postgres
docker compose -f docker-compose.yml -f docker-compose.k8s.yml logs --tail 100 postgres
```

Safe fix: correct `.env` and restart API/worker.

### Redis connection failure

Symptom: `/ready` reports Redis error or queue counts unavailable.

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps redis
docker compose -f docker-compose.yml -f docker-compose.k8s.yml logs --tail 100 redis
```

Safe fix: start Redis and restart API/worker.

### Prisma migration drift

Symptom: migration status reports drift.

```powershell
.\node_modules\.bin\prisma.cmd migrate status --schema packages/database/prisma/schema.prisma
```

Safe fix: investigate migrations and back up the database first. Do not run reset.

### Jenkins NOT_CONFIGURED

Symptom: Jenkins status is `NOT_CONFIGURED`. Likely cause: missing Jenkins env values.

Safe check: verify `JENKINS_URL`, `JENKINS_USERNAME`, `JENKINS_API_TOKEN`, and `JENKINS_ALLOWED_JOBS` are set without printing token values.

### Jenkins AUTH_FAILED

Symptom: Jenkins status is `AUTH_FAILED`. Likely cause: invalid username/token or Jenkins permissions.

Safe fix: rotate the Jenkins API token and ensure it can read the allowlisted job.

### Jenkins UNREACHABLE

Symptom: Jenkins status is `UNREACHABLE`. Likely cause: controller stopped or wrong URL.

```powershell
docker ps --filter "name=autoops-jenkins"
```

Safe fix: start Jenkins and verify `JENKINS_URL`.

### Docker connector unavailable

Symptom: Docker status is unavailable. Likely cause: socket not mounted or Docker engine down.

```powershell
docker ps
```

Safe fix: start Docker Desktop and use the local compose file only when socket risk is accepted.

### Docker socket permission denied

Symptom: Docker returns permission denied. Likely cause: container user lacks socket permission.

Safe fix: review compose socket mount and runtime user. Do not add exec/shell controls.

### Kubernetes NOT_CONFIGURED

Symptom: Kubernetes status is `NOT_CONFIGURED`. Likely cause: kubeconfig not mounted.

```powershell
kubectl config current-context
```

Safe fix: set `KUBECONFIG_HOST_PATH` and mount kubeconfig read-only.

### Kubernetes UNREACHABLE

Symptom: cluster cannot be reached from container.

```powershell
kubectl get nodes
```

Safe fix: set `KUBERNETES_API_SERVER_OVERRIDE` to `https://host.docker.internal:<port>`.

### Kubernetes metrics API not connected

Symptom: workloads load but metrics show unavailable.

```powershell
kubectl top nodes
```

Safe fix: install or repair Metrics Server in the cluster.

### Pending approval not executing

Symptom: operation stays `PENDING_APPROVAL`.

Likely cause: no authorized separate approver or worker offline.

Safe fix: login as admin/approver and approve; verify worker heartbeat.

### Worker heartbeat stale

Symptom: worker runtime is degraded/offline.

Safe check: inspect worker container health and logs.

### Incident not created after failed operation

Symptom: operation failed but no incident linked.

Safe check: verify worker logs and incidents endpoint. Avoid manually inserting fake incidents.

### Browser stale auth token

Symptom: UI redirects or API returns session expired.

Safe fix: logout and login again.

### Port already in use

Symptom: compose cannot bind a port.

```powershell
netstat -ano | findstr ":3000"
netstat -ano | findstr ":4000"
```

Safe fix: stop the conflicting local process or change ports intentionally.

### Docker Desktop Kubernetes UI stale but kubectl Ready

Symptom: Docker Desktop UI disagrees with `kubectl`.

Safe check:

```powershell
kubectl get nodes
kubectl get pods -A
```

Safe fix: trust `kubectl` for AutoOps connector verification and restart Docker Desktop only if needed.

## Known Limitations

- Production user invite/admin bootstrap is not yet a full UI flow.
- Docker socket access is intentionally not enabled in production compose.
- Kubernetes connector depends on mounted kubeconfig or in-cluster configuration.
- Jenkins build trigger is limited to allowlisted jobs.
- No AI-generated runbooks or external alerting integrations are included in this milestone.

## Future Production Improvements

- Managed secret provider integration.
- HTTPS reverse proxy hardening.
- Real user invite/admin management UI.
- Centralized audit export.
- External alert routing after the governed incident model matures.
