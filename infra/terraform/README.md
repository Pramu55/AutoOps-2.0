# AutoOps Gate 3 Slice 2 Terraform Foundation

Gate 3 Slice 2 creates a local Terraform foundation for AutoOps 3.0. It proves
version constraints, provider configuration, typed variables, deterministic
naming, standard tags, local validation, and secret-safe repository rules before
any cloud deployment work begins.

This foundation intentionally creates zero resources. It contains no Terraform
resource blocks, data blocks, import blocks, moved blocks, or backend blocks.
It does not require AWS credentials, does not require AWS API calls for
structural validation, creates no cloud resources, and incurs no AWS cost.

## Directory Structure

```text
infra/
  terraform/
    README.md
    environments/
      proof/
        versions.tf
        providers.tf
        variables.tf
        locals.tf
        outputs.tf
        terraform.tfvars.example
      production/
        versions.tf
        providers.tf
        variables.tf
        locals.tf
        outputs.tf
        terraform.tfvars.example
```

`proof` and `production` are separate Terraform root modules. They are
intentionally similar in this slice so validation proves the environment
contract without creating infrastructure.

## Version Requirements

Both root modules require Terraform `>= 1.9.0, < 2.0.0` and the AWS provider
`>= 6.0.0, < 7.0.0`.

Terraform installation is manual and user-controlled. Do not install Terraform
automatically from repository scripts.

Gate 3 Slice 3 verified Terraform CLI `1.15.8` at the user-local Windows path
`$HOME\Tools\terraform\1.15.8\terraform.exe`. Use a temporary session PATH
entry when needed:

```powershell
$env:PATH = "$HOME\Tools\terraform\1.15.8;$env:PATH"
```

The Terraform ZIP checksum was verified against the official HashiCorp
`SHA256SUMS` file before extraction. GPG signature verification was not
performed because `gpg` was not available; SHA256 verification over official
HTTPS was the approved minimum for this slice, but it is not equivalent to GPG
signature verification.

HashiCorp release-server access is used only to obtain the Terraform CLI.
Terraform Registry access is used only to resolve and download provider
packages and checksums. AWS API access is separate and is not required for this
foundation.

The selected AWS provider version is `6.55.0`, signed by HashiCorp, satisfying
`>= 6.0.0, < 7.0.0`.

## Local Validation

Windows PowerShell:

```powershell
pnpm.cmd run check:terraform-foundation
terraform fmt -check -recursive infra/terraform/environments
terraform -chdir=infra/terraform/environments/proof init -backend=false
terraform -chdir=infra/terraform/environments/proof validate
terraform -chdir=infra/terraform/environments/production init -backend=false
terraform -chdir=infra/terraform/environments/production validate
```

WSL/Linux:

```bash
pnpm run check:terraform-foundation
terraform fmt -check -recursive infra/terraform/environments
terraform -chdir=infra/terraform/environments/proof init -backend=false
terraform -chdir=infra/terraform/environments/proof validate
terraform -chdir=infra/terraform/environments/production init -backend=false
terraform -chdir=infra/terraform/environments/production validate
```

Use `pnpm.cmd` on Windows PowerShell because the `pnpm.ps1` shim can be blocked
by local execution policy. `pnpm.cmd` avoids that script policy path.

`terraform init` uses `-backend=false` because Slice 2 has no remote state. It
must run independently in both root modules because each environment has its
own provider and variable contract.

The two committed root-module lock files are:

- `infra/terraform/environments/proof/.terraform.lock.hcl`
- `infra/terraform/environments/production/.terraform.lock.hcl`

They are committed so provider selections and checksums can be reviewed like
source changes. They include Windows and Linux hashes for reproducible local
PowerShell and future Linux/WSL or CI validation.

`.terraform` directories and state files must never be committed. Real `.tfvars`
files must remain uncommitted. The checked-in `terraform.tfvars.example` files
are non-secret examples only; never place credentials, passwords, tokens, or
account secrets in tfvars.

Terraform apply and Terraform destroy are prohibited in Slice 2.

## Expected Result

The expected result is zero cloud resources, zero AWS API calls during
structural validation, zero AWS credentials, and USD 0 spend.

## Troubleshooting

