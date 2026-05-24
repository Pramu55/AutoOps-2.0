# AWS Terraform ECS Plan

AutoOps supports a plan-only AWS ECS deployment review flow. It uses Terraform/OpenTofu, remote state configuration, and tenant-scoped ECR image metadata from the governed image push workflow.

## Scope

- Supported operation: `AWS_TERRAFORM_ECS_PLAN`
- Confirmation token: `PLAN`
- Execution: worker-backed Terraform/OpenTofu `init`, `validate`, and `plan`
- Not included: `apply`, `destroy`, arbitrary Terraform commands, arbitrary paths, arbitrary tfvars, or AWS resource mutation

## Required Configuration

The plan endpoint requires all remote state settings:

- `AWS_TERRAFORM_STATE_BUCKET`
- `AWS_TERRAFORM_STATE_DYNAMODB_TABLE`
- `AWS_TERRAFORM_STATE_REGION`
- `AWS_ALLOWED_DEPLOYMENT_WORKSPACES`

If any remote state setting is missing, readiness returns `NOT_CONFIGURED` and plan execution fails safely.

## Safe Image Source

Plans must reference a successful tenant-scoped `AWS_ECR_IMAGE_PUSH` operation. The API does not accept arbitrary image URIs, arbitrary image tags, or cross-organization image metadata.

## Worker Safety

The worker copies the allowlisted Terraform workspace into a temporary runtime directory, generates backend config and plan variables only inside that temp directory, then runs:

1. `init`
2. `validate`
3. `plan`

The worker never writes `.terraform`, `terraform.tfstate`, backend config, or tfvars secrets into the repository.

## Plan Summary

AutoOps stores only safe evidence:

- target slug
- environment slug
- image URI or digest
- add/change/destroy counts
- risk level
- blocked reasons
- apply eligibility
- generated timestamp
- limited redacted output summary

If a plan includes any destroy actions, `riskLevel` is `HIGH`, `applyEligible` is `false`, and the blocked reasons include destroy detection.

## API

- `GET /api/v1/integrations/aws/terraform/plan-readiness`
- `POST /api/v1/integrations/aws/deployments/:targetSlug/plan`

The plan route is authenticated, tenant-scoped, confirmation-gated, and uses only allowlisted deployment workspaces.
