# AWS Cost and Blast-Radius Guardrails

AutoOps evaluates AWS ECS/Fargate deployment risk before plan evidence is used and immediately before any apply, promotion, or rollback mutation can run.

## Purpose

The guardrail layer prevents approved-but-unsafe AWS changes from executing. Approval is required for production-grade mutations, but approval cannot override a `BLOCKED` guardrail result.

## Configuration

Required company safety allowlists:

- `AWS_ALLOWED_ACCOUNT_IDS`
- `AWS_ALLOWED_REGIONS`

Default limits:

- `AWS_MAX_PLAN_ADD_COUNT=10`
- `AWS_MAX_PLAN_CHANGE_COUNT=20`
- `AWS_MAX_MONTHLY_COST_DELTA_USD=100`
- `AWS_MAX_FARGATE_CPU=1024`
- `AWS_MAX_FARGATE_MEMORY_MB=2048`
- `AWS_MAX_DESIRED_COUNT=2`
- `AWS_BLOCK_PUBLIC_LOAD_BALANCER_BY_DEFAULT=true`
- `AWS_ALLOW_PUBLIC_LOAD_BALANCER=false`
- `AWS_COST_GUARDRAILS_ENABLED=true`
- `AWS_BLAST_RADIUS_GUARDRAILS_ENABLED=true`

If AWS credentials are configured but account or region allowlists are missing, mutation paths are blocked.

## Cost Estimate

Day 6 uses a conservative local estimate. It does not call the AWS Pricing API.

Known signals include:

- ECS/Fargate CPU, memory, and desired count
- Load balancer baseline when detected
- NAT gateway/public networking warnings and baseline
- CloudWatch log group baseline

The UI labels this as estimated monthly cost, conservative estimate, and not a billing guarantee.

## Blast-Radius Rules

Blocked by default:

- `destroyCount > 0`
- disallowed AWS account
- disallowed AWS region
- add count above limit
- change count above limit
- public load balancer changes unless explicitly allowed
- desired count above limit
- Fargate CPU or memory above limit
- estimated monthly cost delta above limit

Warnings/high risk:

- IAM changes
- security group changes
- network changes
- replacement actions
- unknown high-impact resources such as RDS, EKS, or ElastiCache
- production/prod environment changes

## Operation Integration

Guardrails are evaluated for:

- `AWS_TERRAFORM_ECS_PLAN`
- `AWS_TERRAFORM_ECS_APPLY`
- `AWS_ECS_RELEASE_PROMOTE`
- `AWS_ECS_RELEASE_ROLLBACK`

Plan operations store safe guardrail evidence in operation result metadata. Apply, promotion, and rollback re-check guardrails immediately before execution. If the re-check returns `BLOCKED`, the worker blocks the mutation even if approval already exists.

## Evidence

Operation detail and Governance Center expose only safe evidence:

- status
- risk level
- estimated monthly cost range/delta
- add/change/destroy counts
- blocked reasons
- warnings
- evaluated timestamp

AutoOps does not store or expose AWS credentials, raw provider output, backend configuration, `terraform.tfstate`, `.terraform`, or raw Terraform plan JSON.

## Tenant Isolation

Guardrail evidence is stored with organization-scoped operation metadata. New organizations see empty guardrail history until they create their own operations.

## Limitations

- Cost estimation is conservative and local.
- AWS Pricing API integration is future work.
- Guardrails inspect summarized/redacted plan output, not a full compliance engine.
- Direct cloud mutation remains limited to existing governed apply/promotion/rollback paths.
