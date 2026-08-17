Set-StrictMode -Version Latest

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

function Stop-Rotation([string]$Code) {
  throw [System.InvalidOperationException]::new($Code)
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
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  $planRoot = Join-Path $root 'rotation-plans'
  if (-not (Test-Path -LiteralPath $planRoot -PathType Container)) { Stop-Rotation 'ROTATION_PLAN_ROOT_MISSING' }
  Assert-RotationNoReparse $planRoot 'ROTATION_PLAN_REPARSE_PATH'
  if (-not $AllowSyntheticTestPermissions) { Assert-RotationPlanDirectorySecurity $planRoot }
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

function Read-RotationPlan([string]$TargetRoot, [string]$OperationId) {
  if (-not (Test-RotationGenerationId $OperationId)) { Stop-Rotation 'ROTATION_OPERATION_ID_INVALID' }
  $root = Get-RotationFullPath $TargetRoot 'ROTATION_ROOT_INVALID'
  $planRoot = Join-Path $root 'rotation-plans'
  if (-not (Test-Path -LiteralPath $planRoot -PathType Container)) { Stop-Rotation 'ROTATION_PLAN_MISSING' }
  Assert-RotationNoReparse $planRoot 'ROTATION_PLAN_REPARSE_PATH'
  Assert-RotationPlanDirectorySecurity $planRoot
  $path = Join-Path $planRoot ($OperationId + '.json')
  if (-not (Test-RotationPathInside $path $planRoot) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-Rotation 'ROTATION_PLAN_MISSING' }
  Assert-RotationNoReparse $path 'ROTATION_PLAN_REPARSE_PATH'
  try { $plan = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json } catch { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  if ($plan.schemaVersion -ne $script:RotationSchemaVersion -or $plan.operationId -cne $OperationId -or -not (Test-RotationGenerationId $plan.candidateGenerationId) -or -not (Test-RotationGenerationId $plan.currentGoodGenerationId) -or -not (Test-RotationRevision $plan.repositoryRevision) -or -not (Test-RotationSha256 $plan.apiImageId) -or -not (Test-RotationSha256 $plan.workerImageId) -or -not (Test-RotationAttemptBudget $plan)) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  if ($plan.status -notin @('PREPARED', 'VALIDATED', 'ACTIVATION_CANDIDATE', 'ACTIVE', 'PREVIOUS_GOOD', 'REJECTED', 'ROLLBACK_TARGET', 'ARCHIVED')) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  $rollback = $plan.rollback
  if ($null -eq $rollback -or -not (Test-RotationGenerationId $rollback.TargetGenerationId) -or $rollback.TargetGenerationId -cne $plan.currentGoodGenerationId -or -not (Test-RotationSha256 $rollback.ApiImageId) -or -not (Test-RotationSha256 $rollback.WorkerImageId) -or $rollback.ExpectedRuntimeMode -ne 'file' -or @($rollback.ExpectedHealthEndpoints).Count -ne 4 -or $null -eq $rollback.NonTargetContainerIds -or $null -eq $rollback.VolumeInventory) { Stop-Rotation 'ROTATION_PLAN_MALFORMED' }
  return $plan
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
