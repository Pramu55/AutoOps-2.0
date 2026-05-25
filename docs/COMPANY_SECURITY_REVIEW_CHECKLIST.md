# Company Security Review Checklist

Use this checklist before connecting AutoOps to any company infrastructure.

## Identity and Access

- Confirm production users come from an approved identity process.
- Confirm demo accounts are disabled or removed in production.
- Confirm JWT secrets are unique, strong, and rotated.
- Confirm roles are organization-scoped.

## Tenant Isolation

- Verify new users create or join only their intended organization.
- Verify tenant-owned queries are scoped by authenticated organization.
- Verify direct ID access across organizations returns 403 or 404.
- Verify governance exports are tenant-scoped.

## Provider Access

- Confirm provider inventory requires explicit organization allowlisting or provider settings.
- Confirm OWNER/ADMIN role alone does not grant shared provider inventory.
- Confirm new organizations receive `BLOCKED_BY_ORG_POLICY`.
- Never enable wildcard provider inventory in production.

## Secret Management

- Store provider credentials outside Git.
- Use a secret manager or approved deployment secret mechanism.
- Confirm scripts print presence only, never values.
- Run `.\scripts\scan-secrets.ps1` before every handoff.

## Network Access

- Document API, web, database, Redis, Jenkins, Kubernetes, Docker, AWS, GitHub, Prometheus, and Grafana network paths.
- Restrict PostgreSQL and Redis to private networks.
- Require HTTPS for production-like access.
- Confirm VPN/firewall rules are approved.

## Audit and Governance

- Verify controlled operations create operation records.
- Verify approval decisions are recorded.
- Verify Governance Center does not show raw secrets or provider state.
- Verify failed operation incidents include safe runbook guidance.

## Operation Approval Rules

- Confirm risky Docker, Kubernetes, Terraform/OpenTofu, Ansible, AWS apply, promotion, rollback, and production ECR push operations are approval-gated.
- Confirm requester self-approval is blocked.
- Confirm approval cannot override blocked AWS guardrails.

## Worker Execution Model

- Confirm provider mutations run through BullMQ workers.
- Confirm API request handlers do not execute mutations inline.
- Confirm workers use fixed commands/SDK methods and allowlisted targets only.
- Confirm no arbitrary shell, Docker exec, Kubernetes exec, or Terraform command path exists.

## AWS Guardrails

- Confirm `AWS_ALLOWED_ACCOUNT_IDS` and `AWS_ALLOWED_REGIONS` are configured before mutation paths.
- Confirm public load balancer changes are denied by default.
- Confirm cost estimates are labeled as estimates, not billing guarantees.
- Confirm destroy actions block apply, promotion, and rollback.

## Kubernetes Safety

- Use least-privilege service accounts.
- Restrict namespaces and workloads.
- Do not expose Kubernetes Secrets.
- Do not add apply/delete/exec/port-forward controls.

## Docker Safety

- Treat Docker socket access as high trust.
- Do not expose Docker socket paths in UI.
- Do not add exec/create/delete controls.
- Restrict inventory to approved organizations.

## Jenkins Safety

- Use API tokens, not passwords.
- Restrict token permissions.
- Configure `JENKINS_ALLOWED_JOBS`.
- Do not expose script console or job config mutation.

## Backup and Restore

- Verify backup scripts are tested.
- Store backups securely.
- Confirm restore requires explicit `RESTORE`.
- Never reset production databases as a troubleshooting shortcut.

## Incident Response

- Verify failed operations create safe incidents.
- Verify incident acknowledge/resolve permissions.
- Verify runbooks are deterministic and non-secret.

## Logging and Redaction

- Confirm logs do not contain Authorization headers, tokens, kubeconfig, AWS credentials, or Docker login passwords.
- Confirm screenshots hide `.env`, provider credentials, and private URLs.
- Confirm exports contain safe DTOs only.

## CI and Release Checks

- Run build, typecheck, tests, `git diff --check`, secret scan, provider connectivity check, and final smoke check.
- Confirm CI does not require real company credentials.
- Confirm workflow logs do not dump environment variables.

## Known Limitations

- AutoOps is a controlled pilot/evaluation platform, not an enterprise-certified product.
- Provider credentials must be supplied and approved by the company.
- Resource graph, signal ingestion, incident correlation, AI assistance, and full SLO governance are roadmap phases.

## Required Approvals Before Company Connection

- Written authorization from infrastructure owner.
- Security review approval.
- Network/VPN/firewall approval.
- Provider credential owner approval.
- Data classification review.
- Rollback and support owner approval.
