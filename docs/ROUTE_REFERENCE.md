# AutoOps Route Reference

## `/login`

- Purpose: Sign in through the real auth API.
- Who uses it: Operator / Requester, Admin / Approver, registered users.
- Data shown: Login form and local demo account prefill cards.
- Key actions: Authenticate and store session.
- Safety notes: Demo cards only prefill credentials; no auth bypass.

## `/register`

- Purpose: Create a user and organization workspace through the real API.
- Who uses it: Local evaluators creating a workspace.
- Data shown: Registration form and password validation.
- Key actions: Register user, redirect to login.
- Safety notes: Duplicate registration errors are shown safely.

## `/dashboard`

- Purpose: Command overview for platform posture.
- Who uses it: Operators and admins.
- Data shown: Runtime, projects, deployments, and readiness summaries.
- Key actions: Navigate to major modules.
- Safety notes: Uses real API data only.

## `/dashboard/operations`

- Purpose: Operations Hub.
- Who uses it: Operators, admins, incident responders.
- Data shown: Platform health, provider health, queue health, worker runtime, pending approvals, important incidents, failures, and activity.
- Key actions: View operation detail, approve/reject when authorized, open incidents/connectors.
- Safety notes: Backend enforces RBAC and requester/approver separation.

## `/dashboard/operations/:operationId`

- Purpose: Operation detail and recovery.
- Who uses it: Operators, admins, reviewers.
- Data shown: Status, governance, lifecycle, approval panel, provider details, incident link, governance evidence, safe error/result summaries.
- Key actions: Approve/reject pending operation, trigger supported recovery.
- Safety notes: Raw operation metadata is not rendered.

## `/dashboard/governance`

- Purpose: Governance Center for audit-style operation evidence.
- Who uses it: Admins, approvers, operators, and company reviewers.
- Data shown: Tenant-scoped evidence table, requester, approver/rejecter, policy, risk, approval status, provider, target, lifecycle timing, incident linkage, and safe summaries.
- Key actions: Filter evidence, open operation detail, open linked incidents, export safe JSON evidence when authorized.
- Safety notes: Exports and page data intentionally exclude raw input, raw results, raw errors, stack traces, kubeconfig, tokens, environment values, and secret-like metadata.

## `/dashboard/incidents`

- Purpose: Incident register.
- Who uses it: Operators, admins, responders.
- Data shown: Tenant-scoped incident list, filters, summary counts.
- Key actions: Open incident detail.
- Safety notes: Incidents come from real failed operations.

## `/dashboard/incidents/:incidentId`

- Purpose: Incident detail and runbook.
- Who uses it: Operators, admins, responders.
- Data shown: Severity, status, linked operation, safe error summary, lifecycle, runbook.
- Key actions: Acknowledge, resolve, open linked operation.
- Safety notes: Acknowledge/resolve permissions are enforced by backend.

## `/dashboard/integrations`

- Purpose: Integrations Hub for control plane connectors.
- Who uses it: Operators and admins.
- Data shown: Readiness and connection status for Jenkins, Docker, Kubernetes, AWS, GitHub Actions, Observability, Cloud, and DevOps tools.
- Key actions: Open specific connector dashboards.
- Safety notes: Read-only status aggregator. It does not execute provider actions, bypass boundaries, fake data, or expose secrets.

## `/dashboard/integrations/jenkins`

- Purpose: Jenkins control connector.
- Who uses it: Operators and admins.
- Data shown: Jenkins status, jobs, builds, recent Jenkins operations.
- Key actions: Trigger allowlisted build with `BUILD` confirmation.
- Safety notes: No arbitrary Jenkins mutation.

## `/dashboard/integrations/docker`

- Purpose: Docker control connector.
- Who uses it: Operators and admins.
- Data shown: Engine status, containers, images, networks, volumes, logs, Docker operations.
- Key actions: START, STOP, RESTART with confirmation and policy.
- Safety notes: No Docker exec, shell, delete, create/run, or unsafe image/volume/network controls.

## `/dashboard/integrations/kubernetes`

