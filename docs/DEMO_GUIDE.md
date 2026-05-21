# AutoOps Demo Guide

## Purpose

This guide gives a safe, repeatable company demo path for AutoOps. It shows real connector data, governed operation flow, RBAC, approvals, worker execution, incidents, runbooks, and release readiness.

## Target Audience

- Recruiters reviewing a serious DevOps portfolio project.
- DevOps, Cloud, Platform, SRE, Backend, or Full-stack interviewers.
- Company evaluators checking pilot readiness.

## Prerequisites

- Docker Desktop is running.
- PostgreSQL, Redis, API, web, and worker containers are healthy.
- Optional local Jenkins is running if the Jenkins connector will be shown.
- Optional Docker Desktop Kubernetes is running if the Kubernetes connector will be shown.
- Optional Terraform/OpenTofu and Ansible binaries are installed in the runtime if infrastructure actions will be executed.
- `.env` exists locally and is not committed.

## Demo Safety Checklist

- Do not show `.env`, tokens, kubeconfig, database passwords, or Authorization headers.
- Use local demo accounts only.
- Use local Jenkins, Docker smoke containers, local Kubernetes resources, and local-only IaC smoke samples.
- Do not connect a real production cluster without permission.
- Do not run destructive reset commands.
- Do not show raw logs if they may contain secrets.

## Start AutoOps

```powershell
cd "C:\AutoOps 2.0"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-autoops.ps1 -Build
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps
```

Open `http://localhost:3000`.

## Login Accounts

These are local demo accounts only.

| Role | Email | Use |
| --- | --- | --- |
| Operator / Requester | `pramod.local@autoops.dev` | Request governed operations |
| Admin / Approver | `approver.local@autoops.dev` | Approve/reject and resolve |

Use the login page demo buttons to prefill credentials. The buttons do not bypass authentication.

## Demo Flow Summary

1. Login as Operator / Requester.
2. Open Dashboard and Operations Hub.
3. Show runtime health, provider health, queue health, and worker heartbeat.
4. Show Jenkins, Docker, Kubernetes, and Infrastructure Automation connector pages.
5. Trigger a governed Docker restart, Kubernetes scale, Terraform plan, or Ansible check.
6. Show the pending approval and requester self-approval block.
7. Login as Admin / Approver.
8. Approve or reject.
9. Show worker execution and operation detail lifecycle.
10. Show governance evidence.
11. Show incident and runbook for a failed operation.
12. Show CI/release readiness docs.

## Step 1: Login as Operator / Requester

Open `/login`, choose `Use Operator account`, then sign in. Explain that this is a real local seeded user and organization membership.

## Step 2: Open Dashboard / Operations Hub

Open `/dashboard` and `/dashboard/operations`. Explain that Operations Hub is the command center for health, approvals, incidents, failures, activity, worker runtime, and queues.

## Step 3: Show Runtime Health and Worker Heartbeat

In Operations Hub, show:

- API health
- PostgreSQL health
- Redis health
- worker runtime
- queue coverage
- latest operations

Explain that worker liveness comes from persisted heartbeat rows, not fake UI state.

## Step 4: Show Jenkins Connector

Open `/dashboard/integrations/jenkins`.

Show:

- connection status
- allowed jobs
- jobs/builds returned from Jenkins when configured
- `BUILD` confirmation modal for allowed build trigger

Say that Jenkins mutations are limited to allowlisted build triggers.

## Step 5: Show Docker Connector

Open `/dashboard/integrations/docker`.

Show:

- engine status
- containers, images, networks, volumes
- container logs
- governed start/stop/restart actions

Say that Docker exec, shell, delete, create/run, image push/delete, volume delete, and network delete are intentionally absent.

## Step 6: Show Kubernetes Connector and Metrics

Open `/dashboard/integrations/kubernetes`.

Show:

- cluster status
- Metrics API status
- namespaces, workloads, pods, services
- protected namespace labels
- scale and rollout restart modals
- rollout status panel

Say that Kubernetes exec, shell, apply, delete, Secret access, and port-forward are intentionally absent.

## Step 7: Show Infrastructure Automation Center

Open `/dashboard/integrations/infrastructure`.

Show:

- Terraform/OpenTofu tool status.
- Ansible tool status.
- allowlisted `local-smoke` Terraform workspace.
- allowlisted `local-smoke` Ansible playbook.
- disabled actions when tools are not installed.
- approval requirement for `APPLY` and `RUN`.

Say that AutoOps never accepts arbitrary shell commands or arbitrary file paths. Terraform/OpenTofu and Ansible actions are fixed worker operations against allowlisted files.

## Step 8: Trigger a Governed Operation

