# Contributing to AutoOps

Thank you for your interest in AutoOps.

AutoOps is a governance-first DevOps control-plane project built for portfolio, learning, and evaluator/demo use.

## Contribution Rules

Please follow these rules before opening a pull request:

- Do not commit `.env` files, credentials, kubeconfig, private keys, provider tokens, database URLs, Redis URLs, or Authorization headers.
- Do not add fake provider data or hidden demo data.
- Do not weaken tenant isolation, RBAC, provider inventory boundaries, approval policy, or confirmation-token workflows.
- Do not expose raw provider payloads, raw operation inputs, raw error objects, stack traces, or secret-like metadata in API responses or UI.
- Do not add unsafe Docker, Kubernetes, Jenkins, AWS, GitHub Actions, Terraform, or Ansible mutations.
- Do not add Kubernetes exec/apply/delete/Secret listing, Docker exec/delete shortcuts, arbitrary Jenkins mutation, or autonomous remediation.
- Keep all provider actions explicit, allowlisted, governed, and auditable.
- Keep frontend changes aligned with the existing service-platform UI patterns.
- Keep backend services tenant-scoped by authenticated organization context.

## Local Validation

Before opening a pull request, run these checks:

- pnpm.cmd --filter @autoops/web typecheck
- pnpm.cmd --filter @autoops/web build
- pnpm.cmd --filter @autoops/api typecheck
- pnpm.cmd --filter @autoops/api test
- git --no-pager diff --check
- .\scripts\scan-secrets.ps1

For full local readiness, also run:

- .\scripts\final-smoke-check.ps1
- .\scripts\check-provider-connectivity.ps1
- .\scripts\company-readiness-check.ps1

## Pull Request Expectations

A pull request should clearly explain:

- what changed,
- why it changed,
- which safety boundaries were preserved,
- which validation commands passed,
- whether any docs need updates.

Do not open pull requests that require real secrets to test.
