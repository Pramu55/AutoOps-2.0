# Gate 3 Slice 5C Terraform Runtime Approval Package

## Purpose

Gate 3 Slice 5C prepares the approval package for a later controlled Terraform
init of the disposable EC2 Docker Compose proof in `ap-south-1`. Slice 5C is
offline only: Terraform is not installed, Terraform is not run, HashiCorp
release and Registry endpoints are not contacted, AWS is not contacted, Docker
is not run, and AWS spend remains USD 0.

The AWS introductory Free Tier has ended. Every future AWS resource is billable.
This package does not approve resource creation and does not approve any command
that can create, refresh, mutate, import, or destroy infrastructure.

## Approval Preconditions

Before the later runtime init can run, capture approval evidence for:

- Repository root: `C:\AutoOps 2.0`
- Required branch: `feat/terraform-runtime-approval-package`
- Expected commit: `2587c1c64d3aa5f0e935219e16ef18e98b6dc8fb`
- Expected tree hash from `git rev-parse HEAD^{tree}` at approval time
- Clean working tree and nothing staged
- Protected stashes exactly:
  - `stash@{0}: On feat/service-platform-experience: wip service platform experience before typecheck fixes`
  - `stash@{1}: On main: WIP tenant isolation hardening before shutdown`
- Approved Terraform binary path, version, checksum evidence, and approval
  reference
- The two approved tracked lock files remain unchanged from HEAD:
  - `infra/terraform/environments/proof/.terraform.lock.hcl`
  - `infra/terraform/environments/production/.terraform.lock.hcl`

## Toolchain Boundary

The approved Terraform CLI version for the future init must satisfy the root
module requirement `>= 1.9.0, < 2.0.0`. Slice 3 previously verified Terraform
CLI `1.15.8`; any future binary must be approved with explicit provenance.

Binary provenance evidence must include the official HashiCorp release URL, ZIP
filename, expected SHA256 from the official `SHA256SUMS` file, actual SHA256,
checksum comparison result, final user-local binary path, and `terraform
version` output. GPG verification should be used when available. If GPG is not
performed, evidence must say so plainly and must not claim GPG assurance.

## Allowed Init Command

The only Terraform init command covered by this package is:

```powershell
terraform -chdir=infra/terraform/environments/proof init -backend=false
```

The command must be run by itself after explicit approval. Do not chain commands.
Do not append `&& terraform plan` or any equivalent follow-on operation. Do not
use `-upgrade`, `-migrate-state`, `-reconfigure`, backend configuration flags,
variables, tfvars, or provider-version changes. Do not initialize the production
root in this package.

## Explicit Prohibitions

The following remain prohibited until separate approvals exist:

- Terraform plan, apply, destroy, refresh, import, state, console, and test
- AWS CLI commands, STS identity checks, credential inspection, profile reads,
  account lookups, EC2 metadata calls, and AWS API calls
- Docker commands and Docker runtime changes
- Remote backend configuration or migration
- Provider lock-file regeneration or manual checksum edits
- Terraform source changes, tfvars changes, generated state, plan artifacts, or
  cloud-resource mutation

Separate approval gates are still required for AWS identity access, input
completion, Terraform plan, Terraform apply, Terraform destroy, and any lock-file
regeneration or provider upgrade.

## Network Boundary

The later init may contact only Terraform provider distribution endpoints needed
to install the already locked provider for the proof root. HashiCorp release
server access is only for separately approved Terraform binary acquisition.
Terraform Registry access is only for provider package/checksum retrieval.

The later init must not contact AWS APIs, AWS STS, EC2 metadata, remote state
services, Docker registries, application endpoints, DNS-provider APIs, or
certificate-provider APIs. Evidence must phrase this as operational evidence:
no AWS CLI command was run, no Terraform operation requiring AWS API access was
run, provider settings skip credential/account/metadata/region validation, and
no AWS API interaction was observed in command output.

## Expected Generated Artifacts

The future init may create only Terraform provider initialization artifacts under:

- `infra/terraform/environments/proof/.terraform/`

The existing proof lock file should remain unchanged because the provider is
already locked. The production lock file must remain unchanged. No additional
`.terraform.lock.hcl` files are approved.

The future init must not create Terraform state, state backups, plan files,
crash logs, override files, provider caches outside the approved root, real
tfvars files, backend metadata, or any generated artifact outside the proof root
initialization directory.

## Stop Conditions

Stop immediately if any of these occur:

- Branch, commit, tree hash, clean status, or stash evidence differs
- Terraform binary path, version, or checksum evidence differs from approval
- Any approved lock file is missing, untracked, staged, or different from HEAD
- Any unexpected lock file, state, plan, crash log, override, provider cache, or
  `.terraform` directory exists before init
- The init command attempts production, backend migration, `-upgrade`, variables,
  tfvars, plan, apply, destroy, refresh, import, state, console, test, AWS CLI,
  Docker, or any chained command
- Init output requests credentials, reports AWS API access, changes lock files,
  creates state, or produces unexpected artifacts
- Any post-init validator or secret scan fails

## Evidence Requirements

Before init, capture branch, commit, tree hash, clean status, stash list, lock
file hashes, Terraform binary path, Terraform version, checksum evidence,
approval reference, and generated-artifact inventory.

After init, capture the exact command, exit code, command output summary,
provider version evidence, generated-artifact inventory, lock-file hash
comparison, absence of state and plans, validator outputs, secret-scan result,
and Git status.

Do not include credential values, account IDs, tfvars content from real local
files, private keys, tokens, passwords, profile contents, or cloud console data
in evidence.

## Rollback Boundary

Slice 5C does not approve cleanup deletion. The runtime wrapper records generated
artifacts and stops before plan. Removing `.terraform` directories, restoring
local files, handling state, or destroying cloud resources each require explicit
follow-up approval appropriate to the artifact or resource.

Because the approved init uses `-backend=false` and creates no AWS resources,
the expected cost remains USD 0.
