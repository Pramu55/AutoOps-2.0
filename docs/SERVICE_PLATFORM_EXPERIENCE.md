# Service Platform Experience

This document outlines the UX/UI architectural principles behind AutoOps, establishing it as an enterprise-grade service platform.

## Core Philosophy: Platform > Dashboard

AutoOps is designed as a ServiceNow-grade DevOps control plane, not a lightweight dashboard. It adheres to the following principles:

1. **Workspace-First Navigation**: Operations are grouped into logical, goal-oriented workspaces (Command, Operations, Incidents, Integrations, Governance) rather than flat dashboard cards.
2. **Record-Driven Workflows**: Every entity (Incident, Deployment, Operation) is treated as a unique enterprise record with a dedicated detail view.
3. **Evidence-First Investigation**: Panels emphasize clear, audit-ready data (Evidence Panel) over superficial visual summaries.
4. **No Visual Fluff**: Avoid generic charts or "vanity metrics." Display actionable data only.
5. **Clear State Representation**: Standardized empty states, loading states, and error states across all views.
6. **Robust Navigation**: Consistent breadcrumbs and back links for easy traversal of deep records.

## Shared UI Components

To maintain consistency, the following components govern the platform's layout and interaction models:

- `WorkspaceHeader`: The standard header for top-level workspaces, establishing context and providing global actions (refresh, create).
- `WorkQueue`: A standardized list view for records, optimizing scannability and quick actions.
- `EvidencePanel`: A structured container for displaying detailed record metadata, logs, or associated configuration.
- `RecordSummary`: A compact summary header used in detail views to surface critical status and metadata immediately.
- `StatusBadge`: Consistent visual language for operational states (e.g., SUCCEEDED, FAILED, RUNNING).
- `EmptyState`: Professional, action-oriented placeholders for when no data is present.

## Workspace Definitions

- **Command Center**: The primary landing workspace. Surfaces immediate triage needs, active incidents, and a snapshot of provider health.
- **Operations**: The control room for executing and reviewing automated tasks.
- **Incidents**: The triage queue and detailed investigation workspace for operational anomalies.
- **Integrations**: The management hub for connecting and monitoring external providers (AWS, Kubernetes, Jenkins, etc.). Grouped by category.
- **Delivery**: Project-centric workflows managing the relationship between code repositories and deployment lifecycles.
- **Governance**: The audit and compliance layer, surfacing policy decisions and operation evidence.

## Service Platform Experience Phase 2

Phase 2 introduces the Integrations Hub, providing a read-only, unified view of all control plane connectors and cloud readiness checks. It respects provider boundaries, does not execute actions, does not fake provider data, and never exposes credentials or secrets.

## Service Platform Experience Phase 3

Phase 3 transforms the main dashboard into an enterprise Command Workspace. It aggregates active incidents, pending approvals, critical signals, and provider health into a unified "Needs Attention" queue and logical snapshot panels. It adheres to strict React safety patterns and derives all next-best actions safely from real API state.

## Service Platform Experience Phase 4

### Phase 4: Incident Workspace
- Replaces standard table with a Needs Attention triage queue.
- Implements `RecordSummary`, `ContextPanel`, and `EvidencePanel` for incident triage and resolution.

### Phase 5: Observations Workspace
- Applies enterprise layout to `/dashboard/signals` and `/dashboard/resources`.
- Wraps normalized signals and topology resources into `WorkQueue` and `EvidencePanel`.
- Signals are correctly framed as observations, distinct from incidents.
- Resource Graph is explicitly positioned as topology and identity context, not as a permission source.