- Purpose: Kubernetes control connector.
- Who uses it: Operators and admins.
- Data shown: Cluster status, Metrics API status, namespaces, workloads, pods, services, rollout status.
- Key actions: SCALE and ROLLOUT with confirmation and approval policy.
- Safety notes: Protected namespaces are blocked; no exec, shell, apply, delete, Secret access, or port-forward.

## `/dashboard/integrations/infrastructure`

- Purpose: Infrastructure Automation Center for Terraform/OpenTofu and Ansible.
- Who uses it: Operators requesting IaC checks and admins reviewing apply/run approvals.
- Data shown: Tool status, allowlisted Terraform workspaces, allowlisted Ansible playbooks, recent infrastructure operations.
- Key actions: Terraform/OpenTofu validate, plan, approval-gated apply; Ansible syntax-check, check mode, approval-gated run.
- Safety notes: No arbitrary shell, no arbitrary paths, no cloud credentials, no SSH keys, no vault secrets, and no Terraform state exposure.

## `/dashboard/integrations/github-actions`

- Purpose: GitHub Actions workflow and run readiness.
- Who uses it: Operators, admins, and company evaluators.
- Data shown: Configured repository, allowlisted workflows, workflows, and latest runs when a read-only token is configured.
- Key actions: Refresh and open GitHub run links.
- Safety notes: Read-only visibility only; no arbitrary workflow dispatch or token exposure.

## `/dashboard/integrations/observability`

- Purpose: Prometheus and Grafana integration readiness.
- Who uses it: Operators and SRE/platform reviewers.
- Data shown: Prometheus readiness, target/query counts, Grafana health, and public link.
- Key actions: Refresh and open Grafana.
- Safety notes: No fake metrics and no Grafana token exposure.

## `/dashboard/integrations/devops-tools`

- Purpose: DevOps CLI readiness.
- Who uses it: Platform operators and evaluators.
- Data shown: Terraform/OpenTofu, Ansible, kubectl, Helm, Kustomize, Docker CLI, Node, and pnpm detection.
- Key actions: Refresh readiness.
- Safety notes: Version detection only; no cluster apply/delete/upgrade.

## `/dashboard/integrations/cloud`

- Purpose: Cloud Provider Readiness Center.
- Who uses it: Platform owners and company evaluators.
- Data shown: AWS/Azure/GCP readiness, safe read checks, and write model.
- Key actions: Refresh readiness.
- Safety notes: Direct cloud mutations are intentionally not implemented.

## `/dashboard/integrations/aws`

- Purpose: AWS Deployment Foundation diagnostics, readiness, and governed ECR image operations.
- Who uses it: OWNER and ADMIN users only (provider inventory access required).
- Data shown: AWS Identity (account, ARN, region), Configuration Readiness, IAM Permission Diagnostics, Remote State Storage readiness, Workspace Readiness, Deployment Targets, ECR readiness, allowlisted repositories, allowlisted build targets, tenant-scoped ECR image operations, Terraform ECS readiness, release history, and cost/blast-radius guardrail evidence.
- Key actions: Refresh diagnostics, inspect readiness gates, request ECR image build with `BUILD`, request ECR image push with `PUSH`, request ECS plan with `PLAN`, request approval-gated apply with `APPLY`, request production promotion with `PROMOTE`, request rollback with `ROLLBACK`, open governance evidence.
- Safety notes: No terraform destroy, arbitrary Terraform execution, arbitrary Dockerfile path, arbitrary build context, arbitrary image tag, arbitrary repository, Docker login password exposure, raw tfstate exposure, or AWS credential exposure. Apply/promotion/rollback are blocked when guardrails are `BLOCKED`; approval cannot override blocked guardrails.

