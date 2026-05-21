# AutoOps Final Release Checklist

Purpose: use this checklist before publishing the company-demo release candidate.

## Repository

- [ ] `git status --short` reviewed.
- [ ] No `.env`, kubeconfig, private key, token, backup, or Terraform state file is committed.
- [ ] Pull request checklist completed.
- [ ] GitHub Actions CI is green after push.

## Local Release Gate

- [ ] `pnpm.cmd --filter @autoops/database build`
- [ ] `pnpm.cmd --filter @autoops/types build`
- [ ] `pnpm.cmd --filter @autoops/utils build`
- [ ] `pnpm.cmd --filter @autoops/logger build`
- [ ] `pnpm.cmd --filter @autoops/api typecheck`
- [ ] `pnpm.cmd --filter @autoops/api build`
- [ ] `pnpm.cmd --filter @autoops/api test`
- [ ] `pnpm.cmd --filter @autoops/worker typecheck`
- [ ] `pnpm.cmd --filter @autoops/worker build`
- [ ] `pnpm.cmd --filter @autoops/web typecheck`
- [ ] `pnpm.cmd --filter @autoops/web build`
- [ ] `git diff --check`
- [ ] `.\scripts\check-release.ps1`
- [ ] `.\scripts\scan-secrets.ps1`

## Runtime

- [ ] `.\scripts\start-autoops.ps1 -Build`
- [ ] API, web, worker, Postgres, and Redis are healthy.
- [ ] Jenkins/Docker/Kubernetes status endpoints are honest.
- [ ] Terraform/OpenTofu and Ansible are available in the worker.
- [ ] `.\scripts\final-smoke-check.ps1` passes.

## Demo Safety

- [ ] Screenshots reviewed for secrets.
- [ ] Browser tabs/address bar cropped or blurred if needed.
- [ ] Demo uses only local demo accounts.
- [ ] Cloud providers are shown as readiness checks only unless explicitly configured for read-only checks.
- [ ] Limitations and future scope are stated honestly.
