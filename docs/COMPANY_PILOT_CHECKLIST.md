# Company Pilot Checklist

## Evaluation Scope

Use this checklist to evaluate AutoOps as a local-first, production-style DevOps Control Plane. The scope is local/company pilot validation, not enterprise certification.

## Environment Readiness

- [ ] Docker Desktop or Docker Engine is running.
- [ ] Node.js 20+ and pnpm 9+ are installed.
- [ ] `.env` exists locally and is not committed.
- [ ] Optional Jenkins, Docker, and Kubernetes resources are local or explicitly approved.

## Repository Readiness

- [ ] GitHub Actions CI exists and passes.
- [ ] `.env.example` contains placeholders only.
- [ ] README links to production, security, CI, demo, and architecture docs.
- [ ] No real secrets are committed.
- [ ] Release check script exists.
- [ ] Secret scan script exists.

## Runtime Readiness

- [ ] `autoops-api` is healthy.
- [ ] `autoops-web` is healthy.
- [ ] `autoops-worker` is healthy.
- [ ] `autoops-postgres` is healthy.
- [ ] `autoops-redis` is healthy.
- [ ] Prometheus/Grafana are optional and documented.

## Auth/RBAC Validation

- [ ] Operator / Requester can login.
- [ ] Admin / Approver can login.
- [ ] Demo accounts are clearly local-only.
- [ ] User organization membership is real.
- [ ] VIEWER cannot trigger operations if a viewer account is used.

## Approval Workflow Validation

- [ ] Jenkins BUILD does not require approval.
- [ ] Docker START does not require approval.
- [ ] Docker STOP requires approval.
- [ ] Docker RESTART requires approval.
- [ ] Kubernetes SCALE to 0, 1, or 2 replicas is confirmation-only.
- [ ] Kubernetes SCALE above 2 requires approval.
- [ ] Requester cannot approve own operation.
- [ ] Admin can approve pending operation.
- [ ] Rejected operations do not execute.

## Jenkins Validation

- [ ] Jenkins status is `CONNECTED` or `NOT_CONFIGURED` honestly.
- [ ] Jobs and builds are real when connected.
- [ ] `JENKINS_ALLOWED_JOBS` controls triggerable jobs.
- [ ] BUILD confirmation is required.
- [ ] No arbitrary Jenkins mutation is exposed.

## Docker Validation

- [ ] Docker status is `CONNECTED` or `UNREACHABLE` honestly.
- [ ] Containers, images, networks, volumes, and logs are real.
- [ ] START/STOP/RESTART use confirmation.
- [ ] Approval-required actions pause.
- [ ] No exec, shell, delete, create/run, or unsafe image/volume/network actions exist.

## Kubernetes Validation

- [ ] Kubernetes node is Ready when local cluster is enabled.
- [ ] Metrics API works with `kubectl top nodes` when configured.
- [ ] Namespaces, workloads, pods, and services are real.
- [ ] Protected namespaces are visibly blocked for mutation.
- [ ] SCALE and ROLLOUT require confirmation.
- [ ] No exec, shell, apply, delete, Secret access, or port-forward exists.

## Worker/Runtime Validation

- [ ] Worker heartbeat is `RUNNING`.
- [ ] Queue coverage includes operations, deployments, and system queues.
- [ ] Operation lifecycle updates after worker execution.
- [ ] Worker errors create safe failed operation records.

## Observability Validation

- [ ] Operations Hub shows platform health.
- [ ] Provider health is real.
- [ ] Queue health is real or honestly unavailable.
- [ ] Recent operation activity is tenant-scoped.
- [ ] No fake metrics or fake resources are displayed.

## Governance Evidence Validation

- [ ] Governance Center shows real tenant-scoped operation evidence.
- [ ] Evidence links operation requester, policy, approval decision, provider, lifecycle, and incident when present.
- [ ] Rejected operations are visible.
- [ ] Failed operations are visible.
- [ ] Safe JSON export works for authorized owner/admin users.
- [ ] Export contains no raw input, raw result, raw error stack, tokens, kubeconfig, or secret-like metadata.

## Incident/Runbook Validation

- [ ] Failed operation creates an incident.
- [ ] Incident has severity and status.
- [ ] Incident links to operation detail.
- [ ] Safe error summary is shown.
- [ ] Runbook is deterministic and safe.
- [ ] Incident can be acknowledged by authorized user.
- [ ] Incident can be resolved by Admin/Owner.

## Production Readiness Validation

- [ ] `.env.example` is complete and safe.
- [ ] `docker-compose.prod.yml` exists.
- [ ] Production readiness doc exists.
- [ ] Security checklist exists.
- [ ] Troubleshooting guidance exists.
- [ ] Demo users are documented as local-only.

## CI/Release Validation

- [ ] GitHub Actions workflow exists.
- [ ] Local release check passes.
- [ ] Secret scan passes.
- [ ] Branch protection guidance exists.
- [ ] PR template includes safety checks.

## Backup/Restore Validation

- [ ] Backup script creates timestamped backup.
- [ ] Restore script requires typed `RESTORE`.
- [ ] Restore does not delete Docker volumes.
- [ ] Restore does not call `prisma migrate reset`.

## Security Validation

- [ ] No `.env` committed.
- [ ] No tokens visible in UI.
- [ ] No kubeconfig content visible.
- [ ] No raw provider metadata exposed.
- [ ] No raw operation input/result/error exposed.
- [ ] Logs do not expose secrets.

## Acceptance Criteria

- [ ] AutoOps can be started safely.
- [ ] Core runtime is healthy.
- [ ] Governed operation flow works.
- [ ] RBAC and approval separation work.
- [ ] Governance evidence and safe export work.
- [ ] Incident/runbook lifecycle works.
- [ ] Release and secret checks pass.
- [ ] Documentation is sufficient for an evaluator.

## Known Limitations

- Local-first runtime by default.
- No SOC2 or enterprise certification claim.
- No cloud connector product features yet.
- No notification integration yet.
- No AI runbook generation yet.

## Production Adoption Questions

- Which identity provider should own users?
- Which Kubernetes RBAC role should AutoOps use?
- Should Docker socket access be allowed in production?
- Which Jenkins jobs are safe to allowlist?
- What alerting/notification channels are required?
- What audit retention is required?
