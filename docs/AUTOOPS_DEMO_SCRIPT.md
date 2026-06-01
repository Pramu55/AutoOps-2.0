# AutoOps Evaluator Demo Script

This script is designed for a **10–15 minute live demo** of AutoOps. It guides an evaluator or interviewer through the core platform modules, showing how the interface handles real integrations, safety checks, and tenant isolation constraints.

---

## Demo Preparation & Setup
1. Verify the local stack is running: `docker compose ps`
2. Open the browser to: `http://localhost:3000`
3. Have two browsers or one normal and one incognito window open to demonstrate **Tenant Isolation**.

---

## Phase 1: Login & Prefilled Credentials (1 Minute)
- **Action**: Visit `http://localhost:3000/login`.
- **Explain**: "AutoOps uses real JWT authentication. The login page provides prefilled credentials for local testing, representing three key demo roles:
  1. `pramod.local@autoops.dev` (Operator/Requester in **Org A**)
  2. `approver.local@autoops.dev` (Admin/Approver in **Org A**)
  3. `isolated.local@autoops.dev` (Tenant in **Org B**)"
- **Action**: Prefill and login as the Operator: `pramod.local@autoops.dev` with password `StrongPass123`.

---

## Phase 2: Command Workspace (2 Minutes)
- **Action**: Land on `/dashboard`.
- **Explain**: "This is the Command Workspace, an enterprise-grade landing board that prioritizes immediate actionable items. It aggregates critical details instead of using superficial visual widgets."
- **Point out**:
  - **Needs Attention Queue**: Shows pending approvals and active high-priority incidents.
  - **Active Incidents**: Operational failures requiring response.
  - **Provider Connectivity**: Health check indicators for local integrations.
  - **Signals Ingest Snapshot**: Latest telemetry alerts.

---

## Phase 3: Operations & Approvals (2 Minutes)
- **Action**: Navigate to the **Operations Workspace** (`/dashboard/operations`).
- **Explain**: "The Operations Workspace controls and reviews worker-executed tasks. Operators can trigger allowed jobs here, but high-risk mutations require separate approval."
- **Point out**:
  - **Pending Approvals Queue**: Tasks requested by other users awaiting authorization.
  - **Activity Timeline**: Scans the real-time BullMQ worker log of completed operations.
  - **Safety check**: Try clicking approve on a task requested by yourself to show the system block (Requester self-approval is forbidden by the API).

---

## Phase 4: Governance & Evidence Export (2 Minutes)
- **Action**: Navigate to the **Governance Center** (`/dashboard/governance`).
- **Explain**: "The Governance Center acts as an audit log. Every single operation leaves a durable record containing evidence, approval status, policy risk level, and timeline metadata."
- **Action**: Click **Export Evidence** to download the audited JSON log.
- **Explain**: "To protect organization boundaries, the exported JSON contains sanitized audit details. Raw environment variables, tokens, kubeconfig, and secrets are strictly redacted by the API before response."

---

## Phase 5: Incident Workspace & Runbooks (2 Minutes)
- **Action**: Navigate to **Incidents** (`/dashboard/incidents`). Click on a failed-operation incident to open the Detail View (`/dashboard/incidents/[incidentId]`).
- **Explain**: "When an operation fails on a connector, the platform automatically registers it as an incident. We provide a vertical chronological event timeline and manual analyst note composer."
- **Action**: Type a manual note (e.g., *'Investigating Docker container logs'*) and click **Add Note**.
- **Point out**: The **Recommended Remediation** cards. "These are deterministic recommendations from real incident evidence. If a card can bind a verified target, the operator can type the displayed token and prepare an existing governed operation. If the target is not safe, the card remains disabled with a reason."
- **Explain**: "Preparation is not autonomous remediation. It creates the same operation record used by the provider pages, so confirmation, approval, policy, audit evidence, and worker execution still apply."

---

## Phase 6: Observations & Resource Graph (2 Minutes)
- **Action**: Navigate to the Observations Workspaces:
  - **Signals** (`/dashboard/signals`): Deduplicated telemetry stream.
  - **Resources** (`/dashboard/resources`): The **Resource Graph**.
- **Explain**: "AutoOps maps resource topology to track service relationships. We discover resource nodes and map incoming/outgoing edges."
- **Action**: Click on a resource node to view its detailed properties and its **Resource Neighbors** explorer.
- **Explain**: "The Resource Graph is read-only. It is designed to establish topology and incident context, not to grant direct provider access."

---

## Phase 7: Delivery Workspace (1 Minute)
- **Action**: Navigate to **Projects** (`/dashboard/projects`) and **Deployments** (`/dashboard/deployments`).
- **Explain**: "The Delivery workspace tracks the lifecycle from repository to environment. Projects are tenant-isolated by organization, preventing cross-tenant visibility."
- **Action**: Click **Simulate Deployment** on the deployments page to trigger a safe, simulated pipeline execution.

---

## Phase 8: Integrations Hub & Provider Pages (2 Minutes)
- **Action**: Navigate to the **Integrations Hub** (`/dashboard/integrations`).
- **Explain**: "The Integrations Hub groups our 9 control plane connectors into standard categories (Runtime & Orchestration, CI/CD & Infrastructure, Cloud, and Telemetry). Let's look at one."
- **Action**: Open the **Docker Page** (`/dashboard/integrations/docker`).
- **Explain**: "AutoOps interacts with real providers. If configured, this pulls container, image, network, and volume data from the local socket."
- **Action**: Trigger a container restart.
- **Explain**: "To prevent casual mistakes, the UI displays a confirmation modal. The operator must type `RESTART` to confirm the action. Once typed, a BullMQ task is queued and verified by the worker."
- **Action**: If a provider is not configured (e.g., AWS or Jenkins), visit that page.
- **Explain**: "If a provider is not configured, we present an **honest setup state** outlining the environment variables required, rather than generating fake mockup data."

---

## Phase 9: Settings Workspace (1 Minute)
- **Action**: Navigate to **Settings** (`/dashboard/settings`).
- **Explain**: "The settings page represents our administrative roadmap surface. It contains an honest warning: *'Organization and admin settings will appear here as controls become available.'* This guarantees we do not imply pre-built features that are not live."

---

## Phase 10: Tenant Isolation Verification (1 Minute)
- **Action**: Log out of the Operator account, and login using the Isolated Tenant: `isolated.local@autoops.dev`.
- **Explain**: "To verify strict tenant isolation, we switch to Org B. Notice that the command dashboard, operations, incidents, resource graph, and projects are completely empty. Org B cannot read or modify any logs or resource structures owned by Org A, even if they query IDs directly."

---

## Summary
- **Conclude**: "AutoOps is a safe, audited, and tenant-isolated platform. It shows how modern enterprise DevOps can be managed with high-quality engineering and robust safety patterns."
