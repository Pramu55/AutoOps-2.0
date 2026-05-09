# AutoOps 3.0 — Architecture

> AI-native DevOps Control Plane. Local-first today, Kubernetes-ready tomorrow.

---

## 1. Architectural Pillars

| Pillar | Decision |
|---|---|
| **Topology** | Monorepo, modular monolith on the API side, separate background worker, separate web. Microservice extraction is a refactor — not a rewrite — because every domain lives in its own module behind a service interface. |
| **Runtime** | Local-first via Docker Compose. Identical container images run in Kubernetes later. No cloud-only primitives in Phase 1–4. |
| **Data plane** | PostgreSQL (system of record) + Redis (cache, pub/sub, queue broker). Prometheus for metrics, files/Loki later for logs. |
| **Control plane** | Express API exposes REST + WebSocket. BullMQ worker consumes async jobs. Both share one Prisma client and one logger. |
| **Edge** | Nginx terminates HTTP, fans out to web/api/grafana. WebSocket upgrade preserved. |
| **Auth** | JWT access + refresh, RBAC encoded in DB (Role + Permission). Org/team/project scoping enforced in service layer, never in the route handler. |
| **AI** | Provider-agnostic adapter (`OpenAI | Anthropic | Ollama`) behind a single `AIClient` interface. Prompts live as versioned templates in `packages/ai-prompts`. |
| **Realtime** | Socket.IO over the API server, Redis adapter so multiple API replicas can fan out. |

### Why a modular monolith first

A platform like this has 13+ domains (auth, orgs, projects, deployments, builds, pipelines, logs, metrics, incidents, alerts, AI, audit, integrations). Spinning up 13 services on day one is the failure mode that killed every ambitious DevOps tool that came before. We get the **boundaries** right with module folders + service interfaces; the **deployment topology** stays simple until load actually demands separation.

### Why pnpm + Turborepo

- pnpm: content-addressable store, strict hoisting, fastest install in CI, first-class workspace support.
- Turborepo: incremental builds with remote cache, task graph awareness (`web` waits on `types`, `api` waits on `database`), zero config for our pipeline.

---

## 2. Repository Layout

```
autoops/
├── apps/
│   ├── web/                    # Next.js 15 (App Router) — dashboard
│   ├── api/                    # Express + TS — REST, WS, auth, RBAC
│   └── worker/                 # BullMQ — builds, deployments, AI, ingest
│
├── packages/
│   ├── config-typescript/      # Shared tsconfigs (base, node, nextjs, react-lib)
│   ├── config-eslint/          # Shared ESLint flat configs
│   ├── database/               # Prisma schema + generated client + seed
│   ├── types/                  # Domain DTOs, enums, contract types
│   ├── logger/                 # Pino logger w/ request-id correlation
│   ├── utils/                  # Errors, env loader, result helpers
│   └── ui/                     # (later) shared shadcn components
│
├── infra/
│   ├── docker/                 # Dockerfiles per app (multi-stage)
│   ├── nginx/                  # Reverse proxy config
│   ├── prometheus/             # Scrape config + alert rules
│   └── grafana/                # Provisioned dashboards + datasources
│
├── scripts/                    # Bootstrap, db reset, codegen helpers
├── docs/                       # ADRs, runbooks, API docs
├── .github/workflows/          # CI: lint, typecheck, test, build, image push
├── docker-compose.yml          # Local dev stack
├── docker-compose.prod.yml     # Production-like stack (single host)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                # Workspace root
├── tsconfig.base.json
├── .env.example
├── ARCHITECTURE.md             # ← this document
└── README.md
```

---

## 3. Service Topology (Phase 1)

```
                          ┌────────────────────────────┐
                          │           Nginx             │
                          │   (TLS term, routing, WS)   │
                          └─────────┬───────────┬───────┘
                                    │           │
                       ┌────────────▼──┐   ┌────▼─────────┐
                       │  Next.js Web   │   │  Express API  │
                       │  :3000         │   │  :4000        │
                       └────────────────┘   └─┬──────┬──────┘
                                              │      │
                                ┌─────────────▼──┐  │
                                │   PostgreSQL   │  │
                                │   (Prisma)     │  │
                                └────────────────┘  │
                                                    │
                                ┌──────────────┐    │
                                │  Redis       │◄───┤   pub/sub + cache
                                │  (queues +   │    │
                                │   pub/sub)   │    │
                                └──────┬───────┘    │
                                       │            │
                                ┌──────▼────────┐   │
                                │  BullMQ       │   │
                                │  Worker       │◄──┘  jobs
                                │  (deploys,    │
                                │   builds, AI) │
                                └───────────────┘

           ┌─────────────────┐         ┌─────────────────┐
           │  Prometheus     │  ←─ scrape /metrics on api & worker
           │  Grafana        │  ←─ datasource: prometheus
           └─────────────────┘
```

