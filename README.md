# AutoOps 2.0

> **AI-native DevOps control plane.** Deploy, observe, and understand your infrastructure — with an AI copilot that reads your logs, writes your Dockerfiles, and explains every incident.

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| API | Express 4 + TypeScript (ESM) |
| Worker | BullMQ + Redis |
| Web | Next.js 15 (App Router) + Tailwind + shadcn/ui |
| Database | PostgreSQL 16 + Prisma ORM |
| Queue/Cache | Redis 7 |
| Observability | Prometheus + Grafana |
| Reverse proxy | Nginx |

---

## Quick start (Docker — one command)

```bash
# 1. Clone and enter the repo
git clone <repo-url> autoops && cd autoops

# 2. Copy env template and fill in the two secrets
cp .env.example .env
# Edit .env — set JWT_SECRET and JWT_REFRESH_SECRET (32+ chars each):
#   openssl rand -base64 48

# 3. Start the full stack
docker compose up --build -d

# 4. Run migrations and seed the database
docker compose exec api pnpm --filter @autoops/database db:migrate
docker compose exec api pnpm --filter @autoops/database db:seed

# 5. Open the UI
open http://localhost
```

| Service | URL |
|---|---|
| Web UI | http://localhost |
| API | http://localhost/api |
| Grafana | http://localhost/grafana &nbsp;(admin / admin) |
| Prometheus | http://localhost:9090 |

**Demo login:** `admin@autoops.local` / `AutoOpsAdmin1!`

---

## Local development (without Docker)

```bash
# Install dependencies
pnpm install

# Copy and fill env
cp .env.example .env

# Start Postgres + Redis (Docker required for these two)
docker compose up postgres redis -d

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed
pnpm db:seed

# Start all apps in watch mode (api, worker, web)
pnpm dev
```

Each app runs on its own port:

| App | Port |
|---|---|
| Web | 3000 |
| API | 4000 |
| Worker health | 4001 |

---

## Project layout

```
autoops/
├── apps/
│   ├── api/          Express API — auth, REST, WebSocket, Prometheus
│   ├── worker/       BullMQ worker — deployments, builds (Phase 2), AI (Phase 4)
│   └── web/          Next.js 15 dashboard
│
├── packages/
│   ├── database/     Prisma schema (21 models) + seed
│   ├── types/        Shared Zod schemas + inferred TS types
│   ├── logger/       Pino structured logger
│   └── utils/        AppError hierarchy, env loader, Result type
│
├── infra/
│   ├── docker/       Dockerfiles (multi-stage, node runtime user)
│   ├── nginx/        Reverse proxy — web, api, ws upgrade, grafana
│   ├── prometheus/   Scrape config
│   └── grafana/      Provisioned datasource + overview dashboard
│
├── docker-compose.yml
├── ARCHITECTURE.md
└── .env.example
```

---

## Environment variables

See `.env.example` for the full list. Required values:

```env
DATABASE_URL=postgresql://autoops:autoops_dev@localhost:5432/autoops
REDIS_URL=redis://localhost:6379
JWT_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>
```

---

## Useful commands

```bash
pnpm build              # Build all packages + apps
pnpm lint               # Lint everything
pnpm typecheck          # Type-check everything
pnpm db:generate        # Regenerate Prisma client after schema changes
pnpm db:migrate         # Run pending migrations (prisma migrate dev)
pnpm db:seed            # Seed the database
pnpm db:studio          # Open Prisma Studio at :5555
docker compose logs -f api worker   # Follow service logs
```

---

## Phase roadmap

| Phase | Goal | Status |
|---|---|---|
| **1 — Foundation** | Monorepo, shared packages, DB schema, API, worker, web shell, Docker stack | ✅ |
| **2 — Build & Deploy** | GitHub OAuth, project CRUD, Docker build pipeline, deployment engine, log streaming | 🔜 |
| **3 — Observability** | In-app Prometheus dashboards, alerts engine, incident management | 🔜 |
| **4 — AI Copilot** | Multi-provider AI (OpenAI/Anthropic/Ollama), log explainer, RCA, Dockerfile generator | 🔜 |
| **5 — Kubernetes** | kubeconfig management, cluster viz, Helm catalog, ArgoCD-style sync | 🔜 |

---

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design doc — topology, data flows, security posture, and decision log.
