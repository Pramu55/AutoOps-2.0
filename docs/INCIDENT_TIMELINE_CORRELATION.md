# Incident Timeline Correlation

AutoOps exposes a tenant-scoped incident evidence timeline at:

```http
GET /api/v1/incidents/:incidentId/timeline
```

The endpoint is authenticated and always validates the incident with both `incidentId` and `organizationId` before loading related data. Related operations, signals, deployment events, and governance evidence are also queried with tenant boundaries or through tenant-owned parent records.

## Event Sources

The timeline can include these public-safe event types:

- `incident_detected`
- `incident_acknowledged`
- `incident_resolved`
- `incident_archived`
- `signal_observed`
- `operation_requested`
- `operation_pending_approval`
- `operation_approved`
- `operation_rejected`
- `operation_started`
- `operation_succeeded`
- `operation_failed`
- `deployment_event`
- `provider_evidence`

Correlation sources are:

- The incident record and incident event log.
- Linked resource signals.
- Operations directly linked by `operationId`, operation correlation key, linked signal operation IDs, or bounded project/environment time correlation.
- Deployment events directly linked by `deploymentId`, deployment correlation key, linked signal deployment IDs, or bounded project/environment time correlation.
- Governance audit evidence linked to related operations.

## Public-Safe DTO

Each event returns:

- `id`
- `timestamp`
- `source`
- `type`
- `severity`
- `status`
- `title`
- `description`
- `relatedIds`
- `metadata`

Sensitive metadata keys such as tokens, passwords, authorization headers, credentials, kubeconfig, sessions, and secrets are redacted before the response is returned. Provider credentials and raw secrets are never returned to the browser.

## Read-Only Scope

This milestone is read-only. The timeline endpoint does not mutate incidents, providers, deployments, operations, or external systems. Existing incident actions such as acknowledge, resolve, archive, and operator notes remain handled by their existing endpoints.
