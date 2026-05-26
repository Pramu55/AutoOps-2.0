# Resource Graph Foundation Plan

The next architecture phase is a tenant-scoped resource graph. It should come before deeper incident automation because incidents need a safe, durable model of what resources exist and how they relate.

## Why Resource Graph Is Next

AutoOps already sees Jenkins jobs/builds, Docker resources, Kubernetes objects, AWS deployment targets, projects, environments, deployments, operations, and incidents. A resource graph gives these records stable identities and relationships so future signal ingestion and incident correlation can answer:

- What changed?
- What depends on this resource?
- Which deployment owns this runtime object?
- Which operation created or affected this resource?
- Which runbook is safe for this resource kind?

## Why It Comes Before Incidents

Incident correlation without a resource graph tends to become string matching and guesswork. The graph should define resource identity first, then signals can attach to resources, then incidents can correlate affected nodes.

## URN Model

Resource URNs are deterministic public-facing identifiers. They must not contain raw organization IDs, secrets, tokens, kubeconfig content, credentials, or raw provider responses. Tenant isolation should be enforced by database fields and API filters, not by embedding tenant identifiers in URNs.

Recommended examples:

- `urn:autoops:jenkins:local:job/autoops-smoke-build`
- `urn:autoops:jenkins:local:build/autoops-smoke-build/16`
- `urn:autoops:kubernetes:docker-desktop:namespace/default`
- `urn:autoops:kubernetes:docker-desktop:namespace/default:deployment/autoops-api`
- `urn:autoops:kubernetes:docker-desktop:namespace/default:pod/autoops-api-abc123`
- `urn:autoops:docker:local:container/autoops-postgres`
- `urn:autoops:autoops:project/<projectId>`
- `urn:autoops:autoops:environment/<environmentId>`
- `urn:autoops:autoops:deployment/<deploymentId>`

## Future Models

- `ResourceNode`
- `ResourceEdge`
- `Signal`
- `Incident`
- `IncidentEvent`
- `IncidentResource`
- `Runbook`
- `RunbookStep`
- `RunbookExecution`
- `RunbookExecutionStep`

## Future API

- `GET /api/v1/resources`
- `GET /api/v1/resources/:resourceId`
- `GET /api/v1/resources/:resourceId/neighbors`
- `GET /api/v1/signals`
- `GET /api/v1/incidents`
- `GET /api/v1/runbooks`

All future endpoints must be authenticated, tenant-scoped, provider-boundary aware, and secret-free.

## Future Worker Queues

- `signal-processing`
- `incident-correlation`
- `runbook-execution`

## How Existing Connectors Will Register Nodes Later

- Jenkins jobs and builds become `JENKINS_JOB` and `JENKINS_BUILD`.
- Docker containers, images, networks, and volumes become Docker resource nodes.
- Kubernetes namespaces, deployments, pods, services, and nodes become Kubernetes resource nodes.
- AWS deployment targets and ECR repositories become AWS resource nodes.
- Projects, environments, deployments, and operations become AutoOps resource nodes.

Edges can represent ownership, containment, deployment, runtime placement, build provenance, release relationships, and impact.

## Minimal Scaffolding In This Milestone

This milestone adds shared resource graph DTO types and deterministic URN helpers only. It intentionally does not add persistence, ingestion, correlation, or UI graph views.

## What Not To Do Yet

- No fake graph data.
- No Prisma migration unless a later milestone needs persistence.
- No OpenTelemetry collector.
- No AI or autonomous remediation.
- No incident war room.
- No governed runbook execution.
- No bypassing RBAC, approval, provider boundaries, or tenant isolation.

## Implemented Foundation Status

The first Resource Graph foundation is now implemented with Prisma-backed `ResourceNode` and `ResourceEdge` tables, tenant-scoped API routes, shared DTOs, deterministic URN helpers, curated metadata redaction, provider registration hooks for Jenkins/Docker/Kubernetes, AutoOps domain registration hooks, and a read-only `/dashboard/resources` UI.

Still intentionally not implemented: signals, incident correlation, runbook execution, OpenTelemetry ingestion, SLO governance, AI summaries, autonomous remediation, and graph action buttons.