---

## 4. Data Flow Patterns

### 4.1 Synchronous request (e.g., create project)
`Web → Nginx → API route → middleware (authn/rbac/validate) → controller → service → repository → Prisma → Postgres`

### 4.2 Async deployment
`Web triggers POST /deployments → API persists "queued" deployment → enqueues BullMQ job → returns 202 → Worker picks up job → runs build/deploy steps → emits events to Redis pub/sub → API forwards via WebSocket → Web updates UI in real time`

### 4.3 Metrics
`API + worker expose /metrics (prom-client) → Prometheus scrapes every 15s → Grafana queries Prometheus → API exposes /api/metrics/* that proxies to Prometheus for in-app dashboards`

### 4.4 Logs (Phase 1)
Structured pino JSON to stdout. Captured by Docker. Phase 3 introduces Loki.

---

## 5. Domain Model (high-level)

```
User ──< OrgMembership >── Organization ──< Team
                                ↑
                                └──< Project ──< Environment ──< Deployment ──< DeploymentEvent
                                                                       │
                                                                       └──< BuildLog
                                Project ──< Pipeline ──< PipelineRun ──< PipelineStep
                                Project ──< Incident ──< IncidentEvent
                                Project ──< Alert
                                Project ──< AIConversation ──< AIMessage
Organization ──< AuditLog
```

Every mutating service call writes an `AuditLog` row. RBAC is checked against `OrgMembership.role` plus a per-resource `Permission` matrix.

---

## 6. Security Posture (initial)

- HTTPS terminated at Nginx (self-signed locally, real certs in prod via cert-manager later).
- Helmet + CORS allowlist on the API.
- Argon2id for password hashing (not bcrypt — better resistance to GPU attacks).
- JWT access tokens, 15-min TTL; refresh tokens persisted hashed in `refresh_tokens` table, rotated on use.
- Per-route rate limiting (Redis sliding window).
- Audit log on every state-changing call (org/project/deploy/role mutations).
- All secrets through env vars; `.env.example` documents shape, real `.env` is git-ignored.
- Zod schema validation on every request body, query, and param.

---

## 7. Observability Posture (initial)

- `prom-client` default + custom metrics on api/worker (`http_request_duration_seconds`, `deployments_total`, `queue_depth`).
- pino structured logging with `requestId`, `userId`, `orgId` correlation tags.
- `/healthz` (liveness) and `/readyz` (DB + Redis ping) on api & worker.
- Grafana provisioned with three baseline dashboards: API Health, Worker Health, Deployment Throughput.

---

## 8. Phase Roadmap (commit-sized)

| Phase | Goal | Artifacts |
|---|---|---|
| **1 — Foundation** *(this commit)* | Monorepo, shared packages, DB schema, API/web/worker skeletons, Docker stack, auth scaffolding, dashboard shell | What you're reading |
| **2 — Build & Deploy** | GitHub OAuth, Project CRUD, Docker build pipeline, deployment engine, log streaming via WS | `apps/api/src/modules/{projects,deployments,pipelines,git}` |
| **3 — Observability** | Prometheus integration in-app, realtime metrics dashboards, alerts engine, incidents | `apps/api/src/modules/{metrics,incidents,alerts}` |
| **4 — AI Copilot** | Multi-provider AI client, log explainer, Dockerfile/YAML generator, RCA, embeddings + vector store | `packages/ai-*`, `apps/api/src/modules/ai` |
| **5 — Kubernetes** | kubeconfig storage, cluster viz, Helm catalog, manifest editor, ArgoCD-style sync | `apps/api/src/modules/kubernetes`, `apps/web/src/app/clusters` |

---

## 9. Non-goals (deliberate)

- No Kafka, no NATS, no service mesh in Phase 1. Redis pub/sub is plenty until we measure otherwise.
- No multi-tenant DB isolation in Phase 1; row-level scoping is sufficient. Schema-per-tenant if/when an enterprise customer demands it.
- No client-side state management library beyond Zustand + TanStack Query. Redux is not justified.
- No GraphQL. REST + typed contracts via the shared `types` package gives us the same DX without the operational cost.

---

## 10. Decision Log Pointers

ADRs live in `docs/adr/`. The first three to write (in this order):

1. `ADR-0001-monorepo-pnpm-turbo.md`
2. `ADR-0002-modular-monolith-api.md`
3. `ADR-0003-postgres-redis-only.md`

Future architectural moves must update this file and add a new ADR.
