[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ExpectedBranch,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedCommit,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedTree,

  [Parameter(Mandatory = $true)]
  [string]$TerraformPath,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedTerraformVersion,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedTerraformSha256,

  [Parameter(Mandatory = $true)]
  [string]$ApprovalReference,

  [Parameter(Mandatory = $true)]
  [string]$ApprovedTfvarsPath,

  [Parameter(Mandatory = $true)]
  [string]$ApprovedPlanPath,

  [Parameter(Mandatory = $true)]
  [string]$ApprovedAwsRegion,

  [Parameter(Mandatory = $true)]
  [string]$ApprovedAmiId,

  [Parameter(Mandatory = $true)]
  [string]$ApprovedIngressCidr,

  [Parameter(Mandatory = $true)]
  [string]$ApprovedDomain,

  [Parameter(Mandatory = $true)]
  [string]$ApprovedExpiryUtc,

  [Parameter(Mandatory = $true)]
  [string]$ApprovedCostReference,

  [Parameter(Mandatory = $true)]
  [decimal]$ApprovedMaxCostUsd,

  [Parameter(Mandatory = $true)]
  [switch]$ApproveCredentialUse,

  [Parameter(Mandatory = $true)]
  [switch]$ApproveTerraformPlan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$expectedRepoRoot = 'C:\AutoOps 2.0'
$proofRootRelative = 'infra/terraform/environments/proof'
$proofRoot = Join-Path $repoRoot $proofRootRelative
$approvedTerraformDirectory = Join-Path $proofRoot '.terraform'
$approvedLockFiles = @(
  'infra/terraform/environments/proof/.terraform.lock.hcl',
  'infra/terraform/environments/production/.terraform.lock.hcl'
)
$requiredStashes = @(
  'stash@{0}: On feat/service-platform-experience: wip service platform experience before typecheck fixes',
  'stash@{1}: On main: WIP tenant isolation hardening before shutdown'
)

function Fail($Message) {
  throw "Controlled Terraform plan refused: $Message"
}

function Invoke-Git([string[]]$Arguments) {
  $output = & git -C $repoRoot @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
  return @($output)
}

function Get-RelativePath([string]$PathValue) {
  $normalizedRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd([char[]]@('\', '/'))
  $normalizedPath = [System.IO.Path]::GetFullPath($PathValue)

  if ($normalizedPath.Equals($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return '.'
  }

  $rootPrefix = $normalizedRoot + [System.IO.Path]::DirectorySeparatorChar
  if (-not $normalizedPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail "path must remain inside repository root: $normalizedPath"
  }

  return $normalizedPath.Substring($rootPrefix.Length).Replace('\', '/')
}

function Get-ProofRelativePath([string]$FullPath, [string]$Label) {
  $proofRootFullPath = [System.IO.Path]::GetFullPath($proofRoot).TrimEnd([char[]]@('\', '/'))
  $proofRootPrefix = $proofRootFullPath + [System.IO.Path]::DirectorySeparatorChar

  if (-not $FullPath.StartsWith($proofRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail "$Label must remain strictly underneath proof root: $FullPath"
  }

  $relativePath = $FullPath.Substring($proofRootPrefix.Length).Replace('\', '/')
  if ([string]::IsNullOrWhiteSpace($relativePath)) {
    Fail "$Label proof-root-relative path must not be empty"
  }

  return $relativePath
}

function Get-ExactlyOneGitLine([string[]]$Arguments, [string]$Label) {
  $lines = @(Invoke-Git $Arguments)
  if ($lines.Count -ne 1) {
    Fail "expected exactly one $Label result, got $($lines.Count)"
  }

  $value = ([string]$lines[0]).Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    Fail "$Label result must not be blank"
  }

  return $value
}

function Assert-CleanGitState {
  $status = @(Invoke-Git @('status', '--porcelain=v1', '--untracked-files=all'))
  if ($status.Count -ne 0) {
    Fail 'working tree must be clean'
  }
}

function Assert-IgnoredPath([string]$PathValue, [string]$Label) {
  & git -C $repoRoot check-ignore -q -- $PathValue
  if ($LASTEXITCODE -ne 0) {
    Fail "$Label must be ignored by Git: $PathValue"
  }
}

function Assert-UntrackedUnstagedPath([string]$RelativePath, [string]$Label) {
  $tracked = @(Invoke-Git @('ls-files', '--', $RelativePath))
  if ($tracked.Count -ne 0) {
    Fail "$Label must not be tracked: $RelativePath"
  }

  $staged = @(Invoke-Git @('diff', '--cached', '--name-only', '--', $RelativePath))
  if ($staged.Count -ne 0) {
    Fail "$Label must not be staged: $RelativePath"
  }
}

function Get-LockHashes {
  $hashes = @{}
  foreach ($lockFile in $approvedLockFiles) {
    $fullPath = Join-Path $repoRoot $lockFile
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      Fail "approved lock file is missing: $lockFile"
    }
    $hashes[$lockFile] = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash
  }
  return $hashes
}

function Assert-ApprovedLockState {
  $changedLocks = @(Invoke-Git @('diff', '--name-only', '--', '.terraform.lock.hcl', ':(glob)**/.terraform.lock.hcl'))
  if ($changedLocks.Count -ne 0) {
    Fail "approved lock files must not differ from HEAD: $($changedLocks -join ', ')"
  }

  $stagedLocks = @(Invoke-Git @('diff', '--cached', '--name-only', '--', '.terraform.lock.hcl', ':(glob)**/.terraform.lock.hcl'))
  if ($stagedLocks.Count -ne 0) {
    Fail "approved lock files must not be staged: $($stagedLocks -join ', ')"
  }
}

function Assert-GeneratedArtifacts([string]$AllowedTfvarsRelative, [string]$AllowedPlanRelative, [switch]$AfterPlan) {
  $terraformRoot = Join-Path $repoRoot 'infra/terraform'
  $forbidden = New-Object System.Collections.Generic.List[string]

  Get-ChildItem -LiteralPath $terraformRoot -Force -Recurse -Directory |
    Where-Object { $_.Name -eq '.terraform' -or $_.Name -eq '.terraform.d' -or $_.Name -eq 'terraform-plugin-cache' } |
    ForEach-Object {
      if ($_.FullName -ne $approvedTerraformDirectory) {
        $forbidden.Add((Get-RelativePath $_.FullName))
      }
    }

  Get-ChildItem -LiteralPath $terraformRoot -Force -Recurse -File |
    ForEach-Object {
      $relative = Get-RelativePath $_.FullName
      $name = $_.Name
      if ($name -match '^terraform\.tfstate(\.backup)?$' -or $name -like '*.tfstate.*') {
        $forbidden.Add($relative)
      } elseif (($name -like '*.tfplan' -or $name -like '*.tfplan.*' -or $name -like '*.plan') -and ($AfterPlan -and $relative -eq $AllowedPlanRelative) -eq $false) {
        $forbidden.Add($relative)
      } elseif ($name -match '^crash(\..*)?\.log$') {
        $forbidden.Add($relative)
      } elseif (($name -like '*.tfvars' -or $name -like '*.tfvars.json') -and $name -notlike '*.tfvars.example' -and $relative -ne $AllowedTfvarsRelative) {
        $forbidden.Add($relative)
      }
    }

  if ($forbidden.Count -ne 0) {
    Fail "unexpected Terraform artifacts: $($forbidden -join ', ')"
  }
}

function Read-Tfvars([string]$PathValue) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $PathValue) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) {
      continue
    }
    if ($trimmed -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"\s*$') {
      $values[$matches[1]] = $matches[2]
    } elseif ($trimmed -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(true|false)\s*$') {
      $values[$matches[1]] = [bool]::Parse($matches[2])
    } elseif ($trimmed -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*$') {
      $values[$matches[1]] = [decimal]$matches[2]
    }
  }
  return $values
}

function Assert-TfvarsSafe([string]$PathValue) {
  $text = Get-Content -LiteralPath $PathValue -Raw
  if ($text -match '(?i)(access_key|secret_key|session_token|credential|password|token)\s*=') {
    Fail 'tfvars file must not contain credential-like or secret-like assignments'
  }
  if ($text -match '\b\d{12}\b') {
    Fail 'tfvars file must not contain likely account IDs'
  }
}

if (-not $ApproveCredentialUse) {
  Fail 'the -ApproveCredentialUse switch is mandatory'
}
if (-not $ApproveTerraformPlan) {
  Fail 'the -ApproveTerraformPlan switch is mandatory'
}
if ($repoRoot -ne $expectedRepoRoot) {
  Fail "repository root must be $expectedRepoRoot, got $repoRoot"
}
if ([string]::IsNullOrWhiteSpace($ApprovalReference)) {
  Fail 'approval reference must be non-empty'
}

$branch = Get-ExactlyOneGitLine @('branch', '--show-current') 'current branch'
$commit = Get-ExactlyOneGitLine @('rev-parse', 'HEAD') 'HEAD commit'
$tree = Get-ExactlyOneGitLine @('rev-parse', 'HEAD^{tree}') 'HEAD tree'
if ($branch -ne $ExpectedBranch) { Fail "branch mismatch: expected $ExpectedBranch, got $branch" }
if ($commit -ne $ExpectedCommit) { Fail "commit mismatch: expected $ExpectedCommit, got $commit" }
if ($tree -ne $ExpectedTree) { Fail "tree mismatch: expected $ExpectedTree, got $tree" }

$originCommit = Get-ExactlyOneGitLine @('rev-parse', "origin/$ExpectedBranch") 'origin branch commit'
if ($originCommit -ne $commit) {
  Fail "branch must be synchronized with origin/$ExpectedBranch"
}

Assert-CleanGitState
Assert-ApprovedLockState
$lockHashesBefore = Get-LockHashes

if (-not (Test-Path -LiteralPath $TerraformPath -PathType Leaf)) {
  Fail "Terraform binary path does not exist: $TerraformPath"
}

if ($ExpectedTerraformSha256 -notmatch '^[A-Fa-f0-9]{64}$') {
  Fail 'ExpectedTerraformSha256 must be exactly 64 hexadecimal characters'
}

$actualTerraformSha256 = (Get-FileHash -LiteralPath $TerraformPath -Algorithm SHA256).Hash
if ($actualTerraformSha256 -ine $ExpectedTerraformSha256) {
  Fail 'Terraform binary SHA256 does not match approved checksum'
}

$resolvedTerraform = (Resolve-Path -LiteralPath $TerraformPath).Path
$versionOutput = & $resolvedTerraform version
if ($LASTEXITCODE -ne 0) {
  Fail 'Terraform version check failed'
}
if (($versionOutput -join "`n") -notmatch "Terraform v$([regex]::Escape($ExpectedTerraformVersion))(\s|$)") {
  Fail "Terraform version must be exactly $ExpectedTerraformVersion"
}

if (-not [System.IO.Path]::IsPathRooted($ApprovedTfvarsPath)) {
  Fail 'ApprovedTfvarsPath must be an absolute path'
}
if (-not [System.IO.Path]::IsPathRooted($ApprovedPlanPath)) {
  Fail 'ApprovedPlanPath must be an absolute path'
}

$tfvarsFullPath = [System.IO.Path]::GetFullPath($ApprovedTfvarsPath)
$planFullPath = [System.IO.Path]::GetFullPath($ApprovedPlanPath)
$proofRootFullPath = [System.IO.Path]::GetFullPath($proofRoot).TrimEnd([char[]]@('\', '/'))
$proofRootPrefix = $proofRootFullPath + [System.IO.Path]::DirectorySeparatorChar

foreach ($pathValue in @($tfvarsFullPath, $planFullPath)) {
  if (-not $pathValue.StartsWith($proofRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail "approved paths must remain under proof root: $pathValue"
  }
}

if (-not $tfvarsFullPath.EndsWith('.tfvars', [System.StringComparison]::OrdinalIgnoreCase)) {
  Fail 'approved tfvars filename must end in .tfvars'
}
if (-not $planFullPath.EndsWith('.tfplan', [System.StringComparison]::OrdinalIgnoreCase)) {
  Fail 'approved plan filename must end in .tfplan'
}
if (-not (Test-Path -LiteralPath $tfvarsFullPath -PathType Leaf)) {
  Fail "approved tfvars file must exist: $tfvarsFullPath"
}
if (Test-Path -LiteralPath $planFullPath) {
  Fail "approved plan path must not already exist: $planFullPath"
}
if (-not (Test-Path -LiteralPath $approvedTerraformDirectory -PathType Container)) {
  Fail 'proof .terraform directory must exist before plan'
}

$tfvarsRelative = Get-RelativePath $tfvarsFullPath
$planRelative = Get-RelativePath $planFullPath
$tfvarsProofRelative = Get-ProofRelativePath $tfvarsFullPath 'tfvars file'
$planProofRelative = Get-ProofRelativePath $planFullPath 'plan file'
Assert-IgnoredPath $tfvarsRelative 'tfvars file'
Assert-IgnoredPath $planRelative 'plan file'
Assert-UntrackedUnstagedPath $tfvarsRelative 'tfvars file'

Assert-TfvarsSafe $tfvarsFullPath
$tfvars = Read-Tfvars $tfvarsFullPath

if ($ApprovedAwsRegion -ne 'ap-south-1' -or $tfvars['aws_region'] -ne $ApprovedAwsRegion) { Fail 'aws_region must be ap-south-1 and match approval' }
if ($ApprovedAmiId -notmatch '^ami-[0-9a-f]{8,17}$' -or $tfvars['ami_id'] -ne $ApprovedAmiId) { Fail 'AMI ID must match approval and AMI format' }
if ($ApprovedIngressCidr -notmatch '^(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})(\.(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})){3}/32$' -or $tfvars['approved_ingress_cidr'] -ne $ApprovedIngressCidr) { Fail 'approved ingress CIDR must be an IPv4 /32 matching approval' }
if ($ApprovedDomain -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' -or $tfvars['approved_domain'] -ne $ApprovedDomain) { Fail 'approved domain must be lowercase DNS and match approval' }
if ($tfvars['cost_approval_reference'] -ne $ApprovedCostReference) { Fail 'cost approval reference must match approval' }
if ($ApprovedMaxCostUsd -gt 2 -or [decimal]$tfvars['expected_max_cost_usd'] -ne $ApprovedMaxCostUsd) { Fail 'approved max cost must be numeric, match tfvars, and be <= 2' }
if ($tfvars['instance_type'] -ne 't3.large') { Fail 'instance_type must be t3.large' }
if ([decimal]$tfvars['root_volume_size_gib'] -ne 40) { Fail 'root volume must be 40 GiB' }
if ([decimal]$tfvars['max_proof_hours'] -gt 8) { Fail 'max proof hours must be <= 8' }
if ($tfvars['detailed_monitoring'] -ne $false) { Fail 'detailed monitoring must be false' }
if ($tfvars['enable_ssm'] -ne $true -or $tfvars['associate_public_ip'] -ne $true -or $tfvars['enable_public_https'] -ne $true) { Fail 'SSM, public IP, and public HTTPS guardrails must be true' }
if ($tfvars['data_classification'] -ne 'disposable') { Fail 'data classification must be disposable' }

$expiry = [datetime]::ParseExact($ApprovedExpiryUtc, "yyyy-MM-ddTHH:mm:ssZ", [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal)
$now = [datetime]::UtcNow
if ($tfvars['proof_expires_at'] -ne $ApprovedExpiryUtc) { Fail 'expiry must match approved value' }
if ($expiry -le $now) { Fail 'expiry must be in the future' }
if ($expiry -gt $now.AddHours(8)) { Fail 'expiry must be no more than eight hours from execution time' }

Assert-GeneratedArtifacts $tfvarsRelative $planRelative

$planArgs = @(
  "-chdir=infra/terraform/environments/proof",
  "plan",
  "-refresh=false",
  "-input=false",
  "-lock=false",
  "-var-file=$tfvarsProofRelative",
  "-out=$planProofRelative"
)

$forbiddenArgs = @('-upgrade', '-target', '-replace', '-refresh-only', '-destroy', '-generate-config-out', '-reconfigure', '-migrate-state')
foreach ($arg in $planArgs) {
  foreach ($forbidden in $forbiddenArgs) {
    if ($arg.StartsWith($forbidden, [System.StringComparison]::OrdinalIgnoreCase)) {
      Fail "forbidden Terraform argument present: $arg"
    }
  }
}

Write-Host 'Approved runtime command: terraform -chdir=infra/terraform/environments/proof plan -refresh=false -input=false -lock=false -var-file=<approved-local-tfvars> -out=<approved-local-plan>'
& $resolvedTerraform @planArgs
$planExitCode = $LASTEXITCODE
Write-Host "Terraform plan exit code: $planExitCode"
if ($planExitCode -ne 0) {
  Fail "Terraform plan failed with exit code $planExitCode"
}

if (-not (Test-Path -LiteralPath $planFullPath -PathType Leaf)) {
  Fail 'plan file must exist after successful plan'
}

Assert-CleanGitState
Assert-ApprovedLockState
Assert-GeneratedArtifacts $tfvarsRelative $planRelative -AfterPlan
$lockHashesAfter = Get-LockHashes
foreach ($lockFile in $approvedLockFiles) {
  if ($lockHashesBefore[$lockFile] -ne $lockHashesAfter[$lockFile]) {
    Fail "approved lock file changed unexpectedly: $lockFile"
  }
}

Write-Host 'Terraform plan completed. Stop before apply; apply remains prohibited until a separate approval gate.'