If `terraform` is not found, install Terraform manually and re-run validation.
Do not add an automatic installer to this repository.

If `pnpm` is blocked by PowerShell execution policy, use `pnpm.cmd` from
Windows PowerShell.

If provider download fails during `terraform init -backend=false`, check local
network access and retry when provider registry access is available. Do not add
credentials or remote state to fix provider download issues.

If validation fails, read the validator error and update only the Slice 2
foundation files. Do not edit existing sample Terraform workspaces as part of
this slice.

## Future Work

- Regenerate or change approved lock files only during a separately approved
  controlled initialization or provider-upgrade slice, then review them in a
  dedicated change.
- Add remote state only in a later approved slice.
- Add AWS resources only after explicit cost approval.
- Add CI integration later, after the local foundation is stable.

## Controlled Provider Upgrade Procedure

Future provider upgrades must be explicit. Update version constraints only in a
reviewed slice, run `terraform providers lock` for both root modules and both
platforms, run backend-disabled initialization and validation, compare the two
lock files, remove `.terraform` directories, and commit only the approved lock
file changes and documentation evidence. Do not run plan, apply, destroy,
refresh, import, state, console, test, or AWS CLI commands as part of this
foundation validation.

## Gate 3 Slice 5A Offline EC2 Proof Source

Slice 5A adds offline source for the disposable EC2 Docker Compose proof under
`infra/terraform/environments/proof` and `docker-compose.ec2-proof.yml`. The
source code exists but has not been initialized or planned. No AWS identity has
been queried, no credentials have been accessed, no Terraform provider has been
downloaded by this slice, no AWS API has been called, no resources have been
created, and AWS spend remains USD 0.

The proof root still uses local Terraform state. No backend block is configured.
State, state backups, `.terraform` directories, plans, provider caches, and real
tfvars files must remain uncommitted.

The offline proof implementation is limited to the approved ten resource
addresses from the Slice 4 design:

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

The Compose overlay has not been deployed. It is designed for a later approved
EC2 proof with:

```powershell
docker compose -f docker-compose.prod.yml -f docker-compose.ec2-proof.yml config
docker compose -f docker-compose.prod.yml -f docker-compose.ec2-proof.yml up -d
```

Do not run those commands until the later runtime approval gate allows them.
`docker-compose.prod.yml` remains the hardened base for `postgres`, `redis`,
`api`, `worker`, and `web`; `docker-compose.ec2-proof.yml` adds `nginx`,
`prometheus`, and `grafana` for the eight-service proof. Only TCP 443 is intended
for public host publication. Prometheus and Grafana remain private and are
accessed through SSM port forwarding only.

The overlay requires a Docker Compose implementation that supports the Compose
`!reset []` tag so inherited `api` and `web` host-port publications from the
hardened base can be explicitly cleared before the EC2 proof overlay publishes
only `443:443`. Validate this capability in the later runtime gate before any
deployment command is approved.

Offline validation:

```powershell
pnpm.cmd run check:terraform-foundation
pnpm.cmd run check:aws-proof-infrastructure
```

Later Terraform init requires separate approval. Later Terraform plan requires
separate approval. Later Terraform apply requires separate explicit approval.
Terraform destroy also requires the approved cleanup gate. AWS CLI commands,
credential inspection, AWS API access, Docker runtime operations, and cloud
resource creation are outside Slice 5A.

## Gate 3 Slice 5B Terraform Init Readiness

Slice 5B prepares deterministic offline readiness artifacts for a later,
separately approved Terraform initialization. Terraform source exists and init
readiness artifacts exist, but Terraform has not been installed or executed in
this slice. Providers have not been downloaded, `.terraform.lock.hcl` has not
been generated by this slice, AWS identity has not been queried, credentials
have not been accessed, no backend has been initialized, no state exists from
this slice, no plan exists, no resources exist from this slice, and AWS spend
remains USD 0.

The proof root keeps a non-secret documentation-only
`terraform.tfvars.example`. It contains placeholders only and is intentionally
not directly usable for apply. Create a real local tfvars file only after the
future init gate is approved; real tfvars remain ignored by Git and must never
contain AWS credentials, profiles, account IDs, passwords, tokens, DNS provider
secrets, certificate material, private keys, or credential file paths.

