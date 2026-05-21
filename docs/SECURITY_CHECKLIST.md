# AutoOps Security Checklist

Use this checklist before a company pilot, demo, or production-like deployment.

## Environment and Secrets

- Never commit `.env`.
- Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` before production.
- Use different access and refresh JWT secrets.
- Use a strong PostgreSQL password.
- Use a strong Redis password if Redis is exposed or managed externally.
- Restrict `CORS_ORIGINS` to real web origins.
- Put AutoOps behind HTTPS in production.
- Prefer a secret manager for database, Redis, Jenkins, and Kubernetes credentials.

## Network Exposure

- Do not expose PostgreSQL publicly.
- Do not expose Redis publicly.
- Restrict API and web exposure through a controlled reverse proxy.
- Review open ports before a company pilot.

## Jenkins Connector

- Protect `JENKINS_API_TOKEN`.
- Use Jenkins API tokens, not passwords.
- Restrict Jenkins token permissions.
- Restrict `JENKINS_ALLOWED_JOBS`.
- Do not enable Jenkins script console, plugin install, job create/delete, or config mutation through AutoOps.

## Kubernetes Connector

- Protect kubeconfig.
- Mount kubeconfig read-only.
- Use least-privilege Kubernetes RBAC where possible.
- Do not expose Kubernetes Secret listing or Secret data.
- Do not add Kubernetes exec, shell, apply, delete, or port-forward controls.

## Docker Connector

- Avoid Docker socket access in production unless explicitly accepted.
- Do not add Docker exec or shell controls.
- Do not add Docker create/run/delete/remove controls.
- Do not add image push/build/delete, volume delete, or network delete controls.

## Infrastructure Automation

- Do not expose arbitrary shell command execution.
- Do not accept arbitrary Terraform/OpenTofu workspace paths.
- Do not accept arbitrary Ansible playbook or inventory paths.
- Do not commit `.terraform/`, `*.tfstate`, Ansible vault files, SSH private keys, or cloud credentials.
- Do not show Terraform state, Ansible inventory secrets, cloud credentials, or provider tokens in UI/API/logs.
- Require approval for Terraform/OpenTofu apply.
- Require approval for Ansible run.
- Keep Terraform/OpenTofu plan and Ansible check output summarized and redacted.
- Mount only approved infrastructure automation directories in company environments.

## Governance

- Verify backend RBAC.
- Verify requester/approver separation.
- Verify approval policy for Docker stop/restart, Kubernetes scale above policy threshold, Terraform/OpenTofu apply, and Ansible run.
- Verify approval-required operations are not enqueued until approved.
- Verify rejected operations do not execute.
- Verify operation recovery remains confirmation, policy, and RBAC governed.
- Verify Governance Center evidence is tenant-scoped.
- Verify governance exports include safe evidence fields only.
- Verify governance exports do not include raw operation metadata, stack traces, tokens, kubeconfig, Authorization headers, or secret-like values.
- Verify infrastructure governance evidence does not include Terraform state, Ansible vault data, SSH keys, cloud credentials, or raw full logs.
- GitHub Actions integration must use read-only tokens and must not expose `GITHUB_ACTIONS_TOKEN`.
- Cloud Provider Readiness must not perform direct AWS/Azure/GCP resource mutation.
- Prometheus/Grafana checks must not expose API tokens or dashboard secrets.
- Helm/Kustomize readiness must not run `apply`, `delete`, `upgrade`, or cluster-mutating commands.

## Incidents and Runbooks

- Verify failed operations create incidents.
- Verify incident runbooks are deterministic and safe.
- Verify incident acknowledge/resolve permissions.
- Verify no AI-generated or automatic remediation is enabled.

## Backups and Restore

- Run `.\scripts\backup-postgres.ps1`.
- Store backups securely.
- Test `.\scripts\restore-postgres.ps1` in a non-production environment.
- Confirm restore requires typed `RESTORE`.
- Do not run `prisma migrate reset` against company data.

## Logging and UI Safety

- Verify logs do not expose secrets.
- Verify UI does not expose raw operation input, result, error, provider metadata, kubeconfig, or tokens.
- Verify operation details show safe summaries only.
- Verify failed operations do not leak sensitive provider data.
- Verify support bundles and screenshots do not include `.env` or credentials.

## Release Gate

Run:

```powershell
.\scripts\check-release.ps1
.\scripts\scan-secrets.ps1
git --no-pager diff --stat
git diff --check
```

Do not release if build/typecheck fails, migration status is unsafe, or secrets appear in the diff.

## CI and Branch Protection

- CI must not contain real tokens or production credentials.
- GitHub Actions secrets must be scoped to the minimum required repositories and environments.
- Do not store kubeconfig, Jenkins tokens, Docker socket credentials, or `.env` in the repository.
- Do not put Jenkins API tokens directly in workflow YAML.
- Secret scan must pass before merge.
- Release check must pass before merge.
- Workflow logs must not print environment dumps, Authorization headers, tokens, kubeconfig, or database URLs with passwords.
- Enable branch protection on `main`.
- Disable force pushes on `main`.
- Require pull request review for production branches.
- Require AutoOps CI status checks before merge.
