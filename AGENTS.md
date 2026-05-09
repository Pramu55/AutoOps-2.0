# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

AutoOps 3.0 is an AI-native DevOps control plane monorepo (pnpm workspaces + Turborepo). See `README.md` for the full command reference.

| Service | Port | Dev command |
|---------|------|-------------|
| API (Express) | 4000 | `pnpm dev` (runs all via turbo) or `cd apps/api && pnpm dev` |
| Worker (BullMQ) | 4001 | `cd apps/worker && pnpm dev` |
| Web (Next.js 15) | 3000 | `cd apps/web && npx next dev --turbo --port 3000` |
| PostgreSQL | 5432 | Native install (see below) |
| Redis | 6379 | Native install (see below) |

### Infrastructure (PostgreSQL & Redis)

Docker Hub is **blocked by egress restrictions** in Cloud Agent VMs. PostgreSQL 16 and Redis 7 are installed natively via apt:

```bash
# Start PostgreSQL (if not already running)
sudo pg_ctlcluster 16 main start

# Start Redis (if not already running)
sudo redis-server --daemonize yes --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

PostgreSQL credentials: `autoops` / `autoops_dev`, database `autoops` on localhost:5432.

### Environment variables

The `.env` file must use `localhost` instead of Docker service names:
- `DATABASE_URL=postgresql://autoops:autoops_dev@localhost:5432/autoops?schema=public`
- `REDIS_URL=redis://localhost:6379`

Export `DATABASE_URL` before running Prisma commands (`pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`).

### Pre-existing code bugs fixed for startup

The following import path bugs exist in the repository and must be fixed for apps to start:

1. **API** (`apps/api/src/modules/`): Files use incorrect relative paths (e.g., `../lib/redis.js` from `modules/health/` resolves to `modules/lib/redis.js` instead of `lib/redis.js`). Fix: use `../../lib/...` and `../../middleware/...` and `../../config/...`.

2. **Worker** (`apps/worker/src/`): Uses unresolved `@/` path aliases at runtime (tsx doesn't resolve tsconfig paths for ESM). Fix: replace `@/config/env.js` with `../config/env.js`, etc. Also: imports `db` from `@autoops/database` (correct export is `prisma`), uses `pretty` (correct property is `prettyPrint`), and references `DeploymentStatus.SUCCESS` (correct value is `SUCCEEDED`).

3. **Web** (`apps/web/`): `postcss.config.js` uses ESM `export default` but package.json lacks `"type": "module"`. Fix: rename to `postcss.config.mjs`.

### Running lint/typecheck/test

- `pnpm lint` — passes for all packages except `@autoops/web` (pre-existing ESM config issue with Next.js lint)
- `pnpm typecheck` — will fail for `@autoops/worker` due to the pre-existing bugs above
- `pnpm test` — vitest is configured in `apps/api` but no test files exist yet (Phase 1)
- `pnpm build` — builds all except worker (same TypeScript errors)

### Seeded demo account

After running `pnpm db:seed`: `admin@autoops.local` / `AutoOpsAdmin1!`

### Google Fonts / egress

`next/font/google` (Inter) may fail in restricted network environments. The Turbopack error (`Connection reset by peer`) during CSS processing is caused by blocked egress to fonts.googleapis.com. The `postcss.config.mjs` rename resolves the non-turbo mode failure.
