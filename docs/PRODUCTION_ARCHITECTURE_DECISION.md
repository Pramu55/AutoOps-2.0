# AutoOps Production Architecture Decision

## Status

Proposed for the final production hardening milestone.

## Current Position

AutoOps is a production-style, local-first DevOps control plane with:

- Next.js web application
- Express API
- BullMQ worker
- PostgreSQL persistence
- Redis queue, cache, and rate-limit storage
- Prisma migrations
- Prometheus metrics
- Grafana dashboards
- Tenant-scoped RBAC and provider access
- Approval-gated controlled operations
- Governance evidence
- Incidents and deterministic runbooks
- CI, secret scanning, backup, restore, and release scripts

The local runtime and CI are verified. A complete public production deployment is not yet proven.

## Decision

Use a provider-neutral production topology with separately deployable services.

### Public Services

1. Web
   - Next.js production runtime
   - Public HTTPS endpoint
   - Communicates only with the public API endpoint

2. API
   - Public HTTPS endpoint
   - Authentication, authorization, governance, provider readiness, and realtime connections
   - No public database or Redis ports

### Private Services

3. Worker
   - No public application endpoint
   - Private access to PostgreSQL and Redis
   - Health endpoint available only to the hosting platform or private network

4. PostgreSQL
   - Managed or privately hosted
   - TLS required where supported
   - Automated backups and retention
   - No public unrestricted access

5. Redis
   - Managed or privately hosted
   - Authentication and TLS where supported
   - No public unrestricted access

### Optional Observability Services

6. Prometheus
   - Private scrape access to API and worker metrics
   - Not exposed publicly without authentication

7. Grafana
   - Authenticated HTTPS access
   - Production credentials stored outside the repository

## Network Boundary

- Only Web and API are publicly reachable.
- PostgreSQL and Redis remain private.
- Worker remains private.
- Provider connectors are disabled unless explicitly configured.
- Docker socket access remains disabled in production.
- Kubernetes credentials and provider tokens must come from an approved secret store.
- CORS contains only the exact production Web origin.
- WebSocket origins match the production Web origin.

## Secret Boundary

Production secrets must not be committed, placed in Compose defaults, printed in logs, or exposed to the frontend.

Required secret classes include:

- PostgreSQL credentials
- Redis credentials
- JWT access secret
- JWT refresh secret
- provider credentials
- Jenkins token
- Kubernetes configuration
- AWS credentials
- Grafana administration credentials

JWT access and refresh secrets must:

- be independently generated;
- differ from one another;
- satisfy strict environment validation;
- be rotated through a documented process.

## Production Environment Requirements

Production must set explicit values for:

- NODE_ENV=production
- STRICT_ENV_VALIDATION=true
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
- API_PUBLIC_URL
- CORS_ORIGINS
- NEXT_PUBLIC_API_URL
- NEXT_PUBLIC_WS_URL
- production log level
- approved provider allowlists

Localhost fallbacks must not be accepted by the production validation flow.

## Database Migration Strategy

1. Create an encrypted backup.
2. Verify current Prisma migration status.
3. Review pending migrations.
4. Run `prisma migrate deploy`.
5. Verify migration status again.
6. Start or restart API and worker.
7. Run database-backed smoke checks.

The production process must never use:

- `prisma migrate reset`
- destructive volume deletion
- unreviewed schema push
- manual database mutation without evidence

## Backup and Restore

Production requires:

- automated timestamped PostgreSQL backups;
- encrypted off-host storage;
- documented retention;
- periodic restore testing in a non-production database;
- restore evidence;
- ownership and escalation contacts;
- defined recovery objectives.

Target initial objectives for a portfolio/company-pilot deployment:

- RPO: 24 hours
- RTO: 4 hours

These values must be reviewed before enterprise adoption.

## Deployment Strategy

Use a controlled rolling or replace deployment:

1. CI release checks pass.
2. Images are built from the reviewed commit.
3. Database backup is created.
4. Migrations are deployed.
5. Worker is deployed.
6. API is deployed.
7. Web is deployed with the correct public API URL.
8. Health and readiness checks pass.
9. End-to-end smoke checks pass.
10. Release evidence is recorded.

Do not enable provider mutations during the first public deployment.

## Rollback Strategy

Application rollback:

- redeploy the previously verified image or commit;
- keep database data and persistent volumes;
- do not automatically reverse database migrations;
- investigate migration compatibility before application rollback.

Database recovery:

- use the approved restore process only;
- restore into a separate environment first where possible;
- require explicit operator confirmation;
- preserve evidence and timestamps.

## Observability Requirements

Minimum production monitoring:

- API health and readiness
- worker health and heartbeat
- PostgreSQL connectivity
- Redis connectivity
- queue depth and failed jobs
- request latency and error rate
- authentication failures
- operation failures
- stale worker heartbeat
- deployment annotations
- disk and database capacity where available

Alert delivery must eventually route to an approved email, chat, pager, or incident-management channel.

## Container Hardening Requirements

Production services should evaluate and apply, where compatible:

- non-root runtime user;
- read-only filesystem;
- dropped Linux capabilities;
- `no-new-privileges`;
- CPU and memory limits;
- restart policy;
- bounded log rotation;
- health checks;
- private networks;
- minimal exposed ports;
- immutable image tags or digests.

Exceptions must be documented.

## Production Admin Safety

- Demo users must not be deployed as production administrators.
- The first production administrator must be created through an approved bootstrap process.
- Requester and approver separation must remain enforced.
- Provider access is denied by default.
- Production mutation flags remain disabled until separately approved.

## Release Gates

Production deployment is blocked unless all of the following pass:

- repository clean-state review;
- release script;
- secret scan;
- API tests;
- type checks;
- production builds;
- Prisma migration status;
- production configuration validation;
- backup creation;
- health checks;
- end-to-end smoke test;
- rollback-readiness review;
- CI success;
- human approval.

## Current Blocking Gaps

1. Production URLs still permit localhost defaults.
2. Public HTTPS and domain configuration are not implemented or verified.
3. Secret-manager integration is not selected.
4. Managed/private PostgreSQL and Redis are not provisioned.
5. Off-host encrypted backup is not configured.
6. Restore testing is not proven.
7. External alert delivery is not configured.
8. Production observability topology is not deployed.
9. Automated production deployment workflow is not implemented.
10. Production container hardening is incomplete.
11. Production admin bootstrap is not proven.
12. Two frontend React hook warnings remain.
13. Production smoke and rollback evidence do not exist.

## Implementation Order

1. Add production environment validation.
2. Remove unsafe production localhost fallbacks.
3. Harden production containers and networking.
4. Fix frontend build warnings.
5. Add production smoke and deployment verification scripts.
6. Add backup verification and restore-test documentation.
7. Select a hosting platform.
8. Provision production infrastructure.
9. Deploy with provider mutations disabled.
10. Verify, tag, document, and freeze the release.

## Non-Goals for Initial Deployment

The initial public production deployment will not:

- expose Docker socket access;
- enable arbitrary infrastructure mutation;
- store raw cloud credentials in the database;
- expose PostgreSQL or Redis publicly;
- claim enterprise certification;
- claim high availability until it is tested;
- claim disaster recovery until restore evidence exists.
