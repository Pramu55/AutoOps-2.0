# AWS ECS Release Promotion and Rollback Foundation

This document describes the design, implementation, and safety mechanisms for AWS ECS release history, environment release promotion, and governed rollbacks in the AutoOps Control Plane.

## Architecture & Data Model

AutoOps tracks successful deployments using the `AwsRelease` Prisma model. Every successful Terraform/OpenTofu apply on an ECS target creates a new release record.

### Schema Fields
- `id`: Unique identifier (UUID).
- `organizationId`: Scopes all releases strictly to the owning tenant.
- `targetSlug`: Identifies the AWS target workspace (e.g., `aws-sample-ecs-app`).
- `environmentSlug`: Identifies the target environment (e.g., `staging`, `production`).
- `releaseVersion`: Monotonically increasing version number per target and environment (e.g. `v1`, `v2`, `v3`).
- `status`: Release lifecycle state enum (`ACTIVE`, `SUPERSEDED`, `ROLLED_BACK`, `FAILED`).
- `promotedFromReleaseId` / `rolledBackFromReleaseId`: Tracks promotion and rollback lineage vectors.
- `createdByUserId` / `approvedByUserId`: Retains full user accountability logs.

### Tenant Isolation
Release history is strictly partitioned by `organizationId`. A tenant can never query, inspect, promote, or roll back to a release belonging to another organization. Newly registered organizations start with a completely empty release history.

---

## Controlled Operations & Governance

Promotion and rollbacks do not execute directly from the API. Instead, they submit controlled governance operations to the BullMQ task engine, reusing the Day 3 plan safety checks and Day 4 apply authorization flow.

### Operation Types
1. **`AWS_ECS_RELEASE_PROMOTE`**: Promotes a known successful source release from one environment to another.
2. **`AWS_ECS_RELEASE_ROLLBACK`**: Rolls back the active release in an environment to a previous known successful release.

### Approval Policies
| Operation | Target Environment | Approval Required | Risk Level |
| :--- | :--- | :--- | :--- |
| `AWS_ECS_RELEASE_PROMOTE` | `staging` / non-prod | No (Confirmation Only) | MEDIUM |
| `AWS_ECS_RELEASE_PROMOTE` | `production` / `prod` | **Yes** | HIGH |
| `AWS_ECS_RELEASE_ROLLBACK` | Any | **Yes (Always)** | HIGH |

- **Self-Approval Blocked**: Requesters are strictly blocked from self-approving their own promotion or rollback requests.
- **Requester Identity**: The user who triggered the request is logged in the `createdByUserId` field, while the admin who approved it is logged in `approvedByUserId`.

---

## Safety & Worker Execution Gates

Before applying a promotion or rollback, the background worker performs validation checks inside a temporary isolated workspace:

1. **Plan Reconciliation**: The worker re-runs `init`, `validate`, and `plan` dynamically inside the temporary directory.
2. **Block Destructive Actions**: If the generated plan contains any destroy actions (`destroyCount > 0`), the apply is immediately blocked.
3. **Check Eligibility**: If `applyEligible` is `false` or the plan risk is `HIGH`, execution is aborted and a safe incident is recorded.
4. **Lineage Linkage**: Upon successful execution, the worker:
   - Updates the status of the previous `ACTIVE` release in that environment to `SUPERSEDED`.
   - Records the new release as `ACTIVE` and links the promotion or rollback lineage references.

---

## Frontend Integration

The AWS Dashboard client features a dedicated release control panel containing:
- **Active Releases Grid**: Cards showing the currently active release version and image metadata for Staging and Production.
- **Pipelines & Promotion**: A "Request Production Promotion" button available on the Staging active release card.
- **Governed Rollbacks**: Dropdowns allowing users to select a previous successful release in the environment.
- **Double-Confirmation Gate**: Users must type the exact word `ROLLBACK` in a confirmation input to enable the confirmation button.
- **Timeline Logs**: A vertical timeline rendering audit logs, including plan and apply evidence links, creation timestamps, and approval reference lines.
