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
$trustedDockerEndpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$trustedDockerConfigRoot = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)) 'AutoOps\rotation-authority\docker-cli'

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

function Test-Digest([string]$Identity) {
  return -not [string]::IsNullOrWhiteSpace($Identity) -and $Identity -cmatch '^sha256:[0-9a-f]{64}$'
}

function Get-CommitPinnedGitContext([string]$Revision) {
  return "${gitContextRepository}?ref=$Revision&checksum=$Revision"
}

function Get-CommitPinnedProvenanceUri([string]$Revision) {
  return "$gitContextRepository#$Revision"
}

function Get-NormalizedPath([string]$Path) {
  return [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
}

function Test-TrustedExecutableFile([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.File]::Exists($Path)) { return $false }
  try { return (([IO.File]::GetAttributes($Path) -band [IO.FileAttributes]::ReparsePoint) -eq 0) } catch { return $false }
}

function Get-TrustedProgramFilesRoots() {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { return @() }
  $roots = [Collections.Generic.List[string]]::new()
  foreach ($folder in @([Environment+SpecialFolder]::ProgramFiles, [Environment+SpecialFolder]::ProgramFilesX86)) {
    try {
      $root = [Environment]::GetFolderPath($folder)
      if (-not [string]::IsNullOrWhiteSpace($root) -and -not $roots.Contains($root)) { $roots.Add($root) }
    } catch { }
  }
  return @($roots)
}

function Get-TrustedDockerExecutable() {
  foreach ($root in Get-TrustedProgramFilesRoots) {
    $candidate = Join-Path $root 'Docker\Docker\resources\bin\docker.exe'
    if (Test-TrustedExecutableFile $candidate) { return $candidate }
  }
  return $null
}

function Get-TrustedBuildxExecutable() {
  foreach ($root in Get-TrustedProgramFilesRoots) {
    $candidate = Join-Path $root 'Docker\Docker\resources\cli-plugins\docker-buildx.exe'
    if (Test-TrustedExecutableFile $candidate) { return $candidate }
  }
  return $null
}

function Set-TrustedDockerChildEnvironment($ProcessStartInfo, [switch]$Buildx) {
  $ProcessStartInfo.EnvironmentVariables.Clear()
  $systemDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::System)
  if ([string]::IsNullOrWhiteSpace($systemDirectory)) { throw 'Trusted Windows system directory unavailable' }
  $windowsDirectory = Split-Path -Parent $systemDirectory
  foreach ($entry in @{
    SystemRoot = $windowsDirectory; WINDIR = $windowsDirectory; ComSpec = (Join-Path $systemDirectory 'cmd.exe'); TEMP = [IO.Path]::GetTempPath(); TMP = [IO.Path]::GetTempPath()
  }.GetEnumerator()) { $ProcessStartInfo.EnvironmentVariables[$entry.Key] = $entry.Value }
  if ($Buildx) {
    $ProcessStartInfo.EnvironmentVariables['DOCKER_HOST'] = $trustedDockerEndpoint
    $ProcessStartInfo.EnvironmentVariables['DOCKER_CONFIG'] = $trustedDockerConfigRoot
    $ProcessStartInfo.EnvironmentVariables['BUILDX_CONFIG'] = (Join-Path $trustedDockerConfigRoot 'buildx')
  }
}

function New-TrustedDockerProcessStartInfo([string]$Arguments) {
  $dockerExecutable = Get-TrustedDockerExecutable
  if ($null -eq $dockerExecutable) { return $null }
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $dockerExecutable
  $psi.Arguments = '--host "' + $trustedDockerEndpoint + '" --config "' + $trustedDockerConfigRoot + '" ' + $Arguments
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  Set-TrustedDockerChildEnvironment $psi
  return $psi
}

