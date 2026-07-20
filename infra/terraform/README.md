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

`.terraform.lock.hcl` is not manually created in this slice. If a controlled
future initialization generates lock files, the repository lock-file policy will
be revisited. The existing repository ignore rules currently exclude generated
lock files.

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
