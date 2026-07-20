# AutoOps 3.0 — Gate 3 Cloud Architecture Decision

## Status

Accepted for Gate 3 planning.

This decision permits documentation and local infrastructure planning only. During Slice 1, this decision explicitly prohibits:

- AWS resource creation
- Terraform files
- Terraform init
- Terraform plan
- Terraform apply
- Terraform destroy
- AWS credentials
- IAM changes
- budget creation
- EC2
- ECS
- RDS
- ElastiCache
- ECR
- ALB
- VPC
- Route 53
- ACM
- deployment workflow changes
- Docker runtime changes
- database changes
- protected volume changes
- provider mutation enablement

## Repository Baseline

- Repository: Pramu55/AutoOps-2.0
- Canonical repository: C:\AutoOps 2.0
- Gate 3 base commit: b02a93276ed0c4b66928adddb305fede0d32fa6e
- Branch: feat/controlled-cloud-deployment-plan
- Gate 2 Slice 2 production container hardening completed

## Context

AutoOps is a DevOps control plane for projects, environments, deployments, approvals, operations, incidents, provider integrations, resources, historical signals, governance, recommendations, and audit evidence.

Gate 2 Slice 2 completed production container hardening. The repository now has production controls for strict production environment validation, HTTPS public URL requirements, explicit HTTPS CORS origins, non-root application containers, read-only application root filesystems, no-new-privileges, dropped Linux capabilities, bounded logs, CPU, memory and PID limits, private PostgreSQL and Redis, no Docker socket, no kubeconfig, no privileged mode, no host networking, and isolated runtime proof.

Gate 3 must preserve those controls while documenting a path from local production hardening to a controlled cloud deployment plan. The first slice is intentionally limited to an Architecture Decision Record. It does not approve any cloud account mutation, provider credential handling, Terraform authoring, or deployment runtime change.

## Cost Constraint

The AWS introductory Free Tier has expired.

Therefore:

- planning spend must remain USD 0
- local implementation spend must remain USD 0
- no always-running cloud architecture is approved
- every later resource-creating slice requires a cost estimate
- every apply requires explicit approval
- all cloud deployments must be temporary and reversible
- unused resources must be destroyed after evidence capture

Proposed future alerts:

- First alert: USD 5
- Second alert: USD 10
- Personal safety boundary: USD 15

Budget alerts do not guarantee spending stops. They are notification controls, not hard enforcement controls, and they must be paired with short deployment windows, teardown runbooks, inventory checks, and explicit approval before any resource creation.

## Decision Summary

| Decision                                | Selection                                                         |
| --------------------------------------- | ----------------------------------------------------------------- |
| Target cloud                            | AWS                                                               |
| Primary region                          | ap-south-1                                                        |
| Infrastructure as code                  | Terraform                                                         |
| Long-term compute                       | ECS on Fargate                                                    |
| Initial deployment proof                | short-lived EC2 Docker Compose deployment                         |
| Long-term database                      | private RDS PostgreSQL                                            |
| Long-term Redis                         | private ElastiCache Redis                                         |
| Initial proof database                  | disposable PostgreSQL container                                   |
| Initial proof Redis                     | disposable Redis container                                        |
| Long-term ingress                       | ALB with ACM                                                      |
| Initial proof ingress                   | Nginx reverse proxy with controlled TLS                           |
| Secrets                                 | Parameter Store SecureString or Secrets Manager depending on need |
| CI authentication                       | GitHub Actions OIDC                                               |
| Availability                            | single-region pilot                                               |
| Managed data may initially be single-AZ | documented cost trade-off                                         |
| Provider mutations                      | disabled                                                          |
| Kubernetes hosting                      | not approved                                                      |
| Normal planning spend                   | zero                                                              |
| Live proof model                        | create, verify, capture evidence, safely destroy                  |

## Cloud-Provider Decision

AWS is selected as the target cloud because AutoOps already integrates with AWS and because AWS provides strong IAM, VPC, ECS, secrets, and monitoring portfolio value. The same selection also provides strong DevOps interview value by demonstrating controlled cloud architecture, identity, networking, deployment, observability, backup, rollback, and teardown thinking in a widely used production platform.

AWS is not selected because it is the cheapest provider. The expired introductory Free Tier makes cost discipline an architecture requirement. AWS is selected because the architecture can be designed locally before any paid deployment and because short-lived proof slices can be tightly constrained, reviewed, and destroyed after evidence capture.

## Region Decision

The primary region is ap-south-1.

ap-south-1 is selected for Bengaluru proximity, India latency, required service availability, single-region simplicity, and easier cost tracking. No cross-region deployment is approved initially. Cross-region replication, disaster recovery, and failover are deferred until after measured recovery evidence exists in the single-region pilot.

## Architecture Modes

### Mode 1 — Initial Controlled Deployment Proof

```text
Internet
  |
  v
DNS
  |
  v
HTTPS
  |
  v
Temporary EC2 instance
  |
  v
Nginx
  |----------------|
  v                v
Web               API
                    |
                    |----------------|
                    v                v
                  Worker         PostgreSQL
                    |
                    v
                  Redis
```

