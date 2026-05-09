# AGENTS.md

## Cursor Cloud specific instructions

### Overview

AutoOps 3.0 is an AI-native DevOps control plane built as a pnpm + Turborepo monorepo. See `README.md` for stack details and `ARCHITECTURE.md` for design docs.

### Services

| Service | Port | Command | Notes |
|---------|------|---------|-------|
| Web (Next.js 15) | 3000 | `pnpm dev` (via turbo) | Works standalone for UI dev |
| API (Express) | 4000 | `pnpm dev` (via turbo) | Requires PostgreSQL + Redis |
| Worker (BullMQ) | 4001 | `pnpm dev` (via turbo) | Requires PostgreSQL + Redis |

### Infrastructure (PostgreSQL + Redis)

Docker Hub is blocked in Cloud Agent VMs (egress restrictions). Install PostgreSQL and Redis natively instead of using `docker compose up postgres redis -d`:

```bash
sudo apt-get update && sudo apt-get install -y postgresql postgresql-client redis-server
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "CREATE USER autoops WITH PASSWORD 'autoops_dev' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE autoops OWNER autoops;"
sudo redis-server --daemonize yes --appendonly yes
```

### Environment variables

Copy `.env.example` to `.env` and update these values for local (non-Docker) dev:
- `DATABASE_URL` — use `localhost` not `postgres` as host, password `autoops_dev` (matching native PG setup)
- `REDIS_URL` — use `localhost` not `redis` as host
- `POSTGRES_PASSWORD` — `autoops_dev`

### Database setup

```bash
export DATABASE_URL="postgresql://autoops:autoops_dev@localhost:5432/autoops?schema=public"
pnpm db:generate   # Generate Prisma client
pnpm db:migrate    # Run migrations (will prompt for name if no existing migrations)
pnpm db:seed       # Seeds demo user: admin@autoops.local / AutoOpsAdmin1!
```

`DATABASE_URL` must be exported in the shell before running any Prisma or dev commands — the `.env` file is loaded by `dotenv` at runtime but Prisma CLI reads from the environment directly.

### Lint / Test / Build

Standard commands per `README.md`: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck`.

Note: `pnpm test` currently exits with code 1 because no test files exist yet (Phase 1). The Vitest infrastructure in `apps/api` is correctly configured.

### Known pre-existing code issues

- **API app**: Files in `src/modules/health/` and `src/modules/auth/` use incorrect relative imports (e.g., `../lib/redis.js` should be `../../lib/redis.js`). This prevents the API from starting in dev mode.
- **Worker app**: Imports `db` from `@autoops/database` (should be `prisma`), uses `pretty` instead of `prettyPrint` for logger options, and references `DeploymentStatus.SUCCESS` (should be `SUCCEEDED`). This prevents the worker from building/starting.
- **Web app lint**: 3 unused-import lint errors in the web app.

These issues block full end-to-end testing but do not affect environment setup.