function New-TrustedBuildxProcessStartInfo([string]$Arguments) {
  $buildxExecutable = Get-TrustedBuildxExecutable
  if ($null -eq $buildxExecutable) { return $null }
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $buildxExecutable; $psi.Arguments = $Arguments
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  Set-TrustedDockerChildEnvironment $psi -Buildx
  return $psi
}

function Get-TrustedGitExecutable() {
  $installationRoots = [Collections.Generic.List[string]]::new()
  foreach ($root in Get-TrustedProgramFilesRoots) { if (-not $installationRoots.Contains($root)) { $installationRoots.Add($root) } }
  # Git for Windows also documents the conventional system-drive installation
  # root used by managed/local installations. Derive the drive from the OS
  # system directory rather than an environment variable or caller PATH.
  try {
    $systemDrive = [IO.Path]::GetPathRoot([Environment]::GetFolderPath([Environment+SpecialFolder]::System))
    if (-not [string]::IsNullOrWhiteSpace($systemDrive) -and -not $installationRoots.Contains($systemDrive)) { $installationRoots.Add($systemDrive) }
  } catch { }
  foreach ($root in $installationRoots) {
    foreach ($relativePath in @('Git\cmd\git.exe', 'Git\bin\git.exe')) {
      $candidate = Join-Path $root $relativePath
      if (Test-TrustedExecutableFile $candidate) { return $candidate }
    }
  }
  return $null
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
  $gitExecutable = Get-TrustedGitExecutable
  if ($null -eq $gitExecutable) { return [pscustomobject]@{ Succeeded = $false; Output = $null } }
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $gitExecutable
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
  $psi = New-TrustedDockerProcessStartInfo ('image inspect --format "{{json .Config.Labels}}" "' + $Image.Replace('"', '\"') + '"')
  if ($null -eq $psi) { return $null }
  # Request the complete label map as JSON so the child-process argument does
  # not need to embed a quoted label key.  Read only the non-secret revision.
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

function Get-LoadedImageMetadata([string]$Image) {
  if (-not (Test-ImageReference $Image)) { return $null }
  $psi = New-TrustedDockerProcessStartInfo ('image inspect --format "{{.Id}}|{{.Os}}|{{.Architecture}}" "' + $Image.Replace('"', '\"') + '"')
  if ($null -eq $psi) { return $null }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  if (-not $process.Start()) { return $null }
  $stdout = $process.StandardOutput.ReadToEnd().Trim()
  $null = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $parts = $stdout.Split('|')
  if ($process.ExitCode -ne 0 -or $parts.Count -ne 3 -or -not (Test-Digest $parts[0]) -or [string]::IsNullOrWhiteSpace($parts[1]) -or [string]::IsNullOrWhiteSpace($parts[2])) { return $null }
  return [pscustomobject]@{
    LoadedImageIdentity = $parts[0]
    LoadedOs = $parts[1]
    LoadedArchitecture = $parts[2]
  }
}

function Get-SelectedApplicationManifest([object]$Index, [string]$LoadedOs, [string]$LoadedArchitecture) {
  if ($null -eq $Index -or $Index.mediaType -cne 'application/vnd.oci.image.index.v1+json' -or [string]::IsNullOrWhiteSpace($LoadedOs) -or [string]::IsNullOrWhiteSpace($LoadedArchitecture)) {
    return [pscustomobject]@{ Succeeded = $false }
  }
  $matches = @($Index.manifests | Where-Object {
    $_.mediaType -ceq 'application/vnd.oci.image.manifest.v1+json' -and
    $_.platform.os -ceq $LoadedOs -and
    $_.platform.architecture -ceq $LoadedArchitecture -and
    $_.platform.os -cne 'unknown' -and
    $_.platform.architecture -cne 'unknown' -and
    $_.annotations.'vnd.docker.reference.type' -cne 'attestation-manifest' -and
    (Test-Digest ([string]$_.digest))
  })
  if ($matches.Count -ne 1) { return [pscustomobject]@{ Succeeded = $false } }
  return [pscustomobject]@{ Succeeded = $true; ManifestDigest = [string]$matches[0].digest }
}

function Get-BuildRecordInspection([string]$Builder, [string]$RecordRef, [string]$Expected, [string]$ExpectedDockerfile, [object]$LoadedImage) {
  if (-not (Test-BuildxBuilder $Builder) -or -not (Test-BuildRecordReference $RecordRef) -or -not (Test-Revision $Expected) -or [string]::IsNullOrWhiteSpace($ExpectedDockerfile) -or $null -eq $LoadedImage -or -not (Test-Digest $LoadedImage.LoadedImageIdentity) -or [string]::IsNullOrWhiteSpace($LoadedImage.LoadedOs) -or [string]::IsNullOrWhiteSpace($LoadedImage.LoadedArchitecture)) {
    return [pscustomobject]@{ Succeeded = $false }
  }

  function Invoke-BuildxJson([string]$Arguments) {
    $psi = New-TrustedBuildxProcessStartInfo $Arguments
    if ($null -eq $psi) { return $null }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $psi
    if (-not $process.Start()) { return $null }
    $stdout = $process.StandardOutput.ReadToEnd()
    $null = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($stdout)) { return $null }
    try { return $stdout | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
  }

  $record = Invoke-BuildxJson ('history inspect --builder "' + $Builder + '" "' + $RecordRef + '" --format json')
  $provenance = Invoke-BuildxJson ('history inspect attachment --builder "' + $Builder + '" "' + $RecordRef + '" --type "https://slsa.dev/provenance/v1"')
  $index = Invoke-BuildxJson ('history inspect attachment --builder "' + $Builder + '" "' + $RecordRef + '" --type "application/vnd.oci.image.index.v1+json"')
  $manifest = Invoke-BuildxJson ('history inspect attachment --builder "' + $Builder + '" "' + $RecordRef + '" --type "application/vnd.oci.image.manifest.v1+json"')
  if ($null -eq $record -or $null -eq $provenance -or $null -eq $index -or $null -eq $manifest) { return [pscustomobject]@{ Succeeded = $false } }

  $indexAttachments = @($record.Attachments | Where-Object { $_.Type -eq 'application/vnd.oci.image.index.v1+json' })
  $manifestAttachments = @($record.Attachments | Where-Object { $_.Type -eq 'application/vnd.oci.image.manifest.v1+json' })
  if ($indexAttachments.Count -ne 1 -or $manifestAttachments.Count -ne 1 -or -not (Test-Digest $indexAttachments[0].Digest) -or -not (Test-Digest $manifestAttachments[0].Digest)) { return [pscustomobject]@{ Succeeded = $false } }

  $selection = Get-SelectedApplicationManifest $index $LoadedImage.LoadedOs $LoadedImage.LoadedArchitecture
  $configDigest = [string]$manifest.config.digest
  if (-not $selection.Succeeded -or -not (Test-Digest $configDigest) -or $selection.ManifestDigest -cne $manifestAttachments[0].Digest) { return [pscustomobject]@{ Succeeded = $false } }

  $provenanceUri = $provenance.buildDefinition.externalParameters.configSource.uri
  return [pscustomobject]@{
    Succeeded = $true
    IsCompleted = $record.Status -ceq 'completed'
    HasPinnedContext = $record.Context -ceq (Get-CommitPinnedGitContext $Expected)
    HasPinnedProvenanceUri = $provenanceUri -ceq (Get-CommitPinnedProvenanceUri $Expected)
    HasExpectedDockerfile = (($record.Dockerfile -replace '\\', '/') -ceq $ExpectedDockerfile)
    HasIndexManifestChain = $selection.ManifestDigest -ceq $manifestAttachments[0].Digest
    HasManifestConfigChain = Test-Digest $configDigest
    HasLoadedIndexBinding = $LoadedImage.LoadedImageIdentity -ceq $indexAttachments[0].Digest
    LoadedImageIdentity = $LoadedImage.LoadedImageIdentity
    LoadedOs = $LoadedImage.LoadedOs
    LoadedArchitecture = $LoadedImage.LoadedArchitecture
    IndexDigest = [string]$indexAttachments[0].Digest
    ManifestDigest = $selection.ManifestDigest
    ConfigDigest = $configDigest
  }
}

function Test-BuildRecordBinding([object]$Inspection) {
  return $null -ne $Inspection -and $Inspection.Succeeded -and $Inspection.IsCompleted -and $Inspection.HasPinnedContext -and $Inspection.HasPinnedProvenanceUri -and $Inspection.HasExpectedDockerfile -and $Inspection.HasIndexManifestChain -and $Inspection.HasManifestConfigChain -and $Inspection.HasLoadedIndexBinding -and (Test-Digest $Inspection.LoadedImageIdentity) -and (Test-Digest $Inspection.IndexDigest) -and (Test-Digest $Inspection.ManifestDigest) -and (Test-Digest $Inspection.ConfigDigest)
}

function Test-ManifestMetadataConfigBinding([string]$ManifestConfigDigest, [string]$MetadataConfigDigest) {
  return (Test-Digest $ManifestConfigDigest) -and (Test-Digest $MetadataConfigDigest) -and $ManifestConfigDigest -ceq $MetadataConfigDigest
}

function Invoke-TestGit([string]$RepositoryRoot, [string[]]$Arguments) {
  $gitExecutable = Get-TrustedGitExecutable
  if ($null -eq $gitExecutable) { throw 'Trusted Git executable unavailable' }
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $gitExecutable -c core.safecrlf=false -C $RepositoryRoot @Arguments 1>$null 2>$null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) { throw "Synthetic Git command failed: $($Arguments -join ' ')" }
}

