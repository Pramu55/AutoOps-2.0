# Jenkins real CI/CD connector

This connector integrates AutoOps with a real Jenkins controller through the
Jenkins Remote Access API. It never uses shell commands, Jenkins CLI, script
console, plugin management, or job configuration mutation.

## Required environment

- `JENKINS_URL`
- `JENKINS_USERNAME`
- `JENKINS_API_TOKEN`
- `JENKINS_ALLOWED_JOBS`

Optional:

- `JENKINS_REQUEST_TIMEOUT_MS`
- `JENKINS_TRIGGER_POLL_TIMEOUT_MS`
- `JENKINS_TRIGGER_POLL_INTERVAL_MS`

Use a Jenkins API token. Do not use or store Jenkins passwords.

`JENKINS_ALLOWED_JOBS` is a comma-separated allowlist. Build triggering is
disabled when the allowlist is empty, even if Jenkins status reads are
connected.

## Endpoints

- `GET /api/v1/integrations/jenkins/status`
- `GET /api/v1/integrations/jenkins/summary`
- `GET /api/v1/integrations/jenkins/jobs`
- `GET /api/v1/integrations/jenkins/builds`
- `POST /api/v1/integrations/jenkins/jobs/:jobName/build`
- `POST /api/v1/integrations/jenkins/jobs/:jobName/trigger`

All endpoints require AutoOps bearer-token authentication.

## Build trigger safety

Build trigger requests require:

- authenticated AutoOps user
- organization context
- OWNER or ADMIN role
- `confirmationToken: "BUILD"`
- `jobName` included in `JENKINS_ALLOWED_JOBS`
- Operation row
- AuditLog row
- BullMQ worker execution

If `projectId` and a production-like `environmentId` are provided, the operation
enters `PENDING_APPROVAL` and the worker does not execute until approved.

## No fake data

When Jenkins is not configured, AutoOps returns `NOT_CONFIGURED` with empty
lists. It never displays fake jobs, fake builds, fake queue items, or fake
executor counts.

## Local Jenkins setup

```powershell
docker run -d --name autoops-jenkins `
  -p 8080:8080 -p 50000:50000 `
  jenkins/jenkins:lts

docker exec autoops-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Create a Jenkins user and API token in the Jenkins UI, create the job you want
AutoOps to trigger, then set:

```powershell
$env:JENKINS_URL="http://host.docker.internal:8080"
$env:JENKINS_USERNAME="<username>"
$env:JENKINS_API_TOKEN="<token>"
$env:JENKINS_ALLOWED_JOBS="<job-name>"

docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build api worker web
```

AutoOps stores only safe operation metadata such as job name, queue URL, build
number, build URL, and Jenkins result. It does not store the Jenkins API token.
