# AutoOps CI and Release Gates

## Purpose

Day 16 adds repeatable automated checks for pull requests, pushes, and local release readiness. CI is a quality gate only; it does not deploy AutoOps and it does not call real Jenkins, Docker, or Kubernetes resources.

## What CI Verifies

- pnpm install with the committed lockfile.
- Prisma client generation and database package build.
- Shared types build.
- API typecheck, build, and focused pure-policy tests.
- Worker typecheck and build.
- Web typecheck and production build.
- Git whitespace check.
- Lightweight secret scan.
- Optional integration configuration remains optional.

## GitHub Actions Workflow

Workflow path:

```text
.github/workflows/ci.yml
```

It runs on pushes and pull requests targeting `main` using `ubuntu-latest`, Node.js 20, pnpm 9.12.0, and safe CI placeholder environment values. It does not require a Jenkins token, kubeconfig, Docker socket, Docker Desktop Kubernetes, local `.env`, a CI database service, or local database volumes.

## Local Release Check

Windows:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\check-release.ps1
```

Linux / CI:

```bash
bash scripts/check-release.sh
```

## Secret Scan

Windows:

```powershell
.\scripts\scan-secrets.ps1
```

Linux / CI:

```bash
bash scripts/scan-secrets.sh
```

The scanner prints file path, line, and category only. It does not print matched secret values.

## Pull Request Checklist

Use `.github/pull_request_template.md` for every PR. The checklist covers release checks, secret scan, `.env` safety, RBAC safety, approval safety, migration awareness, docs, and screenshots for UI changes.

## Branch Protection Recommendations

- Require pull requests before merge.
- Require `AutoOps CI / Quality Build` to pass.
- Require branches to be up to date before merge.
- Require at least one reviewer before merge.
- Block force pushes to `main`.
- Restrict direct pushes to `main` for company setup.
- Require secret scan before merge.
- Do not deploy production from unreviewed branches.

## Required Status Checks

- `AutoOps CI / Quality Build`

Add more checks later only when they are deterministic and do not require private local resources.

## Optional Integrations in CI

Jenkins, Docker, and Kubernetes are optional in CI. The workflow intentionally does not configure:

- `JENKINS_API_TOKEN`
- Docker socket mounts
- kubeconfig
- real cluster credentials

Missing optional integration config must not fail build/typecheck.

## What Must Not Run in CI

- `prisma migrate reset`
- Docker volume deletion
- Docker prune
- Kubernetes commands against a real cluster
- Jenkins API calls
- Docker socket controls
- Production deployment
- Secret or environment dumps
- Fake deployment success markers

## Handling CI Failures

Fix the failing check locally, rerun the matching command, and push a new commit. Do not skip checks to merge around a real build or safety failure.

## Troubleshooting

### pnpm install failure

Symptom: install fails before builds start. Likely cause: lockfile drift. Safe fix: run `pnpm install`, commit `pnpm-lock.yaml` if it intentionally changed.

### Corepack or pnpm setup failure

Symptom: pnpm command is missing. Likely cause: action setup issue or unsupported Node version. Safe fix: verify `.github/workflows/ci.yml` uses Node 20 and pnpm 9.12.0.

### Prisma generate failure

Symptom: database build fails at Prisma generation. Likely cause: invalid schema or dependency install issue. Safe fix: run `pnpm --filter @autoops/database build` locally and inspect the Prisma error.

### TypeScript typecheck failure

Symptom: API, worker, or web typecheck fails. Likely cause: changed type contract. Safe fix: fix the typed API/shared contract and rerun the failing package command.

### API build failure

Symptom: `@autoops/api build` fails. Likely cause: TypeScript compile error or missing generated dependency. Safe fix: run database build first, then API build.

### Worker build failure

Symptom: `@autoops/worker build` fails. Likely cause: queue/runtime type error. Safe fix: run worker typecheck locally and fix compile errors.

### Next.js web build failure

Symptom: `@autoops/web build` fails. Likely cause: client/server rendering error, type error, or missing public env value. Safe fix: reproduce with `pnpm --filter @autoops/web build`.

### Next ESLint plugin warning

Symptom: CI logs show Next ESLint plugin warning but build passes. Likely cause: existing ESLint flat config layout. Safe fix: track as tooling polish; it is not a release blocker unless lint is made strict.

### MODULE_TYPELESS_PACKAGE_JSON warning

Symptom: CI logs show module type warning for `apps/web/eslint.config.js`. Likely cause: ESM config without package `type: module`. Safe fix: future tooling cleanup; not a runtime failure.

### git diff --check failure

Symptom: whitespace check fails. Likely cause: trailing whitespace or conflict marker. Safe fix: edit the named file and rerun `git diff --check`.

### Secret scan false positive

Symptom: scan fails on a documented placeholder. Likely cause: allowlist too narrow. Safe fix: replace the example with an obvious placeholder or update the scanner carefully without allowing real secrets.

### CI missing env var

Symptom: build fails due required env. Likely cause: compile-time env validation changed. Safe fix: add a safe placeholder to workflow env, never a real secret.

### Optional Jenkins/Kubernetes/Docker env missing

Symptom: CI fails because optional connector config is absent. Likely cause: code began requiring optional connector config at build time. Safe fix: keep connector config optional and runtime-reported as `NOT_CONFIGURED` or unavailable.

### Linux vs Windows script differences

Symptom: PowerShell release check passes but CI shell script fails, or the reverse. Likely cause: command syntax differences. Safe fix: keep both scripts aligned and prefer direct package commands over shell-specific behavior.