The initial controlled deployment proof is temporary, not highly available, and not the final production design. It is intended to prove provisioning, deployment, HTTPS, secrets, migrations, health checks, smoke tests, rollback, backup, restore, monitoring, and teardown.

Only disposable test data is allowed unless preservation is separately approved. The proof must use unique cloud volume names and must never reuse local AutoOps volumes. Public access is limited to HTTPS ingress. PostgreSQL and Redis must not expose public ports.

### Mode 2 — Long-Term Production-Like Architecture

```text
Internet
  |
  v
Route 53
  |
  v
ACM
  |
  v
Application Load Balancer
  |------------------------------|
  v                              v
Web ECS service              API ECS service
                                  |
                                  |---------------------------|
                                  v                           v
                         Private RDS PostgreSQL     Private ElastiCache Redis
                                                              |
                                                              v
                                                   Private worker ECS service
```

The long-term production-like architecture uses ECR for immutable images, CloudWatch for logs and metrics, Parameter Store or Secrets Manager for secret material, GitHub OIDC for CI authentication, least-privilege task roles, deployment circuit breaker behavior, a controlled migration task, backup and restore procedures, and billing alerts.

This architecture is a future target and is not approved for continuous deployment now. ECS, RDS, ElastiCache, ALB, ACM, Route 53, and supporting network resources require separate cost approval and explicit resource-creation approval in a later slice.

## Compute Decision

The initial proof uses a temporary EC2 instance running Docker Compose. This supports easy teardown, a low-cost controlled proof, and useful Linux, Docker, EC2, and Terraform experience. The EC2 proof is acceptable only as a temporary validation environment and must not become the long-term production architecture.

The long-term compute target is ECS Fargate with separate web, API, and worker services. ECS Fargate avoids host patching, supports IAM task roles, private networking, ALB, ECR, and CloudWatch integration, and provides rolling deploy and rollback behavior.

EKS is rejected for now because Kubernetes hosting would introduce unnecessary cost and operational complexity for the Gate 3 objective. Kubernetes hosting is not approved by this decision.

## Data Decision

The initial proof uses containerized PostgreSQL and containerized Redis on the temporary EC2 deployment. It must use unique cloud volume names, never reuse local AutoOps volumes, expose no public 5432 or 6379 ports, use disposable data, and prove backup and restore before teardown.

The long-term data target is private RDS PostgreSQL and private ElastiCache Redis. Requirements include encryption at rest, encrypted transport where supported, no public accessibility, security-group-only access, automated backups, a measured restore drill, maintenance windows, deletion protection, Terraform lifecycle protection, and single-AZ initially only as a documented cost trade-off.

Managed data services are future architecture. They are not approved for creation or continuous operation by Slice 1.

## Networking Decision

The long-term network model uses one VPC with public ingress subnets, private application subnets, and private data subnets. Access must be controlled with security-group-to-security-group rules. PostgreSQL must not be public. Redis must not be public. Workers must have no inbound access path. Normal SSH administration is not approved.

For the initial EC2 proof, only HTTPS is public. Systems Manager should be used where practical. Broad admin ports are not approved. Public DB and Redis ports are not approved.

## NAT and Egress Decision

No NAT Gateway is approved by default.

Before any egress design is selected, the following options must be compared:

- no runtime internet egress
- restricted public EC2 egress
- NAT instance
- NAT Gateway
- gateway endpoints
- interface endpoints

Interface endpoints are not free. NAT Gateway is also a recurring cost source. A cost comparison is required before selecting any egress pattern. The default planning assumption is that runtime internet egress should be minimized and cloud spend should remain zero until an explicitly approved resource-creating slice.

## HTTPS and DNS

Long-term names:

- app.<domain>
- api.<domain>

Requirements:

- HTTPS only
- HTTP redirected to HTTPS
- TLS 1.2+
- ACM for long-term architecture
- exact HTTPS CORS origin
- no wildcard CORS
- HSTS after verification
- Grafana not publicly exposed without strong protection

Domain purchase is not required for Slice 1. Any later domain, DNS, or certificate work requires explicit approval and must fit the zero-spend planning constraint until a resource-creating slice is approved.

## Secrets

Secrets are explicitly prohibited in:

- Git
- committed .env
- Terraform source
- committed tfvars
- images
- plaintext EC2 user data
- workflow logs
- plaintext task environment variables
- long-lived GitHub credentials

Approved secret handling patterns are Parameter Store SecureString, Secrets Manager where rotation is needed, GitHub Actions OIDC, service-specific IAM, and documented rotation. Secret access must be narrow, auditable, environment-specific, and never dependent on long-lived static AWS keys in CI.

## IAM

Separate IAM roles are required for:

- web
- API
- worker
- task execution
- deployment
- migration
- monitoring
- backups
- human administration

Automation must not use AdministratorAccess. Broad wildcard permissions are not allowed without written justification. Long-lived AWS keys are not approved. AutoOps provider mutation permissions are not approved. iam:PassRole must be limited to the smallest required role set. Human access must use MFA, and IAM Identity Center should be used where practical. CloudTrail audit evidence is required for human and automation actions in any later cloud activity.

