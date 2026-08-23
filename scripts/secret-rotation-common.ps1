Set-StrictMode -Version Latest

$script:RotationModuleRoot = $PSScriptRoot

# Shared, non-secret primitives for M01.4 rotation planning, acceptance, and
# recovery.  This file intentionally contains no Compose mutation command.

$script:RotationSchemaVersion = 1
$script:RotationGenerationRequiredFiles = @('.published', 'github-actions-token', 'jwt-access', 'jwt-refresh', 'runtime.env', 'sensitive.env')
$script:RotationProviderKeys = @(
  'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS',
  'PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS',
  'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS'
)
$script:RotationFlagKeys = @('GITHUB_ACTIONS_ENABLED', 'JENKINS_INTEGRATION_ENABLED')
$script:RotationRequiredOverlays = @('core', 'sensitive-env', 'github')
$script:RotationRequiredGates = @('mounted-secret-delivery', 'provider-semantic-equivalence', 'image-provenance', 'runtime-acceptance')
$script:RotationHealthEndpoints = @('/health', '/ready', '/healthz', '/readyz')
$script:RotationApplicationSecretTargets = @('/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh', '/run/secrets/autoops/github-actions-token', '/run/secrets/autoops/jenkins-api-token')
$script:RotationRuntimeServices = [ordered]@{ api = 'autoops-api'; worker = 'autoops-worker' }
# This is the complete base docker-compose.yml topology.  The OPA overlay is
# not part of the mandatory base deployment contract and is therefore not a
# silently optional preservation target for this M01.4 operation.
$script:RotationNonTargetContainers = @('autoops-postgres','autoops-redis','autoops-web','autoops-nginx','autoops-prometheus','autoops-grafana')

function Stop-Rotation([string]$Code) {
  throw [System.InvalidOperationException]::new($Code)
}

# Windows PowerShell 5.1 uses .NET Framework, where ProcessStartInfo has no
# ArgumentList property.  Build one Windows command-line argument string for a
# direct executable invocation; no shell is involved.
function ConvertTo-RotationProcessArgument([string]$Value) {
  if ($null -eq $Value) { Stop-Rotation 'PROCESS_ARGUMENT_INVALID' }
  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
  $builder = [Text.StringBuilder]::new(); $null = $builder.Append('"'); $slashes = 0
  foreach ($character in $Value.ToCharArray()) {
    # PowerShell single-quoted strings do not use C-style backslash escaping.
    # Compare the character directly so trailing separators are doubled before
    # the closing quote under the Windows CRT argument grammar.
    if ($character -eq [char]92) { $slashes++; continue }
    if ($character -eq '"') { $null = $builder.Append([string]::new([char]92, (($slashes * 2) + 1))); $null = $builder.Append('"'); $slashes = 0; continue }
    if ($slashes -gt 0) { $null = $builder.Append([string]::new([char]92, $slashes)); $slashes = 0 }
    $null = $builder.Append($character)
  }
  if ($slashes -gt 0) { $null = $builder.Append([string]::new([char]92, ($slashes * 2))) }
  $null = $builder.Append('"'); return $builder.ToString()
}

function Start-RotationProcess([string]$FileName, [string[]]$Arguments, [string]$FailureCode, [hashtable]$Environment = @{}, [switch]$ClearInheritedEnvironment) {
  if ([string]::IsNullOrWhiteSpace($FileName)) { Stop-Rotation $FailureCode }
  $psi = [Diagnostics.ProcessStartInfo]::new(); $psi.FileName = $FileName; $psi.Arguments = (($Arguments | ForEach-Object { ConvertTo-RotationProcessArgument $_ }) -join ' ')
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  if ($ClearInheritedEnvironment) { $psi.EnvironmentVariables.Clear() }
  foreach ($entry in $Environment.GetEnumerator()) { $psi.EnvironmentVariables[$entry.Key] = [string]$entry.Value }
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $psi
  if (-not $process.Start()) { Stop-Rotation $FailureCode }
  return $process
}

function Get-RotationWindowsSystemExecutable([string]$Name) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or $Name -notmatch '^[A-Za-z0-9.-]+\.exe$') { Stop-Rotation 'TRUSTED_EXECUTABLE_UNAVAILABLE' }
  # Use the OS known-folder API rather than an inherited WINDIR value.
  $systemDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::System)
  if ([string]::IsNullOrWhiteSpace($systemDirectory)) { Stop-Rotation 'TRUSTED_EXECUTABLE_UNAVAILABLE' }
  $path = Join-Path $systemDirectory $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-Rotation 'TRUSTED_EXECUTABLE_UNAVAILABLE' }
  return Get-RotationFullPath $path 'TRUSTED_EXECUTABLE_UNAVAILABLE'
}

function Get-RotationDockerExecutable() {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Stop-Rotation 'TRUSTED_DOCKER_UNAVAILABLE' }
  # The maintained Windows Docker Desktop CLI location comes from an OS
  # known-folder API; PATH and caller-provided executable names are not trust
  # inputs to the runtime acceptance boundary.
  $programFiles = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
  if ([string]::IsNullOrWhiteSpace($programFiles)) { Stop-Rotation 'TRUSTED_DOCKER_UNAVAILABLE' }
  $path = Join-Path $programFiles 'Docker\Docker\resources\bin\docker.exe'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-Rotation 'TRUSTED_DOCKER_UNAVAILABLE' }
  Assert-RotationNoReparse $path 'TRUSTED_DOCKER_UNAVAILABLE'
  return Get-RotationFullPath $path 'TRUSTED_DOCKER_UNAVAILABLE'
}

$script:RotationDockerEndpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$script:RotationAuthorityDockerConfig = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)) 'AutoOps\rotation-authority\docker-cli'

function Get-RotationAuthorityChildEnvironment {
  $systemDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::System)
  if ([string]::IsNullOrWhiteSpace($systemDirectory)) { Stop-Rotation 'TRUSTED_EXECUTABLE_UNAVAILABLE' }
  $windowsDirectory = Split-Path -Parent $systemDirectory
  return @{
    SystemRoot = $windowsDirectory
    WINDIR = $windowsDirectory
    ComSpec = (Join-Path $systemDirectory 'cmd.exe')
    TEMP = [IO.Path]::GetTempPath()
    TMP = [IO.Path]::GetTempPath()
  }
}

function Start-RotationTrustedDockerProcess([string[]]$Arguments, [string]$FailureCode) {
  # Every security-authoritative Docker command binds the maintained Docker
  # Desktop Linux endpoint and an authority-owned CLI config. The child starts
  # from a minimal environment, so caller DOCKER_*/BUILDX_* selectors cannot
  # redirect endpoint, context, TLS, configuration, or plugin state.
  $fullArguments = @('--host', $script:RotationDockerEndpoint, '--config', $script:RotationAuthorityDockerConfig) + $Arguments
  return Start-RotationProcess (Get-RotationDockerExecutable) $fullArguments $FailureCode (Get-RotationAuthorityChildEnvironment) -ClearInheritedEnvironment
}

function Test-RotationGenerationId([string]$Value) {
  return -not [string]::IsNullOrWhiteSpace($Value) -and $Value -cmatch '^[a-f0-9]{32}$'
}

function Test-RotationSha256([string]$Value) {
  return -not [string]::IsNullOrWhiteSpace($Value) -and $Value -cmatch '^sha256:[a-f0-9]{64}$'
}

function Test-RotationRevision([string]$Value) {
  return -not [string]::IsNullOrWhiteSpace($Value) -and $Value -cmatch '^[a-f0-9]{40}$'
}

function Get-RotationPathComparison() {
  if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    return [System.StringComparison]::OrdinalIgnoreCase
  }
  return [System.StringComparison]::Ordinal
}

function Get-RotationFullPath([string]$Path, [string]$FailureCode) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathRooted($Path)) { Stop-Rotation $FailureCode }
  try { return [IO.Path]::GetFullPath($Path) } catch { Stop-Rotation $FailureCode }
}

function Test-RotationPathInside([string]$Path, [string]$Root) {
  $fullPath = Get-RotationFullPath $Path 'ROTATION_PATH_INVALID'
  $fullRoot = Get-RotationFullPath $Root 'ROTATION_ROOT_INVALID'
  $comparison = Get-RotationPathComparison
  $trimmedRoot = $fullRoot.TrimEnd([char[]]@('\', '/'))
  return $fullPath.StartsWith($trimmedRoot + [IO.Path]::DirectorySeparatorChar, $comparison)
}

function Test-RotationPathOverlap([string]$Left, [string]$Right) {
  $fullLeft = Get-RotationFullPath $Left 'ROTATION_PATH_INVALID'
  $fullRight = Get-RotationFullPath $Right 'ROTATION_ROOT_INVALID'
  $comparison = Get-RotationPathComparison
  return [string]::Equals($fullLeft, $fullRight, $comparison) -or (Test-RotationPathInside $fullLeft $fullRight) -or (Test-RotationPathInside $fullRight $fullLeft)
}

function ConvertTo-RotationContainerPath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not $Path.StartsWith('/') -or $Path.Contains('\')) { Stop-Rotation 'MOUNT_DESTINATION_INVALID' }
  $segments = @($Path.Split('/') | Where-Object { $_.Length -gt 0 })
  if (@($segments | Where-Object { $_ -in @('.', '..') }).Count -ne 0) { Stop-Rotation 'MOUNT_DESTINATION_INVALID' }
  return '/' + ($segments -join '/')
}

function Test-RotationContainerPathOverlap([string]$Left, [string]$Right) {
  $canonicalLeft = ConvertTo-RotationContainerPath $Left
  $canonicalRight = ConvertTo-RotationContainerPath $Right
  return $canonicalLeft -ceq $canonicalRight -or $canonicalLeft.StartsWith($canonicalRight + '/') -or $canonicalRight.StartsWith($canonicalLeft + '/')
}

function Assert-RotationPlanDirectorySecurity([string]$Path) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Stop-Rotation 'ROTATION_PLAN_PERMISSION_MODEL_UNSUPPORTED' }
  try {
    $acl = [IO.Directory]::GetAccessControl($Path)
    if (-not $acl.AreAccessRulesProtected) { Stop-Rotation 'ROTATION_PLAN_PERMISSIONS_UNSAFE' }
    $operatorSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $approved = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($sid in @($operatorSid, 'S-1-5-18', 'S-1-5-32-544')) { $null = $approved.Add($sid) }
    $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier])
    if ($null -eq $owner -or -not $approved.Contains($owner.Value)) { Stop-Rotation 'ROTATION_PLAN_PERMISSIONS_UNSAFE' }
    $operatorAllowed = $false
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
      $sid = $rule.IdentityReference.Value
      if ($rule.AccessControlType -eq 'Allow' -and -not $approved.Contains($sid)) { Stop-Rotation 'ROTATION_PLAN_PERMISSIONS_UNSAFE' }
      if ($sid -eq $operatorSid -and $rule.AccessControlType -eq 'Allow' -and (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne 0)) { $operatorAllowed = $true }
    }
    if (-not $operatorAllowed) { Stop-Rotation 'ROTATION_PLAN_PERMISSIONS_UNSAFE' }
  } catch {
    if ($_.Exception.Message -match '^ROTATION_PLAN_') { throw }
    Stop-Rotation 'ROTATION_PLAN_PERMISSIONS_UNSAFE'
  }
}

