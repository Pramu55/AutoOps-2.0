# Gate 3 Slice 5E Terraform Plan Readiness Package

## Purpose

Gate 3 Slice 5E prepares a deterministic, fail-closed approval package for a
later separately approved Terraform plan of `infra/terraform/environments/proof`.
This slice is offline preparation only. Terraform is not executed, plan is not
executed, credentials and profiles are not accessed, account identity and STS
calls are not made, AWS APIs are not called, Docker is not run, no plan or state
exists, no resources are created, and AWS spend remains USD 0.

Plan execution remains prohibited until all identity, credential, input, expiry,
cost, local-state, and explicit plan approvals are captured.

## Required Future Approval Inputs

Capture every item before a later plan gate:

- Exact branch, commit SHA, and tree SHA.
- Approved Terraform binary absolute path, approved Terraform version, approved
  expected SHA-256 value, and binary checksum evidence.
- Approved proof root only: `infra/terraform/environments/proof`.
- Exact ignored local tfvars absolute path under the proof root.
- Exact ignored output plan absolute path under the proof root.
- `aws_region = ap-south-1`.
- Explicit Ubuntu Server 24.04 LTS x86_64 AMI ID.
- Explicit tester IPv4 `/32`.
- Approved user-owned domain or subdomain.
- RFC3339 UTC expiry timestamp no more than eight hours after approved plan time.
- Non-secret owner, cost center, and cost approval reference.
- `instance_type = t3.large`.
- `root_volume_size_gib = 40`.
- `expected_max_cost_usd <= 2`.
- `detailed_monitoring = false`.
- `enable_ssm = true`.
- `associate_public_ip = true`.
- `enable_public_https = true`.
- Disposable data classification.
- Exact ten-resource allowlist:
  `aws_vpc.proof`, `aws_subnet.public`, `aws_internet_gateway.proof`,
  `aws_route_table.public`, `aws_route_table_association.public`,
  `aws_security_group.proof_instance`, `aws_iam_role.ssm_instance`,
  `aws_iam_role_policy_attachment.ssm_core`, `aws_iam_instance_profile.ssm`,
  and `aws_instance.proof`.
- Local-state handling decision.
- Separate approval for AWS identity and credential access.
- Separate approval for plan execution.
- Separate approval after plan review for apply.

## Future Command Shape

The future approved plan command must be exactly equivalent to:

```powershell
terraform -chdir=infra/terraform/environments/proof plan -refresh=false -input=false -lock=false -var-file=<approved-local-tfvars> -out=<approved-local-plan>
```

The wrapper must stop if credential or identity approval is absent.
`-refresh=false` does not guarantee zero provider or AWS interaction. Plan
execution may still require approved credentials depending on provider behavior.
No claim of zero AWS API access may be made until verified during the separate
runtime gate.

The plan file can contain infrastructure metadata and must be treated as
sensitive operational evidence. It must remain ignored and uncommitted. Plan
output must not be pasted publicly if it contains account IDs, ARNs, public IPs,
or other operational metadata.

## Stop Conditions

Stop before or during the later plan gate if any condition occurs:

- Branch, commit, tree, or clean-tree evidence differs.
- The branch is not synchronized with the local `origin` tracking ref.
- Terraform binary version or checksum evidence is not approved.
- The tfvars path or plan path is not absolute, not ignored, or outside the
  proof root.
- The tfvars file is tracked, staged, missing, secret-like, or contains an
  account ID.
- Approved values do not exactly match parsed tfvars values.
- Expiry is missing, invalid, in the past, or more than eight hours after plan
  execution time.
- Existing state, existing plan files, missing proof `.terraform`, unexpected
  generated artifacts, or unexpected lock-file changes are present.
- Any unexpected resource, data source, backend, provider change, replacement,
  destroy, import, state operation, or drift appears.
- Plan review does not show exactly ten creates and zero changes or destroys,
  unless a separately approved reason exists.
- Cost must be revalidated immediately before plan and apply.

Apply remains prohibited after plan generation. Plan review and apply approval
are separate gates.

## Evidence And Rollback

Before plan, capture branch, commit, tree, Git status, upstream synchronization,
approval reference, UTC timestamp, Terraform path, version evidence, approved
expected SHA-256 value, checksum evidence, lock-file hashes, approved tfvars
path, approved plan path, approved non-secret values, local-state decision, and
generated-artifact inventory.

After a future successful plan, capture exit code, command summary, plan path,
plan-file hash, lock-file hash comparison, no-state confirmation, generated
artifact inventory, final Git status, and UTC timestamp. Do not include
credentials, secret values, private keys, account IDs, or full plan output in
public evidence.

Rollback does not mean casually deleting state. Missing or existing state
requires a separate review. Plan files and provider artifacts may be removed
only under an explicit cleanup approval that targets those generated artifacts.
