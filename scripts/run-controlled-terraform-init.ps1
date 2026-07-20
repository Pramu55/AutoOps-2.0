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
  [string]$ApprovalReference,

  [switch]$ApproveTerraformInit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$expectedRepoRoot = 'C:\AutoOps 2.0'
$proofRootRelative = 'infra/terraform/environments/proof'
$approvedLockFiles = @(
  'infra/terraform/environments/proof/.terraform.lock.hcl',
  'infra/terraform/environments/production/.terraform.lock.hcl'
)
$requiredStashes = @(
  'stash@{0}: On feat/service-platform-experience: wip service platform experience before typecheck fixes',
  'stash@{1}: On main: WIP tenant isolation hardening before shutdown'
)

function Fail($Message) {
  throw "Controlled Terraform init refused: $Message"
}

function Invoke-Git([string[]]$Arguments) {
  $output = & git -C $repoRoot @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
  return @($output)
}

function Get-RelativePath([string]$PathValue) {
  $normalizedRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd(
    [char[]]@('\', '/')
  )
  $normalizedPath = [System.IO.Path]::GetFullPath($PathValue)

  if (
    $normalizedPath.Equals(
      $normalizedRoot,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    return '.'
  }

  $rootPrefix = $normalizedRoot + [System.IO.Path]::DirectorySeparatorChar

  if (
    -not $normalizedPath.StartsWith(
      $rootPrefix,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    Fail "path must remain inside repository root: $normalizedPath"
  }

  return $normalizedPath.Substring($rootPrefix.Length).Replace('\', '/')
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

function Assert-ExactLines([string[]]$Actual, [string[]]$Expected, [string]$Label) {
  if ($Actual.Count -ne $Expected.Count) {
    Fail "$Label count mismatch"
  }

  for ($index = 0; $index -lt $Expected.Count; $index += 1) {
    if ($Actual[$index] -ne $Expected[$index]) {
      Fail "$Label mismatch at entry $index"
    }
  }
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
    Fail 'working tree must be clean before controlled init'
  }
}

function Assert-GeneratedArtifacts([string]$Phase, [switch]$AllowProofTerraformDirectory) {
  $terraformRoot = Join-Path $repoRoot 'infra/terraform'
  $approvedTerraformDirectory = Join-Path $repoRoot "$proofRootRelative/.terraform"
  $forbidden = New-Object System.Collections.Generic.List[string]
  $observed = New-Object System.Collections.Generic.List[string]

  Get-ChildItem -LiteralPath $terraformRoot -Force -Recurse -Directory |
    Where-Object {
      $_.Name -eq '.terraform' -or
      $_.Name -eq '.terraform.d' -or
      $_.Name -eq 'terraform-plugin-cache'
    } |
    ForEach-Object {
      $relativePath = Get-RelativePath $_.FullName
      if ($AllowProofTerraformDirectory -and $_.FullName -eq $approvedTerraformDirectory) {
        $observed.Add($relativePath)
      } else {
        $forbidden.Add($relativePath)
      }
    }

  Get-ChildItem -LiteralPath $terraformRoot -Force -Recurse -File |
    Where-Object {
      $_.Name -match '^terraform\.tfstate(\.backup)?$' -or
      $_.Name -like '*.tfstate.*' -or
      $_.Name -like '*.tfplan' -or
      $_.Name -like '*.tfplan.*' -or
      $_.Name -like '*.plan' -or
      $_.Name -match '^crash(\..*)?\.log$' -or
      $_.Name -match '^(override|.*_override)\.tf(\.json)?$'
    } |
    ForEach-Object { $forbidden.Add((Get-RelativePath $_.FullName)) }

  if ($forbidden.Count -ne 0) {
    Fail "$Phase found forbidden generated artifacts: $($forbidden -join ', ')"
  }

  if ($observed.Count -ne 0) {
    Write-Host "$Phase observed approved generated artifacts: $($observed -join ', ')"
  }
}

function Assert-ApprovedLockState {
  $trackedLocks = @(Invoke-Git @('ls-files', '--', '.terraform.lock.hcl', ':(glob)**/.terraform.lock.hcl')) |
    Sort-Object
  $expectedLocks = @($approvedLockFiles | Sort-Object)
  Assert-ExactLines $trackedLocks $expectedLocks 'tracked lock files'

  $changedLocks = @(Invoke-Git @('diff', '--name-only', '--', '.terraform.lock.hcl', ':(glob)**/.terraform.lock.hcl'))
  if ($changedLocks.Count -ne 0) {
    Fail "approved lock files must not differ from HEAD: $($changedLocks -join ', ')"
  }

  $stagedLocks = @(Invoke-Git @('diff', '--cached', '--name-only', '--', '.terraform.lock.hcl', ':(glob)**/.terraform.lock.hcl'))
  if ($stagedLocks.Count -ne 0) {
    Fail "approved lock files must not be staged: $($stagedLocks -join ', ')"
  }
}

function Invoke-CheckedCommand([string]$Name, [string[]]$Arguments) {
  Write-Host "Running $Name $($Arguments -join ' ')"
  $output = & $Name @Arguments
  $exitCode = $LASTEXITCODE
  $output | ForEach-Object { Write-Host $_ }
  if ($exitCode -ne 0) {
    Fail "$Name $($Arguments -join ' ') failed with exit code $exitCode"
  }
}

if (-not $ApproveTerraformInit) {
  Fail 'the -ApproveTerraformInit switch is mandatory'
}

if ([string]::IsNullOrWhiteSpace($ApprovalReference)) {
  Fail 'approval reference must be non-empty'
}

if ($repoRoot -ne $expectedRepoRoot) {
  Fail "repository root must be $expectedRepoRoot, got $repoRoot"
}

$branch = Get-ExactlyOneGitLine @('branch', '--show-current') 'current branch'
if ($branch -ne $ExpectedBranch) {
  Fail "branch mismatch: expected $ExpectedBranch, got $branch"
}

$commit = Get-ExactlyOneGitLine @('rev-parse', 'HEAD') 'HEAD commit'
if ($commit -ne $ExpectedCommit) {
  Fail "commit mismatch: expected $ExpectedCommit, got $commit"
}

$tree = Get-ExactlyOneGitLine @('rev-parse', 'HEAD^{tree}') 'HEAD tree'
if ($tree -ne $ExpectedTree) {
  Fail "tree mismatch: expected $ExpectedTree, got $tree"
}

Assert-CleanGitState
Assert-ExactLines @(Invoke-Git @('stash', 'list')) $requiredStashes 'stash list'
Assert-ApprovedLockState
Assert-GeneratedArtifacts 'before init'

$lockHashesBefore = Get-LockHashes

$resolvedTerraform = (Resolve-Path -LiteralPath $TerraformPath).Path
if (-not (Test-Path -LiteralPath $resolvedTerraform -PathType Leaf)) {
  Fail "Terraform binary path does not exist: $TerraformPath"
}

$versionOutput = & $resolvedTerraform version
if ($LASTEXITCODE -ne 0) {
  Fail 'Terraform version check failed'
}
$versionOutput | ForEach-Object { Write-Host $_ }
if (($versionOutput -join "`n") -notmatch "Terraform v$([regex]::Escape($ExpectedTerraformVersion))(\s|$)") {
  Fail "Terraform version must be exactly $ExpectedTerraformVersion"
}

$initArgs = @("-chdir=$proofRootRelative", 'init', '-backend=false')
if ($initArgs -contains '-upgrade') {
  Fail 'provider upgrade is not approved'
}

Write-Host 'Approved runtime command: terraform -chdir=infra/terraform/environments/proof init -backend=false'
& $resolvedTerraform @initArgs
$initExitCode = $LASTEXITCODE
Write-Host "Terraform init exit code: $initExitCode"
if ($initExitCode -ne 0) {
  Fail "Terraform init failed with exit code $initExitCode"
}

$lockHashesAfter = Get-LockHashes
foreach ($lockFile in $approvedLockFiles) {
  if ($lockHashesBefore[$lockFile] -ne $lockHashesAfter[$lockFile]) {
    Fail "approved lock file changed unexpectedly: $lockFile"
  }
}

Assert-ApprovedLockState
Assert-GeneratedArtifacts 'after init' -AllowProofTerraformDirectory

Invoke-CheckedCommand 'node' @(
  'scripts/validate-terraform-foundation.mjs',
  '--allow-proof-terraform-directory'
)
Invoke-CheckedCommand 'node' @(
  'scripts/validate-aws-proof-infrastructure.mjs',
  '--allow-proof-terraform-directory'
)
Invoke-CheckedCommand 'node' @(
  'scripts/validate-terraform-init-readiness.mjs',
  '--allow-proof-terraform-directory'
)
Invoke-CheckedCommand 'node' @('scripts/validate-terraform-runtime-approval.mjs')
Invoke-CheckedCommand 'powershell' @('-ExecutionPolicy', 'Bypass', '-File', 'scripts/scan-secrets.ps1')

Write-Host 'Controlled Terraform init completed. Stop before plan; later gates remain separate.'
