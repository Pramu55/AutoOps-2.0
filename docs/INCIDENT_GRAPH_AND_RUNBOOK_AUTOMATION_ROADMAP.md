# Incident Graph and Runbook Automation Roadmap

This roadmap describes the safe next architecture sequence after the company handoff/resource graph planning milestone.

## Milestone 1: RESOURCE_GRAPH_FOUNDATION_GREEN

Build persistent `ResourceNode` and `ResourceEdge` models, tenant-scoped APIs, and connector registration hooks for AutoOps, Jenkins, Docker, Kubernetes, AWS, and GitHub Actions resources.

Safety constraints:

- no fake graph data,
- no secrets in URNs,
- no raw organization IDs in public URNs,
- no cross-tenant graph reads.

## Milestone 2: SIGNAL_INGESTION_GREEN

Add safe ingestion for provider events, operation lifecycle signals, health checks, and selected metrics summaries.

Safety constraints:

- no OpenTelemetry collector until configured safely,
- no raw logs with secrets,
- no unbounded metric/cardinality ingestion.

## Milestone 3: INCIDENT_CORRELATION_GREEN

Correlate signals into incidents using resource graph relationships, operation context, and provider failure evidence.

Safety constraints:

- deterministic rules first,
- tenant-scoped incidents,
- no AI-generated incident facts.

## Milestone 4: INCIDENT_WAR_ROOM_UI_GREEN

Add an incident-focused UI that shows affected resources, timeline, owners, linked operations, and safe diagnostic context.

Safety constraints:

- no raw credentials or provider dumps,
- no cross-org resource context,
- no unsafe remediation buttons.

## Milestone 5: RUNBOOK_AUTOMATION_GREEN

Add governed runbook definitions and worker-executed runbook steps for allowlisted diagnostic and recovery actions.

Safety constraints:

- no arbitrary shell,
- approval gates for risky recovery,
- requester self-approval remains blocked,
- all steps produce governance evidence.

## Milestone 6: SLO_GOVERNANCE_GREEN

Add service-level objectives, error budget tracking, policy impact, and release risk gates.

Safety constraints:

- no fake SLO data,
- tenant-scoped SLOs,
- no production gating without company-approved thresholds.

## Milestone 7: AI_SRE_COPILOT_READONLY_GREEN

Add a read-only assistant that can summarize incidents, operations, runbooks, and resource graph context.

Safety constraints:

- read-only first,
- no autonomous execution,
- no secrets in prompts,
- no provider mutation,
- human approval remains mandatory for actions.
