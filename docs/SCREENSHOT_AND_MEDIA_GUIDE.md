# Screenshot and Media Guide

## Purpose

This guide helps create safe public screenshots, portfolio images, and demo videos without exposing secrets or private runtime details.

## Recommended Screenshots

1. Operations Hub.
2. Kubernetes connector.
3. Docker connector.
4. Jenkins connector.
5. Operation detail governance.
6. Pending approvals.
7. Incident runbook.
8. Login RBAC demo accounts.
9. CI/release docs or GitHub Actions.

## Best LinkedIn Carousel Order

1. One title slide: "AutoOps DevOps Control Plane".
2. Operations Hub.
3. Governed Docker or Kubernetes action.
4. Approval workflow.
5. Operation lifecycle.
6. Incident and runbook.
7. CI/release gates.
8. Architecture diagram.

## Best GitHub README Image Order

1. Operations Hub.
2. Kubernetes connector.
3. Operation detail.
4. Incident runbook.
5. CI badge/workflow.

## Best Portfolio Image Order

1. Architecture diagram.
2. Dashboard/Operations Hub.
3. Connector pages.
4. Approval flow.
5. Incident/runbook.
6. Release readiness.

## What to Crop

- Browser tab clutter.
- Personal browser toolbar.
- Messy address bar query strings.
- External notifications.
- Unneeded terminal history.

## What to Blur

- Email address if desired.
- Internal operation IDs if desired.
- Hostnames if sensitive.
- Error summaries if they include private target names.
- Any token-like text.

## What Not to Upload

- `.env`
- Jenkins API token
- JWT secrets
- database password
- kubeconfig
- Authorization header
- pgAdmin password hash table
- terminal output with tokens
- real company cluster details
- private credentials

## Safe Captions

- "AutoOps Operations Hub with runtime, queue, provider, approval, and incident visibility."
- "Governed Kubernetes scale and rollout operations with protected namespace safety."
- "Failed operation incident with deterministic safe runbook."
- "Worker-backed operation lifecycle with RBAC and approval separation."

## Demo Video Plan

1. Open with the problem: unsafe operational actions need governance.
2. Show AutoOps console.
3. Trigger a governed operation.
4. Show pending approval.
5. Approve as Admin / Approver.
6. Show operation lifecycle.
7. Show incident/runbook.
8. End with CI/release gates.

## 60-Second Video Script

"AutoOps is a production-style DevOps Control Plane for Jenkins, Docker, and Kubernetes. It uses real connector data, RBAC, policy gates, confirmation tokens, and worker-backed execution. Here I trigger a governed operation as an operator. Because policy requires approval, it stays pending and is not executed. I switch to the admin approver account, approve it, and the worker executes. If an operation fails, AutoOps creates an incident with a safe runbook. The project also includes production readiness docs, backup/restore scripts, secret scanning, and GitHub Actions release gates."

## 90-Second Video Script

Use the 60-second script, then add:

"The API owns security decisions. The frontend is only a console. Docker exec/delete and Kubernetes exec/apply/delete/Secret access are intentionally not implemented. This keeps the project focused on governed operations, auditability, and safe platform engineering practices."

## Screenshot Filename Suggestions

- `01-operations-hub.png`
- `02-kubernetes-connector.png`
- `03-docker-connector.png`
- `04-jenkins-connector.png`
- `05-operation-detail-governance.png`
- `06-pending-approvals.png`
- `07-incident-runbook.png`
- `08-login-demo-accounts.png`
- `09-ci-release-gates.png`