### Toolchain And Lock-File Policy

- Terraform CLI version requirement: root modules require `>= 1.9.0, < 2.0.0`.
- Approved previously verified CLI evidence: Terraform `1.15.8` was verified in
  Slice 3, but Slice 5B does not install or run Terraform.
- AWS provider source constraint: root modules declare `hashicorp/aws`
  `>= 6.0.0, < 7.0.0`.
- Lock-file policy: exactly two approved tracked lock files already exist:
  `infra/terraform/environments/proof/.terraform.lock.hcl` and
  `infra/terraform/environments/production/.terraform.lock.hcl`.
- Those two lock files were generated and committed in an earlier approved
  controlled toolchain slice. Slice 5B neither creates nor modifies them.
- Future lock-file regeneration or changes require separate explicit approval.
  Provider checksums must be generated by Terraform, never handwritten.
- Provider checksums must be generated by Terraform, not handwritten. Slice 5B
  does not create or fabricate lock files.
- Any future lock-file change must be reviewed in a dedicated follow-up change.
  New or unexpected `.terraform.lock.hcl` files are prohibited.
- Local provider/plugin caches are generated artifacts and must remain ignored.
- Offline source validation uses Node validators only. Later init may contact
  the Terraform Registry, but only after the explicit init gate is approved.

### Pre-Init Approval Checklist

Before any future Terraform init, capture approval evidence for every item:

- Separate explicit approval to install or use Terraform.
- Approved Terraform CLI version and local binary path.
- Repository branch and clean tree confirmed.
- Approved AWS region: `ap-south-1`.
- Approved disposable EC2 proof scope and exact ten-resource boundary.
- Approved Ubuntu Server 24.04 LTS x86_64 AMI ID.
- Approved tester IPv4 `/32`.
- Approved user-owned domain or subdomain.
- Approved DNS-01 certificate workflow.
- Approved proof expiry timestamp.
- Approved cost reference and maximum direct cost, currently USD 2.
- Approved temporary least-privileged AWS identity.
- Explicit approval before reading credentials or calling STS.
- No remote backend; local state only.
- Local-state handling and backup decision.
- Confirmation that no pre-existing generated Terraform artifacts exist.
- Rollback and evidence locations.
- Separate approval gates for init, plan, and apply.

### Pre-Init Evidence And Rollback Procedure

Capture this evidence before init:

- Exact repository commit and clean-tree status.
- Validator results for `check:terraform-foundation`,
  `check:aws-proof-infrastructure`, and `check:terraform-init-readiness`.
- Toolchain version evidence after separate approval to use Terraform.
- Approved non-secret input metadata: region, AMI ID, tester `/32`, domain,
  expiry timestamp, and cost reference.
- Generated artifact inventory after init, including `.terraform` directory
  presence and lock-file changes.

Stopping safely after init means stopping before plan. Do not proceed to plan
without a separate plan gate. Removing generated `.terraform` provider/cache
artifacts requires explicit approval and must target only generated directories.
Local state must never be casually deleted. Rollback does not mean deleting
state or cloud resources. Terraform apply and Terraform destroy remain separate
explicit gates.

Offline readiness validation:

```powershell
pnpm.cmd run check:terraform-init-readiness
```

## Gate 3 Slice 5C Terraform Runtime Approval Package

Slice 5C is documentation and static-script preparation only. Terraform was not
installed or executed in Slice 5C, HashiCorp release servers were not contacted,
the Terraform Registry was not contacted, the approved lock files were not
modified, AWS was not accessed, no resources were created, and AWS spend remains
USD 0.

The runtime approval contract is documented in
`docs/cloud/TERRAFORM_RUNTIME_APPROVAL_PACKAGE.md`. The prepared wrapper is
`scripts/run-controlled-terraform-init.ps1`; do not execute it until a later
runtime gate grants explicit approval for Terraform binary use and proof-root
backend-disabled init.

Slice 5C validates only the approval package:

```powershell
pnpm.cmd run check:terraform-runtime-approval
```

That validator is static and offline. It checks the approval document, wrapper
guardrails, generated-artifact absence, approved lock-file immutability, the
existing ten-resource proof scope, and the package script. It does not run
Terraform, Docker, AWS CLI, provider downloads, or network commands.
