# Evaluator Quickstart

## What to Read First

1. [README](../README.md)
2. [Feature Matrix](./FEATURE_MATRIX.md)
3. [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)
4. [Demo Guide](./DEMO_GUIDE.md)

## What to Run First

```powershell
cd "C:\AutoOps 2.0"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-autoops.ps1 -Build
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps
```

## What to Click First

1. `/login`
2. Use Operator / Requester demo account.
3. `/dashboard`
4. `/dashboard/operations`
5. `/dashboard/integrations/docker`
6. `/dashboard/integrations/kubernetes`
7. `/dashboard/incidents`

## What to Verify

- Real auth login.
- Runtime health.
- Worker heartbeat.
- Provider health.
- Governed Docker/Kubernetes operation.
- Pending approval.
- Admin approval.
- Operation detail lifecycle.
- Incident and runbook.
- CI/release gates.

## What Makes This Project Strong

- It models real platform engineering concerns, not only UI screens.
- It separates API governance from worker execution.
- It includes RBAC and requester/approver separation.
- It handles failed operations with incidents and runbooks.
- It has production readiness, backup/restore, secret scanning, and CI gates.

## What Is Intentionally Not Included

- Unsafe Docker exec/delete/create.
- Unsafe Kubernetes exec/apply/delete/Secret access.
- AI-generated remediation.
- AWS/GitHub product connectors.
- Real production cloud deployment automation.
- Enterprise certification claims.

## Suggested Interview Questions

- How does AutoOps prevent requester self-approval?
- Why does the worker own execution instead of the API?
- How are optional integrations handled safely?
- What happens when a worker-executed operation fails?
- What would you add before a real production rollout?

## Suggested Demo Path

Use the [Demo Guide](./DEMO_GUIDE.md#demo-flow-summary) or follow the comprehensive [AutoOps Demo Script](./AUTOOPS_DEMO_SCRIPT.md).

## How to Evaluate Architecture

Look for separation of concerns:

- web is UX
- API is policy/security
- worker is execution
- database is durable state
- Redis/BullMQ is queueing
- connectors are limited and governed

## How to Evaluate Safety

Run:

```powershell
.\scripts\scan-secrets.ps1
.\scripts\check-release.ps1
```

Review [Security Checklist](./SECURITY_CHECKLIST.md) and [Controlled Operations Overview](./CONTROLLED_OPERATIONS_OVERVIEW.md).
