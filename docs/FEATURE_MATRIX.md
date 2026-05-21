# AutoOps Feature Matrix

| Area | Feature | Status | Real Data? | Safety Model | Notes |
| --- | --- | --- | --- | --- | --- |
| Authentication | Login/register | Complete | Yes | Real auth API | Demo buttons only prefill |
| Organizations | Membership and tenant scope | Complete | Yes | Organization ID scoping | Demo users share local org |
| RBAC | Trigger authorization | Complete | Yes | OWNER/ADMIN/MEMBER trigger | VIEWER denied |
| RBAC | Approval authorization | Complete | Yes | OWNER/ADMIN approve | Requester self-approval blocked |
| Operations | Operation records | Complete | Yes | Durable lifecycle | No fake records |
| Operations | Operation detail | Complete | Yes | Safe DTOs | No raw input/result/error |
| Approvals | Pending approval workflow | Complete | Yes | Policy + RBAC | Not enqueued before approval |
| Jenkins | Status/jobs/builds | Complete | Yes when configured | Read-only inventory | Optional connector |
| Jenkins | Governed build trigger | Complete | Yes | BUILD confirmation + allowlisted jobs | No arbitrary Jenkins mutation |
| Docker | Engine inventory | Complete | Yes | Read-only lists | Containers/images/networks/volumes/logs |
| Docker | Start container | Complete | Yes | START confirmation | No approval by local policy |
| Docker | Stop/restart container | Complete | Yes | STOP/RESTART confirmation + approval | No exec/delete/create |
| Kubernetes | Cluster inventory | Complete | Yes | Read-only lists | Namespaces/workloads/pods/services |
| Kubernetes | Metrics API status | Complete | Yes when configured | Read-only metrics | Honest unavailable state |
| Kubernetes | Scale deployment | Complete | Yes | SCALE confirmation + approval threshold | Protected namespaces blocked |
| Kubernetes | Rollout restart | Complete | Yes | ROLLOUT confirmation | No apply/delete/exec |
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