## Terraform Decision

Terraform is selected as the infrastructure as code tool.

Planned structure:

```text
infra/
  terraform/
    modules/
      budget/
      identity/
      network/
      security/
      compute/
      database/
      redis/
      registry/
      observability/
      dns/
    environments/
      proof/
      production/
docs/
  cloud/
scripts/
```

Terraform work must use separate environment state, encrypted remote state later, state locking, no committed secrets, typed variables, validation, consistent tags, manually reviewed plan, no automatic production apply, lifecycle protection, a destroy runbook, drift detection, and cost review.

Slice 1 does not permit Terraform files, Terraform init, Terraform plan, Terraform apply, Terraform destroy, provider credentials, or provider mutation enablement.

## Deployment Workflow

The target deployment workflow is:

```text
Feature branch
-> PR
-> CI
-> merge
-> immutable image build
-> security scan
-> image push by commit SHA
-> manual approval
-> backup
-> one-off Prisma migration
-> deploy
-> health checks
-> smoke tests
-> evidence or rollback
```

No static AWS credentials are approved. CI authentication must use GitHub Actions OIDC with tightly scoped deployment permissions in a later approved slice.

## Database Migration

Production database migration must use:

```text
prisma migrate deploy
```

The migration runs as a controlled one-off task. It must never run in every API replica. `prisma migrate reset` must never be used against production or production-like data. Concurrent production deployments are not allowed during migration. A backup is required before migration. Deployment must halt on migration failure. The application deploys only after migration success. Forward-fix is preferred for recoverable migration issues. Snapshot restore is reserved for severe failure and requires a controlled cutover plan.

## Rollback

Rollback coverage must include web, API, worker, configuration, secret version, health-check failure, migration failure, PostgreSQL failure, and Redis failure.

Application rollback means redeploying the previous immutable image for the affected service and restoring the previously known-good configuration and secret version where required. Health-check or smoke-test failure must stop rollout and trigger rollback before accepting the deployment as complete.

Database rollback is not the same as application rollback. Database failure should be handled through forward-fix when possible. Severe data or migration failure requires separate restore, validation, and controlled cutover. PostgreSQL restore must be tested against an isolated restore target before any production cutover. Redis recovery expectations must be documented separately because Redis may contain ephemeral, cache, or queue state with different recovery requirements.

## Observability

Initial proof observability must include health checks, structured logs, host monitoring, API error visibility, PostgreSQL monitoring, Redis monitoring, external uptime check, billing alerts, and deployment evidence.

Long-term observability should include CloudWatch, Prometheus-compatible metrics, Grafana, external alerts, and deployment and rollback audit evidence. Grafana must not be publicly exposed without protection.

## Backup and Disaster Recovery

Backups are not verified until restored.

Disaster recovery planning must include PostgreSQL backup, isolated restore, data-integrity verification, application connectivity to restored data, measured restore time, Redis recovery expectations, Terraform reconstruction, immutable image retention, and incident runbooks.

RPO and RTO must be determined after a measured restore drill. Until that drill exists, any stated recovery target is only a planning assumption.

## Gate 3 Slices

Slice 1: feat/controlled-cloud-deployment-plan

Documentation only, no cloud resources.

Slice 2: feat/aws-terraform-foundation

Terraform structure, formatting, validation and static checks only. No apply.

Slice 3: feat/aws-account-cost-guardrails

Billing inspection, resource inventory, alerts, expiry controls and OIDC design. No creation without explicit approval.

Slice 4: feat/aws-ec2-proof-plan

EC2 design, security groups, Systems Manager, storage, TLS prerequisites, cost and teardown plan.

Slice 5: feat/aws-ec2-proof-deployment

Temporary resource creation only after approval.

Slice 6: feat/aws-recovery-proof

Backup, restore, rollback and measured recovery.

Slice 7: feat/aws-proof-cleanup

Destroy temporary infrastructure and verify final cost.

ECS, RDS, ElastiCache, and ALB remain future architecture and require a new cost approval.

## Required Choices Before AWS Resource Creation

Before any AWS resource creation, the following choices are required:

1. maximum proof cost
2. maximum deployment duration
3. domain ownership
4. disposable data approval
5. existing AWS resource inventory
6. exact region
7. teardown date
8. whether public access is allowed
9. required retained evidence

## Consequences

Positive consequences:

- Gate 3 progresses with zero immediate AWS spend
- production architecture remains documented
- temporary proof is controlled
- Terraform/AWS/rollback/recovery evidence is gained
- cost is treated as an architecture constraint
- Gate 2 security remains intact

Trade-offs:

- EC2 proof is not highly available
- container PostgreSQL and Redis are not equivalent to managed services
- disciplined backup and teardown are required
- ECS architecture remains unproven until separately deployed
- some enterprise features are deferred

## Approval

Gate 3 Slice 1 is approved for documentation only.

No AWS resources are approved by this decision.

The next allowed activity after this document is reviewed and merged is the creation of a local Terraform foundation that performs validation without creating cloud infrastructure.
