# Gate 3 Slice 5F AWS Identity And Credential Readiness Package

## Purpose

Gate 3 Slice 5F is offline only. It prepares the approval package for a later,
separately approved AWS identity lookup and credential-use gate. This slice does
not verify a real AWS identity and does not authorize any credential use.

For this slice:

- AWS credentials were not accessed.
- AWS profiles were not inspected.
- AWS environment variables were not inspected.
- STS was not called.
- AWS APIs were not accessed.
- AWS CLI was not executed.
- Terraform was not executed.
- Docker was not accessed.
- No resources were created.
- AWS spend remains USD 0.

The package separates four gates:

1. Offline readiness preparation in Slice 5F.
2. Later approved identity verification.
3. Later approved Terraform plan.
4. Later separately approved Terraform apply.

## Existing Provider Boundary

The proof provider currently contains:

```hcl
skip_credentials_validation = true
skip_requesting_account_id  = true
skip_metadata_api_check     = true
skip_region_validation      = true
```

These settings support offline/static preparation. They do not prove AWS
identity, do not authorize credential use, do not replace STS identity
verification, and must not be silently treated as account validation.

Do not modify `providers.tf` for this slice.

## Required Future Approval Inputs

Before any later identity lookup, capture all of the following approval inputs:

- Exact Git branch.
- Exact commit SHA.
- Exact tree SHA.
- Clean working tree.
- Synchronization with origin.
- Approval reference.
- Approval timestamp.
- Approval expiry.
- Exact AWS CLI executable absolute path.
- Approved AWS CLI version.
- Approved AWS CLI SHA-256 checksum.
- Explicitly selected credential source type.
- Explicitly selected region `ap-south-1`.
- Expected AWS account ID captured privately.
- Expected IAM principal type.
- Expected IAM principal ARN pattern captured privately.
- Expected session expiry.
- Separate approval to access credentials.
- Separate approval to execute STS GetCallerIdentity.
- Separate approval for Terraform plan.
- Separate approval for Terraform apply.
- Cost confirmation of USD 0 for identity lookup.
- Confirmation that no resource mutation is authorized.

## Approved Future Identity Command

The only future identity lookup command documented by this package is:

```text
aws sts get-caller-identity --output json --no-cli-pager
```

This command is documented only and must not be executed in Slice 5F. No other
AWS command is approved by this package.

The future runtime gate must use a separately approved exact AWS CLI binary path
and version.

## Credential Source Requirements

Only one explicitly approved credential source may be used at a time.

Acceptable future credential-source categories are:

- Temporary AWS IAM Identity Center or SSO session.
- Temporary assumed-role session.
- Short-lived environment/session credentials supplied outside the repository.

Short-lived credentials are preferred.

The following are explicitly rejected:

- Root-user credentials.
- Long-lived IAM user access keys.
- Credentials committed to Git.
- Credentials in tfvars.
- Credentials in `.env` files.
- Credentials in PowerShell history.
- Credentials pasted into public logs.
- Credentials stored in evidence documents.
- Credentials copied into repository files.
- Ambiguous default-profile fallback.
- Automatic credential-chain selection without approval.

## Least-Privilege Requirements

Identity lookup approval does not authorize resource creation or resource
mutation. The later identity session must be reviewed for the smallest
permissions required for the next approved action.

The identity check itself should require only the ability to perform
`sts:GetCallerIdentity`.

Do not claim that `sts:GetCallerIdentity` alone will be sufficient for Terraform
plan. Terraform plan permissions must be reviewed separately against the exact
ten-resource proof scope.

## Session And Expiry Requirements

The later approved session must have an expected expiry captured before use. The
expiry must be current, bounded, and appropriate for the approved action. A
missing expiry, already expired session, or excessively long session must stop
the identity runtime.

Temporary credentials are preferred, and the selected credential source must
match the approved credential source exactly.

## Expected Identity Evidence

Future identity evidence may record only non-secret fields needed for approval:

- Account ID.
- Principal ARN.
- Principal type.
- User ID or role-session identifier.
- AWS CLI path.
- AWS CLI version.
- AWS CLI SHA-256.
- UTC execution time.
- Approval reference.
- Exit code.
- Sanitized command summary.

Account ID, ARN, and role-session identifiers are sensitive operational
metadata. They must not be published in public PR comments, screenshots, or
logs.

## Prohibited Evidence And Secret Handling

The following must not be recorded in evidence:

- Access key ID.
- Secret access key.
- Session token.
- SSO token.
- Credential-process output.
- Cached credential content.
- Browser authentication tokens.
- MFA seed.
- Private keys.
- Complete credential files.
- Environment-variable values containing credentials.

Secret values must never be echoed, hashed as evidence, copied, logged, or
committed.

## Stop Conditions

The future identity runtime must stop if any of these occur:

- Branch, commit, or tree differs.
- Working tree is dirty.
- Origin synchronization differs.
- Approval is missing or expired.
- AWS CLI path differs.
- AWS CLI version differs.
- AWS CLI checksum differs.
- Credential source differs from approval.
- Root credentials are detected or suspected.
- Long-lived access keys are detected or suspected.
- Expected account ID is absent.
- Expected principal ARN pattern is absent.
- Returned account differs.
- Returned ARN differs from the expected pattern.
- Session expiry is missing, already expired, or too long.
- Credential values would be printed.
- Output includes unexpected secret-like material.
- Command differs from the exact approved GetCallerIdentity command.
- Any mutating AWS command is requested.
- Terraform plan is attempted in the same gate.
- Cost or account ownership is uncertain.

## Relationship To Terraform Plan

Identity readiness does not approve identity execution. Identity execution does
not approve Terraform plan. Terraform plan does not approve apply. Apply remains
prohibited until separate review and approval.

The plan must still be constrained to the exact ten-resource allowlist:

- `aws_vpc.proof`
- `aws_subnet.public`
- `aws_internet_gateway.proof`
- `aws_route_table.public`
- `aws_route_table_association.public`
- `aws_security_group.proof_instance`
- `aws_iam_role.ssm_instance`
- `aws_iam_role_policy_attachment.ssm_core`
- `aws_iam_instance_profile.ssm`
- `aws_instance.proof`

Expected maximum infrastructure cost remains USD 2. Identity lookup itself must
create zero resources and incur no expected resource cost.

## Evidence Retention

Evidence must be retained only in approved private locations. Evidence must
contain only the non-secret identity evidence listed above, the approval
reference, the exact sanitized command summary, UTC execution time, and exit
code. Sensitive operational metadata must stay out of public PR comments,
screenshots, and logs.

## Current Slice Safety State

Slice 5F is offline readiness preparation only. Credentials were not accessed,
profiles were not inspected, environment variables were not inspected, STS was
not called, AWS APIs were not accessed, AWS CLI was not executed, Terraform was
not executed, Docker was not accessed, no resources were created, and AWS spend
remains USD 0.
