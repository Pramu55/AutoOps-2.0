# AutoOps Evaluator Demo Script

This script is designed for a polished **5–8 minute live demo** of AutoOps, tailored for recruiters, hiring managers, and technical interviewers assessing DevOps, SRE, Platform, or Cloud Engineering roles.

---

## 1. Opening Pitch (1 Minute)

"Hi, I'm excited to show you AutoOps. AutoOps is a production-grade DevOps control plane that I built to unify incident workflows, provider integrations, and governed operations. It is designed to act as an incident-aware platform where operations are strictly governed and remediation is deterministic and safe."

## 2. The Problem AutoOps Solves (30 Seconds)

"Modern operations teams juggle too many tools. When an incident occurs, responders often face disconnected telemetry, fragmented runbooks, and dangerous manual recovery steps. AutoOps solves this by bringing telemetry, incidents, and infrastructure control into one tenant-isolated platform. Crucially, it prioritizes safety—there is no unsafe autonomous auto-fix bot. Every action is governed, audited, and strictly controlled."

## 3. Architecture Overview (30 Seconds)

"To achieve this, the architecture separates governance from execution. The Next.js web console and Express API handle RBAC, tenant isolation, and approval policies. Approved work is placed onto a Redis and BullMQ queue. A separate worker process executes the action against real local connectors like Jenkins, Docker, or Kubernetes, ensuring the API never holds raw execution state."

## 4. Dashboard Walkthrough (1 Minute)

- **Action**: Log in as Operator and show `/dashboard`.
- **Explain**: "This is the Command Workspace. Rather than flashy widgets, it focuses on actionable intelligence: Needs Attention items, active incidents, and connector health. From here, we can jump into the Operations Hub, which monitors active worker queues, pending approvals, and the heartbeat of our backend executors."

## 5. Incident Workflow & Recommended Remediation (1.5 Minutes)

- **Action**: Navigate to `/dashboard/incidents` and open a failed operation incident.
- **Explain**: "When a worker operation fails, AutoOps automatically opens an incident. This view provides a vertical timeline of correlated evidence. Below the timeline, you'll see Recommended Remediation cards. These are deterministic suggestions based on evidence. We do not use AI hallucination for remediation."

## 6. Governed Operation Preparation (1 Minute)

- **Action**: Click 'Prepare governed action' on a supported recommendation.
- **Explain**: "Notice the safety behavior here. Clicking 'Prepare' does not blindly execute the fix. It safely maps the remediation into the existing governed operations pipeline. The operator still has to provide a confirmation token, and the action still respects RBAC, approval policies, and audit logging. If evidence is missing, the preparation button remains safely disabled."

## 7. Integrations (1 Minute)

- **Action**: Navigate to `/dashboard/integrations/docker` or Kubernetes.
- **Explain**: "These are real integrations. The platform polls my local Docker socket and Kubernetes cluster. If I want to restart a container, the UI enforces a confirmation token. Dangerous actions like container deletion or arbitrary `kubectl apply` are intentionally blocked to preserve platform integrity."

## 8. Governance and Audit Evidence (30 Seconds)

- **Action**: Navigate to `/dashboard/governance`.
- **Explain**: "Every completed operation creates an immutable audit record in the Governance Center. You can see who requested it, who approved it, and what policy applied. Data exports are automatically sanitized to remove secrets and credentials."

## 9. Closing Pitch (30 Seconds)

"To summarize, AutoOps is a comprehensive portfolio project that models real enterprise DevOps challenges. By combining tenant isolation, worker-based execution, deterministic remediation, and strict safety guardrails, it demonstrates my ability to design, build, and secure production-grade platform engineering systems. Thank you for taking the time to review it."