function Set-RotationOperationDirectorySecurity([string]$Path) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Stop-Rotation 'ROTATION_OPERATION_PERMISSION_MODEL_UNSUPPORTED' }
  try {
    $acl = [IO.Directory]::GetAccessControl($Path)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))) { $null = $acl.RemoveAccessRuleSpecific($rule) }
    $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    foreach ($sidText in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')) {
      $sid = [Security.Principal.SecurityIdentifier]::new($sidText)
      $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
      $acl.AddAccessRule($rule)
    }
    [IO.Directory]::SetAccessControl($Path, $acl)
  } catch { Stop-Rotation 'ROTATION_OPERATION_PERMISSIONS_UNSAFE' }
}

function Assert-RotationOperationDirectorySecurity([string]$Path) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Stop-Rotation 'ROTATION_OPERATION_PERMISSION_MODEL_UNSUPPORTED' }
  try {
    $acl = [IO.Directory]::GetAccessControl($Path)
    if (-not $acl.AreAccessRulesProtected) { Stop-Rotation 'ROTATION_OPERATION_PERMISSIONS_UNSAFE' }
    $operatorSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $approved = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($sid in @($operatorSid, 'S-1-5-18', 'S-1-5-32-544')) { $null = $approved.Add($sid) }
    $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier])
    if ($null -eq $owner -or -not $approved.Contains($owner.Value)) { Stop-Rotation 'ROTATION_OPERATION_PERMISSIONS_UNSAFE' }
    $operatorAllowed = $false
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
      $sid = $rule.IdentityReference.Value
      if ($rule.AccessControlType -eq 'Allow' -and -not $approved.Contains($sid)) { Stop-Rotation 'ROTATION_OPERATION_PERMISSIONS_UNSAFE' }
      if ($sid -eq $operatorSid -and $rule.AccessControlType -eq 'Allow' -and (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne 0)) { $operatorAllowed = $true }
    }
    if (-not $operatorAllowed) { Stop-Rotation 'ROTATION_OPERATION_PERMISSIONS_UNSAFE' }
  } catch {
    if ($_.Exception.Message -match '^ROTATION_OPERATION_') { throw }
    Stop-Rotation 'ROTATION_OPERATION_PERMISSIONS_UNSAFE'
  }
}

function Assert-RotationNoReparse([string]$Path, [string]$FailureCode) {
  $full = Get-RotationFullPath $Path $FailureCode
  $current = $full
  while ($true) {
    if (-not (Test-Path -LiteralPath $current)) { Stop-Rotation $FailureCode }
    try {
      $item = Get-Item -Force -LiteralPath $current -ErrorAction Stop
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Stop-Rotation $FailureCode }
    } catch { Stop-Rotation $FailureCode }
    $parent = [IO.Directory]::GetParent($current)
    if ($null -eq $parent -or $parent.FullName -eq $current) { break }
    $current = $parent.FullName
  }
}

function Get-RotationGenerationPath([string]$TargetRoot, [string]$GenerationId) {
  if (-not (Test-RotationGenerationId $GenerationId)) { Stop-Rotation 'GENERATION_ID_INVALID' }
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  $setsRoot = Join-Path $root 'sets'
  $generationPath = Join-Path $setsRoot $GenerationId
  if (-not (Test-RotationPathInside $generationPath $setsRoot)) { Stop-Rotation 'GENERATION_PATH_ESCAPE' }
  return $generationPath
}

