# AutoOps Feature Matrix

This matrix provides the final, honest capability list for the AutoOps platform.

## Supported Capabilities

- **Projects/Environments/Deployments**: Tenant-isolated structures defining deployment lifecycles.
- **BullMQ Worker Execution**: Asynchronous, isolated job execution decoupled from the API.
- **Operations Hub**: Centralized command center for operations, providers, queues, failures, and approvals.
- **Governance Center**: Immutable, audit-ready evidence log of all completed operations, configurations, and decisions.
- **Approvals**: Policy-driven gates separating requesters from execution approval.
- **Docker Connector**: Status, container/image/network visibility, and governed start/stop/restart.
- **Kubernetes Connector**: Status, workloads, pods, services, and governed scale/rollout restart.
- **Jenkins Connector**: Allowlisted job discovery and governed build triggers.
- **GitHub Actions Connector**: Workflow and run observability for configured repositories.
- **AWS Deployment Planning**: Governed ECR image build/push and ECS Terraform plan/apply workflows.
- **Prometheus/Grafana Observability**: Integration readiness checks and embedded metrics proxy.
- **Argo CD / GitOps Foundation**: Prepared routes and structural models for future GitOps integrations.
- **Signals**: Real-time telemetry ingest, deduplication, and normalized observation streams.
- **Resource Graph**: Database-backed read-only Resource Graph mapping infrastructure topology.
- **Incidents**: Tenant-scoped failure records generated from failed worker operations.
- **Incident Timeline**: Vertical chronological correlation of incidents, signals, deployments, and operations.
- **Recommended Remediation**: Deterministic remediation suggestions derived from real incident evidence.
- **Governed Remediation Preparation**: Safe mapping of recommendations to the standard governed operation pipeline.
- **Audit/Evidence**: Exportable, safe JSON records of platform activity with redacted secrets.
- **Hosted Demo Readiness**: Security profiles prepared for safe, read-only public hosted demonstrations.

## Explicit Non-Goals & Blocked Capabilities

To maintain a production-grade safety model, AutoOps explicitly **DOES NOT** and **WILL NOT** implement:

- **No autonomous remediation**: AutoOps never triggers remediation actions without human interaction.
- **No AI auto-fix**: There are no LLM agents writing code, patching infrastructure, or autonomously executing fixes.
- **No fake data**: Status indicators represent real connector checks. Unconfigured connectors report honestly.
- **No unsafe provider mutation**: There is no arbitrary `kubectl apply`, Docker `exec`, Jenkins job deletion, or raw cloud permission escalation.
- **No Slack/PagerDuty fanout unless actually implemented**: Notifications are not spoofed. Integrations do not exist unless explicitly verified and tested.
