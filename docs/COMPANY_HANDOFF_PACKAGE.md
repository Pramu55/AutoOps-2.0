# AutoOps Company Handoff Package

AutoOps is a local-first, production-style DevOps Control Plane for controlled CI/CD, containers, Kubernetes, infrastructure automation, observability, governance, and company evaluation.

## What Is Included

- Next.js web console and Express API.
- PostgreSQL, Prisma, Redis, BullMQ, and worker runtime.
- Jenkins, Docker, Kubernetes, Terraform/OpenTofu, Ansible, GitHub Actions visibility, Prometheus/Grafana readiness, DevOps tool readiness, and cloud-provider readiness.
- RBAC, requester/approver separation, confirmation tokens, approval policy, operation lifecycle, governance evidence, incidents, runbooks, backup/restore scripts, release checks, and CI gates.

## Setup Path

```powershell
Copy-Item .env.example .env
notepad .env
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-autoops.ps1 -Build
.\scripts\final-smoke-check.ps1
```

## Evaluation Path

1. Review `README.md`.
2. Run the final smoke check.
3. Open the Operations Hub.
4. Review Governance Center.
5. Verify Jenkins, Docker, Kubernetes, Infrastructure, GitHub Actions, Cloud Readiness, Observability, and DevOps Tools pages.
6. Verify requester cannot approve their own operation.
7. Review `docs/FINAL_EVALUATOR_REPORT.md`.

## Security Model

AutoOps avoids arbitrary shell execution, raw provider metadata exposure, unsafe Kubernetes/Docker controls, direct cloud mutation, and secret printing. Mutating infrastructure workflows use confirmation tokens, allowlisted targets, policy checks, and worker-backed execution.

## Known Limits

AutoOps is company-pilot-ready as a local-first control-plane project. It is not SOC2 certified, production certified, or a replacement for managed cloud platforms.
