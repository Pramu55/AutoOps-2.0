# Controlled Operations Overview

AutoOps controlled operations use real provider APIs through authenticated, tenant-scoped, worker-executed flows. The platform focuses on security, traceability, and strict governance to ensure no unauthorized or destructive actions occur.

## Core Governance Mechanisms

### Confirmation Tokens
Every mutating action requires a deliberate **confirmation token** (e.g., `START`, `SCALE`, `RESTART`). Operators must explicitly type this exact token. This prevents accidental clicks from triggering infrastructure changes.

### Approvals & RBAC
AutoOps enforces multi-tier **approvals** and Requester/Approver separation. High-risk actions (like scaling above certain limits, or pushing to production) enter a `PENDING_APPROVAL` state. Crucially, the user who requests an action cannot approve their own request. Actions are blocked from the worker queue until a designated Admin/Owner grants approval.

### Worker Queue Execution
The web API never calls provider infrastructure directly. Instead, when an action is confirmed and approved, the API places a payload onto a Redis-backed **BullMQ worker queue**. A separate, isolated worker process dequeues the job, executes it against the local provider socket/API, and updates the database with the result. This isolates the web layer from raw provider access.

### Audit Evidence
Every completed operation creates an immutable record in the **Governance Center**. This **audit evidence** includes the requester, approver, policy rule evaluated, duration, provider target, and safe error/result summaries. Sensitive data like tokens, kubeconfigs, and raw environmental variables are redacted from the database and exported JSON.

## Remediation & Incident Response

### Recommended Remediation
When a worker-executed operation fails, an incident is created. AutoOps analyzes the incident, operation context, and signal timeline to provide **deterministic recommended remediation** suggestions. These are fixed, evidence-based recommendations mapping to known recovery actions (e.g., restarting a crashed container).

### Governed Remediation Preparation
If a recommendation can confidently identify a target (like a specific Docker container ID), the operator can click **Prepare governed action**. This seamlessly maps the recommendation into the standard operation pipeline. 

### Critical Safety Rules

- **No direct provider execution from incident endpoints**: Clicking "Prepare" simply drafts a standard operation record. The API endpoint never reaches out to the provider directly.
- **No autonomous remediation**: AutoOps never executes a fix automatically. The drafted remediation operation still requires the exact confirmation token, still respects RBAC, still requires approval if mandated by policy, and still executes via the worker queue. It is explicitly not an autonomous auto-fix bot.