### AWS API Routes

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/v1/integrations/aws/status` | All authenticated | Sanitized AWS connection status (no secrets, no ARN, no account ID) |
| GET | `/v1/integrations/aws/identity` | OWNER/ADMIN | AWS STS identity (account ID, ARN, region) |
| GET | `/v1/integrations/aws/readiness` | OWNER/ADMIN | Configuration readiness (env var presence, not values) |
| GET | `/v1/integrations/aws/permissions` | OWNER/ADMIN | IAM permission diagnostics per service |
| GET | `/v1/integrations/aws/remote-state` | OWNER/ADMIN | Terraform remote state S3/DynamoDB readiness |
| GET | `/v1/integrations/aws/workspace-readiness/:targetSlug` | OWNER/ADMIN | Terraform workspace file and tooling checks |
| GET | `/v1/integrations/aws/deployment-targets` | OWNER/ADMIN | Allowlisted ECS Fargate deployment targets |
| GET | `/v1/integrations/aws/summary` | OWNER/ADMIN | AWS resource summary (EC2, ECS, ECR, CloudWatch, Lambda) |
| GET | `/v1/integrations/aws/ec2/instances` | OWNER/ADMIN | EC2 instance inventory |
| GET | `/v1/integrations/aws/ecs/clusters` | OWNER/ADMIN | ECS cluster inventory |
| GET | `/v1/integrations/aws/ecs/services` | OWNER/ADMIN | ECS service inventory |
| GET | `/v1/integrations/aws/ecr/repositories` | OWNER/ADMIN | ECR repository inventory |
| GET | `/v1/integrations/aws/ecr/readiness` | OWNER/ADMIN | ECR readiness, allowlisted repositories, and build targets |
| GET | `/v1/integrations/aws/ecr/images` | Authenticated | Organization-scoped ECR image operation history |
| POST | `/v1/integrations/aws/ecr/images/build` | Authenticated | Request allowlisted Docker image build with `BUILD` |
| POST | `/v1/integrations/aws/ecr/images/push` | Authenticated | Request allowlisted ECR push with `PUSH`; production requires approval |
| GET | `/v1/integrations/aws/deployments` | Authenticated | Organization-scoped deployment history |
| GET | `/v1/integrations/aws/terraform/plan-readiness` | OWNER/ADMIN | Plan-only ECS readiness: remote state, workspace, tool, and safe pushed image metadata |
| GET | `/v1/integrations/aws/apply-readiness` | Authenticated | ECS apply readiness: checks apply status, state storage config, and plan freshness |
| GET | `/v1/integrations/aws/guardrails/readiness` | OWNER/ADMIN | Cost, blast-radius, account, and region guardrail configuration readiness |
| GET | `/v1/integrations/aws/guardrails/evaluations` | Authenticated | Organization-scoped safe guardrail evidence from AWS operations |
| GET | `/v1/integrations/aws/guardrails/evaluations/:operationId` | Authenticated | Organization-scoped safe guardrail evidence for one operation |
| POST | `/v1/integrations/aws/deployments/:targetSlug/plan` | Authenticated | Request plan-only ECS ECS Terraform/OpenTofu operation with `PLAN`; no apply/destroy |
| POST | `/v1/integrations/aws/deployments/:targetSlug/apply` | Authenticated | Request ECS Terraform/OpenTofu apply operation (creates a PENDING_APPROVAL operation; requires `APPLY`) |
| GET | `/v1/integrations/aws/releases` | Authenticated | Organization-scoped list of releases |
| GET | `/v1/integrations/aws/releases/history` | Authenticated | Organization-scoped release history |
| GET | `/v1/integrations/aws/releases/:releaseId` | Authenticated | Specific release details by ID |
| POST | `/v1/integrations/aws/releases/:releaseId/promote` | Authenticated | Request release promotion (production promotion requires approval) |
| POST | `/v1/integrations/aws/releases/:releaseId/rollback` | Authenticated | Request rollback to a previous release (always requires approval) |
| GET | `/v1/integrations/aws/release-readiness` | Authenticated | Release promote/rollback readiness check |

## `/dashboard/projects`

- Purpose: Project inventory.
- Who uses it: Operators and platform owners.
- Data shown: Real project records.
- Key actions: Create/open projects.
- Safety notes: Project data is organization-scoped.

## `/dashboard/projects/:projectId`

- Purpose: Project detail and environment management.
- Who uses it: Operators and platform owners.
- Data shown: Project fields and environments.
- Key actions: Edit project, manage environments, archive project.
- Safety notes: Uses project-scoped API endpoints.

## `/dashboard/deployments`

- Purpose: Deployment records and safe simulation trigger.
- Who uses it: Operators and evaluators.
- Data shown: Real deployment records.
- Key actions: Trigger deployment simulation and open deployment detail.
- Safety notes: Current deployment flow is safe simulation and does not mutate real infrastructure.

## `/dashboard/deployments/:deploymentId`

- Purpose: Deployment detail.
- Who uses it: Operators and evaluators.
- Data shown: Status, commit, branch, duration, metadata, event timeline.
- Key actions: Refresh and inspect lifecycle.
- Safety notes: Shows stored deployment event data.

## `/dashboard/settings`

- Purpose: Governance/settings area.
- Who uses it: Platform owners.
- Data shown: Current frontend surface for governance settings.
- Key actions: Navigate and inspect available controls.
- Safety notes: Treat as a limited current surface unless expanded later.

## `/dashboard/alerts`

- Purpose: Alert surface.
- Who uses it: Operators and responders.
- Data shown: Current frontend alert surface if present.
- Key actions: Inspect alert-related UI.
- Safety notes: No external notification integration is claimed.

## `/dashboard/observability`

- Purpose: Observability surface.
- Who uses it: Operators and admins.
- Data shown: Runtime/provider/queue data where implemented.
- Key actions: Inspect live readiness.
- Safety notes: Metrics are real or reported unavailable honestly.

## `/dashboard/resources`

- Purpose: Tenant-scoped Resource Graph explorer.
- Who uses it: Operators, admins, platform reviewers.
- Data shown: Resource readiness, provider counts, resource table, selected resource safe metadata, and graph neighbors.
- Key actions: Filter, search, select a resource, inspect neighbors.
- Safety notes: Read-only. No action buttons. Does not grant provider access or bypass RBAC/governance.

## Resource Graph API Routes

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/v1/resources/readiness` | Authenticated | Tenant-scoped graph readiness and counts |
| GET | `/v1/resources` | Authenticated | Tenant-scoped resource list with filters |
| GET | `/v1/resources/:resourceId` | Authenticated | Tenant-scoped resource detail |
| GET | `/v1/resources/:resourceId/neighbors` | Authenticated | Tenant-scoped incoming/outgoing edges |