function Get-TestGitOutput([string]$RepositoryRoot, [string[]]$Arguments) {
  $gitExecutable = Get-TrustedGitExecutable
  if ($null -eq $gitExecutable) { throw 'Trusted Git executable unavailable' }
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $gitExecutable
  $psi.Arguments = '-C "' + (Get-NormalizedPath $RepositoryRoot).Replace('"', '\"') + '" ' + (($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' ')
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $psi
  if (-not $process.Start()) { throw 'Trusted Git process failed to start' }
  $stdout = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw 'Synthetic Git command failed' }
  return $stdout
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
  $authoritySelectionVariables = @('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','DOCKER_CERT_PATH','DOCKER_TLS_VERIFY','DOCKER_TLS','DOCKER_API_VERSION','BUILDX_CONFIG','BUILDX_BUILDER','BUILDKIT_HOST')
  foreach ($name in @($gitRepositorySelectionVariables + $authoritySelectionVariables)) { $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  $originalPath = [Environment]::GetEnvironmentVariable('PATH', 'Process')
  $passed = $true
  try {
    # Place plausible attacker-named executables first in PATH.  Resolution
    # below must either use an OS-known trusted location or fail closed.
    $attackerDirectory = Join-Path $root 'attacker'
    New-Item -ItemType Directory -Path $attackerDirectory -Force | Out-Null
    $systemExecutable = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::System)) 'cmd.exe'
    $fakeDocker = Join-Path $attackerDirectory 'docker.exe'; $fakeGit = Join-Path $attackerDirectory 'git.exe'
    Copy-Item -LiteralPath $systemExecutable -Destination $fakeDocker -Force
    Copy-Item -LiteralPath $systemExecutable -Destination $fakeGit -Force
    [Environment]::SetEnvironmentVariable('PATH', $attackerDirectory + [IO.Path]::PathSeparator + $originalPath, 'Process')
    foreach ($name in $authoritySelectionVariables) { [Environment]::SetEnvironmentVariable($name, ('attacker-' + $name), 'Process') }
    $trustedDocker = Get-TrustedDockerExecutable; $trustedGit = Get-TrustedGitExecutable; $trustedBuildx = Get-TrustedBuildxExecutable
    $dockerPsi = New-TrustedDockerProcessStartInfo 'version'
    $buildxPsi = New-TrustedBuildxProcessStartInfo 'version'
    # CI generally lacks Docker Desktop itself.  Exercise the isolated child
    # environment directly in that case so the selection invariants are not
    # converted into vacuous availability checks.
    $dockerEnvironmentPsi = if ($null -ne $dockerPsi) { $dockerPsi } else { $psi = [Diagnostics.ProcessStartInfo]::new(); Set-TrustedDockerChildEnvironment $psi; $psi }
    $buildxEnvironmentPsi = if ($null -ne $buildxPsi) { $buildxPsi } else { $psi = [Diagnostics.ProcessStartInfo]::new(); Set-TrustedDockerChildEnvironment $psi -Buildx; $psi }
    $provenanceSource = Get-Content -LiteralPath $PSCommandPath -Raw
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
      @{ Name = 'IMAGE_PROVENANCE_API_WORKER_MISMATCH_BLOCKED'; Passed = -not ((Test-ImageRevision $expected $expected) -and (Test-ImageRevision $stale $expected)) },
      @{ Name = 'PROVENANCE_FAKE_DOCKER_PATH_BLOCKED'; Passed = $null -eq $trustedDocker -or -not [string]::Equals($trustedDocker, $fakeDocker, [StringComparison]::OrdinalIgnoreCase) },
      @{ Name = 'PROVENANCE_FAKE_GIT_PATH_BLOCKED'; Passed = $null -eq $trustedGit -or -not [string]::Equals($trustedGit, $fakeGit, [StringComparison]::OrdinalIgnoreCase) },
      @{ Name = 'PROVENANCE_CALLER_PATH_IGNORED'; Passed = ($null -eq $trustedDocker -or -not [string]::Equals($trustedDocker, $fakeDocker, [StringComparison]::OrdinalIgnoreCase)) -and ($null -eq $trustedGit -or -not [string]::Equals($trustedGit, $fakeGit, [StringComparison]::OrdinalIgnoreCase)) },
      @{ Name = 'PROVENANCE_DOCKER_PATH_PINNED'; Passed = $null -eq $trustedDocker -or ((Test-TrustedExecutableFile $trustedDocker) -and -not [string]::Equals($trustedDocker, $fakeDocker, [StringComparison]::OrdinalIgnoreCase)) },
      @{ Name = 'PROVENANCE_GIT_PATH_PINNED'; Passed = $null -eq $trustedGit -or ((Test-TrustedExecutableFile $trustedGit) -and -not [string]::Equals($trustedGit, $fakeGit, [StringComparison]::OrdinalIgnoreCase)) },
      @{ Name = 'PROVENANCE_PATH_FALLBACK_NO'; Passed = ($null -eq $trustedDocker -or -not [string]::Equals($trustedDocker, $fakeDocker, [StringComparison]::OrdinalIgnoreCase)) -and ($null -eq $trustedGit -or -not [string]::Equals($trustedGit, $fakeGit, [StringComparison]::OrdinalIgnoreCase)) },
      # Hosted Windows workers usually do not install Docker Desktop.  That is
      # an expected fail-closed condition, never an invitation to use PATH or a
      # caller-selected CLI/plugin.  On a Docker Desktop host the same cases
      # additionally inspect the concrete pinned process start information.
      @{ Name = 'TRUSTED_DOCKER_UNAVAILABLE_FAILS_CLOSED'; Passed = $null -ne $dockerPsi -or $null -eq $trustedDocker },
      @{ Name = 'TRUSTED_BUILDX_UNAVAILABLE_FAILS_CLOSED'; Passed = $null -ne $buildxPsi -or $null -eq $trustedBuildx },
      @{ Name = 'CALLER_DOCKER_HOST_IGNORED'; Passed = -not $dockerEnvironmentPsi.EnvironmentVariables.ContainsKey('DOCKER_HOST') },
      @{ Name = 'CALLER_DOCKER_CONTEXT_IGNORED'; Passed = -not $dockerEnvironmentPsi.EnvironmentVariables.ContainsKey('DOCKER_CONTEXT') },
      @{ Name = 'CALLER_DOCKER_CONFIG_IGNORED'; Passed = -not $dockerEnvironmentPsi.EnvironmentVariables.ContainsKey('DOCKER_CONFIG') },
      @{ Name = 'CALLER_DOCKER_CERT_PATH_IGNORED'; Passed = -not $dockerEnvironmentPsi.EnvironmentVariables.ContainsKey('DOCKER_CERT_PATH') },
      @{ Name = 'CALLER_DOCKER_TLS_VERIFY_IGNORED'; Passed = -not $dockerEnvironmentPsi.EnvironmentVariables.ContainsKey('DOCKER_TLS_VERIFY') },
      @{ Name = 'TRUSTED_DOCKER_ENDPOINT_EXPLICIT'; Passed = ($null -ne $dockerPsi -and $dockerPsi.Arguments -match [regex]::Escape($trustedDockerEndpoint)) -or (($provenanceSource -match [regex]::Escape($trustedDockerEndpoint)) -and ($provenanceSource -match "--host")) },
      @{ Name = 'TRUSTED_DOCKER_EXECUTABLE_ABSOLUTE'; Passed = ($null -ne $dockerPsi -and $dockerPsi.FileName -ceq $trustedDocker) -or $provenanceSource -match 'Docker\\Docker\\resources\\bin\\docker\.exe' },
      @{ Name = 'TRUSTED_BUILDX_EXECUTABLE_DIRECT'; Passed = ($null -ne $buildxPsi -and $buildxPsi.FileName -ceq $trustedBuildx -and $buildxPsi.Arguments -notmatch 'buildx') -or $provenanceSource -match 'cli-plugins\\docker-buildx\.exe' },
      @{ Name = 'CALLER_BUILDX_CONFIG_IGNORED'; Passed = $buildxEnvironmentPsi.EnvironmentVariables['BUILDX_CONFIG'] -ceq (Join-Path $trustedDockerConfigRoot 'buildx') },
      @{ Name = 'CALLER_BUILDX_BUILDER_IGNORED'; Passed = -not $buildxEnvironmentPsi.EnvironmentVariables.ContainsKey('BUILDX_BUILDER') },
      @{ Name = 'CALLER_BUILDKIT_HOST_IGNORED'; Passed = -not $buildxEnvironmentPsi.EnvironmentVariables.ContainsKey('BUILDKIT_HOST') },
      @{ Name = 'DOCKER_PLUGIN_DISCOVERY_NOT_AUTHORITY'; Passed = $provenanceSource -notmatch 'docker\.exe buildx' }
    )
    $builderTokens = $null
    $builderParseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'build-file-mode-provenance-candidates.ps1'), [ref]$builderTokens, [ref]$builderParseErrors)
    $cases += @{ Name = 'COMMIT_PINNED_CANDIDATE_BUILDER_SYNTAX_VALID'; Passed = $builderParseErrors.Count -eq 0 }
    $expectedGitContext = "${gitContextRepository}?ref=$expected&checksum=$expected"
    $cases += @{ Name = 'COMMIT_PINNED_GIT_CONTEXT_FORMAT_VALID'; Passed = (Get-CommitPinnedGitContext $expected) -ceq $expectedGitContext }

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

    function New-BuildRecordFixture([hashtable]$Override = @{}) {
      $values = [ordered]@{
        Succeeded = $true; IsCompleted = $true; HasPinnedContext = $true; HasPinnedProvenanceUri = $true; HasExpectedDockerfile = $true
        HasIndexManifestChain = $true; HasManifestConfigChain = $true; HasLoadedIndexBinding = $true
        LoadedImageIdentity = 'sha256:' + ('a' * 64); IndexDigest = 'sha256:' + ('a' * 64)
        ManifestDigest = 'sha256:' + ('b' * 64); ConfigDigest = 'sha256:' + ('c' * 64)
      }
      foreach ($key in $Override.Keys) { $values[$key] = $Override[$key] }
      return [pscustomobject]$values
    }
    $trustedBuildRecord = New-BuildRecordFixture
    $cases += @{ Name = 'VALID_DISTINCT_INDEX_MANIFEST_CONFIG_CHAIN_ACCEPTED'; Passed = (Test-BuildRecordBinding $trustedBuildRecord) -and $trustedBuildRecord.IndexDigest -cne $trustedBuildRecord.ManifestDigest -and $trustedBuildRecord.ManifestDigest -cne $trustedBuildRecord.ConfigDigest -and $trustedBuildRecord.IndexDigest -cne $trustedBuildRecord.ConfigDigest }
    $cases += @{ Name = 'VALID_INDEX_MANIFEST_CONFIG_CHAIN'; Passed = Test-BuildRecordBinding $trustedBuildRecord }
    $cases += @{ Name = 'BUILDX_METADATA_CONFIG_CONFLICT_BLOCKED'; Passed = -not (Test-ManifestMetadataConfigBinding $trustedBuildRecord.ConfigDigest ('sha256:' + ('d' * 64))) }
    $indexMismatch = New-BuildRecordFixture @{ HasLoadedIndexBinding = $false }
    $cases += @{ Name = 'INDEX_MISMATCH_BLOCKED'; Passed = -not (Test-BuildRecordBinding $indexMismatch) }
    $cases += @{ Name = 'MISSING_INDEX_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ IndexDigest = $null })) }
    $cases += @{ Name = 'MALFORMED_INDEX_DIGEST_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ IndexDigest = 'not-a-digest' })) }
    $cases += @{ Name = 'MANIFEST_NOT_IN_INDEX_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ HasIndexManifestChain = $false })) }
    $cases += @{ Name = 'MISSING_MANIFEST_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ ManifestDigest = $null })) }
    $cases += @{ Name = 'MALFORMED_MANIFEST_DIGEST_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ ManifestDigest = 'not-a-digest' })) }
    $cases += @{ Name = 'MISSING_BUILD_RECORD_BLOCKED'; Passed = -not (Test-BuildRecordBinding $null) }
    $cases += @{ Name = 'INCOMPLETE_BUILD_RECORD_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ IsCompleted = $false })) }
    $cases += @{ Name = 'WRONG_PINNED_GIT_CONTEXT_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ HasPinnedContext = $false })) }
    $cases += @{ Name = 'WRONG_PROVENANCE_URI_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ HasPinnedProvenanceUri = $false })) }
    $cases += @{ Name = 'WRONG_DOCKERFILE_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ HasExpectedDockerfile = $false })) }
    $cases += @{ Name = 'MISSING_PROVENANCE_ATTACHMENT_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ HasPinnedProvenanceUri = $false })) }
    $cases += @{ Name = 'MISSING_CONFIG_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ HasManifestConfigChain = $false; ConfigDigest = $null })) }
    $cases += @{ Name = 'MALFORMED_CONFIG_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ ConfigDigest = 'not-a-digest' })) }
    $cases += @{ Name = 'CONFIG_DIGEST_FROM_DIFFERENT_MANIFEST_BLOCKED'; Passed = -not (Test-BuildRecordBinding (New-BuildRecordFixture @{ HasManifestConfigChain = $false })) }
    $cases += @{ Name = 'IID_LOADED_ID_MISMATCH_BLOCKED'; Passed = -not (Test-BuildRecordBinding $indexMismatch) }
    $cases += @{ Name = 'LOADED_ID_BUILDX_INDEX_MISMATCH_BLOCKED'; Passed = -not (Test-BuildRecordBinding $indexMismatch) }
    $cases += @{ Name = 'FORGED_LABEL_UNRELATED_IMAGE_BLOCKED'; Passed = -not (Test-BuildRecordBinding $indexMismatch) }

    $validIndex = [pscustomobject]@{ mediaType = 'application/vnd.oci.image.index.v1+json'; manifests = @(
      [pscustomobject]@{ mediaType = 'application/vnd.oci.image.manifest.v1+json'; digest = ('sha256:' + ('b' * 64)); platform = [pscustomobject]@{ os = 'linux'; architecture = 'amd64' }; annotations = [pscustomobject]@{} },
      [pscustomobject]@{ mediaType = 'application/vnd.oci.image.manifest.v1+json'; digest = ('sha256:' + ('d' * 64)); platform = [pscustomobject]@{ os = 'unknown'; architecture = 'unknown' }; annotations = [pscustomobject]@{ 'vnd.docker.reference.type' = 'attestation-manifest' } }
    ) }
    $cases += @{ Name = 'ATTESTATION_MANIFEST_EXCLUDED'; Passed = (Get-SelectedApplicationManifest $validIndex 'linux' 'amd64').Succeeded }
    $cases += @{ Name = 'NO_PLATFORM_MANIFEST_BLOCKED'; Passed = -not (Get-SelectedApplicationManifest $validIndex 'linux' 'arm64').Succeeded }
    $ambiguousIndex = [pscustomobject]@{ mediaType = $validIndex.mediaType; manifests = @($validIndex.manifests[0], $validIndex.manifests[0]) }
    $cases += @{ Name = 'MULTIPLE_PLATFORM_MANIFESTS_AMBIGUOUS_BLOCKED'; Passed = -not (Get-SelectedApplicationManifest $ambiguousIndex 'linux' 'amd64').Succeeded }
    $cases += @{ Name = 'WRONG_PLATFORM_MANIFEST_BLOCKED'; Passed = -not (Get-SelectedApplicationManifest $validIndex 'windows' 'amd64').Succeeded }

    $fsmonitorHook = Join-Path $primary '.git/fsmonitor-empty.sh'
    Set-Content -LiteralPath $fsmonitorHook -Value "#!/bin/sh`necho 'version 2'`necho 'token'" -Encoding ascii
    Invoke-TestGit $primary @('config','core.fsmonitor','sh .git/fsmonitor-empty.sh')
    $null = Get-TestGitOutput $primary @('status','--porcelain=v1')
    Add-Content -LiteralPath (Join-Path $primary $trackedBuildInput) -Value '// stale fsmonitor change' -Encoding utf8
    $misledStatus = Get-TestGitOutput $primary @('status','--porcelain=v1')
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
    foreach ($name in $originalEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process') }
    [Environment]::SetEnvironmentVariable('PATH', $originalPath, 'Process')
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
$apiLoadedImage = Get-LoadedImageMetadata $ApiImage
$workerLoadedImage = Get-LoadedImageMetadata $WorkerImage
$apiRecord = Get-BuildRecordInspection $BuildxBuilder $ApiBuildRecordRef $ExpectedRevision 'infra/docker/Dockerfile.api' $apiLoadedImage
$workerRecord = Get-BuildRecordInspection $BuildxBuilder $WorkerBuildRecordRef $ExpectedRevision 'infra/docker/Dockerfile.worker' $workerLoadedImage

$apiLabelPassed = Test-ImageRevision $apiRevision $ExpectedRevision
$workerLabelPassed = Test-ImageRevision $workerRevision $ExpectedRevision
$apiRecordPassed = Test-BuildRecordBinding $apiRecord
$workerRecordPassed = Test-BuildRecordBinding $workerRecord

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
