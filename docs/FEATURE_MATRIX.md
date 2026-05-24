# AutoOps Feature Matrix

| Area | Feature | Status | Real Data? | Safety Model | Notes |
| --- | --- | --- | --- | --- | --- |
| Authentication | Login/register | Complete | Yes | Real auth API | Demo buttons only prefill |
| Organizations | Membership and tenant scope | Complete | Yes | Organization ID scoping | New registration creates a new organization |
| RBAC | Trigger authorization | Complete | Yes | OWNER/ADMIN/MEMBER trigger | VIEWER denied |
| RBAC | Approval authorization | Complete | Yes | OWNER/ADMIN approve | Requester self-approval blocked |
| Operations | Operation records | Complete | Yes | Durable lifecycle | No fake records |
| Operations | Operation detail | Complete | Yes | Safe DTOs | No raw input/result/error |
| Approvals | Pending approval workflow | Complete | Yes | Policy + RBAC | Not enqueued before approval |
| Jenkins | Status/jobs/builds | Complete | Yes when configured | Status sanitized; inventory requires org provider access | Optional connector |
| Jenkins | Governed build trigger | Complete | Yes | BUILD confirmation + allowlisted jobs | No arbitrary Jenkins mutation |
| Docker | Engine inventory | Complete | Yes | OWNER/ADMIN plus org provider access | Containers/images/networks/volumes/logs |
| Docker | Start container | Complete | Yes | START confirmation | No approval by local policy |
| Docker | Stop/restart container | Complete | Yes | STOP/RESTART confirmation + approval | No exec/delete/create |
| Kubernetes | Cluster inventory | Complete | Yes | OWNER/ADMIN plus org provider access | Namespaces/workloads/pods/services |
| Kubernetes | Metrics API status | Complete | Yes when configured | Read-only metrics | Honest unavailable state |
| Kubernetes | Scale deployment | Complete | Yes | SCALE confirmation + approval threshold | Protected namespaces blocked |
| Kubernetes | Rollout restart | Complete | Yes | ROLLOUT confirmation | No apply/delete/exec |
| Infrastructure | Terraform/OpenTofu workspace discovery | Complete | Yes | Allowlisted directories only | No arbitrary path execution |
| Infrastructure | Terraform/OpenTofu validate and plan | Complete | Yes when tool installed | VALIDATE/PLAN confirmation + worker execution | No cloud credentials included |
| Infrastructure | Terraform/OpenTofu apply | Complete | Yes when tool installed | APPLY confirmation + approval required | No arbitrary variables or shell |
| Infrastructure | Ansible playbook discovery | Complete | Yes | Allowlisted playbooks and inventory only | Local smoke playbook included |
| Infrastructure | Ansible syntax-check and check mode | Complete | Yes when tool installed | SYNTAX/CHECK confirmation + worker execution | No SSH keys or vault secrets |
| Infrastructure | Ansible run | Complete | Yes when tool installed | RUN confirmation + approval required | No arbitrary playbook path |
| GitHub Actions | Workflow/run readiness | Complete | Yes when token configured | Status sanitized; inventory requires org provider access | No arbitrary dispatch |
| Observability | Prometheus/Grafana readiness | Complete | Yes | Status sanitized; details require org provider access | No fake metrics |
| DevOps Tools | Helm/Kustomize/tool readiness | Complete | Yes | Version detection only | No apply/mutation |
| Cloud Readiness | AWS/Azure/GCP readiness center | Complete | Yes when configured | Status sanitized; details require org provider access; no direct writes | Cloud writes future via Terraform approval |
| AWS Foundation | AWS deployment foundation diagnostics | Complete | Yes when configured | OWNER/ADMIN only; read-only STS/IAM/S3/DynamoDB probes | No apply/destroy; no secrets; sanitized status for all users |
| AWS Foundation | AWS identity verification | Complete | Yes when configured | STS GetCallerIdentity; OWNER/ADMIN only | Account ID, ARN, region returned; no credentials exposed |
| AWS Foundation | AWS IAM permission diagnostics | Complete | Yes when configured | Read-only permission probes per AWS service | Missing permissions reported; no privilege escalation |
| AWS Foundation | AWS remote state readiness | Complete | Yes when configured | S3 HeadBucket + DynamoDB DescribeTable | No state file read/write; reachability check only |
| AWS Foundation | AWS workspace readiness | Complete | Yes when configured | Allowlisted workspace file and tooling checks | Local state/init directory flagged; no execution |
| AWS Foundation | AWS deployment targets | Complete | Yes when configured | Allowlisted ECS Fargate workspaces only | Plan approval-gated; apply disabled by default |
| AWS ECR | ECR readiness and repository inventory | Complete | Yes when configured | OWNER/ADMIN provider-boundary access + allowlisted repositories | No repository creation or deletion |
| AWS ECR | Docker image build | Complete | Yes when configured | BUILD confirmation + allowlisted build target | No arbitrary Dockerfile, context, tag, or shell |
| AWS ECR | ECR image push | Complete | Yes when configured | PUSH confirmation + production approval gate | Push disabled by default; no credential exposure |
| AWS Terraform ECS | Plan-only ECS review | Complete | Yes when configured | PLAN confirmation + remote state + tenant-scoped pushed image metadata | No apply, destroy, arbitrary workspace, arbitrary tfvars, or raw plan output exposure |
| AWS Terraform ECS | Approval-gated ECS apply | Complete | Yes when configured | APPLY confirmation + approval required + plan safety validation | No apply runs without approval; no destroy; no secrets exposed; ECS verification after apply |
| AWS Guardrails | Cost estimate and blast-radius analysis | Complete | Yes from safe plan metadata | Account/region allowlists + local conservative estimate + mutation block | No Pricing API; estimated monthly cost is not a billing guarantee |
| AWS Guardrails | Apply/promotion/rollback enforcement | Complete | Yes | Guardrails checked at plan time and immediately before mutation | `BLOCKED` guardrails cannot be overridden by approval |
| AWS ECS Releases | Release history & timeline | Complete | Yes | Tenant-scoped by organizationId | No fake demo releases; empty history for new orgs |
| AWS ECS Releases | Release promotion | Complete | Yes | PROMOTE confirmation + production approval gate | Promotion reuses plan and apply safety gates; no arbitrary image URIs |
| AWS ECS Releases | Governed rollback | Complete | Yes | ROLLBACK confirmation + always requires approval | Rollback blocked if destroyCount > 0 or applyEligible=false; no direct mutations |
| Worker Runtime | BullMQ execution | Complete | Yes | Worker-only execution | API queues accepted work |
| Worker Runtime | Heartbeat registry | Complete | Yes | Persisted heartbeat rows | Fresh/stale/offline derived |
| Observability | Operations Hub | Complete | Yes | Safe summaries | Platform/provider/queue/worker/incidents |
| Governance | Governance Center | Complete | Yes | Tenant-scoped safe evidence | Requester, approver, policy, provider, lifecycle, incident linkage |
| Governance | Safe evidence export | Complete | Yes | OWNER/ADMIN export + safe DTO | JSON only; no raw metadata or secrets |
| Incidents | Failed operation incident | Complete | Yes | Safe summary + lifecycle | One incident per failed operation |
| Runbooks | Deterministic runbooks | Complete | Yes | Observe/verify/recover/escalate guidance | No AI runbooks yet |
| Production Readiness | `.env.example` | Complete | N/A | Safe placeholders | Local-only notes |
| Production Readiness | Production compose | Complete | N/A | No default socket/kubeconfig | Company pilot topology |
| CI/Release Gates | GitHub Actions CI | Complete | N/A | Build/typecheck/test/scan | Optional connectors not required |
| Backup/Restore | PostgreSQL scripts | Complete | Yes | Backup safe, restore requires RESTORE | No migrate reset |
| Secret Safety | Redaction utility and scans | Complete | N/A | Redacts and detects suspicious values | Values not printed |
| Documentation | Evaluator docs | Complete | N/A | Honest positioning | Day 17 docs |
