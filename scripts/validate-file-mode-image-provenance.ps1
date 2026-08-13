param(
  [string]$ExpectedRevision,
  [string]$ApiImage = 'autoops-api',
  [string]$WorkerImage = 'autoops-worker',
  [switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot

# These are the only source paths copied from the checkout by the API and worker
# builder stages. The provenance gate treats an ignored path as relevant only if
# it both survives .dockerignore and is beneath one of these COPY inputs.
$apiAndWorkerBuildInputPrefixes = @(
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'packages/config-typescript/',
  'packages/config-eslint/',
  'packages/types/',
  'packages/logger/',
  'packages/utils/',
  'packages/database/',
  'apps/api/',
  'apps/worker/'
)

# Git accepts these inherited variables as repository, worktree, index, object,
# or discovery overrides. They must never influence an inspection that is meant
# to bind Docker's checkout context to an accepted revision.
$gitRepositorySelectionVariables = @(
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM'
)

function Write-Result([string]$Name, [bool]$Passed) {
  Write-Host "$Name $(if ($Passed) { 'PASS' } else { 'FAIL' })"
}

function Test-Revision([string]$Revision) {
  return -not [string]::IsNullOrWhiteSpace($Revision) -and $Revision -cmatch '^[0-9a-f]{40}$'
}

function Test-ImageReference([string]$Image) {
  return -not [string]::IsNullOrWhiteSpace($Image) -and $Image -cmatch '^[A-Za-z0-9][A-Za-z0-9._/:@-]*$'
}

function Get-NormalizedPath([string]$Path) {
  return [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
}

function ConvertTo-PathRegex([string]$Pattern) {
  $escaped = [Regex]::Escape($Pattern.Replace('\', '/'))
  $escaped = $escaped.Replace('\*\*/', '(?:.*/)?').Replace('\*\*', '.*').Replace('\*', '[^/]*').Replace('\?', '[^/]')
  return '^' + $escaped + '$'
}

function Test-DockerIgnorePattern([string]$Path, [string]$Pattern) {
  # Docker treats a leading "./" as optional, but a leading dot in names such
  # as ".turbo" and ".pnpm-store" is significant.
  $normalizedPath = ($Path.Replace('\', '/') -replace '^\./', '')
  $normalizedPattern = (($Pattern.Replace('\', '/').Trim()) -replace '^\./', '')
  if ([string]::IsNullOrWhiteSpace($normalizedPattern)) { return $false }

  $directoryPattern = $normalizedPattern.EndsWith('/')
  $normalizedPattern = $normalizedPattern.TrimEnd('/')
  if ([string]::IsNullOrWhiteSpace($normalizedPattern)) { return $false }

  if ($normalizedPattern -notmatch '/') {
    $segments = $normalizedPath.Split('/')
    foreach ($segment in $segments) {
      if ($segment -match (ConvertTo-PathRegex $normalizedPattern)) { return $true }
    }
    return $false
  }

  $regex = ConvertTo-PathRegex $normalizedPattern
  if ($normalizedPath -match $regex) { return $true }
  return $directoryPattern -and $normalizedPath.StartsWith($normalizedPattern + '/', [StringComparison]::Ordinal)
}

function Test-PathExcludedFromDockerContext([string]$Path, [string]$RepositoryRoot) {
  $dockerIgnorePath = Join-Path $RepositoryRoot '.dockerignore'
  if (-not (Test-Path -LiteralPath $dockerIgnorePath -PathType Leaf)) { return $false }

  $excluded = $false
  foreach ($rawLine in Get-Content -LiteralPath $dockerIgnorePath) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
    $isNegated = $line.StartsWith('!')
    $pattern = if ($isNegated) { $line.Substring(1) } else { $line }
    if (Test-DockerIgnorePattern $Path $pattern) { $excluded = -not $isNegated }
  }
  return $excluded
}

function Test-PathWithinBuildInput([string]$Path, [string[]]$BuildInputPrefixes) {
  $normalizedPath = ($Path.Replace('\', '/') -replace '^\./', '')
  foreach ($prefix in $BuildInputPrefixes) {
    $normalizedPrefix = ($prefix.Replace('\', '/') -replace '^\./', '')
    if ($normalizedPrefix.EndsWith('/')) {
      if ($normalizedPath.StartsWith($normalizedPrefix, [StringComparison]::Ordinal)) { return $true }
    } elseif ($normalizedPath -ceq $normalizedPrefix) {
      return $true
    }
  }
  return $false
}

function Test-IgnoredPathAffectsBuild([string]$Path, [string]$RepositoryRoot, [string[]]$BuildInputPrefixes) {
  return (Test-PathWithinBuildInput $Path $BuildInputPrefixes) -and -not (Test-PathExcludedFromDockerContext $Path $RepositoryRoot)
}

function Get-RepositoryGitOutput([string]$Arguments, [string]$RepositoryRoot = $repositoryRoot) {
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'git'
  $psi.Arguments = '-C "' + (Get-NormalizedPath $RepositoryRoot).Replace('"', '\"') + '" ' + $Arguments
  $psi.WorkingDirectory = Get-NormalizedPath $RepositoryRoot
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($name in $gitRepositorySelectionVariables) { [void]$psi.EnvironmentVariables.Remove($name) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  if (-not $process.Start()) { return [pscustomobject]@{ Succeeded = $false; Output = $null } }
  $stdout = $process.StandardOutput.ReadToEnd().Trim()
  $null = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { return [pscustomobject]@{ Succeeded = $false; Output = $null } }
  return [pscustomobject]@{ Succeeded = $true; Output = $stdout }
}

function Get-RepositoryInspection([string]$RepositoryRoot, [string[]]$BuildInputPrefixes) {
  try { $normalizedRoot = Get-NormalizedPath $RepositoryRoot } catch { return [pscustomobject]@{ Succeeded = $false } }
  $topLevel = Get-RepositoryGitOutput 'rev-parse --show-toplevel' $normalizedRoot
  $head = Get-RepositoryGitOutput 'rev-parse HEAD' $normalizedRoot
  $status = Get-RepositoryGitOutput 'status --porcelain=v1 --untracked-files=all --ignored=matching' $normalizedRoot
  if (-not $topLevel.Succeeded -or -not $head.Succeeded -or -not $status.Succeeded) { return [pscustomobject]@{ Succeeded = $false } }

  $isRootBound = $false
  try { $isRootBound = (Get-NormalizedPath $topLevel.Output) -ceq $normalizedRoot } catch { $isRootBound = $false }
  $ordinaryChanges = @()
  $ignoredBuildInputs = @()
  foreach ($line in @($status.Output -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.StartsWith('!! ')) {
      $path = $line.Substring(3)
      if (Test-IgnoredPathAffectsBuild $path $normalizedRoot $BuildInputPrefixes) { $ignoredBuildInputs += $path }
    } else {
      $ordinaryChanges += $line
    }
  }
  return [pscustomobject]@{
    Succeeded = $true
    Head = $head.Output
    IsRootBound = $isRootBound
    HasOrdinaryChanges = $ordinaryChanges.Count -gt 0
    HasIgnoredBuildInputs = $ignoredBuildInputs.Count -gt 0
  }
}

function Test-CheckoutBinding([string]$Expected, [object]$Inspection) {
  return $Inspection.Succeeded -and $Inspection.IsRootBound -and (Test-Revision $Expected) -and (Test-Revision $Inspection.Head) -and $Expected -ceq $Inspection.Head -and -not $Inspection.HasOrdinaryChanges -and -not $Inspection.HasIgnoredBuildInputs
}

function Get-ImageRevision([string]$Image) {
  if (-not (Test-ImageReference $Image)) { return $null }
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'docker'
  # Request the complete label map as JSON so the child-process argument does
  # not need to embed a quoted label key.  Read only the non-secret revision.
  $psi.Arguments = 'image inspect --format "{{json .Config.Labels}}" "' + $Image.Replace('"', '\"') + '"'
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  if (-not $process.Start()) { return $null }
  $stdout = $process.StandardOutput.ReadToEnd().Trim()
  $null = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($stdout) -or $stdout -eq '<no value>' -or $stdout -eq 'null') { return $null }
  try {
    $labels = $stdout | ConvertFrom-Json -ErrorAction Stop
    $revision = $labels.'org.opencontainers.image.revision'
    if ([string]::IsNullOrWhiteSpace($revision)) { return $null }
    return $revision.Trim()
  } catch {
    return $null
  }
}

function Test-ImageRevision([string]$Revision, [string]$Expected) {
  return (Test-Revision $Revision) -and $Revision -ceq $Expected
}

function Invoke-TestGit([string]$RepositoryRoot, [string[]]$Arguments) {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & git -c core.safecrlf=false -C $RepositoryRoot @Arguments 1>$null 2>$null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) { throw "Synthetic Git command failed: $($Arguments -join ' ')" }
}

function New-SyntheticRepository([string]$Root, [string]$Name) {
  $path = Join-Path $Root $Name
  New-Item -ItemType Directory -Path $path -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $path 'packages/database/prisma') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $path 'apps/api') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $path 'scratch') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $path 'package.json') -Value '{"name":"synthetic"}' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'pnpm-lock.yaml') -Value 'lockfileVersion: 9.0' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'pnpm-workspace.yaml') -Value 'packages: []' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'tsconfig.base.json') -Value '{}' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'packages/database/prisma/schema.prisma') -Value 'generator client { provider = "prisma-client-js" }' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'apps/api/index.ts') -Value 'export {}' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path '.gitignore') -Value "*.key`ndist/" -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path '.dockerignore') -Value "dist`n**/dist" -Encoding utf8
  Invoke-TestGit $path @('init')
  Invoke-TestGit $path @('config','user.email','synthetic@example.invalid')
  Invoke-TestGit $path @('config','user.name','Synthetic Test')
  Invoke-TestGit $path @('add','.')
  Invoke-TestGit $path @('commit','-m','synthetic baseline')
  return $path
}

function Invoke-SelfTest {
  $root = Join-Path ([IO.Path]::GetTempPath()) ('autoops-provenance-' + [Guid]::NewGuid().ToString('N'))
  $originalEnvironment = @{}
  foreach ($name in $gitRepositorySelectionVariables) { $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  $passed = $true
  try {
    $primary = New-SyntheticRepository $root 'primary'
    $redirect = New-SyntheticRepository $root 'redirect'
    $expected = (Get-RepositoryGitOutput 'rev-parse HEAD' $primary).Output
    $stale = 'b' * 40
    $clean = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases = @(
      @{ Name = 'IMAGE_PROVENANCE_EXACT_ACCEPTED_SHA'; Passed = Test-CheckoutBinding $expected $clean },
      @{ Name = 'IMAGE_PROVENANCE_STALE_SHA_BLOCKED'; Passed = -not (Test-CheckoutBinding $stale $clean) },
      @{ Name = 'IMAGE_PROVENANCE_MISSING_BLOCKED'; Passed = -not (Test-ImageRevision $null $expected) },
      @{ Name = 'IMAGE_PROVENANCE_MALFORMED_BLOCKED'; Passed = -not (Test-ImageRevision 'not-a-revision' $expected) },
      @{ Name = 'IMAGE_PROVENANCE_INVALID_IMAGE_REFERENCE_BLOCKED'; Passed = -not (Test-ImageReference 'invalid image reference') },
      @{ Name = 'IMAGE_PROVENANCE_GIT_STATUS_FAILURE_BLOCKED'; Passed = -not (Get-RepositoryGitOutput 'not-a-git-command' $primary).Succeeded },
      @{ Name = 'IMAGE_PROVENANCE_API_WORKER_MISMATCH_BLOCKED'; Passed = -not ((Test-ImageRevision $expected $expected) -and (Test-ImageRevision $stale $expected)) }
    )

    Add-Content -LiteralPath (Join-Path $primary 'packages/database/prisma/schema.prisma') -Value '// dirty' -Encoding utf8
    $cases += @{ Name = 'IMAGE_PROVENANCE_DIRTY_CHECKOUT_BLOCKED'; Passed = -not (Test-CheckoutBinding $expected (Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes)) }
    Invoke-TestGit $primary @('checkout','--','packages/database/prisma/schema.prisma')

    Set-Content -LiteralPath (Join-Path $primary 'packages/database/prisma/untracked.ts') -Value 'export {}' -Encoding utf8
    $cases += @{ Name = 'UNTRACKED_BUILD_INPUT_BLOCKED'; Passed = -not (Test-CheckoutBinding $expected (Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes)) }
    Remove-Item -LiteralPath (Join-Path $primary 'packages/database/prisma/untracked.ts') -Force

    Set-Content -LiteralPath (Join-Path $primary 'packages/database/prisma/credential.key') -Value 'synthetic-non-secret' -Encoding utf8
    $ignoredInput = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'IGNORED_BUILD_INPUT_BLOCKED'; Passed = $ignoredInput.HasIgnoredBuildInputs -and -not (Test-CheckoutBinding $expected $ignoredInput) }
    Remove-Item -LiteralPath (Join-Path $primary 'packages/database/prisma/credential.key') -Force

    Set-Content -LiteralPath (Join-Path $primary 'scratch/credential.key') -Value 'synthetic-non-secret' -Encoding utf8
    $outsideIgnored = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'IGNORED_OUTSIDE_EFFECTIVE_BUILD_INPUT_ACCEPTED'; Passed = -not $outsideIgnored.HasIgnoredBuildInputs -and (Test-CheckoutBinding $expected $outsideIgnored) }
    Remove-Item -LiteralPath (Join-Path $primary 'scratch/credential.key') -Force

    New-Item -ItemType Directory -Path (Join-Path $primary 'packages/database/dist') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $primary 'packages/database/dist/credential.key') -Value 'synthetic-non-secret' -Encoding utf8
    $dockerExcludedIgnored = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'IGNORED_DOCKER_EXCLUDED_BUILD_PATH_ACCEPTED'; Passed = -not $dockerExcludedIgnored.HasIgnoredBuildInputs -and (Test-CheckoutBinding $expected $dockerExcludedIgnored) }
    Remove-Item -LiteralPath (Join-Path $primary 'packages/database/dist') -Recurse -Force

    Add-Content -LiteralPath (Join-Path $primary 'packages/database/prisma/schema.prisma') -Value '// redirected dirty' -Encoding utf8
    $redirectGitDir = Join-Path $redirect '.git'
    [Environment]::SetEnvironmentVariable('GIT_DIR', $redirectGitDir, 'Process')
    $cases += @{ Name = 'GIT_DIR_REDIRECTION_BLOCKED'; Passed = -not (Test-CheckoutBinding $expected (Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes)) }
    [Environment]::SetEnvironmentVariable('GIT_DIR', $null, 'Process')
    [Environment]::SetEnvironmentVariable('GIT_WORK_TREE', $redirect, 'Process')
    $cases += @{ Name = 'GIT_WORK_TREE_REDIRECTION_BLOCKED'; Passed = -not (Test-CheckoutBinding $expected (Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes)) }
    [Environment]::SetEnvironmentVariable('GIT_WORK_TREE', $null, 'Process')
    [Environment]::SetEnvironmentVariable('GIT_INDEX_FILE', (Join-Path $redirectGitDir 'index'), 'Process')
    $cases += @{ Name = 'GIT_INDEX_FILE_REDIRECTION_BLOCKED'; Passed = -not (Test-CheckoutBinding $expected (Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes)) }

    foreach ($case in $cases) {
      Write-Result $case.Name $case.Passed
      if (-not $case.Passed) { $passed = $false }
    }
  } finally {
    foreach ($name in $gitRepositorySelectionVariables) { [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process') }
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
  }
  exit $(if ($passed) { 0 } else { 1 })
}

if ($RunSelfTest) { Invoke-SelfTest }

if (-not (Test-Revision $ExpectedRevision)) {
  Write-Result 'EXPECTED_IMAGE_REVISION' $false
  exit 1
}

$inspection = Get-RepositoryInspection $repositoryRoot $apiAndWorkerBuildInputPrefixes
$checkoutPassed = Test-CheckoutBinding $ExpectedRevision $inspection
Write-Result 'CHECKOUT_IMAGE_PROVENANCE' $checkoutPassed
if (-not $checkoutPassed) { exit 1 }

$apiRevision = Get-ImageRevision $ApiImage
$workerRevision = Get-ImageRevision $WorkerImage
$apiPassed = Test-ImageRevision $apiRevision $ExpectedRevision
$workerPassed = Test-ImageRevision $workerRevision $ExpectedRevision
Write-Result 'API_IMAGE_PROVENANCE' $apiPassed
Write-Result 'WORKER_IMAGE_PROVENANCE' $workerPassed
if (-not $apiPassed -or -not $workerPassed) { exit 1 }
