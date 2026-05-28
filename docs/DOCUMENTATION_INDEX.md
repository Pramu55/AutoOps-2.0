# AutoOps Documentation Index

This index categorizes all engineering, deployment, and pilot readiness documentation for AutoOps 2.0.

---

## 1. Getting Started
- **[Evaluator Quickstart](./EVALUATOR_QUICKSTART.md)**: Fast path for setting up, inspecting, and assessing AutoOps locally.
- **[Demo Guide](./DEMO_GUIDE.md)**: 5-minute and 10-minute walkthrough guides.
- **[AutoOps Demo Script](./AUTOOPS_DEMO_SCRIPT.md)**: Realistic 10-15 minute live demo script detailing all refined workspaces and action confirmations.

## 2. Architecture
- **[Architecture Overview](./ARCHITECTURE_OVERVIEW.md)**: Core design patterns, monorepo workspaces, datastore entities, and worker queues.
- **[Enterprise Architecture Overview](./ENTERPRISE_ARCHITECTURE_OVERVIEW.md)**: Enterprise deployment architectures, security zones, and decoupling patterns.
- **[Resource Graph Foundation](./RESOURCE_GRAPH_FOUNDATION.md)** & **[Resource Graph Foundation Plan](./RESOURCE_GRAPH_FOUNDATION_PLAN.md)**: Database-backed read-only Resource Graph details.
- **[Signal Ingest Foundation](./SIGNAL_INGESTION_FOUNDATION.md)**: Real-time telemetry ingest, deduplication, and parsing specifications.

## 3. Service Platform Experience
- **[Service Platform Experience Overview](./SERVICE_PLATFORM_EXPERIENCE.md)**: Shared layout components (`WorkspaceHeader`, `EvidencePanel`, `WorkQueue`, `StatusBadge`) and layout migration history.
- **[Route Reference](./ROUTE_REFERENCE.md)**: Mapping of UI paths to REST API endpoints, detailing permissions, user roles, and safety notes.

## 4. Integrations
- **[Infrastructure Automation Center](./INFRASTRUCTURE_AUTOMATION_CENTER.md)**: Terraform/OpenTofu validation/planning/applying and Ansible syntax/check/run workflows.
- **[AWS ECR Image Build and Push](./AWS_ECR_IMAGE_BUILD_AND_PUSH.md)**: Separate governed ECR actions, allowlists, and image verification.
- **[AWS Terraform ECS Plan](./AWS_TERRAFORM_ECS_PLAN.md)**: Plan-only review workflows, remote state buckets, and container metadata parsing.
- **[AWS ECS Gated Apply](./AWS_APPROVAL_GATED_ECS_APPLY.md)**: Production-gated ECS rollout triggers, verification status, and change summaries.
- **[AWS Rollback and Release Promotion](./AWS_ROLLBACK_AND_RELEASE_PROMOTION.md)**: ECS release promotion mechanics and safety-critical rollback restrictions.
- **[Provider Onboarding and Organization Access](./PROVIDER_ONBOARDING_AND_ORG_ACCESS.md)**: Dynamic organization activation states and administrator onboarding instructions.

## 5. Operations, Governance, & Security
- **[Controlled Operations Overview](./CONTROLLED_OPERATIONS_OVERVIEW.md)**: Lifecycle flow of operations (Pending Approval, Running, Completed, Failed).
- **[Security Checklist](./SECURITY_CHECKLIST.md)**: Threat modeling, privilege escalation mitigations, and database connection checks.
- **[Tenant Isolation and Authorization](./TENANT_ISOLATION_AND_AUTHORIZATION.md)**: Multi-tenant boundary rules, JWT token decoders, and cross-organization boundary validation tests.
- **[Incident Workflow and Timeline](./INCIDENT_WORKFLOW_AND_TIMELINE.md)**: Vertical event timelines, incident triage statuses, and analyst notes.
- **[Incident Graph and Runbook Automation Roadmap](./INCIDENT_GRAPH_AND_RUNBOOK_AUTOMATION_ROADMAP.md)**: Dynamic runbook architecture specifications.
- **[CI and Release Gates](./CI_AND_RELEASE_GATES.md)**: Build validation pipelines, secret scans, and Vitest suite configurations.

## 6. Company Demo/Pilot
- **[Company Handoff Package](./COMPANY_HANDOFF_PACKAGE.md)**: Deliverable list for pilot evaluators.
- **[Company Deployment Handoff](./COMPANY_DEPLOYMENT_HANDOFF.md)**: Pilot environment configurations, environment variables, and Docker Compose parameters.
- **[Company Security Review Checklist](./COMPANY_SECURITY_REVIEW_CHECKLIST.md)**: Critical checks covering sockets, credentials, audit retention, and RBAC rules.
- **[Company Pilot Runbook](./COMPANY_PILOT_RUNBOOK.md)**: Step-by-step pilot scenario validation scripts.
- **[Company Provider Connectivity Handoff](./COMPANY_PROVIDER_CONNECTIVITY_HANDOFF.md)**: Connection validation guides for local integrations.

## 7. Portfolio & Career Material
- **[LinkedIn and Resume Content](./LINKEDIN_AND_RESUME_CONTENT.md)**: Ready-to-use resume bullet points, LinkedIn project summaries, and technical keywords.
- **[Portfolio Case Study](./PORTFOLIO_CASE_STUDY.md)**: Case study context, design challenges, structural choices, and business outcome summaries.
- **[TCS-Ready Positioning](./TCS_READY_POSITIONING.md)**: Platform engineering positioning, interview prep, and corporate alignment guides.
- **[Interview Talking Points](./INTERVIEW_TALKING_POINTS.md)**: Verbal screening summaries, architectural design justifications, and Q&A guides.
- **[Screenshot and Media Guide](./SCREENSHOT_AND_MEDIA_GUIDE.md)** & **[Final Screenshot Checklist](./FINAL_SCREENSHOT_CHECKLIST.md)**: Safe media creation guidelines.

## 8. Safety & Limitations
- **[Limitations and Roadmap](./LIMITATIONS_AND_ROADMAP.md)**: Live vs. future scopes, local constraints, and production hardening roadmaps.
- **[Demo Data Safety](./DEMO_DATA_SAFETY.md)**: Guarantees no fake mock data or hidden mock datasets exist in the backend.
- **[Final Freeze Report](./FINAL_COMPANY_READY_FREEZE_REPORT.md)**: Quality gates checklists, completed phases list, and evaluator safety warnings.