Safe options:

- Docker restart on a disposable local AutoOps smoke container.
- Kubernetes scale on a non-protected local deployment.
- Terraform/OpenTofu plan if the tool is installed.
- Ansible check mode if Ansible is installed.

Use the required confirmation token shown in the modal. Do not use production resources.

## Step 9: Show Pending Approval

For Docker stop/restart, Kubernetes scale above 2 replicas, Terraform/OpenTofu apply, or Ansible run, show `PENDING_APPROVAL` in Operations Hub. Explain that approval-required operations are not enqueued until approved.

## Step 10: Login as Admin / Approver

Logout, then login with the Admin / Approver account. Explain that the approver is a real local database user with a real organization membership.

## Step 11: Approve or Reject Operation

Open pending approvals and approve the operation. Explain that requesters cannot approve their own approval-required operations.

## Step 12: Show Worker Execution

Watch the operation move through queued/running/succeeded or failed states. Explain that the worker owns execution after the API validates policy and approval.

## Step 13: Show Operation Detail Lifecycle

Open `/dashboard/operations/:operationId`. Show:

- governance
- approval panel
- lifecycle timeline
- provider details
- governance evidence summary
- incident link if failed
- recovery panel if supported

## Step 14: Show Governance Center

Open `/dashboard/governance`. Show:

- requester and approver evidence
- policy name and approval reason
- provider and target
- operation status and timing
- incident linkage
- safe JSON export if logged in as Admin / Approver

Explain that this is audit-style evidence for review and intentionally excludes raw metadata, tokens, stack traces, kubeconfig, and secret-like fields.

## Step 15: Show Incident and Runbook

Open `/dashboard/incidents` and then an incident detail page. Show:

- severity
- status
- linked operation
- safe error summary
- deterministic runbook
- acknowledge and resolve flow

Explain that runbooks are safe templates, not AI-generated remediation.

## Step 16: Show CI/Release Readiness

Show:

- `.github/workflows/ci.yml`
- [CI and Release Gates](./CI_AND_RELEASE_GATES.md)
- [Production Deployment Readiness](./PRODUCTION_DEPLOYMENT_READINESS.md)
- [Security Checklist](./SECURITY_CHECKLIST.md)

## Suggested 5-Minute Demo Script

1. "AutoOps is a production-style DevOps Control Plane for governed Jenkins, Docker, Kubernetes, Terraform/OpenTofu, and Ansible operations."
2. Login as Operator.
3. Show Operations Hub health, worker runtime, approvals, and incidents.
4. Open Docker or Kubernetes and trigger one governed operation.
5. Show approval-required state.
6. Login as Admin and approve.
7. Show operation detail, Governance Center, and incident/runbook.
8. End with CI/release gates and safety docs.

## Suggested 10-Minute Demo Script

Use the 5-minute script, then add:

- Jenkins connector and allowlisted build trigger.
- Kubernetes Metrics API and protected namespaces.
- Infrastructure Automation Center for Terraform/OpenTofu and Ansible.
- Worker heartbeat details.
- Backup/restore and release-check scripts.
- Feature matrix and limitations/roadmap.

## What to Say

- "AutoOps uses real connector data and safe backend records."
- "The frontend does not bypass RBAC; backend services enforce authorization."
- "Approvals are policy-driven and worker execution starts only after approval when required."
- "Incidents are created from failed operations and use deterministic safe runbooks."
- "Infrastructure automation uses allowlisted workspaces/playbooks only and never exposes a shell."
- "This is production-style and company-pilot-ready direction, not enterprise-certified software."

## What Not to Show

- `.env`
- Jenkins API token
- kubeconfig
- database password or password hashes
- Authorization headers
- raw stack traces
- production cluster names or credentials
- Terraform state files, Ansible vault files, SSH keys, or cloud credentials

## Troubleshooting Demo Issues

- If web is unavailable, run `docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps`.
- If API is unhealthy, check `Invoke-RestMethod http://localhost:4000/health`.
- If worker is stale, restart the worker service with compose.
- If Jenkins is `NOT_CONFIGURED`, explain it is optional and use Docker/Kubernetes flows.
- If Kubernetes Metrics API is unavailable, show cluster inventory and explain metrics are optional.
- If Terraform/OpenTofu or Ansible is `NOT_INSTALLED`, show the honest disabled state and explain the setup path.

## Safe Reset Guidance Without Destructive Commands

- Use `.\scripts\stop-autoops.ps1` to stop services safely.
- Use `.\scripts\start-autoops.ps1 -Build` to rebuild/start.
- Do not run `prisma migrate reset`.
- Do not delete Docker volumes.
- Do not prune Docker as part of a demo.
