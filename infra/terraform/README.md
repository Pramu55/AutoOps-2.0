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

- Generate and review lock files after controlled initialization.
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
