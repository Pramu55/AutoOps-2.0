# AWS Approval-Gated ECS Apply

AutoOps provides a zero-trust, approval-gated deployment flow for AWS ECS. It uses Terraform/OpenTofu, remote state storage, and tenant-isolated operations.

## Architecture

- **Operation Type**: `AWS_TERRAFORM_ECS_APPLY`
- **Confirmation Token**: `APPLY`
- **Execution Flow**: Gated by a `PENDING_APPROVAL` status. The background worker never picks up or executes an apply operation until an organization Admin or Owner (different from the requester) approves it.

## Safety Controls

### 1. Configuration Check
Apply operations require `AWS_DEPLOYMENT_APPLY_ENABLED=true` in the environment. If disabled, apply readiness shows `BLOCKED` and requests fail immediately.

### 2. Remote State Storage Configuration
The system requires the following environment variables to be fully configured:
- `AWS_TERRAFORM_STATE_BUCKET`
- `AWS_TERRAFORM_STATE_DYNAMODB_TABLE`
- `AWS_TERRAFORM_STATE_REGION`

### 3. Source Plan Validation
The apply route enforces the existence of a fresh, successful `AWS_TERRAFORM_ECS_PLAN` from the same organization:
- **Freshness**: The plan must be less than 24 hours old.
- **Destroy Gating**: The plan must have `destroyCount === 0`. Plans containing destroy actions are blocked from being applied.
- **Risk Level**: The plan risk level must not be `HIGH` or `BLOCKED`.
- **Eligibility**: The plan must be explicitly marked `applyEligible === true`.

### 4. Worker-Side Pre-Checks
Immediately before executing the apply, the background worker re-verifies all configuration, remote state availability, plan freshness, image matches, and target allowlisting.

### 5. Guardrail Enforcement
Apply requires AWS cost and blast-radius guardrails to pass. The worker re-evaluates account and region allowlists, plan counts, conservative estimated monthly cost, public load balancer policy, desired count, and Fargate sizing immediately before mutation. Approval cannot override a `BLOCKED` guardrail result.

### 6. Plan Summary Verification
If no saved binary planfile exists:
- The worker executes a fresh `init`, `validate`, and `plan` in a temporary workspace directory.
- It compares the counts, image URI, environment, and targets of the new plan against the approved plan summary.
- If anything changed or any destroy action appears, the apply is immediately blocked and the operation is failed.

## ECS Verification

After a successful apply, AutoOps performs read-only checks on the target environment to verify deployment health:
- ECS cluster and service status
- Task definition revision
- Desired vs running task counts
- Deployment state (active/completed)
- Load balancer DNS availability
- CloudWatch log group presence

This verification is stored in the operation results and displayed in the control plane dashboard.
