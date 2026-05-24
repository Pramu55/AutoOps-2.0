# AutoOps Security Checklist

Use this checklist before a company pilot, demo, or production-like deployment.

## CIA And Authorization Model

Confidentiality:
- Tenant-owned resources are scoped by authenticated organization membership.
- Cross-organization project, deployment, operation, governance, incident, and audit-log visibility is blocked in the API layer.
- Secrets, tokens, kubeconfig content, and provider credentials must not appear in UI, API responses, logs, screenshots, or exports.

Integrity:
- Tenant-owned mutations verify organization ownership before update.
- Approval and rejection are organization-scoped.
- Requester self-approval remains blocked.
- AutoOps does not expose arbitrary command execution.

Availability:
- Health checks, worker heartbeat, queues, backups, and smoke checks are non-destructive.
- Tenant actions must not delete global runtime data, Docker volumes, or Kubernetes state.

Authorization:
- JWTs are validated and organization membership is rechecked by API middleware.
- Roles are evaluated within the authenticated organization.
- Controllers must use `req.auth.orgId` and must not trust frontend-supplied organization IDs.

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

## AWS Deployment Foundation

- AWS status endpoint must return sanitized data only (status, configured, message, checkedAt). No account ID, ARN, region, or credentials.
- AWS identity, readiness, permissions, remote-state, workspace-readiness, deployment-targets, summary, and inventory endpoints must require OWNER/ADMIN role.
- AWS identity endpoint must not return AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, or AWS_SESSION_TOKEN.
- AWS readiness endpoint must report env var presence (boolean), never env var values.
- AWS permissions endpoint must perform read-only diagnostic probes only (DescribeRepositories, ListClusters, DescribeVpcs, etc.). No write actions.
- AWS remote-state endpoint must verify S3 bucket and DynamoDB table reachability only. No state file read/write/delete.
- AWS workspace-readiness endpoint must check file presence only. No terraform init, plan, apply, or destroy.
- AWS workspace-readiness must flag checked-in terraform.tfstate or .terraform directory as errors.
- AWS deployment targets must be restricted to allowlisted workspaces only (AWS_ALLOWED_DEPLOYMENT_WORKSPACES).
- AWS deployment plan must create an approval-gated TERRAFORM_PLAN operation. No direct execution.
- AWS deployment apply must be disabled by default (AWS_DEPLOYMENT_APPLY_ENABLED !== 'true'). When enabled, must create an approval-gated TERRAFORM_APPLY operation.
- AWS deployment history must be organization-scoped.
- No AWS resource creation, modification, or deletion from any AWS endpoint.

## AWS ECR Image Build and Push

- ECR repository inventory must require OWNER/ADMIN provider-boundary access.
- `AWS_ECR_ALLOWED_REPOSITORIES` must restrict all ECR push targets.
- `AWS_ECR_ALLOWED_BUILD_TARGETS` must restrict all Docker build contexts and Dockerfiles.
- Build operations must require `BUILD` confirmation and create `AWS_ECR_IMAGE_BUILD`.
- Push operations must require `PUSH` confirmation and create `AWS_ECR_IMAGE_PUSH`.
- Production/prod push must enter `PENDING_APPROVAL` when `AWS_ECR_PRODUCTION_PUSH_REQUIRES_APPROVAL=true`.
- `AWS_ECR_PUSH_ENABLED=false` must prevent worker push execution by default.
- AWS ECS Terraform/OpenTofu plan must require `AWS_TERRAFORM_STATE_BUCKET`, `AWS_TERRAFORM_STATE_DYNAMODB_TABLE`, and `AWS_TERRAFORM_STATE_REGION`.
- AWS ECS Terraform/OpenTofu plan must use only allowlisted workspaces and tenant-scoped successful ECR push metadata.
- AWS ECS Terraform/OpenTofu plan must store only safe summaries, add/change/destroy counts, risk, blocked reasons, and apply eligibility.
- Terraform/OpenTofu plan output must be redacted and limited; raw state, backend config, tfvars secrets, `.terraform`, and `terraform.tfstate` must never be written into the repository.
- Docker login password, AWS credentials, and Docker socket details must never appear in logs, API responses, UI, screenshots, operation evidence, or governance export.
- ECR operation history must remain organization-scoped.

## AWS ECS Gated Apply

- AWS ECS apply operations must require `AWS_DEPLOYMENT_APPLY_ENABLED=true` in the environment.
- The POST apply route must never execute apply directly; it must only create a `PENDING_APPROVAL` operation.
- The apply operation must require `APPLY` confirmation token.
- Apply operations must be gated by a fresh (< 24 hours), successful, same-organization `AWS_TERRAFORM_ECS_PLAN` matching target, environment, and ECR image metadata.
- Plans with `destroyCount > 0`, `applyEligible === false`, or `riskLevel === 'HIGH'` must block apply.
- Worker must re-verify all safety gates immediately before apply.
- If no saved binary planfile exists, the worker must rerun the plan in a temporary directory and compare its summary counts/image against the approved plan summary before apply.
- ECS verification after apply must be read-only (describe services, list clusters, etc.) and best-effort; no writes.
- AWS credentials, tfstate, raw planfiles, and raw backend configs must never be stored in operation results or log databases.

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