function Test-RotationGenerationSet([string]$TargetRoot, [string]$GenerationId) {
  $generationPath = Get-RotationGenerationPath $TargetRoot $GenerationId
  $stagingPath = Join-Path (Split-Path -Parent $generationPath) ('.' + $GenerationId + '.staging')
  if (-not (Test-Path -LiteralPath $generationPath -PathType Container)) { Stop-Rotation 'GENERATION_SET_MISSING' }
  if (Test-Path -LiteralPath $stagingPath) { Stop-Rotation 'GENERATION_STAGING_PRESENT' }
  Assert-RotationNoReparse $generationPath 'GENERATION_REPARSE_PATH'
  $items = @(Get-ChildItem -Force -LiteralPath $generationPath -ErrorAction Stop)
  $names = @($items | ForEach-Object { $_.Name } | Sort-Object)
  $expected = @($script:RotationGenerationRequiredFiles | Sort-Object)
  if (($names -join [char]0) -cne ($expected -join [char]0)) { Stop-Rotation 'GENERATION_FILE_SET_INVALID' }
  foreach ($item in $items) {
    if ($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { Stop-Rotation 'GENERATION_FILE_METADATA_INVALID' }
  }
  return $generationPath
}

function ConvertFrom-RotationRuntimeEnvValue([string]$RawValue, [bool]$IsFlag) {
  if ($null -eq $RawValue -or $RawValue.IndexOfAny([char[]]@(0, 13, 10)) -ge 0) { Stop-Rotation 'RUNTIME_ENV_VALUE_MALFORMED' }
  if ($IsFlag) {
    if ($RawValue -cne 'true' -and $RawValue -cne 'false') { Stop-Rotation 'RUNTIME_ENV_FLAG_MALFORMED' }
    return $RawValue
  }
  if ($RawValue.StartsWith("'")) {
    if ($RawValue.Length -lt 2 -or -not $RawValue.EndsWith("'")) { Stop-Rotation 'RUNTIME_ENV_QUOTE_MALFORMED' }
    $value = $RawValue.Substring(1, $RawValue.Length - 2)
    # The maintained serializer uses literal single quotes and rejects both
    # characters that would require a Compose escape grammar.
    if ($value.Contains("'") -or $value.Contains('\')) { Stop-Rotation 'RUNTIME_ENV_QUOTE_MALFORMED' }
    return $value
  }
  # Provider policy values are emitted by the maintained serializer in literal
  # single quotes. Accepting an alternate unquoted spelling would create a
  # second parser contract and make preflight permissive by accident.
  Stop-Rotation 'RUNTIME_ENV_VALUE_MALFORMED'
}

function Get-RotationRuntimeConfiguration([string]$RuntimeEnvPath) {
  if (-not (Test-Path -LiteralPath $RuntimeEnvPath -PathType Leaf)) { Stop-Rotation 'RUNTIME_ENV_MISSING' }
  Assert-RotationNoReparse $RuntimeEnvPath 'RUNTIME_ENV_REPARSE_PATH'
  $allowed = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($key in @($script:RotationProviderKeys + $script:RotationFlagKeys)) { $null = $allowed.Add($key) }
  $raw = @{}
  foreach ($line in [IO.File]::ReadAllLines($RuntimeEnvPath)) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) { continue }
    $match = [regex]::Match($line, '^(?<key>[A-Z][A-Z0-9_]*)=(?<value>.*)$')
    if (-not $match.Success) { continue }
    $key = $match.Groups['key'].Value
    if (-not $allowed.Contains($key)) { continue }
    if ($raw.ContainsKey($key)) { Stop-Rotation 'RUNTIME_ENV_DUPLICATE_APPROVED_KEY' }
    $raw[$key] = ConvertFrom-RotationRuntimeEnvValue $match.Groups['value'].Value ($script:RotationFlagKeys -contains $key)
  }
  $result = [ordered]@{}
  foreach ($key in $script:RotationProviderKeys) {
    if ($raw.ContainsKey($key)) {
      $value = [string]$raw[$key]
      $result[$key] = [pscustomobject]@{ State = if ($value.Length -eq 0) { 'EMPTY' } else { 'NONEMPTY' }; Value = $value }
    } else {
      $result[$key] = [pscustomobject]@{ State = 'ABSENT'; Value = $null }
    }
  }
  foreach ($key in $script:RotationFlagKeys) {
    $result[$key] = if ($raw.ContainsKey($key)) { [string]$raw[$key] } else { $null }
  }
  return [pscustomobject]$result
}

function Test-RotationNullableOrdinal($Left, $Right) {
  if ($null -eq $Left -or $null -eq $Right) { return ($null -eq $Left -and $null -eq $Right) }
  return [string]::Equals([string]$Left, [string]$Right, [System.StringComparison]::Ordinal)
}

function Test-RotationProviderSemanticEquivalence($Baseline, $Candidate) {
  foreach ($key in @('PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS', 'PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS')) {
    if (-not (Test-RotationNullableOrdinal $Baseline.$key.Value $Candidate.$key.Value)) { return $false }
  }
  $baselineIds = $Baseline.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS
  $candidateIds = $Candidate.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS
  if (Test-RotationNullableOrdinal $baselineIds.Value $candidateIds.Value) { return $true }
  return $baselineIds.State -eq 'EMPTY' -and $candidateIds.State -eq 'ABSENT'
}

function Test-RotationEnablementContract($Configuration, [string[]]$Overlays) {
  $overlaySet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($overlay in $Overlays) { $null = $overlaySet.Add($overlay) }
  if (-not $overlaySet.SetEquals([string[]]$script:RotationRequiredOverlays)) { return $false }
  return $Configuration.GITHUB_ACTIONS_ENABLED -ceq 'true' -and $Configuration.JENKINS_INTEGRATION_ENABLED -ceq 'false'
}

function New-RotationPlanObject(
  [string]$OperationId,
  [string]$CandidateGenerationId,
  [string]$CurrentGoodGenerationId,
  [string]$PreviousGoodGenerationId,
  [string]$RepositoryRevision,
  [string]$ApiImageId,
  [string]$WorkerImageId,
  [string[]]$Overlays,
  [hashtable]$RollbackContract
) {
  foreach ($id in @($OperationId, $CandidateGenerationId, $CurrentGoodGenerationId)) { if (-not (Test-RotationGenerationId $id)) { Stop-Rotation 'PLAN_GENERATION_ID_INVALID' } }
  if (-not [string]::IsNullOrWhiteSpace($PreviousGoodGenerationId) -and -not (Test-RotationGenerationId $PreviousGoodGenerationId)) { Stop-Rotation 'PLAN_GENERATION_ID_INVALID' }
  if ($CandidateGenerationId -ceq $CurrentGoodGenerationId -or $CandidateGenerationId -ceq $PreviousGoodGenerationId) { Stop-Rotation 'PLAN_GENERATION_REUSE' }
  if (-not (Test-RotationRevision $RepositoryRevision) -or -not (Test-RotationSha256 $ApiImageId) -or -not (Test-RotationSha256 $WorkerImageId)) { Stop-Rotation 'PLAN_IDENTITY_INVALID' }
  if ($ApiImageId -ceq $WorkerImageId) { Stop-Rotation 'PLAN_IMAGE_IDENTITY_INVALID' }
  if ($null -eq $RollbackContract -or -not (Test-RotationGenerationId $RollbackContract.TargetGenerationId) -or $RollbackContract.TargetGenerationId -cne $CurrentGoodGenerationId -or -not (Test-RotationSha256 $RollbackContract.ApiImageId) -or -not (Test-RotationSha256 $RollbackContract.WorkerImageId) -or $RollbackContract.ExpectedRuntimeMode -ne 'file' -or @($RollbackContract.ExpectedHealthEndpoints).Count -ne 4 -or $null -eq $RollbackContract.NonTargetContainerIds -or $null -eq $RollbackContract.VolumeInventory) { Stop-Rotation 'ROLLBACK_CONTRACT_INVALID' }
  return [ordered]@{
    schemaVersion = $script:RotationSchemaVersion
    operationId = $OperationId
    status = 'PREPARED'
    createdAtUtc = [DateTime]::UtcNow.ToString('o')
    candidateGenerationId = $CandidateGenerationId
    currentGoodGenerationId = $CurrentGoodGenerationId
    previousGoodGenerationId = $PreviousGoodGenerationId
    repositoryRevision = $RepositoryRevision
    apiImageId = $ApiImageId
    workerImageId = $WorkerImageId
    requiredOverlays = @($Overlays)
    requiredGates = @('mounted-secret-delivery', 'provider-semantic-equivalence', 'image-provenance', 'runtime-acceptance')
    activationAttemptLimit = 1
    rollbackAttemptLimit = 1
    activationAttempts = 0
    rollbackAttempts = 0
    rollback = $RollbackContract
    audit = @([ordered]@{ timestampUtc = [DateTime]::UtcNow.ToString('o'); event = 'PLAN_PREPARED'; result = 'PASS' })
  }
}

function Write-RotationPlanAtomically([string]$TargetRoot, $Plan, [switch]$AllowSyntheticTestPermissions) {
  throw [System.InvalidOperationException]::new('ROTATION_AUTHORITY_REQUIRED')
  # Legacy local writer retained below only as unreachable reference for the
  # test-local fixture override. Canonical plans are authority-service owned.
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  $planRoot = if ($AllowSyntheticTestPermissions) { Join-Path $root 'rotation-plans' } else { Ensure-RotationPlanRoot $TargetRoot }
  if (-not (Test-Path -LiteralPath $planRoot -PathType Container)) { Stop-Rotation 'ROTATION_PLAN_ROOT_MISSING' }
  Assert-RotationNoReparse $planRoot 'ROTATION_PLAN_REPARSE_PATH'
  $path = Join-Path $planRoot ($Plan.operationId + '.json')
  if (-not (Test-RotationPathInside $path $planRoot) -or (Test-Path -LiteralPath $path)) { Stop-Rotation 'ROTATION_PLAN_EXISTS_OR_ESCAPES' }
  $temporary = Join-Path $planRoot ('.' + $Plan.operationId + '.tmp')
  if (Test-Path -LiteralPath $temporary) { Stop-Rotation 'ROTATION_PLAN_TEMPORARY_EXISTS' }
  try {
    $json = $Plan | ConvertTo-Json -Depth 8
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
    $stream = [IO.FileStream]::new($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    # File.Move rejects an existing destination, so a concurrent caller cannot
    # overwrite an already-created operation plan.
    [IO.File]::Move($temporary, $path)
  } catch {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
    Stop-Rotation 'ROTATION_PLAN_WRITE_FAILED'
  }
  return $path
}

function Test-RotationAttemptBudget($Plan) {
  return $Plan.activationAttemptLimit -eq 1 -and $Plan.rollbackAttemptLimit -eq 1 -and
    $Plan.activationAttempts -ge 0 -and $Plan.activationAttempts -le 1 -and
    $Plan.rollbackAttempts -ge 0 -and $Plan.rollbackAttempts -le 1
}

function Get-RotationRecoveryClassification($Plan, $Observation) {
  if (-not (Test-RotationAttemptBudget $Plan)) { return 'MANUAL_INTERVENTION_REQUIRED' }
  switch ($Plan.status) {
    'ACTIVE' { return 'NO_ACTION_REQUIRED' }
    'PREPARED' { return 'SAFE_TO_RESUME_PREFLIGHT' }
    'VALIDATED' { return 'SAFE_TO_RESUME_PREFLIGHT' }
    'ACTIVATION_CANDIDATE' {
      if ($Plan.activationAttempts -eq 0) { return 'SAFE_TO_RESUME_PREFLIGHT' }
      if ($Observation.ApiCandidate -and $Observation.WorkerCandidate -and $Observation.ApiHealthy -and $Observation.WorkerHealthy) { return 'ACTIVATION_IN_PROGRESS' }
      return 'ROLLBACK_REQUIRED'
    }
    'ROLLBACK_TARGET' { return 'MANUAL_INTERVENTION_REQUIRED' }
    'REJECTED' { return 'NO_ACTION_REQUIRED' }
    'ARCHIVED' { return 'NO_ACTION_REQUIRED' }
    default { return 'MANUAL_INTERVENTION_REQUIRED' }
  }
}

function Test-RotationRuntimeAcceptanceData($Actual, $Expected) {
  $checks = [ordered]@{
    API_IMAGE_ID = (Test-RotationSha256 $Actual.ApiImageId) -and $Actual.ApiImageId -ceq $Expected.ApiImageId
    WORKER_IMAGE_ID = (Test-RotationSha256 $Actual.WorkerImageId) -and $Actual.WorkerImageId -ceq $Expected.WorkerImageId
    API_HEALTH = ($Actual.ApiRunning -and $Actual.ApiHealthy -and $Actual.ApiHealth200 -and $Actual.ApiReady200)
    WORKER_HEALTH = ($Actual.WorkerRunning -and $Actual.WorkerHealthy -and $Actual.WorkerHealth200 -and $Actual.WorkerReady200)
    SECRET_PROVIDER = ($Actual.SecretProviderMode -eq 'file' -and $Actual.SecretProviderStatus -eq 'READY')
    API_SECRET_PROVIDER_ROOT = $Actual.ApiSecretProviderRootBound
    API_MOUNTS = ($Actual.ApiRequiredFileMounts -and -not $Actual.ApiJenkinsMount)
    WORKER_MOUNTS = (-not $Actual.WorkerApplicationSecretMount)
    MIGRATED_ENVIRONMENT = ($Actual.ApiMigratedEnvironmentAbsent -and $Actual.WorkerMigratedEnvironmentAbsent)
    ENABLEMENT = ($Actual.GitHubActionsEnabled -and $Actual.JenkinsIntegrationDisabled)
    PROVIDER_INVENTORY = ($Actual.ApiProviderEquivalent -and $Actual.WorkerProviderEquivalent)
    PRESERVATION = ($Actual.NonTargetContainerIdsPreserved -and $Actual.VolumeInventoryPreserved)
  }
  foreach ($entry in $checks.GetEnumerator()) { if (-not $entry.Value) { return [pscustomobject]@{ Passed = $false; Gate = $entry.Key } } }
  return [pscustomobject]@{ Passed = $true; Gate = 'PASS' }
}

# The definitions below supersede the original v1 plan helpers. They retain the
# on-disk field names for readability but make the plan immutable and move all
# attempt evidence into separately immutable, plan-bound operation records.
function Test-RotationExactStringArray($Value, [string[]]$Expected) {
  $actual = @($Value)
  if ($actual.Count -ne $Expected.Count) { return $false }
  for ($index = 0; $index -lt $Expected.Count; $index++) { if ($actual[$index] -isnot [string] -or $actual[$index] -cne $Expected[$index]) { return $false } }
  return $true
}

function Test-RotationExactInteger($Value, [int]$Expected) {
  if ($Value -isnot [int] -and $Value -isnot [long]) { return $false }
  return [long]$Value -eq [long]$Expected
}

function Test-RotationExactPropertyNames($Value, [string[]]$Expected) {
  if ($null -eq $Value) { return $false }
  $actual = @($Value.PSObject.Properties.Name | Sort-Object)
  $wanted = @($Expected | Sort-Object)
  return Test-RotationExactStringArray $actual $wanted
}

# Parse only enough JSON grammar to reject duplicate object keys before the
# platform deserializer can collapse them.  This scanner handles recursive
# objects/arrays and JSON escapes; semantic validation remains below.
function Assert-RotationJsonNoDuplicateKeys([string]$Json, [string]$FailureCode) {
  if ([string]::IsNullOrWhiteSpace($Json)) { Stop-Rotation $FailureCode }
  $script:RotationJsonIndex = 0
  function Skip-RotationJsonWhitespace { while ($script:RotationJsonIndex -lt $Json.Length -and [char]::IsWhiteSpace($Json[$script:RotationJsonIndex])) { $script:RotationJsonIndex++ } }
  function Read-RotationJsonString {
    if ($script:RotationJsonIndex -ge $Json.Length -or $Json[$script:RotationJsonIndex] -ne '"') { Stop-Rotation $FailureCode }; $script:RotationJsonIndex++; $builder = [Text.StringBuilder]::new()
    while ($script:RotationJsonIndex -lt $Json.Length) { $char = $Json[$script:RotationJsonIndex]; $script:RotationJsonIndex++; if ($char -eq '"') { return $builder.ToString() }; if ($char -ne [char]92) { $null=$builder.Append($char); continue }
      if ($script:RotationJsonIndex -ge $Json.Length) { Stop-Rotation $FailureCode }; $escape=$Json[$script:RotationJsonIndex]; $script:RotationJsonIndex++
      if ($escape -eq 'u') { if ($script:RotationJsonIndex + 4 -gt $Json.Length -or $Json.Substring($script:RotationJsonIndex,4) -notmatch '^[0-9a-fA-F]{4}$') { Stop-Rotation $FailureCode }; $null=$builder.Append([char][Convert]::ToInt32($Json.Substring($script:RotationJsonIndex,4),16)); $script:RotationJsonIndex+=4 }
      elseif ($escape -eq '"' -or $escape -eq [char]92 -or $escape -eq '/') { $null=$builder.Append($escape) }
      elseif ($escape -eq 'b') { $null=$builder.Append([char]8) } elseif ($escape -eq 'f') { $null=$builder.Append([char]12) } elseif ($escape -eq 'n') { $null=$builder.Append("`n") } elseif ($escape -eq 'r') { $null=$builder.Append("`r") } elseif ($escape -eq 't') { $null=$builder.Append("`t") } else { Stop-Rotation $FailureCode }
    }; Stop-Rotation $FailureCode
  }
  function Read-RotationJsonValue {
    Skip-RotationJsonWhitespace; if ($script:RotationJsonIndex -ge $Json.Length) { Stop-Rotation $FailureCode }
    if ($Json[$script:RotationJsonIndex] -eq '"') { $null=Read-RotationJsonString; return }
    if ($Json[$script:RotationJsonIndex] -eq '{') { $script:RotationJsonIndex++; Skip-RotationJsonWhitespace; $keys=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal); if ($script:RotationJsonIndex -lt $Json.Length -and $Json[$script:RotationJsonIndex] -eq '}') { $script:RotationJsonIndex++; return }; while ($true) { Skip-RotationJsonWhitespace; $key=Read-RotationJsonString; if (-not $keys.Add($key)) { Stop-Rotation $FailureCode }; Skip-RotationJsonWhitespace; if ($script:RotationJsonIndex -ge $Json.Length -or $Json[$script:RotationJsonIndex] -ne ':') { Stop-Rotation $FailureCode }; $script:RotationJsonIndex++; Read-RotationJsonValue; Skip-RotationJsonWhitespace; if ($script:RotationJsonIndex -lt $Json.Length -and $Json[$script:RotationJsonIndex] -eq '}') { $script:RotationJsonIndex++; return }; if ($script:RotationJsonIndex -ge $Json.Length -or $Json[$script:RotationJsonIndex] -ne ',') { Stop-Rotation $FailureCode }; $script:RotationJsonIndex++ } }
    if ($Json[$script:RotationJsonIndex] -eq '[') { $script:RotationJsonIndex++; Skip-RotationJsonWhitespace; if ($script:RotationJsonIndex -lt $Json.Length -and $Json[$script:RotationJsonIndex] -eq ']') { $script:RotationJsonIndex++; return }; while ($true) { Read-RotationJsonValue; Skip-RotationJsonWhitespace; if ($script:RotationJsonIndex -lt $Json.Length -and $Json[$script:RotationJsonIndex] -eq ']') { $script:RotationJsonIndex++; return }; if ($script:RotationJsonIndex -ge $Json.Length -or $Json[$script:RotationJsonIndex] -ne ',') { Stop-Rotation $FailureCode }; $script:RotationJsonIndex++ } }
    $remaining=$Json.Substring($script:RotationJsonIndex); $match=[regex]::Match($remaining,'^(true|false|null|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?)'); if (-not $match.Success) { Stop-Rotation $FailureCode }; $script:RotationJsonIndex += $match.Length
  }
  Read-RotationJsonValue; Skip-RotationJsonWhitespace; if ($script:RotationJsonIndex -ne $Json.Length) { Stop-Rotation $FailureCode }
}

function ConvertFrom-RotationStrictJson([string]$Json, [string]$FailureCode) {
  Assert-RotationJsonNoDuplicateKeys $Json $FailureCode
  try { return $Json | ConvertFrom-Json -ErrorAction Stop } catch { Stop-Rotation $FailureCode }
}

function Get-RotationPlanRoot([string]$TargetRoot) {
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  $planRoot = Join-Path $root 'rotation-plans'
  if (-not (Test-Path -LiteralPath $planRoot -PathType Container)) { Stop-Rotation 'ROTATION_PLAN_ROOT_MISSING' }
  Assert-RotationNoReparse $planRoot 'ROTATION_PLAN_REPARSE_PATH'
  Assert-RotationPlanDirectorySecurity $planRoot
  return $planRoot
}

function Ensure-RotationPlanRoot([string]$TargetRoot) {
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  Assert-RotationNoReparse $root 'ROTATION_ROOT_REPARSE_PATH'; Assert-RotationPlanDirectorySecurity $root
  $planRoot = Join-Path $root 'rotation-plans'
  if (-not (Test-Path -LiteralPath $planRoot)) { try { [IO.Directory]::CreateDirectory($planRoot) | Out-Null; Set-RotationOperationDirectorySecurity $planRoot } catch { Stop-Rotation 'ROTATION_PLAN_ROOT_CREATE_FAILED' } }
  return Get-RotationPlanRoot $TargetRoot
}

function Get-RotationPlanPath([string]$TargetRoot, [string]$OperationId) {
  if (-not (Test-RotationGenerationId $OperationId)) { Stop-Rotation 'ROTATION_OPERATION_ID_INVALID' }
  $planRoot = Get-RotationPlanRoot $TargetRoot
  $path = Join-Path $planRoot ($OperationId + '.json')
  if (-not (Test-RotationPathInside $path $planRoot) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-Rotation 'ROTATION_PLAN_MISSING' }
  Assert-RotationNoReparse $path 'ROTATION_PLAN_REPARSE_PATH'
  return $path
}

function Get-RotationPlanIdentity([string]$TargetRoot, [string]$OperationId) {
  $path = Get-RotationPlanPath $TargetRoot $OperationId
  try {
    $hash = [Security.Cryptography.SHA256]::Create().ComputeHash([IO.File]::ReadAllBytes($path))
    return 'sha256:' + (-join ($hash | ForEach-Object { $_.ToString('x2') }))
  } catch { Stop-Rotation 'ROTATION_PLAN_IDENTITY_UNAVAILABLE' }
}

function New-RotationPlanObject(
  [string]$OperationId, [string]$CandidateGenerationId, [string]$CurrentGoodGenerationId,
  [string]$PreviousGoodGenerationId, [string]$RepositoryRevision, [string]$ApiImageId,
  [string]$WorkerImageId, [string[]]$Overlays, [hashtable]$RollbackContract
) {
  foreach ($id in @($OperationId, $CandidateGenerationId, $CurrentGoodGenerationId)) { if (-not (Test-RotationGenerationId $id)) { Stop-Rotation 'PLAN_GENERATION_ID_INVALID' } }
  if (-not [string]::IsNullOrWhiteSpace($PreviousGoodGenerationId) -and -not (Test-RotationGenerationId $PreviousGoodGenerationId)) { Stop-Rotation 'PLAN_GENERATION_ID_INVALID' }
  $normalizedPreviousGoodGenerationId = if ([string]::IsNullOrWhiteSpace($PreviousGoodGenerationId)) { $null } else { $PreviousGoodGenerationId }
  if ($CandidateGenerationId -ceq $CurrentGoodGenerationId -or $CandidateGenerationId -ceq $normalizedPreviousGoodGenerationId) { Stop-Rotation 'PLAN_GENERATION_REUSE' }
  if (-not (Test-RotationRevision $RepositoryRevision) -or -not (Test-RotationSha256 $ApiImageId) -or -not (Test-RotationSha256 $WorkerImageId) -or $ApiImageId -ceq $WorkerImageId) { Stop-Rotation 'PLAN_IDENTITY_INVALID' }
  if (-not (Test-RotationExactStringArray $Overlays $script:RotationRequiredOverlays)) { Stop-Rotation 'PLAN_OVERLAY_CONTRACT_INVALID' }
  if ($null -eq $RollbackContract -or -not (Test-RotationGenerationId $RollbackContract.TargetGenerationId) -or $RollbackContract.TargetGenerationId -cne $CurrentGoodGenerationId -or -not (Test-RotationSha256 $RollbackContract.ApiImageId) -or -not (Test-RotationSha256 $RollbackContract.WorkerImageId) -or $RollbackContract.ExpectedRuntimeMode -cne 'file' -or -not (Test-RotationExactStringArray $RollbackContract.ExpectedHealthEndpoints $script:RotationHealthEndpoints) -or $null -eq $RollbackContract.NonTargetContainerIds -or $null -eq $RollbackContract.VolumeInventory) { Stop-Rotation 'ROLLBACK_CONTRACT_INVALID' }
  return [ordered]@{ schemaVersion = $script:RotationSchemaVersion; operationId = $OperationId; status = 'PREPARED'; createdAtUtc = [DateTime]::UtcNow.ToString('o'); candidateGenerationId = $CandidateGenerationId; currentGoodGenerationId = $CurrentGoodGenerationId; previousGoodGenerationId = $normalizedPreviousGoodGenerationId; repositoryRevision = $RepositoryRevision; apiImageId = $ApiImageId; workerImageId = $WorkerImageId; runtimeServices = $script:RotationRuntimeServices; requiredOverlays = @($script:RotationRequiredOverlays); requiredGates = @($script:RotationRequiredGates); activationAttemptLimit = 1; rollbackAttemptLimit = 1; activationAttempts = 0; rollbackAttempts = 0; rollback = $RollbackContract }
}

function Read-RotationPlan([string]$TargetRoot, [string]$OperationId) {
  $authorityPlanPath = (Get-Variable -Scope Script -Name RotationAuthorityCanonicalPlanPath -ValueOnly -ErrorAction SilentlyContinue)
  if (-not [string]::IsNullOrWhiteSpace($authorityPlanPath)) {
    # The authority validator accepts only the exact operation file beneath
    # its ProgramData-owned plan root. This branch is entered by the protected
    # service payload; requester-side TargetRoot plans are not consulted.
    $authorityRoot = Get-RotationFullPath (Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)) 'AutoOps\rotation-authority\plans') 'ROTATION_PLAN_MISSING'
    Assert-RotationNoReparse $authorityRoot 'ROTATION_PLAN_REPARSE_PATH'
    $path = Get-RotationFullPath $authorityPlanPath 'ROTATION_PLAN_MISSING'
    if (-not (Test-RotationPathInside $path $authorityRoot) -or $path -cne (Join-Path $authorityRoot ($OperationId + '.json')) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-Rotation 'ROTATION_PLAN_MISSING' }
    Assert-RotationNoReparse $path 'ROTATION_PLAN_REPARSE_PATH'
  } else {
    $path = Get-RotationPlanPath $TargetRoot $OperationId
  }
  try { $plan = ConvertFrom-RotationStrictJson (Get-Content -LiteralPath $path -Raw) 'ROTATION_PLAN_MALFORMED' } catch { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  $required = @('schemaVersion','operationId','status','createdAtUtc','candidateGenerationId','currentGoodGenerationId','previousGoodGenerationId','repositoryRevision','apiImageId','workerImageId','runtimeServices','requiredOverlays','requiredGates','activationAttemptLimit','rollbackAttemptLimit','activationAttempts','rollbackAttempts','rollback')
  if (-not (Test-RotationExactPropertyNames $plan $required)) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  $allowedStatuses = if (-not [string]::IsNullOrWhiteSpace($authorityPlanPath)) { @('ADMITTED') } else { @('PREPARED') }
  if (-not (Test-RotationExactInteger $plan.schemaVersion $script:RotationSchemaVersion) -or $plan.operationId -cne $OperationId -or $plan.status -notin $allowedStatuses -or $plan.createdAtUtc -isnot [string] -or -not (Test-RotationGenerationId $plan.candidateGenerationId) -or -not (Test-RotationGenerationId $plan.currentGoodGenerationId) -or ($null -ne $plan.previousGoodGenerationId -and -not (Test-RotationGenerationId $plan.previousGoodGenerationId)) -or $plan.candidateGenerationId -ceq $plan.currentGoodGenerationId -or $plan.candidateGenerationId -ceq $plan.previousGoodGenerationId -or -not (Test-RotationRevision $plan.repositoryRevision) -or -not (Test-RotationSha256 $plan.apiImageId) -or -not (Test-RotationSha256 $plan.workerImageId) -or $plan.apiImageId -ceq $plan.workerImageId -or -not (Test-RotationExactStringArray $plan.requiredOverlays $script:RotationRequiredOverlays) -or -not (Test-RotationExactStringArray $plan.requiredGates $script:RotationRequiredGates) -or -not (Test-RotationExactInteger $plan.activationAttemptLimit 1) -or -not (Test-RotationExactInteger $plan.rollbackAttemptLimit 1) -or -not (Test-RotationExactInteger $plan.activationAttempts 0) -or -not (Test-RotationExactInteger $plan.rollbackAttempts 0)) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  if (-not (Test-RotationExactPropertyNames $plan.runtimeServices @('api','worker')) -or $plan.runtimeServices.api -cne $script:RotationRuntimeServices.api -or $plan.runtimeServices.worker -cne $script:RotationRuntimeServices.worker) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  $rollback = $plan.rollback
  $rollbackRequired = @('TargetGenerationId','ApiImageId','WorkerImageId','ExpectedRuntimeMode','ExpectedHealthEndpoints','NonTargetContainerIds','VolumeInventory')
  if (-not (Test-RotationExactPropertyNames $rollback $rollbackRequired) -or -not (Test-RotationGenerationId $rollback.TargetGenerationId) -or $rollback.TargetGenerationId -cne $plan.currentGoodGenerationId -or -not (Test-RotationSha256 $rollback.ApiImageId) -or -not (Test-RotationSha256 $rollback.WorkerImageId) -or $rollback.ExpectedRuntimeMode -cne 'file' -or -not (Test-RotationExactStringArray $rollback.ExpectedHealthEndpoints $script:RotationHealthEndpoints) -or $null -eq $rollback.NonTargetContainerIds -or $null -eq $rollback.VolumeInventory) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  if (-not (Test-RotationExactStringArray @($rollback.NonTargetContainerIds.PSObject.Properties.Name | Sort-Object) @($script:RotationNonTargetContainers | Sort-Object))) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  foreach ($property in @($rollback.NonTargetContainerIds.PSObject.Properties)) { if ($property.Name -notmatch '^autoops-[a-z0-9-]+$' -or $property.Value -isnot [string] -or $property.Value -notmatch '^[a-f0-9]{64}$') { Stop-Rotation 'ROTATION_PLAN_MALFORMED' } }
  foreach ($volume in @($rollback.VolumeInventory)) { if ($volume -isnot [string] -or [string]::IsNullOrWhiteSpace($volume)) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' } }
  return $plan
}

function Test-RotationAttemptBudget($Plan) { return (Test-RotationExactInteger $Plan.activationAttemptLimit 1) -and (Test-RotationExactInteger $Plan.rollbackAttemptLimit 1) -and (Test-RotationExactInteger $Plan.activationAttempts 0) -and (Test-RotationExactInteger $Plan.rollbackAttempts 0) }

function Get-RotationInitializationClaimsRoot([string]$TargetRoot, [switch]$AllowMissing) {
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  $claimsRoot = Join-Path $root 'rotation-initialization-claims'
  if (-not (Test-Path -LiteralPath $claimsRoot -PathType Container)) {
    if (Test-Path -LiteralPath $claimsRoot) { Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_INVALID' }
    if ($AllowMissing) { return $null }
    Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_ROOT_MISSING'
  }
  Assert-RotationNoReparse $claimsRoot 'ROTATION_INITIALIZATION_CLAIM_REPARSE_PATH'
  Assert-RotationOperationDirectorySecurity $claimsRoot
  return $claimsRoot
}

function Ensure-RotationInitializationClaimsRoot([string]$TargetRoot) {
  throw [System.InvalidOperationException]::new('ROTATION_AUTHORITY_REQUIRED')
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  Assert-RotationNoReparse $root 'ROTATION_ROOT_REPARSE_PATH'; Assert-RotationPlanDirectorySecurity $root
  $claimsRoot = Join-Path $root 'rotation-initialization-claims'
  if (-not (Test-Path -LiteralPath $claimsRoot)) {
    try { [IO.Directory]::CreateDirectory($claimsRoot) | Out-Null; Set-RotationOperationDirectorySecurity $claimsRoot } catch { Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_ROOT_CREATE_FAILED' }
  }
  return Get-RotationInitializationClaimsRoot $TargetRoot
}

function Get-RotationInitializationClaimPath([string]$TargetRoot, [string]$OperationId, [switch]$AllowMissingClaimsRoot) {
  if (-not (Test-RotationGenerationId $OperationId)) { Stop-Rotation 'ROTATION_OPERATION_ID_INVALID' }
  $claimsRoot = Get-RotationInitializationClaimsRoot $TargetRoot -AllowMissing:$AllowMissingClaimsRoot
  if ($null -eq $claimsRoot) { return $null }
  $path = Join-Path $claimsRoot ($OperationId + '.json')
  if (-not (Test-RotationPathInside $path $claimsRoot)) { Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_PATH_ESCAPE' }
  return $path
}

function Read-RotationInitializationClaim([string]$TargetRoot, [string]$OperationId, [string]$PlanIdentity) {
  $path = Get-RotationInitializationClaimPath $TargetRoot $OperationId -AllowMissingClaimsRoot
  if ($null -eq $path) { return $null }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    if (Test-Path -LiteralPath $path) { Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_INVALID' }
    return $null
  }
  Assert-RotationNoReparse $path 'ROTATION_INITIALIZATION_CLAIM_REPARSE_PATH'
  try { $claim = ConvertFrom-RotationStrictJson (Get-Content -LiteralPath $path -Raw) 'ROTATION_INITIALIZATION_CLAIM_INVALID' } catch { Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_INVALID' }
  $required = @('schemaVersion','operationId','planIdentity','transition','createdAtUtc')
  if (-not (Test-RotationExactPropertyNames $claim $required) -or -not (Test-RotationExactInteger $claim.schemaVersion $script:RotationSchemaVersion) -or $claim.operationId -cne $OperationId -or $claim.planIdentity -cne $PlanIdentity -or $claim.transition -cne 'INITIALIZATION_CLAIMED' -or -not (Test-RotationUtcTimestamp $claim.createdAtUtc)) { Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_INVALID' }
  return $claim
}

function Write-RotationInitializationClaim([string]$TargetRoot, [string]$OperationId, [string]$PlanIdentity) {
  throw [System.InvalidOperationException]::new('ROTATION_AUTHORITY_REQUIRED')
  if (-not (Test-RotationSha256 $PlanIdentity)) { Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_INVALID' }
  $null = Ensure-RotationInitializationClaimsRoot $TargetRoot
  $path = Get-RotationInitializationClaimPath $TargetRoot $OperationId
  $claim = [ordered]@{ schemaVersion = $script:RotationSchemaVersion; operationId = $OperationId; planIdentity = $PlanIdentity; transition = 'INITIALIZATION_CLAIMED'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  try {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($claim | ConvertTo-Json -Compress))
    $stream = [IO.FileStream]::new($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  } catch { Stop-Rotation 'ROTATION_INITIALIZATION_ALREADY_CLAIMED' }
}

function Get-RotationOperationRoot([string]$TargetRoot, [string]$OperationId, [switch]$AllowMissingOperationsRoot) {
  if (-not (Test-RotationGenerationId $OperationId)) { Stop-Rotation 'ROTATION_OPERATION_ID_INVALID' }
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'; $operationsRoot = Join-Path $root 'rotation-operations'
  if (-not (Test-Path -LiteralPath $operationsRoot -PathType Container)) {
    if (-not $AllowMissingOperationsRoot) { Stop-Rotation 'ROTATION_OPERATION_ROOT_MISSING' }
    return (Join-Path $operationsRoot $OperationId)
  }
  Assert-RotationNoReparse $operationsRoot 'ROTATION_OPERATION_REPARSE_PATH'; Assert-RotationOperationDirectorySecurity $operationsRoot
  $operationRoot = Join-Path $operationsRoot $OperationId
  if (-not (Test-RotationPathInside $operationRoot $operationsRoot)) { Stop-Rotation 'ROTATION_OPERATION_PATH_ESCAPE' }
  return $operationRoot
}

function Ensure-RotationOperationsRoot([string]$TargetRoot) {
  throw [System.InvalidOperationException]::new('ROTATION_AUTHORITY_REQUIRED')
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  Assert-RotationNoReparse $root 'ROTATION_ROOT_REPARSE_PATH'; Assert-RotationPlanDirectorySecurity $root
  $operationsRoot = Join-Path $root 'rotation-operations'
  if (-not (Test-Path -LiteralPath $operationsRoot)) { try { [IO.Directory]::CreateDirectory($operationsRoot) | Out-Null; Set-RotationOperationDirectorySecurity $operationsRoot } catch { Stop-Rotation 'ROTATION_OPERATION_ROOT_CREATE_FAILED' } }
  return $operationsRoot
}

function Write-RotationOperationRecord([string]$OperationRoot, [string]$Name, $Record) {
  throw [System.InvalidOperationException]::new('ROTATION_AUTHORITY_REQUIRED')
  if ($Name -in @('candidate-acceptance.json','activation-accepted.json','rollback-acceptance.json','rollback-accepted.json')) { Stop-Rotation 'ROTATION_ACCEPTANCE_WRITER_PRIVATE' }
  $path = Join-Path $OperationRoot $Name
  if (-not (Test-RotationPathInside $path $OperationRoot)) { Stop-Rotation 'ROTATION_OPERATION_PATH_ESCAPE' }
  try {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Record | ConvertTo-Json -Depth 5 -Compress))
    $stream = [IO.FileStream]::new($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  } catch { Stop-Rotation 'ROTATION_OPERATION_RECORD_WRITE_FAILED' }
}

function Get-RotationOperationState([string]$TargetRoot, [string]$OperationId, [switch]$AllowSyntheticTestPermissions) {
  $plan = Read-RotationPlan $TargetRoot $OperationId; $operationRoot = Get-RotationOperationRoot $TargetRoot $OperationId -AllowMissingOperationsRoot
  $planIdentity = Get-RotationPlanIdentity $TargetRoot $OperationId
  $claim = Read-RotationInitializationClaim $TargetRoot $OperationId $planIdentity
  # A strict M01.4 plan is initialized with its create-new operation marker.
  # Missing durable evidence is an interruption/tamper ambiguity, never proof
  # that an activation has not been attempted.
  if (-not (Test-Path -LiteralPath $operationRoot -PathType Container)) {
    if (Test-Path -LiteralPath $operationRoot) { Stop-Rotation 'ROTATION_OPERATION_RECORD_INVALID' }
    $state = if ($null -eq $claim) { 'NEVER_INITIALIZED' } else { 'OPERATION_INITIALIZATION_INTERRUPTED' }
    return [pscustomobject]@{ State = $state; Plan = $plan; PlanIdentity = $planIdentity; OperationRoot = $operationRoot }
  }
  if ($null -eq $claim) { Stop-Rotation 'ROTATION_INITIALIZATION_CLAIM_MISSING' }
  Assert-RotationNoReparse $operationRoot 'ROTATION_OPERATION_REPARSE_PATH'; if (-not $AllowSyntheticTestPermissions) { Assert-RotationOperationDirectorySecurity $operationRoot }
  $allowed = @('operation-created.json','activation-attempt.json','candidate-acceptance.json','activation-accepted.json','activation-failed.json','rollback-attempt.json','rollback-acceptance.json','rollback-accepted.json','manual-intervention.json')
  $items = @(Get-ChildItem -Force -LiteralPath $operationRoot); foreach ($item in $items) { if ($item.PSIsContainer -or $item.Name -notin $allowed -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { Stop-Rotation 'ROTATION_OPERATION_RECORD_INVALID' } }
  if ($items.Count -eq 0) { return [pscustomobject]@{ State = 'OPERATION_INITIALIZATION_INTERRUPTED'; Plan = $plan; PlanIdentity = $planIdentity; OperationRoot = $operationRoot } }
  $recordRequired = @('schemaVersion','operationId','planIdentity','transition','createdAtUtc')
  $expectedTransitionByRecord = @{ 'operation-created.json' = 'OPERATION_CREATED'; 'activation-attempt.json' = 'ACTIVATION_ATTEMPT'; 'activation-accepted.json' = 'ACTIVATION_ACCEPTED'; 'activation-failed.json' = 'ACTIVATION_FAILED'; 'rollback-attempt.json' = 'ROLLBACK_ATTEMPT'; 'rollback-accepted.json' = 'ROLLBACK_ACCEPTED'; 'manual-intervention.json' = 'MANUAL_INTERVENTION' }
  foreach ($item in $items) {
    try { $record = ConvertFrom-RotationStrictJson (Get-Content -LiteralPath $item.FullName -Raw) 'ROTATION_OPERATION_RECORD_INVALID' } catch { Stop-Rotation 'ROTATION_OPERATION_RECORD_INVALID' }
    if ($item.Name -in @('candidate-acceptance.json','rollback-acceptance.json')) {
      if (-not (Test-RotationAcceptanceEvidenceRecord $record $item.Name $OperationId $planIdentity $plan)) { Stop-Rotation 'ROTATION_ACCEPTANCE_EVIDENCE_INVALID' }
    } elseif (-not (Test-RotationExactPropertyNames $record $recordRequired) -or -not (Test-RotationExactInteger $record.schemaVersion $script:RotationSchemaVersion) -or $record.operationId -cne $OperationId -or $record.planIdentity -cne $planIdentity -or $record.transition -cne $expectedTransitionByRecord[$item.Name] -or -not (Test-RotationUtcTimestamp $record.createdAtUtc)) { Stop-Rotation 'ROTATION_OPERATION_RECORD_INVALID' }
  }
  $names = @($items.Name)
  # Every persisted state has one exact, append-only marker sequence.  Parsing
  # individual records is not sufficient: a conflicting set of otherwise
  # valid markers is ambiguous and must never authorize recovery continuation.
  $baseNames = @($names | Where-Object { $_ -cne 'manual-intervention.json' } | Sort-Object)
  $baseSignature = [string]::Join('|', $baseNames)
  $stateBySignature = @{
    # A durable manual marker may be the only operation record after a
    # plan-only or directory-only initialization interruption.  It is still
    # non-accepted and cannot resume preflight, but must remain readable so
    # recovery does not strand the immutable plan.
    '' = 'OPERATION_INITIALIZATION_INTERRUPTED'
    'operation-created.json' = 'PREPARED'
    'activation-attempt.json|operation-created.json' = 'ACTIVATION_ATTEMPT_CONSUMED'
    'activation-attempt.json|candidate-acceptance.json|operation-created.json' = 'CANDIDATE_ACCEPTANCE_INTERRUPTED'
    'activation-accepted.json|activation-attempt.json|candidate-acceptance.json|operation-created.json' = 'ACTIVE_ACCEPTED'
    'activation-attempt.json|activation-failed.json|operation-created.json' = 'ACTIVATION_FAILED'
    'activation-attempt.json|activation-failed.json|operation-created.json|rollback-attempt.json' = 'ROLLBACK_ATTEMPT_CONSUMED'
    'activation-attempt.json|activation-failed.json|operation-created.json|rollback-acceptance.json|rollback-attempt.json' = 'ROLLBACK_ACCEPTANCE_INTERRUPTED'
    'activation-attempt.json|activation-failed.json|operation-created.json|rollback-acceptance.json|rollback-accepted.json|rollback-attempt.json' = 'ROLLED_BACK'
  }
  if (-not $stateBySignature.ContainsKey($baseSignature)) { Stop-Rotation 'ROTATION_OPERATION_TRANSITION_INVALID' }
  $baseState = $stateBySignature[$baseSignature]
  if ('manual-intervention.json' -in $names) {
    if ($baseState -in @('ACTIVE_ACCEPTED','ROLLED_BACK')) { Stop-Rotation 'ROTATION_OPERATION_TRANSITION_INVALID' }
    $state = 'MANUAL_INTERVENTION_REQUIRED'
  } else { $state = $baseState }
  return [pscustomobject]@{ State = $state; Plan = $plan; PlanIdentity = $planIdentity; OperationRoot = $operationRoot }
}

function Consume-RotationOperationTransition([string]$TargetRoot, [string]$OperationId, [ValidateSet('ACTIVATION_ATTEMPT','ACTIVATION_FAILED','ROLLBACK_ATTEMPT','MANUAL_INTERVENTION')][string]$Transition) {
  throw [System.InvalidOperationException]::new('ROTATION_AUTHORITY_REQUIRED')
  $state = Get-RotationOperationState $TargetRoot $OperationId
  $expectations = @{ ACTIVATION_ATTEMPT = 'PREPARED'; ACTIVATION_FAILED = 'ACTIVATION_ATTEMPT_CONSUMED'; ROLLBACK_ATTEMPT = 'ACTIVATION_FAILED' }
  if ($Transition -ne 'MANUAL_INTERVENTION' -and $state.State -cne $expectations[$Transition]) { Stop-Rotation 'ROTATION_OPERATION_TRANSITION_INVALID' }
  if ($Transition -eq 'MANUAL_INTERVENTION' -and $state.State -in @('NEVER_INITIALIZED','ACTIVE_ACCEPTED','ROLLED_BACK','MANUAL_INTERVENTION_REQUIRED')) { Stop-Rotation 'ROTATION_OPERATION_TRANSITION_INVALID' }
  if ($Transition -eq 'MANUAL_INTERVENTION' -and $state.State -eq 'OPERATION_INITIALIZATION_INTERRUPTED') {
    $null = Ensure-RotationOperationsRoot $TargetRoot
    if (-not (Test-Path -LiteralPath $state.OperationRoot)) {
      try { [IO.Directory]::CreateDirectory($state.OperationRoot) | Out-Null; Set-RotationOperationDirectorySecurity $state.OperationRoot; Assert-RotationOperationDirectorySecurity $state.OperationRoot } catch { Stop-Rotation 'ROTATION_OPERATION_CREATE_FAILED' }
    }
  }
  $names = @{ ACTIVATION_ATTEMPT = 'activation-attempt.json'; ACTIVATION_FAILED = 'activation-failed.json'; ROLLBACK_ATTEMPT = 'rollback-attempt.json'; MANUAL_INTERVENTION = 'manual-intervention.json' }
  $record = [ordered]@{ schemaVersion = $script:RotationSchemaVersion; operationId = $OperationId; planIdentity = $state.PlanIdentity; transition = $Transition; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  Write-RotationOperationRecord $state.OperationRoot $names[$Transition] $record
}

function Test-RotationUtcTimestamp($Value) {
  if ($Value -isnot [string]) { return $false }
  $parsed = [DateTime]::MinValue
  return [DateTime]::TryParseExact($Value, 'o', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)
}

function Test-RotationAcceptanceEvidenceRecord($Record, [string]$Name, [string]$OperationId, [string]$PlanIdentity, $Plan) {
  $required = @('schemaVersion','operationId','planIdentity','transition','mode','repositoryRevision','expectedApiImageId','expectedWorkerImageId','acceptanceResult','createdAtUtc')
  $mode = if ($Name -ceq 'candidate-acceptance.json') { 'Candidate' } elseif ($Name -ceq 'rollback-acceptance.json') { 'Rollback' } else { return $false }
  $expectedApi = if ($mode -ceq 'Candidate') { $Plan.apiImageId } else { $Plan.rollback.ApiImageId }
  $expectedWorker = if ($mode -ceq 'Candidate') { $Plan.workerImageId } else { $Plan.rollback.WorkerImageId }
  return (Test-RotationExactPropertyNames $Record $required) -and (Test-RotationExactInteger $Record.schemaVersion $script:RotationSchemaVersion) -and $Record.operationId -ceq $OperationId -and $Record.planIdentity -ceq $PlanIdentity -and $Record.transition -ceq 'ACCEPTANCE_EVIDENCE' -and $Record.mode -ceq $mode -and $Record.repositoryRevision -ceq $Plan.repositoryRevision -and $Record.expectedApiImageId -ceq $expectedApi -and $Record.expectedWorkerImageId -ceq $expectedWorker -and $Record.acceptanceResult -ceq 'PASS' -and (Test-RotationUtcTimestamp $Record.createdAtUtc)
}

function Assert-RotationContainerName([string]$Name) {
  if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') { Stop-Rotation 'CONTAINER_NAME_INVALID' }
}

function Invoke-RotationDockerMetadata([string[]]$Arguments, [string]$FailureCode) {
  $process = Start-RotationTrustedDockerProcess $Arguments $FailureCode
  $stdout = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -ne 0) { Stop-Rotation $FailureCode }
  return $stdout
}

function Get-RotationContainerRuntimeMetadata([string]$Name) {
  Assert-RotationContainerName $Name
  $line = (Invoke-RotationDockerMetadata @('inspect','--format','{{.Id}}|{{.Image}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}',$Name) 'CONTAINER_INSPECTION_FAILED').Trim()
  $parts = $line.Split('|', 4)
  if ($parts.Count -ne 4 -or $parts[0] -notmatch '^[a-f0-9]{64}$' -or -not (Test-RotationSha256 $parts[1])) { Stop-Rotation 'CONTAINER_STATE_MALFORMED' }
  return [pscustomobject]@{ ContainerId = $parts[0]; ImageId = $parts[1]; Running = $parts[2] -eq 'running'; Healthy = $parts[3] -eq 'healthy' }
}

function Get-RotationContainerMountRecords([string]$Name) {
  Assert-RotationContainerName $Name
  $raw = Invoke-RotationDockerMetadata @('inspect','--format','{{range .Mounts}}{{.Type}}|{{.Source}}|{{.Destination}}|{{.RW}}{{"\n"}}{{end}}',$Name) 'MOUNT_INSPECTION_FAILED'
  $records = @()
  foreach ($line in ($raw -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split('|', 4)
    if ($parts.Count -ne 4 -or $parts[0] -notin @('bind','volume','tmpfs','npipe','cluster') -or [string]::IsNullOrWhiteSpace($parts[1]) -or [string]::IsNullOrWhiteSpace($parts[2]) -or $parts[3] -notin @('true','false')) { Stop-Rotation 'MOUNT_INSPECTION_MALFORMED' }
    $records += [pscustomobject]@{ Type = $parts[0]; Source = $parts[1]; Destination = $parts[2]; ReadWrite = $parts[3] -eq 'true' }
  }
  return $records
}

function Test-RotationWindowsHostBindSource([string]$Source) {
  return -not [string]::IsNullOrWhiteSpace($Source) -and ($Source -match '^[A-Za-z]:[\\/]' -or $Source.StartsWith('\\'))
}

function Test-RotationProtectedFileLinkIntegrity([string]$TargetRoot) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { return $false }
  $setsRoot = Get-RotationFullPath (Join-Path (Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID') 'sets') 'MOUNT_SOURCE_INVALID'
  try { $files = @(Get-ChildItem -Force -File -Recurse -LiteralPath $setsRoot -ErrorAction Stop) } catch { return $false }
  foreach ($file in $files) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
    try {
      # Pin the metadata utility to the Windows system directory.  This is
      # deliberately metadata-only: stdout is counted internally and never
      # surfaced, so neither protected paths nor file content leave this gate.
      $fsutil = Get-RotationWindowsSystemExecutable 'fsutil.exe'
      $process = Start-RotationProcess $fsutil @('hardlink','list',$file.FullName) 'PROTECTED_FILE_LINK_METADATA_UNAVAILABLE'
      $output = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
      if ($process.ExitCode -ne 0 -or @($output -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 }).Count -ne 1) { return $false }
    } catch { return $false }
  }
  return $true
}

function Get-RotationMountSourceDomain($Record) {
  $type = if ($Record.PSObject.Properties.Name -contains 'Type') { [string]$Record.Type } else { 'bind' }
  if ($type -eq 'bind' -and (Test-RotationWindowsHostBindSource $Record.Source)) { return 'WINDOWS_HOST_BIND' }
  if ($type -eq 'bind' -and $Record.Source -ceq '/var/run/docker.sock' -and $Record.Destination -ceq '/var/run/docker.sock') { return 'ENGINE_SOCKET_BIND' }
  if ($type -in @('volume','tmpfs','npipe','cluster')) { return 'ENGINE_MANAGED' }
  return 'UNSUPPORTED'
}

function Test-RotationMountBindingData($Records, [string]$TargetRoot, [string]$GenerationId, [bool]$IsApi, [switch]$SkipSourceMetadata) {
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  $setsRoot = Get-RotationFullPath (Join-Path $root 'sets') 'MOUNT_SOURCE_INVALID'
  $expectedGeneration = Get-RotationGenerationPath $TargetRoot $GenerationId
  $expected = @{
    '/run/secrets/autoops/jwt-access' = Join-Path $expectedGeneration 'jwt-access'
    '/run/secrets/autoops/jwt-refresh' = Join-Path $expectedGeneration 'jwt-refresh'
    '/run/secrets/autoops/github-actions-token' = Join-Path $expectedGeneration 'github-actions-token'
  }
  $comparison = Get-RotationPathComparison
  $expectedBySource = @{}
  foreach ($target in $expected.Keys) { $expectedBySource[(Get-RotationFullPath $expected[$target] 'MOUNT_SOURCE_INVALID')] = $target }
  $infraSource = Get-RotationFullPath (Join-Path (Split-Path -Parent $script:RotationModuleRoot) 'infra') 'MOUNT_SOURCE_INVALID'
  if (-not $SkipSourceMetadata -and -not (Test-RotationProtectedFileLinkIntegrity $TargetRoot)) { return $false }
  foreach ($record in @($Records)) {
    $sourceDomain = Get-RotationMountSourceDomain $record
    if ($sourceDomain -eq 'UNSUPPORTED') { return $false }
    $actualSource = $null
    if ($sourceDomain -eq 'WINDOWS_HOST_BIND') {
      try { $actualSource = Get-RotationFullPath $record.Source 'MOUNT_SOURCE_INVALID' } catch { return $false }
    }
    # Never classify a lexical alias as unrelated. A reparse component can
    # redirect a source outside setsRoot into the protected generation tree.
    if ($sourceDomain -eq 'WINDOWS_HOST_BIND' -and -not $SkipSourceMetadata) { try { Assert-RotationNoReparse $actualSource 'MOUNT_SOURCE_REPARSE_PATH' } catch { return $false } }
    # Any source that overlaps the published-generation tree can expose
    # application-secret material: an exact file, a generation directory,
    # the sets root, or an ancestor bind containing the sets root.
    $generationSource = $sourceDomain -eq 'WINDOWS_HOST_BIND' -and (Test-RotationPathOverlap $actualSource $setsRoot)
    try { $protectedDestination = Test-RotationContainerPathOverlap $record.Destination '/run/secrets/autoops' } catch { return $false }
    if (-not $IsApi -and ($generationSource -or $protectedDestination)) { return $false }
    $approvedApiSecretBinding = $IsApi -and $generationSource -and $expectedBySource.ContainsKey($actualSource) -and $record.Destination -ceq $expectedBySource[$actualSource] -and -not $record.ReadWrite
    $approvedInfraBinding = $sourceDomain -eq 'WINDOWS_HOST_BIND' -and [string]::Equals($actualSource, $infraSource, $comparison) -and $record.Destination -ceq '/app/infra' -and -not $record.ReadWrite
    $approvedEngineSocket = $sourceDomain -eq 'ENGINE_SOCKET_BIND' -and $record.Destination -ceq '/var/run/docker.sock' -and $record.ReadWrite
    if (-not ($approvedApiSecretBinding -or $approvedInfraBinding -or $approvedEngineSocket)) { return $false }
    # API file-mode exposure is an allowlist, not merely a required-mount
    # checklist.  A volume or unrelated bind overlapping the protected
    # destination tree could otherwise coexist with the three planned files.
    if ($IsApi -and $protectedDestination -and -not $approvedApiSecretBinding) { return $false }
    if ($generationSource) {
      if (-not $approvedApiSecretBinding) { return $false }
    }
  }
  if (-not $SkipSourceMetadata) {
    # The repository-owned topology has exactly one engine socket and one
    # read-only infra bind for each controlled service.  Counting them makes
    # the allowlist a contract rather than a set of individually valid rows.
    $engineSocketCount = @($Records | Where-Object {
      (Get-RotationMountSourceDomain $_) -eq 'ENGINE_SOCKET_BIND' -and
      $_.Destination -ceq '/var/run/docker.sock' -and $_.ReadWrite
    }).Count
    $infraBindCount = @($Records | Where-Object {
      if ((Get-RotationMountSourceDomain $_) -ne 'WINDOWS_HOST_BIND') { return $false }
      try {
        $candidate = Get-RotationFullPath $_.Source 'MOUNT_SOURCE_INVALID'
        return [string]::Equals($candidate, $infraSource, $comparison) -and $_.Destination -ceq '/app/infra' -and -not $_.ReadWrite
      } catch { return $false }
    }).Count
    if ($engineSocketCount -ne 1 -or $infraBindCount -ne 1) { return $false }
  }
  if (-not $IsApi) { return $true }
  foreach ($target in $script:RotationApplicationSecretTargets) {
    $matching = @($Records | Where-Object { $_.Destination -ceq $target })
    if ($target -eq '/run/secrets/autoops/jenkins-api-token') { if ($matching.Count -ne 0) { return $false }; continue }
    if ($matching.Count -ne 1 -or $matching[0].ReadWrite) { return $false }
    try { $actualSource = Get-RotationFullPath $matching[0].Source 'MOUNT_SOURCE_INVALID'; $expectedSource = Get-RotationFullPath $expected[$target] 'MOUNT_SOURCE_INVALID' } catch { return $false }
    if (-not [string]::Equals($actualSource, $expectedSource, $comparison)) { return $false }
  }
  return $true
}

function Test-RotationPresenceOnlyExitCode([int]$ExitCode) {
  if ($ExitCode -eq 3) { return $true }
  if ($ExitCode -eq 0) { return $false }
  Stop-Rotation 'SECRET_PRESENCE_PROBE_FAILED'
}

function Test-RotationContainerSecretKeyAbsent([string]$Container, [string]$Key) {
  Assert-RotationContainerName $Container
  if ($Key -notin @('JWT_SECRET','JWT_REFRESH_SECRET','GITHUB_ACTIONS_TOKEN','JENKINS_API_TOKEN')) { Stop-Rotation 'SECRET_PRESENCE_KEY_INVALID' }
  # The shell emits no bytes. Exit code is the complete presence result; secret
  # material never crosses the container-process boundary.
  $script = 'if [ "${' + $Key + '+x}" ]; then exit 0; else exit 3; fi'
  $process = Start-RotationTrustedDockerProcess @('exec',$Container,'sh','-c',$script) 'SECRET_PRESENCE_PROBE_FAILED'
  $process.WaitForExit()
  if ($process.ExitCode -ne 0 -and $process.ExitCode -ne 3) { Stop-Rotation 'SECRET_PRESENCE_PROBE_FAILED' }
  return Test-RotationPresenceOnlyExitCode $process.ExitCode
}

function Invoke-RotationRuntimeAcceptanceValidator([string]$TargetRoot, [string]$OperationId, [ValidateSet('Candidate','Rollback')][string]$Mode) {
  $plan = Read-RotationPlan $TargetRoot $OperationId
  $ApiContainer = $plan.runtimeServices.api; $WorkerContainer = $plan.runtimeServices.worker
  $validator = Join-Path $script:RotationModuleRoot 'validate-secret-rotation-runtime.ps1'
  $powershellExe = Join-Path $PSHOME 'powershell.exe'
  try { $process = Start-RotationProcess $powershellExe @('-NoProfile','-ExecutionPolicy','Bypass','-File',$validator,'-TargetRoot',$TargetRoot,'-OperationId',$OperationId,'-Mode',$Mode) 'ROTATION_ACCEPTANCE_VALIDATOR_START_FAILED' } catch { return $false }
  # Validation is a named gate only. Its output is intentionally discarded so
  # recovery classification never relays container or secret-adjacent details.
  $null = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  return $process.ExitCode -eq 0
}

function Get-RotationRecoveryClassification($OperationState, $Observation) {
  switch ($OperationState.State) {
    'NEVER_INITIALIZED' { return 'MANUAL_INTERVENTION_REQUIRED' }
    'OPERATION_INITIALIZATION_INTERRUPTED' { return 'MANUAL_INTERVENTION_REQUIRED' }
    'PREPARED' { if ($Observation.RollbackAcceptancePassed -and -not $Observation.CandidateAcceptancePassed) { return 'SAFE_TO_RESUME_PREFLIGHT' }; return 'MANUAL_INTERVENTION_REQUIRED' }
    'ACTIVATION_ATTEMPT_CONSUMED' { if ($Observation.CandidateAcceptancePassed) { return 'ACTIVATION_IN_PROGRESS' }; if ($Observation.ApiCandidate -or $Observation.WorkerCandidate) { return 'ROLLBACK_REQUIRED' }; return 'MANUAL_INTERVENTION_REQUIRED' }
    'ACTIVE_ACCEPTED' { if ($Observation.CandidateAcceptancePassed) { return 'NO_ACTION_REQUIRED' }; return 'MANUAL_INTERVENTION_REQUIRED' }
    'CANDIDATE_ACCEPTANCE_INTERRUPTED' { return 'MANUAL_INTERVENTION_REQUIRED' }
    'ACTIVATION_FAILED' {
      if ($Observation.RollbackAcceptancePassed -and -not $Observation.CandidateAcceptancePassed) { return 'NO_ACTION_REQUIRED' }
      $apiKnown = $Observation.ApiCandidate -or $Observation.ApiRollback
      $workerKnown = $Observation.WorkerCandidate -or $Observation.WorkerRollback
      if (($Observation.ApiCandidate -or $Observation.WorkerCandidate) -and $apiKnown -and $workerKnown -and -not $Observation.RollbackAcceptancePassed) { return 'ROLLBACK_REQUIRED' }
      return 'MANUAL_INTERVENTION_REQUIRED'
    }
    'ROLLBACK_ATTEMPT_CONSUMED' { return 'MANUAL_INTERVENTION_REQUIRED' }
    'ROLLED_BACK' { if ($Observation.RollbackAcceptancePassed) { return 'NO_ACTION_REQUIRED' }; return 'MANUAL_INTERVENTION_REQUIRED' }
    'ROLLBACK_ACCEPTANCE_INTERRUPTED' { return 'MANUAL_INTERVENTION_REQUIRED' }
    default { return 'MANUAL_INTERVENTION_REQUIRED' }
  }
}

function Test-RotationRecoveryRequiresRuntimeObservation($OperationState) {
  # These states are durably fail-closed before an observation exists.  Do not
  # make recovery depend on Docker availability when no observation can alter
  # the only permitted result: manual intervention.
  return $OperationState.State -notin @(
    'NEVER_INITIALIZED',
    'OPERATION_INITIALIZATION_INTERRUPTED',
    'CANDIDATE_ACCEPTANCE_INTERRUPTED',
    'ROLLBACK_ATTEMPT_CONSUMED',
    'ROLLBACK_ACCEPTANCE_INTERRUPTED',
    'MANUAL_INTERVENTION_REQUIRED'
  )
}
