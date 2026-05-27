# Signal Ingest Foundation

The Signal Ingest Foundation provides a normalized, tenant-scoped observation stream for AutoOps. It captures real-time facts from infrastructure providers (Kubernetes, Docker, Jenkins) and internal platform events without granting raw provider access to restricted tenants.

## Overview

Signals are non-blocking observations that populate the "Signal Inventory" and Operations Hub. They serve as the audit trail for "what happened" across the distributed system.

### Key Components

- **ResourceSignal Model**: Persistent store for observations with deduplication and lifecycle tracking.
- **SignalService**: Central ingestion logic supporting `DEDUPE` (collapsing repeats) and `EVENT` (discrete facts) modes.
- **Provider Hooks**: Low-overhead side effects in Kubernetes, Docker, and Jenkins discovery flows.
- **Signal Inventory UI**: Tenant-scoped dashboard for searching, filtering, and resolving signals.

## Technical Implementation

### Deduplication Strategy

To prevent alert fatigue, noisy signals (like K8s pod restarts) use a deterministic SHA-256 fingerprint. Repeating observations with the same fingerprint increment a `count` and update `lastSeenAt` rather than creating new records.

### Metadata Safety

All signal metadata is sanitized through a shared utility that:
1. Redacts sensitive keys (tokens, secrets, passwords).
2. Caps string lengths to 500 characters.
3. Limits total metadata keys to 25.
4. Prevents storage of raw provider API objects.

### Tenant Isolation

Signals are strictly organization-scoped.
- Ingestion hooks automatically inject the `organizationId`.
- API queries are filtered by `organizationId`.
- Cross-tenant signal access or resource linking is blocked at the service level.

## Signals are not Incidents

Signals represent **raw observations**. They do not imply a service outage or require immediate human response until they are correlated into an **Incident** by the deterministic correlation engine. When signals are linked to incidents as trigger or related evidence, `SIGNAL_LINKED` events are automatically recorded on the incident workflow timeline.

## Future Work (Roadmap)

- **Retention Worker**: Automated pruning of old signals to maintain database performance.
- **Notification Routing**: Pushing critical signals to Slack, Email, or Webhooks.
