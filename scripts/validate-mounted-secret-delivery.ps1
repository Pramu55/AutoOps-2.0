param(
  [string[]]$Overlay = @('core'),
  [switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'

$contracts = @{
  runtime = @{
    Variable = 'AUTOOPS_FILE_MODE_ENV_FILE'
    FileName = $null
    Consumers = 'api,worker'
  }
  core = @(
    @{ Variable = 'AUTOOPS_SECRET_JWT_ACCESS_FILE'; FileName = 'jwt-access'; Consumers = 'api' },
    @{ Variable = 'AUTOOPS_SECRET_JWT_REFRESH_FILE'; FileName = 'jwt-refresh'; Consumers = 'api' }
  )
  github = @{
    Variable = 'AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE'
    FileName = 'github-actions-token'
    Consumers = 'api'
  }
  jenkins = @{
    Variable = 'AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE'
    FileName = 'jenkins-api-token'
    Consumers = 'api,worker'
  }
}

function Write-Result([string]$Name, [string]$Status, [bool]$Passed) {
  Write-Output "$Name $Status $(if ($Passed) { 'PASS' } else { 'FAIL' })"
}

function Test-WithinPath([string]$Candidate, [string]$Root) {
  $trimCharacters = [char[]]@('\', '/')
  $normalizedCandidate = [IO.Path]::GetFullPath($Candidate).TrimEnd($trimCharacters)
  $normalizedRoot = [IO.Path]::GetFullPath($Root).TrimEnd($trimCharacters)
  if ($normalizedCandidate.Equals($normalizedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  $prefix = $normalizedRoot + [IO.Path]::DirectorySeparatorChar
  return $normalizedCandidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

function Get-SourceMetadata([string]$SourcePath) {
  if ([string]::IsNullOrWhiteSpace($SourcePath) -or -not [IO.Path]::IsPathRooted($SourcePath)) {
    return @{ Exists = $false }
  }
  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    return @{ Exists = $false }
  }

  $normalized = [IO.Path]::GetFullPath($SourcePath)
  $current = $normalized
  $hasReparsePoint = $false
  while ($true) {
    $item = Get-Item -Force -LiteralPath $current
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      $hasReparsePoint = $true
      break
    }
    $parentInfo = [IO.Directory]::GetParent($current)
    if ($null -eq $parentInfo -or $parentInfo.FullName -eq $current) { break }
    $current = $parentInfo.FullName
  }

  $leaf = Get-Item -Force -LiteralPath $normalized
  return @{
    Exists = $true
    IsRegularFile = (-not $leaf.PSIsContainer -and $leaf -is [IO.FileInfo])
    LeafName = $leaf.Name
    CanonicalPath = [IO.Path]::GetFullPath($leaf.FullName)
    HasReparsePoint = $hasReparsePoint
  }
}

function Test-SourceFile([hashtable]$Contract, [string]$RepositoryRoot, [hashtable]$MetadataOverride) {
  $value = [Environment]::GetEnvironmentVariable($Contract.Variable)
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Result $Contract.Variable 'ABSENT' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  Write-Result $Contract.Variable 'PRESENT' $true

  $metadata = if ($null -ne $MetadataOverride) { $MetadataOverride } else { Get-SourceMetadata $value }
  if (-not $metadata.Exists) {
    Write-Result $Contract.Variable 'INVALID_TYPE' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  if ($metadata.HasReparsePoint) {
    Write-Result $Contract.Variable 'LINK_PATH_REJECTED' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  if (-not $metadata.IsRegularFile) {
    Write-Result $Contract.Variable 'INVALID_TYPE' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  if ($null -ne $Contract.FileName -and $metadata.LeafName -ne $Contract.FileName) {
    Write-Result $Contract.Variable 'INVALID_TYPE' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }

  # Link-bearing paths were rejected above. The canonical target is the only
  # path used for repository containment and Git-tracking checks.
  $canonicalPath = [IO.Path]::GetFullPath($metadata.CanonicalPath)
  if (Test-WithinPath $canonicalPath $RepositoryRoot) {
    $trimCharacters = [char[]]@('\', '/')
    $relative = $canonicalPath.Substring(([IO.Path]::GetFullPath($RepositoryRoot).TrimEnd($trimCharacters)).Length).TrimStart($trimCharacters)
    $null = & git -C $RepositoryRoot ls-files --error-unmatch -- $relative 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Result $Contract.Variable 'TRACKED' $false
    } else {
      Write-Result $Contract.Variable 'REPOSITORY_PATH' $false
    }
    return @{ Passed = $false; CanonicalPath = $canonicalPath }
  }

  Write-Result $Contract.Variable 'METADATA_VALID' $true
  return @{ Passed = $true; CanonicalPath = $canonicalPath }
}

function Get-NormalizedOverlays([string[]]$Requested) {
  $known = @('core', 'github', 'jenkins')
  $selected = New-Object System.Collections.Generic.List[string]
  $valid = $true
  foreach ($entry in $Requested) {
    foreach ($part in ($entry -split ',')) {
      $name = $part.Trim().ToLowerInvariant()
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      if ($known -notcontains $name) {
        Write-Result 'OVERLAY' 'UNKNOWN' $false
        $valid = $false
        continue
      }
      if ($selected.Contains($name)) {
        Write-Result 'OVERLAY' 'DUPLICATE' $false
        $valid = $false
        continue
      }
      $selected.Add($name)
    }
  }
  if (-not $selected.Contains('core')) {
    $selected.Insert(0, 'core')
    Write-Result 'OVERLAY_CORE' 'IMPLIED' $true
  }
  if ($selected.Count -eq 0) {
    $selected.Add('core')
    Write-Result 'OVERLAY_CORE' 'IMPLIED' $true
  }
  return @{ Valid = $valid; Selected = @($selected) }
}

function Get-EnabledFlag([string]$Variable) {
  $value = [Environment]::GetEnvironmentVariable($Variable)
  if ([string]::IsNullOrWhiteSpace($value) -or $value -eq 'false' -or $value -eq '0') {
    return @{ Valid = $true; Enabled = $false }
  }
  if ($value -eq 'true' -or $value -eq '1') {
    return @{ Valid = $true; Enabled = $true }
  }
  return @{ Valid = $false; Enabled = $false }
}

function Test-Overlay([string[]]$RequestedOverlay, [hashtable]$MetadataOverrides) {
  $repositoryRoot = (git rev-parse --show-toplevel).Trim()
  $normalization = Get-NormalizedOverlays $RequestedOverlay
  if (-not $normalization.Valid) { return $false }
  $selected = $normalization.Selected
  $github = Get-EnabledFlag 'GITHUB_ACTIONS_ENABLED'
  $jenkins = Get-EnabledFlag 'JENKINS_INTEGRATION_ENABLED'
  $allPassed = $github.Valid -and $jenkins.Valid
  if (-not $github.Valid) { Write-Result 'GITHUB_ACTIONS_ENABLED' 'INVALID' $false }
  if (-not $jenkins.Valid) { Write-Result 'JENKINS_INTEGRATION_ENABLED' 'INVALID' $false }

  foreach ($integration in @(
      @{ Name = 'GITHUB_ACTIONS_ENABLED'; Overlay = 'github'; State = $github },
      @{ Name = 'JENKINS_INTEGRATION_ENABLED'; Overlay = 'jenkins'; State = $jenkins }
    )) {
    $hasOverlay = $selected -contains $integration.Overlay
    if ($integration.State.Enabled -and -not $hasOverlay) {
      Write-Result $integration.Name 'OVERLAY_REQUIRED' $false
      $allPassed = $false
    } elseif (-not $integration.State.Enabled -and $hasOverlay) {
      # Optional credential overlays are rejected while disabled so they cannot
      # create needless credential exposure.
      Write-Result $integration.Name 'OVERLAY_CONTRADICTS_DISABLED' $false
      $allPassed = $false
    } else {
      Write-Result $integration.Name 'OVERLAY_ALIGNED' $true
    }
  }
  if (-not $allPassed) { return $false }

  $required = @($contracts.runtime) + @($contracts.core)
  if ($selected -contains 'github') { $required += @($contracts.github) }
  if ($selected -contains 'jenkins') { $required += @($contracts.jenkins) }
  $seen = @{}
  foreach ($contract in $required) {
    $override = $null
    if ($null -ne $MetadataOverrides -and $MetadataOverrides.ContainsKey($contract.Variable)) {
      $override = $MetadataOverrides[$contract.Variable]
    }
    $result = Test-SourceFile $contract $repositoryRoot $override
    if (-not $result.Passed) { $allPassed = $false; continue }
    $duplicateKey = $result.CanonicalPath.ToLowerInvariant()
    if ($seen.ContainsKey($duplicateKey)) {
      Write-Result $contract.Variable 'DUPLICATE' $false
      $allPassed = $false
    } else {
      $seen[$duplicateKey] = $true
    }
  }
  return $allPassed
}

function Invoke-SelfTest {
  $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "autoops-mounted-secret-test-$([guid]::NewGuid())"
  $variables = @(
    'AUTOOPS_FILE_MODE_ENV_FILE', 'AUTOOPS_SECRET_JWT_ACCESS_FILE',
    'AUTOOPS_SECRET_JWT_REFRESH_FILE', 'AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE',
    'AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE', 'GITHUB_ACTIONS_ENABLED',
    'JENKINS_INTEGRATION_ENABLED'
  )
  $original = @{}
  foreach ($variable in $variables) { $original[$variable] = [Environment]::GetEnvironmentVariable($variable) }
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  try {
    foreach ($file in @('file-mode.env', 'jwt-access', 'jwt-refresh', 'github-actions-token', 'jenkins-api-token')) {
      New-Item -ItemType File -Path (Join-Path $temporaryRoot $file) | Out-Null
    }
    $env:AUTOOPS_FILE_MODE_ENV_FILE = Join-Path $temporaryRoot 'file-mode.env'
    $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'
    $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $temporaryRoot 'jwt-refresh'
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
    $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = Join-Path $temporaryRoot 'jenkins-api-token'

    $passed = $true
    $env:GITHUB_ACTIONS_ENABLED = 'false'; $env:JENKINS_INTEGRATION_ENABLED = 'false'
    if (-not (Test-Overlay @('core') $null)) { $passed = $false }
    $env:GITHUB_ACTIONS_ENABLED = 'true'
    if (Test-Overlay @('core') $null) { $passed = $false }
    if (-not (Test-Overlay @('github') $null)) { $passed = $false }
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = $null
    if (Test-Overlay @('github') $null) { $passed = $false }
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
    $env:GITHUB_ACTIONS_ENABLED = 'false'
    if (Test-Overlay @('github') $null) { $passed = $false }
    $env:JENKINS_INTEGRATION_ENABLED = 'true'
    if (Test-Overlay @('core') $null) { $passed = $false }
    if (-not (Test-Overlay @('jenkins') $null)) { $passed = $false }
    $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = $null
    if (Test-Overlay @('jenkins') $null) { $passed = $false }
    $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = Join-Path $temporaryRoot 'jenkins-api-token'
    $env:GITHUB_ACTIONS_ENABLED = 'true'
    if (-not (Test-Overlay @('core', 'github', 'jenkins') $null)) { $passed = $false }
    if (Test-Overlay @('core', 'github', 'github', 'jenkins') $null) { $passed = $false }
    if (Test-Overlay @('unknown') $null) { $passed = $false }
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = $env:AUTOOPS_SECRET_JWT_ACCESS_FILE
    if (Test-Overlay @('core', 'github', 'jenkins') $null) { $passed = $false }
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
    $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $null
    if (Test-Overlay @('core', 'github', 'jenkins') $null) { $passed = $false }
    $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'

    $linkOverride = @{ Exists = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path $temporaryRoot 'jwt-access'); HasReparsePoint = $true }
    if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $linkOverride).Passed) { $passed = $false }
    $repositoryOverride = @{ Exists = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path ((git rev-parse --show-toplevel).Trim()) 'package.json'); HasReparsePoint = $false }
    if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $repositoryOverride).Passed) { $passed = $false }

    Write-Result 'SELF_TEST' 'STRUCTURAL' $passed
    return $passed
  } finally {
    foreach ($variable in $variables) { [Environment]::SetEnvironmentVariable($variable, $original[$variable], 'Process') }
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($RunSelfTest) {
  if (-not (Invoke-SelfTest)) { exit 1 }
  exit 0
}

if (-not (Test-Overlay $Overlay $null)) { exit 1 }
