param(
  [string]$ExpectedRevision,
  [string]$ApiImage = 'autoops-api',
  [string]$WorkerImage = 'autoops-worker',
  [string]$ApiBuildRecordRef,
  [string]$WorkerBuildRecordRef,
  [string]$BuildxBuilder = 'desktop-linux',
  [switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$gitContextRepository = 'https://github.com/Pramu55/AutoOps-2.0.git'

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

# Docker consumes these tracked control inputs in addition to COPY sources.
# Keep this list bounded to the API/worker build definitions and the context
# policy that determines which checkout paths reach those definitions.
$apiAndWorkerBuildControlInputs = @(
  '.dockerignore',
  'infra/docker/Dockerfile.api',
  'infra/docker/Dockerfile.worker'
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

function Test-BuildxBuilder([string]$Builder) {
  return -not [string]::IsNullOrWhiteSpace($Builder) -and $Builder -cmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$'
}

function Test-BuildRecordReference([string]$Reference) {
  return -not [string]::IsNullOrWhiteSpace($Reference) -and $Reference -cmatch '^[a-z0-9]{20,64}$'
}

function Test-ImageIdentity([string]$Identity) {
  return -not [string]::IsNullOrWhiteSpace($Identity) -and $Identity -cmatch '^sha256:[0-9a-f]{64}$'
}

function Get-CommitPinnedGitContext([string]$Revision) {
  return "$gitContextRepository?ref=$Revision&checksum=$Revision"
}

function Get-CommitPinnedProvenanceUri([string]$Revision) {
  return "$gitContextRepository#$Revision"
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

function Test-PathAffectsApiOrWorkerBuild([string]$Path, [string[]]$BuildInputPrefixes, [string[]]$BuildControlInputs) {
  return (Test-PathWithinBuildInput $Path $BuildInputPrefixes) -or ($BuildControlInputs -contains (($Path.Replace('\', '/') -replace '^\./', '')))
}

function Test-IgnoredPathAffectsBuild([string]$Path, [string]$RepositoryRoot, [string[]]$BuildInputPrefixes) {
  return (Test-PathWithinBuildInput $Path $BuildInputPrefixes) -and -not (Test-PathExcludedFromDockerContext $Path $RepositoryRoot)
}

function Get-RepositoryGitOutput([string]$Arguments, [string]$RepositoryRoot = $repositoryRoot, [switch]$DisablePerformanceCaches) {
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'git'
  # Command-scoped cache disables are used for the status proof only. Applying
  # them to ls-files can normalize hidden index tags, so that command must read
  # the raw index metadata instead.
  $cacheConfig = if ($DisablePerformanceCaches) { '--no-optional-locks -c core.fsmonitor=false -c core.untrackedCache=false ' } else { '' }
  $psi.Arguments = $cacheConfig + '-C "' + (Get-NormalizedPath $RepositoryRoot).Replace('"', '\"') + '" ' + $Arguments
  $psi.WorkingDirectory = Get-NormalizedPath $RepositoryRoot
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($name in $gitRepositorySelectionVariables) { [void]$psi.EnvironmentVariables.Remove($name) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  if (-not $process.Start()) { return [pscustomobject]@{ Succeeded = $false; Output = $null } }
  # Keep NUL-delimited Git porcelain output byte-for-byte.  Callers that read
  # scalar output trim it explicitly; status/index parsers must not.
  $stdout = $process.StandardOutput.ReadToEnd()
  $null = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { return [pscustomobject]@{ Succeeded = $false; Output = $null } }
  return [pscustomobject]@{ Succeeded = $true; Output = $stdout }
}

function Get-NulDelimitedRecords([string]$Output) {
  if ($null -eq $Output) { return [pscustomobject]@{ Succeeded = $false; Records = @() } }
  if ($Output.Length -eq 0) { return [pscustomobject]@{ Succeeded = $true; Records = @() } }
  if (-not $Output.EndsWith([string][char]0, [StringComparison]::Ordinal)) { return [pscustomobject]@{ Succeeded = $false; Records = @() } }
  return [pscustomobject]@{ Succeeded = $true; Records = @($Output.Substring(0, $Output.Length - 1).Split([char]0)) }
}

function Get-StatusInspection([string]$Output, [string]$RepositoryRoot, [string[]]$BuildInputPrefixes) {
  $records = Get-NulDelimitedRecords $Output
  if (-not $records.Succeeded) { return [pscustomobject]@{ Succeeded = $false } }
  $ordinaryChanges = @()
  $ignoredBuildInputs = @()
  foreach ($record in $records.Records) {
    # Porcelain v1 -z records begin with the fixed three-character XY + space
    # prefix and carry the actual pathname after it, without C quoting.
    if ($record.Length -lt 3 -or $record[2] -ne ' ') { return [pscustomobject]@{ Succeeded = $false } }
    $prefix = $record.Substring(0, 3)
    $path = $record.Substring(3)
    if ([string]::IsNullOrEmpty($path)) { return [pscustomobject]@{ Succeeded = $false } }
    if ($prefix -ceq '!! ') {
      if (Test-IgnoredPathAffectsBuild $path $RepositoryRoot $BuildInputPrefixes) { $ignoredBuildInputs += $path }
    } elseif ($prefix -notmatch '^(?:[ MADRCUT][ MADRCUT] |\?\? )$') {
      return [pscustomobject]@{ Succeeded = $false }
    } else {
      # Any tracked, untracked, renamed, copied, or otherwise changed record
      # invalidates the checkout. Rename/copy source records need not be parsed
      # because the first record already fails closed.
      $ordinaryChanges += $record
    }
  }
  return [pscustomobject]@{
    Succeeded = $true
    HasOrdinaryChanges = $ordinaryChanges.Count -gt 0
    HasIgnoredBuildInputs = $ignoredBuildInputs.Count -gt 0
  }
}

function Get-HiddenIndexBuildInputInspection([string]$Output, [string[]]$BuildInputPrefixes, [string[]]$BuildControlInputs) {
  $records = Get-NulDelimitedRecords $Output
  if (-not $records.Succeeded) { return [pscustomobject]@{ Succeeded = $false } }
  $hiddenBuildInputs = @()
  foreach ($record in $records.Records) {
    # git ls-files -v -z emits "<tag> <path>\0". h is assume-unchanged,
    # S is skip-worktree, and lowercase s is both flags at once. Each can hide
    # a modified tracked Docker input from normal porcelain status.
    if ($record.Length -lt 3 -or $record[1] -ne ' ') { return [pscustomobject]@{ Succeeded = $false } }
    $tag = $record[0]
    $path = $record.Substring(2)
    if ([string]::IsNullOrEmpty($path)) { return [pscustomobject]@{ Succeeded = $false } }
    if (($tag -ceq 'h' -or $tag -ceq 'S' -or $tag -ceq 's') -and (Test-PathAffectsApiOrWorkerBuild -Path $path -BuildInputPrefixes $BuildInputPrefixes -BuildControlInputs $BuildControlInputs)) { $hiddenBuildInputs += $path }
  }
  return [pscustomobject]@{ Succeeded = $true; HasHiddenBuildInputs = $hiddenBuildInputs.Count -gt 0 }
}

function Get-IndexTagForPath([string]$Output, [string]$Path) {
  $records = Get-NulDelimitedRecords $Output
  if (-not $records.Succeeded) { return $null }
  foreach ($record in $records.Records) {
    if ($record.Length -ge 3 -and $record[1] -eq ' ' -and $record.Substring(2) -ceq $Path) { return [string]$record[0] }
  }
  return $null
}

function Get-RepositoryInspection([string]$RepositoryRoot, [string[]]$BuildInputPrefixes) {
  try { $normalizedRoot = Get-NormalizedPath $RepositoryRoot } catch { return [pscustomobject]@{ Succeeded = $false } }
  $topLevel = Get-RepositoryGitOutput 'rev-parse --show-toplevel' $normalizedRoot
  $head = Get-RepositoryGitOutput 'rev-parse HEAD' $normalizedRoot
  $indexFlags = Get-RepositoryGitOutput 'ls-files -v -z' $normalizedRoot
  # Read index flags before the cache-independent status scan. Some Git
  # implementations normalize assume-unchanged/skip-worktree presentation as
  # part of that scan, but the gate must evaluate the raw index state first.
  $status = Get-RepositoryGitOutput 'status --porcelain=v1 -z --untracked-files=all --ignored=matching' $normalizedRoot -DisablePerformanceCaches
  if (-not $topLevel.Succeeded -or -not $head.Succeeded -or -not $status.Succeeded -or -not $indexFlags.Succeeded) { return [pscustomobject]@{ Succeeded = $false } }

  $isRootBound = $false
  try { $isRootBound = (Get-NormalizedPath $topLevel.Output.Trim()) -ceq $normalizedRoot } catch { $isRootBound = $false }
  $statusInspection = Get-StatusInspection $status.Output $normalizedRoot $BuildInputPrefixes
  $hiddenIndexInspection = Get-HiddenIndexBuildInputInspection -Output $indexFlags.Output -BuildInputPrefixes $BuildInputPrefixes -BuildControlInputs $apiAndWorkerBuildControlInputs
  if (-not $statusInspection.Succeeded -or -not $hiddenIndexInspection.Succeeded) { return [pscustomobject]@{ Succeeded = $false } }
  return [pscustomobject]@{
    Succeeded = $true
    Head = $head.Output.Trim()
    IsRootBound = $isRootBound
    HasOrdinaryChanges = $statusInspection.HasOrdinaryChanges
    HasIgnoredBuildInputs = $statusInspection.HasIgnoredBuildInputs
    HasHiddenBuildInputIndexFlags = $hiddenIndexInspection.HasHiddenBuildInputs
  }
}

function Test-CheckoutBinding([string]$Expected, [object]$Inspection) {
  return $Inspection.Succeeded -and $Inspection.IsRootBound -and (Test-Revision $Expected) -and (Test-Revision $Inspection.Head) -and $Expected -ceq $Inspection.Head -and -not $Inspection.HasOrdinaryChanges -and -not $Inspection.HasIgnoredBuildInputs -and -not $Inspection.HasHiddenBuildInputIndexFlags
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

function Get-ImageIdentity([string]$Image) {
  if (-not (Test-ImageReference $Image)) { return $null }
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'docker'
  $psi.Arguments = 'image inspect --format "{{.Id}}" "' + $Image.Replace('"', '\"') + '"'
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  if (-not $process.Start()) { return $null }
  $stdout = $process.StandardOutput.ReadToEnd().Trim()
  $null = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0 -or -not (Test-ImageIdentity $stdout)) { return $null }
  return $stdout
}

function Get-BuildRecordInspection([string]$Builder, [string]$RecordRef, [string]$Expected, [string]$ExpectedDockerfile) {
  if (-not (Test-BuildxBuilder $Builder) -or -not (Test-BuildRecordReference $RecordRef) -or -not (Test-Revision $Expected) -or [string]::IsNullOrWhiteSpace($ExpectedDockerfile)) {
    return [pscustomobject]@{ Succeeded = $false }
  }

  function Invoke-BuildxJson([string]$Arguments) {
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = 'docker'
    $psi.Arguments = $Arguments
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $psi
    if (-not $process.Start()) { return $null }
    $stdout = $process.StandardOutput.ReadToEnd()
    $null = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($stdout)) { return $null }
    try { return $stdout | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
  }

  $record = Invoke-BuildxJson ('buildx history inspect --builder "' + $Builder + '" "' + $RecordRef + '" --format json')
  $provenance = Invoke-BuildxJson ('buildx history inspect attachment --builder "' + $Builder + '" "' + $RecordRef + '" --type "https://slsa.dev/provenance/v1"')
  if ($null -eq $record -or $null -eq $provenance) { return [pscustomobject]@{ Succeeded = $false } }

  $indexAttachments = @($record.Attachments | Where-Object { $_.Type -eq 'application/vnd.oci.image.index.v1+json' })
  if ($indexAttachments.Count -ne 1 -or -not (Test-ImageIdentity $indexAttachments[0].Digest)) { return [pscustomobject]@{ Succeeded = $false } }

  $provenanceUri = $provenance.buildDefinition.externalParameters.configSource.uri
  return [pscustomobject]@{
    Succeeded = $true
    IsCompleted = $record.Status -ceq 'completed'
    HasPinnedContext = $record.Context -ceq (Get-CommitPinnedGitContext $Expected)
    HasPinnedProvenanceUri = $provenanceUri -ceq (Get-CommitPinnedProvenanceUri $Expected)
    HasExpectedDockerfile = (($record.Dockerfile -replace '\\', '/') -ceq $ExpectedDockerfile)
    ImageIdentity = $indexAttachments[0].Digest
  }
}

function Test-BuildRecordBinding([object]$Inspection, [string]$ImageIdentity) {
  return $null -ne $Inspection -and $Inspection.Succeeded -and $Inspection.IsCompleted -and $Inspection.HasPinnedContext -and $Inspection.HasPinnedProvenanceUri -and $Inspection.HasExpectedDockerfile -and (Test-ImageIdentity $Inspection.ImageIdentity) -and $Inspection.ImageIdentity -ceq $ImageIdentity
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
  New-Item -ItemType Directory -Path (Join-Path $path 'infra/docker') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $path 'scratch') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $path 'package.json') -Value '{"name":"synthetic"}' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'pnpm-lock.yaml') -Value 'lockfileVersion: 9.0' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'pnpm-workspace.yaml') -Value 'packages: []' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'tsconfig.base.json') -Value '{}' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'packages/database/prisma/schema.prisma') -Value 'generator client { provider = "prisma-client-js" }' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'apps/api/index.ts') -Value 'export {}' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'infra/docker/Dockerfile.api') -Value 'FROM scratch' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'infra/docker/Dockerfile.worker') -Value 'FROM scratch' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $path 'scratch/outside.ts') -Value 'export {}' -Encoding utf8
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
    $expected = (Get-RepositoryGitOutput 'rev-parse HEAD' $primary).Output.Trim()
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
    $builderTokens = $null
    $builderParseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'build-file-mode-provenance-candidates.ps1'), [ref]$builderTokens, [ref]$builderParseErrors)
    $cases += @{ Name = 'COMMIT_PINNED_CANDIDATE_BUILDER_SYNTAX_VALID'; Passed = $builderParseErrors.Count -eq 0 }

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

    $specialIgnoredPaths = @(
      @{ Name = 'NUL_DELIMITED_STATUS_TEST'; Path = 'packages/database/prisma/prod credential.key' },
      @{ Name = 'UNICODE_PATH_TEST'; Path = 'packages/database/prisma/unicode-é.key' }
    )
    foreach ($fixture in $specialIgnoredPaths) {
      $fixturePath = Join-Path $primary $fixture.Path
      Set-Content -LiteralPath $fixturePath -Value 'synthetic-non-secret' -Encoding utf8
      $inspection = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
      $cases += @{ Name = $fixture.Name; Passed = $inspection.HasIgnoredBuildInputs -and -not (Test-CheckoutBinding $expected $inspection) }
      if ($fixture.Path.Contains(' ')) {
        $cases += @{ Name = 'SPACE_PATH_TEST'; Passed = $inspection.HasIgnoredBuildInputs -and -not (Test-CheckoutBinding $expected $inspection) }
      }
      Remove-Item -LiteralPath $fixturePath -Force
    }
    # Windows forbids a double quote in a filename; preserve the explicit
    # platform result instead of manufacturing or manually decoding porcelain.
    $quoteSupported = [Array]::IndexOf([IO.Path]::GetInvalidFileNameChars(), [char]'"') -lt 0
    $cases += @{ Name = 'QUOTE_PATH_TEST'; Passed = -not $quoteSupported }

    Set-Content -LiteralPath (Join-Path $primary 'scratch/credential.key') -Value 'synthetic-non-secret' -Encoding utf8
    $outsideIgnored = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'IGNORED_OUTSIDE_EFFECTIVE_BUILD_INPUT_ACCEPTED'; Passed = -not $outsideIgnored.HasIgnoredBuildInputs -and (Test-CheckoutBinding $expected $outsideIgnored) }
    Remove-Item -LiteralPath (Join-Path $primary 'scratch/credential.key') -Force

    New-Item -ItemType Directory -Path (Join-Path $primary 'packages/database/dist') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $primary 'packages/database/dist/credential.key') -Value 'synthetic-non-secret' -Encoding utf8
    $dockerExcludedIgnored = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'IGNORED_DOCKER_EXCLUDED_BUILD_PATH_ACCEPTED'; Passed = -not $dockerExcludedIgnored.HasIgnoredBuildInputs -and (Test-CheckoutBinding $expected $dockerExcludedIgnored) }
    Remove-Item -LiteralPath (Join-Path $primary 'packages/database/dist') -Recurse -Force

    New-Item -ItemType Directory -Path (Join-Path $primary 'packages/database/dist') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $primary 'packages/database/dist/prod credential.key') -Value 'synthetic-non-secret' -Encoding utf8
    $quotedDockerExcludedIgnored = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'IGNORED_QUOTED_DOCKER_EXCLUDED_PATH_ACCEPTED'; Passed = -not $quotedDockerExcludedIgnored.HasIgnoredBuildInputs -and (Test-CheckoutBinding $expected $quotedDockerExcludedIgnored) }
    Remove-Item -LiteralPath (Join-Path $primary 'packages/database/dist') -Recurse -Force

    $trackedBuildInput = 'packages/database/prisma/schema.prisma'
    Invoke-TestGit $primary @('update-index','--assume-unchanged',$trackedBuildInput)
    Add-Content -LiteralPath (Join-Path $primary $trackedBuildInput) -Value '// hidden assume unchanged' -Encoding utf8
    $assumeStatus = Get-RepositoryGitOutput 'status --porcelain=v1 -z --untracked-files=all --ignored=matching' $primary
    $assumeTag = Get-IndexTagForPath (Get-RepositoryGitOutput 'ls-files -v -z' $primary).Output $trackedBuildInput
    $assumeInspection = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'ASSUME_UNCHANGED_BUILD_INPUT_BLOCKED'; Passed = $assumeTag -ceq 'h' -and $assumeStatus.Succeeded -and $assumeStatus.Output.Length -eq 0 -and $assumeInspection.HasHiddenBuildInputIndexFlags -and -not (Test-CheckoutBinding $expected $assumeInspection) }
    Invoke-TestGit $primary @('update-index','--no-assume-unchanged',$trackedBuildInput)
    Invoke-TestGit $primary @('checkout','--',$trackedBuildInput)

    Invoke-TestGit $primary @('update-index','--skip-worktree',$trackedBuildInput)
    Add-Content -LiteralPath (Join-Path $primary $trackedBuildInput) -Value '// hidden skip worktree' -Encoding utf8
    $skipStatus = Get-RepositoryGitOutput 'status --porcelain=v1 -z --untracked-files=all --ignored=matching' $primary
    $skipTag = Get-IndexTagForPath (Get-RepositoryGitOutput 'ls-files -v -z' $primary).Output $trackedBuildInput
    $skipInspection = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'SKIP_WORKTREE_BUILD_INPUT_BLOCKED'; Passed = $skipTag -ceq 'S' -and $skipStatus.Succeeded -and $skipStatus.Output.Length -eq 0 -and $skipInspection.HasHiddenBuildInputIndexFlags -and -not (Test-CheckoutBinding $expected $skipInspection) }
    Invoke-TestGit $primary @('update-index','--no-skip-worktree',$trackedBuildInput)
    Invoke-TestGit $primary @('checkout','--',$trackedBuildInput)

    Invoke-TestGit $primary @('update-index','--assume-unchanged',$trackedBuildInput)
    Invoke-TestGit $primary @('update-index','--skip-worktree',$trackedBuildInput)
    Add-Content -LiteralPath (Join-Path $primary $trackedBuildInput) -Value '// hidden combined flags' -Encoding utf8
    $combinedStatus = Get-RepositoryGitOutput 'status --porcelain=v1 -z --untracked-files=all --ignored=matching' $primary
    $combinedTag = Get-IndexTagForPath (Get-RepositoryGitOutput 'ls-files -v -z' $primary).Output $trackedBuildInput
    $combinedInspection = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'COMBINED_ASSUME_UNCHANGED_SKIP_WORKTREE_BUILD_INPUT_BLOCKED'; Passed = $combinedTag -ceq 's' -and $combinedStatus.Succeeded -and $combinedStatus.Output.Length -eq 0 -and $combinedInspection.HasHiddenBuildInputIndexFlags -and -not (Test-CheckoutBinding $expected $combinedInspection) }
    Invoke-TestGit $primary @('update-index','--no-assume-unchanged',$trackedBuildInput)
    Invoke-TestGit $primary @('update-index','--no-skip-worktree',$trackedBuildInput)
    Invoke-TestGit $primary @('checkout','--',$trackedBuildInput)

    $outsideBuildInput = 'scratch/outside.ts'
    Invoke-TestGit $primary @('update-index','--assume-unchanged',$outsideBuildInput)
    Invoke-TestGit $primary @('update-index','--skip-worktree',$outsideBuildInput)
    Add-Content -LiteralPath (Join-Path $primary $outsideBuildInput) -Value '// hidden combined outside input' -Encoding utf8
    $outsideTag = Get-IndexTagForPath (Get-RepositoryGitOutput 'ls-files -v -z' $primary).Output $outsideBuildInput
    $outsideHiddenInspection = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'COMBINED_OUTSIDE_EFFECTIVE_INPUT_ALLOWED'; Passed = $outsideTag -ceq 's' -and -not $outsideHiddenInspection.HasHiddenBuildInputIndexFlags -and (Test-CheckoutBinding $expected $outsideHiddenInspection) }
    Invoke-TestGit $primary @('update-index','--no-assume-unchanged',$outsideBuildInput)
    Invoke-TestGit $primary @('update-index','--no-skip-worktree',$outsideBuildInput)
    Invoke-TestGit $primary @('checkout','--',$outsideBuildInput)

    $controlFixtures = @(
      @{ Name = 'DOCKERFILE_API_ASSUME_UNCHANGED_BLOCKED'; Path = 'infra/docker/Dockerfile.api'; ExpectedTag = 'h'; Flags = @('update-index','--assume-unchanged') },
      @{ Name = 'DOCKERFILE_WORKER_SKIP_WORKTREE_BLOCKED'; Path = 'infra/docker/Dockerfile.worker'; ExpectedTag = 'S'; Flags = @('update-index','--skip-worktree') },
      @{ Name = 'DOCKERIGNORE_COMBINED_HIDDEN_INDEX_BLOCKED'; Path = '.dockerignore'; ExpectedTag = 's'; Flags = @('update-index','--assume-unchanged') ; SecondFlags = @('update-index','--skip-worktree') }
    )
    foreach ($fixture in $controlFixtures) {
      Invoke-TestGit -RepositoryRoot $primary -Arguments (@($fixture['Flags']) + $fixture.Path)
      if ($fixture['SecondFlags']) { Invoke-TestGit -RepositoryRoot $primary -Arguments (@($fixture['SecondFlags']) + $fixture.Path) }
      Add-Content -LiteralPath (Join-Path $primary $fixture.Path) -Value '# hidden build-control change' -Encoding utf8
      $tag = Get-IndexTagForPath (Get-RepositoryGitOutput 'ls-files -v -z' $primary).Output $fixture.Path
      $inspection = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
      $cases += @{ Name = $fixture.Name; Passed = $tag -ceq $fixture.ExpectedTag -and $inspection.HasHiddenBuildInputIndexFlags -and -not (Test-CheckoutBinding $expected $inspection) }
      Invoke-TestGit $primary @('update-index','--no-assume-unchanged',$fixture.Path)
      Invoke-TestGit $primary @('update-index','--no-skip-worktree',$fixture.Path)
      Invoke-TestGit $primary @('checkout','--',$fixture.Path)
    }

    $trustedBuildRecord = [pscustomobject]@{
      Succeeded = $true
      IsCompleted = $true
      HasPinnedContext = $true
      HasPinnedProvenanceUri = $true
      HasExpectedDockerfile = $true
      ImageIdentity = 'sha256:' + ('a' * 64)
    }
    $cases += @{ Name = 'BUILD_RECORD_PINNED_GIT_CONTEXT_ACCEPTED'; Passed = Test-BuildRecordBinding $trustedBuildRecord $trustedBuildRecord.ImageIdentity }
    $cases += @{ Name = 'FORGED_LABEL_UNRELATED_IMAGE_BLOCKED'; Passed = -not (Test-BuildRecordBinding $trustedBuildRecord ('sha256:' + ('b' * 64))) }
    $cases += @{ Name = 'MISSING_BUILD_RECORD_BLOCKED'; Passed = -not (Test-BuildRecordBinding $null $trustedBuildRecord.ImageIdentity) }

    $fsmonitorHook = Join-Path $primary '.git/fsmonitor-empty.sh'
    Set-Content -LiteralPath $fsmonitorHook -Value "#!/bin/sh`necho 'version 2'`necho 'token'" -Encoding ascii
    Invoke-TestGit $primary @('config','core.fsmonitor','sh .git/fsmonitor-empty.sh')
    & git -C $primary status --porcelain=v1 1>$null 2>$null
    Add-Content -LiteralPath (Join-Path $primary $trackedBuildInput) -Value '// stale fsmonitor change' -Encoding utf8
    $misledStatus = @(& git -C $primary status --porcelain=v1 2>$null) -join "`n"
    $fsmonitorInspection = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'FSMONITOR_STALE_BUILD_INPUT_BLOCKED'; Passed = [string]::IsNullOrWhiteSpace($misledStatus) -and $fsmonitorInspection.HasOrdinaryChanges -and -not (Test-CheckoutBinding $expected $fsmonitorInspection) }
    Invoke-TestGit $primary @('config','--unset','core.fsmonitor')
    Invoke-TestGit $primary @('checkout','--',$trackedBuildInput)

    Invoke-TestGit $primary @('config','core.untrackedCache','true')
    Set-Content -LiteralPath (Join-Path $primary 'packages/database/prisma/cache-visible.ts') -Value 'export {}' -Encoding utf8
    $untrackedCacheInspection = Get-RepositoryInspection $primary $apiAndWorkerBuildInputPrefixes
    $cases += @{ Name = 'UNTRACKED_CACHE_BUILD_INPUT_BLOCKED'; Passed = $untrackedCacheInspection.HasOrdinaryChanges -and -not (Test-CheckoutBinding $expected $untrackedCacheInspection) }
    Remove-Item -LiteralPath (Join-Path $primary 'packages/database/prisma/cache-visible.ts') -Force
    Invoke-TestGit $primary @('config','--unset','core.untrackedCache')

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
$apiIdentity = Get-ImageIdentity $ApiImage
$workerIdentity = Get-ImageIdentity $WorkerImage
$apiRecord = Get-BuildRecordInspection $BuildxBuilder $ApiBuildRecordRef $ExpectedRevision 'infra/docker/Dockerfile.api'
$workerRecord = Get-BuildRecordInspection $BuildxBuilder $WorkerBuildRecordRef $ExpectedRevision 'infra/docker/Dockerfile.worker'

$apiLabelPassed = Test-ImageRevision $apiRevision $ExpectedRevision
$workerLabelPassed = Test-ImageRevision $workerRevision $ExpectedRevision
$apiRecordPassed = Test-BuildRecordBinding $apiRecord $apiIdentity
$workerRecordPassed = Test-BuildRecordBinding $workerRecord $workerIdentity

# Revision labels remain useful diagnostics, but a label is not accepted as
# source-to-image evidence without the Buildx-generated pinned-Git record and
# its exact loaded-image identity binding.
$apiPassed = $apiLabelPassed -and $apiRecordPassed
$workerPassed = $workerLabelPassed -and $workerRecordPassed
Write-Result 'API_IMAGE_REVISION_LABEL' $apiLabelPassed
Write-Result 'WORKER_IMAGE_REVISION_LABEL' $workerLabelPassed
Write-Result 'API_BUILD_RECORD_PROVENANCE' $apiRecordPassed
Write-Result 'WORKER_BUILD_RECORD_PROVENANCE' $workerRecordPassed
Write-Result 'API_IMAGE_PROVENANCE' $apiPassed
Write-Result 'WORKER_IMAGE_PROVENANCE' $workerPassed
if (-not $apiPassed -or -not $workerPassed) { exit 1 }
