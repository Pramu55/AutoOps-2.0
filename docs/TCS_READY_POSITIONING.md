# TCS-Ready Positioning

AutoOps may be described as a TCS-ready enterprise demo or company-pilot-ready DevOps Control Plane. Do not claim that it is deployed to TCS or connected to TCS infrastructure.

## One-Minute Explanation

AutoOps is a governed DevOps Control Plane that brings Jenkins, Docker, Kubernetes, Terraform/OpenTofu, Ansible, AWS readiness, provider onboarding, approvals, tenant isolation, and governance evidence into one safe console. It is built for company pilot review and demonstrates how platform teams can control operations without exposing raw shells, secrets, or cross-tenant data.

## Three-Minute Explanation

AutoOps uses a Next.js frontend, Express API, PostgreSQL, Redis, BullMQ workers, and real provider connectors. The API enforces organization-scoped data access, RBAC, provider inventory boundaries, confirmation tokens, approval gates, and safe response DTOs. Workers execute only allowlisted operations. Demo/admin organizations can see configured local Jenkins, Docker, and Kubernetes data. New organizations are blocked from shared provider inventory by default and see clear onboarding guidance.

The AWS path includes ECR image build/push, Terraform/OpenTofu ECS plan, approval-gated apply foundation, rollback/promotion, and cost/blast-radius guardrails. This is company-pilot-ready architecture, not an unreviewed production deployment.

## Technical Architecture Explanation

AutoOps separates control from execution:

- Web: operator workflows and onboarding.
- API: authentication, tenant scope, policy, approvals, and governance.
- Database: durable tenant-owned state.
- Redis/BullMQ: operation queue.
- Worker: provider execution.
- Connectors: Jenkins, Docker, Kubernetes, AWS, GitHub Actions, Infrastructure, Observability.

## Security and Governance Explanation

- Users only see their organization data.
- Provider inventory requires explicit organization allowlisting.
- New organizations are blocked from shared provider inventory.
- Risky operations require approval.
- Requesters cannot self-approve.
- Guardrails block unsafe AWS mutations even after approval.
- Secrets and raw provider credentials are not returned.

## What To Show In A Demo

- Login and dashboard.
- Provider onboarding for a blocked new org.
- Demo/admin real Jenkins, Docker, and Kubernetes status.
- Operations Hub and operation detail.
- Governance Center evidence.
- AWS guardrail blocked state.
- Secret scan and final smoke checks.
- Company handoff docs.

## What Not To Claim

- Do not claim AutoOps is deployed to TCS.
- Do not claim TCS credentials or infrastructure are connected.
- Do not claim SOC2 compliance or enterprise certification.
- Do not claim production operation without company review.
- Do not claim autonomous remediation or AI execution.

## Answering "Is This Deployed To TCS?"

No. This is a TCS-ready/enterprise-ready AutoOps demo and pilot package. Real TCS deployment requires official authorization, credentials, network access, security review, and stakeholder approval.
