# Demo Data Safety

## Demo Data Principles

- Use local demo data only.
- Use real local records, not fake backend records.
- Keep credentials out of screenshots, docs, logs, and videos.
- Do not connect production infrastructure without written permission.

## Local Demo Accounts

Local-only accounts:

- Operator / Requester: `pramod.local@autoops.dev`
- Admin / Approver: `approver.local@autoops.dev`

These accounts are for local AutoOps demo/testing. Production should use real organization users and managed invites.

## What Not to Show

- `.env`
- tokens
- kubeconfig
- database passwords
- password hashes
- Authorization headers
- raw provider logs that may contain secrets
- private company hostnames or cluster names

## What Not to Connect

- A production Kubernetes cluster without approval.
- A Jenkins controller with broad admin permissions.
- A Docker daemon that runs sensitive workloads.
- Any cloud account containing real company resources.

## Safe Local Jenkins Setup

- Use a local Jenkins controller.
- Use a limited API token.
- Use `JENKINS_ALLOWED_JOBS`.
- Use a harmless smoke build job.
- Do not show the token.

## Safe Local Docker Demo

- Use disposable local containers.
- Prefer AutoOps local smoke containers.
- Use START/STOP/RESTART only.
- Do not use exec, shell, delete, or create/run.

## Safe Local Kubernetes Demo

- Use Docker Desktop Kubernetes.
- Use disposable demo deployments.
- Avoid protected namespaces.
- Use scale and rollout restart only.
- Do not show kubeconfig.
- Do not access Kubernetes Secrets.

## Screenshot Safety

Follow [Screenshot and Media Guide](./SCREENSHOT_AND_MEDIA_GUIDE.md). Crop or blur browser clutter, emails, hostnames, operation IDs, and error text when needed.

## Public Posting Safety

- State that AutoOps is local-first and production-style.
- Do not claim enterprise certification.
- Do not show private company data.
- Do not upload secrets.

## Company Demo Safety

- Tell evaluators which resources are local.
- Confirm before connecting any company systems.
- Keep optional integrations marked optional.
- Use the company pilot checklist.
- Avoid destructive commands and resets.
