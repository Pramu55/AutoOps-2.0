# Resource Graph Foundation

AutoOps now includes a database-backed Resource Graph foundation. The graph is a tenant-scoped read model that records curated resource identities and relationships discovered through AutoOps domain workflows and allowlisted provider inventory reads.

## Purpose

The Resource Graph gives AutoOps topology context before the platform adds signal ingestion, incident correlation, governed runbooks, SLO governance, or AI summaries. It unifies resources that were previously visible only inside individual modules: projects, environments, deployments, operations, Jenkins jobs/builds, Docker resources, Kubernetes resources, and selected safe cloud or CI resources as those DTOs mature.

The graph is not a permission source. Provider access, RBAC, approval policy, tenant isolation, and operation governance remain enforced by the existing API/service layers.

## Data Model

Resource nodes are stored in `resource_nodes` and resource edges are stored in `resource_edges`.

Node uniqueness is `organizationId + urn`, so the same external URN can exist in multiple organizations without collision. Edges also carry `organizationId` and can only connect nodes that belong to the same organization.

Stored node fields include provider, kind, URN, display name, safe metadata summaries, labels summaries, optional project/environment/deployment/operation references, first/last seen timestamps, and archived state.

## URNs

URNs are deterministic and do not include organization IDs. Tenant isolation is enforced by database filters, not by URN content.

Examples:

- `urn:autoops:jenkins:local:instance/default`
- `urn:autoops:jenkins:local:job/autoops-smoke-build`
- `urn:autoops:docker:local:container/autoops-postgres`
- `urn:autoops:kubernetes:docker-desktop:namespace/default`
- `urn:autoops:autoops:project/<projectId>`
- `urn:autoops:autoops:operation/<operationId>`

## API

Resource Graph endpoints are authenticated and organization scoped:

- `GET /api/v1/resources/readiness`
- `GET /api/v1/resources`
- `GET /api/v1/resources/:resourceId`
- `GET /api/v1/resources/:resourceId/neighbors`

All responses use safe DTOs and exclude raw provider payloads, credentials, kubeconfig content, tokens, authorization headers, Docker socket internals, Terraform state, raw plan output, and environment values.

## Registration Sources

AutoOps domain services register organization, project, environment, deployment, and operation nodes as safe side effects.

Provider connectors register graph nodes only after provider inventory access has already been authorized for the current organization. Blocked organizations do not receive shared provider graph data.

Current provider registrations:

- Jenkins instance, jobs, builds
- Docker engine, containers, images, networks, volumes
- Kubernetes cluster, namespaces, nodes, deployments, pods, services

Provider graph registration is non-blocking. If graph registration fails, the provider page can still render and the error is logged safely.

## Metadata Safety

Resource metadata is curated, redacted, and capped before storage. Suspicious keys and secret-like values are masked. Nested raw provider objects are not stored.

Sensitive material that must never enter Resource Graph metadata includes tokens, passwords, API keys, kubeconfig, cookies, authorization headers, private keys, AWS credentials, GitHub tokens, Jenkins tokens, Docker socket details, Terraform state, backend config, and raw provider output.

## UI

`/dashboard/resources` provides a read-only table, readiness summary, provider counts, filters, search, selected resource details, and neighbor panels. The UI has no action buttons and performs no automation.

Operations Hub includes a Resource Graph card with total resources, edges, stale count, and a link to the graph page.

## Current Boundaries

This milestone does not add signal ingestion, incident correlation, runbook execution, AI, OpenTelemetry ingestion, SLO governance, postmortems, autonomous remediation, or graph-based action buttons.

The next planned milestone is `SIGNAL_INGESTION_GREEN`.
