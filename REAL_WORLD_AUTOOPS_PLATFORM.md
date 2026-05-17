# Real-world AutoOps control-plane foundation

AutoOps is moving from simulator-only deployment behavior into a guarded
real-world DevOps control plane.

## Foundation implemented

- Provider registry: `GET /api/v1/integrations/providers`
- AWS discovery connector:
  - `GET /api/v1/integrations/aws/status`
  - `GET /api/v1/integrations/aws/summary`
  - `GET /api/v1/integrations/aws/ec2/instances`
  - `GET /api/v1/integrations/aws/ecs/clusters`
  - `GET /api/v1/integrations/aws/ecs/services`
  - `GET /api/v1/integrations/aws/ecr/repositories`
  - `GET /api/v1/integrations/aws/cloudwatch/alarms`
- Jenkins CI/CD connector:
  - `GET /api/v1/integrations/jenkins/status`
  - `GET /api/v1/integrations/jenkins/summary`
  - `GET /api/v1/integrations/jenkins/jobs`
  - `GET /api/v1/integrations/jenkins/builds`
  - `POST /api/v1/integrations/jenkins/jobs/:jobName/build`
- Kubernetes real visibility and controlled operations:
  - `GET /api/v1/integrations/kubernetes/nodes`
  - `GET /api/v1/integrations/kubernetes/workloads/:namespace/deployments/:name/rollout-status`
  - `POST /api/v1/integrations/kubernetes/workloads/:namespace/deployments/:name/scale`
  - `POST /api/v1/integrations/kubernetes/workloads/:namespace/deployments/:name/rollout-restart`
- Operation lifecycle:
  - `GET /api/v1/operations`
  - `GET /api/v1/operations/:operationId`
  - `POST /api/v1/operations/:operationId/approve`
  - `POST /api/v1/operations/:operationId/reject`
- Audit log:
  - `GET /api/v1/audit-logs`

## Safety model

All real mutations require authentication, organization context, OWNER or ADMIN
role, explicit confirmation token, operation record, audit log, and BullMQ
worker execution. Production environment operations enter `PENDING_APPROVAL`
and are not executed until approved.

AutoOps does not expose provider secrets, kubeconfig content, tokens, certs, or
Kubernetes Secret resources. API responses include connection states and safe
metadata only.

## Provider configuration

Kubernetes:

- `KUBECONFIG`
- `KUBECONFIG_HOST_PATH`
- `KUBERNETES_API_SERVER_OVERRIDE`
- `KUBERNETES_TLS_SERVER_NAME_OVERRIDE`

AWS:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` optional
- `AWS_ACCOUNT_ID` optional

Jenkins:

- `JENKINS_URL`
- `JENKINS_USERNAME`
- `JENKINS_API_TOKEN`
- `JENKINS_REQUEST_TIMEOUT_MS` optional
- `JENKINS_TRIGGER_POLL_TIMEOUT_MS` optional
- `JENKINS_TRIGGER_POLL_INTERVAL_MS` optional

Jenkins uses the Remote Access API (`/api/json`) with HTTP Basic Auth using
username and API token. Mutating build triggers fetch and send a Jenkins crumb
when the crumb issuer is available. AutoOps does not use Jenkins CLI, script
console, plugin install/update, job creation/deletion, or job config mutation.

GitHub is represented in the provider registry but remains `NOT_CONFIGURED`
until its real connector is implemented.

## Known limitations

- Kubernetes controlled operations are limited to deployment scale and rollout
  restart, with protected namespaces blocked.
- Jenkins build trigger polls the queue item for a real executable build number.
  If Jenkins accepts the trigger but no executable is observed before timeout,
  the operation result records `buildVerified: false`.
- GitHub read/write connector is not implemented in this foundation slice.
- AWS integration is discovery-only until a governed control milestone is
  implemented.
- The existing deployment executor can still run simulation deployments when
  explicitly triggered through the deployment flow; real provider operations use
  the separate Operation model and operations queue.
