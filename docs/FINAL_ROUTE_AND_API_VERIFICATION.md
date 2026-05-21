# Final Route And API Verification

## Web Routes

- `/login`
- `/register`
- `/dashboard`
- `/dashboard/operations`
- `/dashboard/operations/:operationId`
- `/dashboard/governance`
- `/dashboard/incidents`
- `/dashboard/incidents/:incidentId`
- `/dashboard/integrations/jenkins`
- `/dashboard/integrations/github-actions`
- `/dashboard/integrations/docker`
- `/dashboard/integrations/kubernetes`
- `/dashboard/integrations/infrastructure`
- `/dashboard/integrations/observability`
- `/dashboard/integrations/devops-tools`
- `/dashboard/integrations/cloud`
- `/dashboard/projects`
- `/dashboard/deployments`

## API Checks

Authenticated:

- `/api/v1/ops/observability`
- `/api/v1/ops/activity`
- `/api/v1/ops/governance`
- `/api/v1/integrations/jenkins/status`
- `/api/v1/integrations/docker/status`
- `/api/v1/integrations/kubernetes/status`
- `/api/v1/integrations/infrastructure/status`
- `/api/v1/integrations/github-actions/status`
- `/api/v1/integrations/observability/status`
- `/api/v1/integrations/devops-tools/status`
- `/api/v1/integrations/cloud/status`
- `/api/v1/incidents`

Safety notes: final verification is read-only except for explicitly governed operation demos. Do not print access tokens or raw provider credentials.
