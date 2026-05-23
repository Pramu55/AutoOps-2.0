# Tenant Isolation And Authorization

## Purpose

AutoOps treats organization membership as the tenant boundary. Users should only see and mutate data that belongs to their authenticated organization.

## Threat Model

The primary risks are cross-organization reads, direct-ID access to another tenant resource, stale browser state after switching accounts, cross-org approval, and worker-created records losing organization context.

## Tenant Isolation Rules

- Tenant-owned API queries must include the authenticated `organizationId`.
- Tenant-owned resources must not be authorized by ID alone.
- API controllers must use `req.auth.orgId`; they must not trust frontend-supplied `organizationId`.
- Provider status may be platform-wide, but operation history, governance evidence, incidents, projects, deployments, and audit logs are tenant-scoped.

## Root Cause

The original codebase did not enforce tenant isolation at the database query level. Prisma queries could accept a resource ID alone without filtering by `organizationId`, allowing any authenticated user to read or act on resources belonging to another tenant.

## Organization-Scoped Data Model

Projects and operations store `organizationId` directly. Environments, deployments, deployment events, and build logs are scoped through project/environment relations. Incidents and audit logs store `organizationId` and preserve operation linkage.

| Entity | Scope Method |
|---|---|
| Project | `where: { organizationId }` |
| Environment | `where: { project: { organizationId } }` |
| Deployment | `where: { project: { organizationId } }` |
| Deployment Event | Scoped via parent deployment org check |
| Operation | `where: { organizationId }` |
| Incident | `where: { organizationId }` |
| Audit Log | `where: { organizationId }` |
| Governance Evidence | `where: { organizationId }` — OWNER/ADMIN only for export |

## Auth Context

Access tokens carry user and organization context. The API auth middleware revalidates the token organization against live `OrgMembership` records and refreshes the request role from the database before protected handlers run.

### Auth Middleware Revalidation Flow

1. Extract JWT from `Authorization: Bearer <token>` header.
2. Verify token signature, expiry, issuer, and audience.
3. Require `payload.orgId` — reject tokens without organization context.
4. Query `OrgMembership` by `(userId, organizationId)` compound key.
5. Verify `user.isActive` and `user.deletedAt` — reject disabled/deleted users.
6. Set `req.auth.role` from live membership, not from stale token claims.

## Service-Layer Enforcement

Services receive organization context from controllers and apply it to list, detail, mutation, aggregation, approval, governance, and export paths.

### Verified Services

| Service | Org Scoping |
|---|---|
| `ProjectService` | All methods accept `organizationId` first; all queries filter by it |
| `DeploymentService` | List, detail, trigger, and events filter through `project.organizationId` |
| `OperationService` | List, get, create, approve, reject — all filter by `organizationId` |
| `IncidentService` | List, detail, acknowledge, resolve, summary — all filter by `organizationId` |
| `AuditLogService` | `listAuditLogs(organizationId)` |
| `OpsService` | Activity, summary, observability, governance — all filter by `organizationId` |
| `OperationAuthorizationService` | Membership lookup by `(userId, organizationId)` compound key |

## Controller Rules

Controllers derive organization context from authenticated middleware only. Request bodies and query strings are not accepted as tenant authority.

### Controller Pattern

Every protected controller uses a `_requireOrganizationId(req)` or `_requireAuth(req)` helper:
1. Check `req.auth` exists — throw `UnauthenticatedError` if missing.
2. Check `req.auth.orgId` exists — throw `UnauthorizedError` if missing.
3. Return the org ID to pass to service methods.

## Approval Isolation

Approvals require:

- the operation belongs to the authenticated organization
- the approver is an owner/admin in that organization
- the requester and approver are different users
- the operation is still pending approval

Self-approval is explicitly blocked at the authorization service layer, not just the UI.

## Governance Export Isolation

Governance evidence and export endpoints are organization-scoped and omit raw input, raw provider results, stacks, tokens, kubeconfig, environment values, and secret-like metadata.

## Incident Isolation

Incident list, detail, acknowledge, resolve, and summary paths filter by organization and verify membership.

## Integration Operation Isolation

Jenkins, Docker, Kubernetes, and Infrastructure action endpoints create operation records with the authenticated organization. Worker jobs load operations by both operation ID and organization context.

### Worker Tenant Scoping

The deployment worker verifies `project.organizationId` when loading deployment records and when claiming jobs via `updateMany`. This prevents cross-tenant job execution even if a job payload is tampered with.

## UI Session Safety

Login and logout clear AutoOps browser storage and React Query cache so a newly authenticated account does not see cached data from a previous account.

### Cleared on Login/Logout

- `sessionStorage`: All keys starting with `autoops`
- `localStorage`: All keys starting with `autoops`
- Cookies: `refresh_token`, `autoops_session`
- React Query cache: `queryClient.clear()`
- Zustand auth store: `clearAuth()` and `resetWorkspace()`

## Seed/Demo Isolation

The database seed creates two separate organizations for tenant isolation testing:

| Organization | Users | Purpose |
|---|---|---|
| AutoOps Demo (Org A) | `pramod.local@autoops.dev` (OWNER), `approver.local@autoops.dev` (ADMIN) | Primary demo org with requester/approver workflow |
| AutoOps Isolated Demo (Org B) | `isolated.local@autoops.dev` (OWNER), `isolated.admin.local@autoops.dev` (ADMIN) | Separate org for cross-tenant isolation verification |

Each organization has its own project and environments. `pramod.local` and `approver.local` are intentionally in the same organization for approval workflow testing.

## Test Coverage

### Auth Middleware Tests (`auth.test.ts`)
- Hydrates role and email from live organization membership (not stale token).
- Rejects tokens whose org membership no longer exists.
- Rejects tokens without organization context.

### Project Service Tests (`project.service.test.ts`)
- Lists projects only for the authenticated organization.
- Gets a project by ID only when it belongs to the authenticated organization.
- Does not return a project from another organization by direct ID.

### Operation Authorization Tests (`operation-authorization.service.test.ts`)
- Returns role when user has membership.
- Returns null when user has no membership (cross-org blocked).
- Blocks approval when user has no role in the organization.
- Blocks approval for VIEWER role.
- Allows approval for ADMIN with different requester.
- Blocks self-approval for OWNER and ADMIN.
- Blocks self-rejection for OWNER.
- Blocks trigger for null role and VIEWER.
- Allows trigger for MEMBER, ADMIN, OWNER.
- Blocks approval/rejection of non-pending operations.

### Operation Policy Tests (`operation-policy.service.test.ts`)
- 16 tests covering confirmation, approval, and risk level policies.

## Manual Verification Steps

1. Log in as `pramod.local@autoops.dev`.
2. Record visible projects, operations, incidents, and governance evidence.
3. Log out.
4. Log in as `isolated.local@autoops.dev`.
5. Confirm the AutoOps Demo Org project and operation history are not visible.
6. Attempt direct API reads for an Org A project/operation using the Org B token.
7. Expect `404` or `403`.
8. Attempt Org B approving Org A operation — expect `404` or `403`.
9. Attempt requester self-approval — expect blocked.

## Known Limitations

Local connector inventories can represent shared local infrastructure. Operation history and governance evidence remain tenant-scoped.

## Future Improvements

- explicit organization switcher for multi-org users
- broader integration tests against a disposable Postgres database
- per-tenant connector credentials for company pilots
- RLS (Row Level Security) in PostgreSQL for defense-in-depth