Resource Graph responses never expose raw provider payloads, secrets, kubeconfig, tokens, Docker socket internals, Terraform state, or raw provider output.

## Incident and Timeline API Routes

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/v1/incidents` | Authenticated | Tenant-scoped incident list with filters |
| GET | `/v1/incidents/readiness` | Authenticated | Tenant-scoped incident readiness and counts |
| GET | `/v1/incidents/:incidentId` | Authenticated | Tenant-scoped incident detail with evidence |
| GET | `/v1/incidents/:incidentId/timeline` | Authenticated | Tenant-scoped incident, signal, operation, deployment, and governance evidence timeline |
| GET | `/v1/incidents/:incidentId/remediation-recommendations` | Authenticated | Deterministic recommendation-only remediation guidance derived from real incident evidence |
| POST | `/v1/incidents/:incidentId/remediation-recommendations/:recommendationId/prepare` | Authenticated | Prepare a supported recommendation as an existing governed operation after confirmation |
| POST | `/v1/incidents/:incidentId/notes` | Member+ | Add operator note to incident workflow |
| POST | `/v1/incidents/:incidentId/acknowledge` | Member+ | Acknowledge open incident |
| POST | `/v1/incidents/:incidentId/resolve` | Member+ | Resolve open/acknowledged incident |
| POST | `/v1/incidents/:incidentId/archive` | Admin+ | Archive resolved incident |
| POST | `/v1/incidents/correlate` | Authenticated | Run deterministic signal correlation |

Remediation recommendations include provider, action type, evidence used, risk level, confirmation token, approval requirement, and preparation availability. Preparing a recommendation recomputes the recommendation server-side, rejects stale or unsupported IDs, and creates only an existing governed operation. It does not call provider APIs directly, does not bypass approval or confirmation, and does not create hidden demo data or autonomous remediation.
