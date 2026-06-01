# Evaluator Quickstart

Welcome! If you are a recruiter, engineering manager, or interviewer evaluating this project, this guide will provide the fastest path to understanding AutoOps and experiencing its core value proposition.

## What to Read First

1. [README](../README.md)
2. [Feature Matrix](./FEATURE_MATRIX.md)
3. [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)

## What to Run First

To start the platform locally using Docker Compose:

```powershell
cd "C:\AutoOps 2.0"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-autoops.ps1 -Build
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps
```

## Recommended Demo Path

We recommend the following flow to evaluate the application's workspaces and safety mechanisms:

1. **Login**: Navigate to `http://localhost:3000/login`. Use the pre-filled Operator account.
2. **Command Workspace**: Observe the high-level signals, resource counts, and priority alerts.
3. **Operations Hub**: Check the worker queue, active platform status, and pending approvals.
4. **Incidents**: Open the incident log to see failure records generated from worker operations.
5. **Incident detail**: Click into an incident to see the vertical event timeline and runbook.
6. **Recommended Remediation**: Observe the deterministic, evidence-based remediation recommendation cards.
7. **Governed preparation safety behavior**: Click "Prepare governed action". Notice how it uses the existing approval and RBAC pipeline without executing autonomously. Unsafe actions remain disabled.
8. **Governance Center**: View the immutable audit log of operations and policy decisions.
9. **Docker/Kubernetes/Jenkins integrations**: View real status from local connectors. Try a governed action like a Docker restart, and notice the exact confirmation token requirement.
10. **Projects and deployments**: View tenant-scoped delivery configurations.

## What Safety Behavior to Notice

While evaluating, please pay attention to these enterprise safety mechanisms:
- **No Autonomous Auto-Fix**: The system provides recommendations, but forces humans through an approval and confirmation pipeline.
- **Requester/Approver Separation**: You cannot approve an operation that you requested.
- **Tenant Isolation**: Operations and incidents belong to specific organizations.
- **Confirmation Tokens**: Destructive actions require typing exact phrases (e.g., `RESTART`).
- **Data Redaction**: Exported logs and API responses strip raw secrets, tokens, and kubeconfig values.

## Suggested Interview Questions

- How does AutoOps separate API governance from worker execution?
- Why did you choose deterministic remediation recommendations over an AI-driven auto-fix bot?
- How are optional integrations handled without generating fake mock data?
- What happens when a worker-executed operation fails?
