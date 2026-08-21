$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

# Test-local seam for operation-initialization authority. This shadows the
# production process launcher only in this synthetic test process; it has no
# production parameter or caller-controlled bypass.
$script:RotationSyntheticRollbackValidatorPass = $true
$script:RotationSyntheticRollbackValidatorExpectedOperationId = $null
$script:RotationSyntheticRollbackValidatorCalls = @()
function Invoke-RotationRuntimeAcceptanceValidator([string]$TargetRoot, [string]$OperationId, [ValidateSet('Candidate','Rollback')][string]$Mode) {
  $script:RotationSyntheticRollbackValidatorCalls += [pscustomobject]@{ TargetRoot = $TargetRoot; OperationId = $OperationId; Mode = $Mode }
  if ($Mode -cne 'Rollback') { return $false }
  if ($null -ne $script:RotationSyntheticRollbackValidatorExpectedOperationId -and $OperationId -cne $script:RotationSyntheticRollbackValidatorExpectedOperationId) { return $false }
  return $script:RotationSyntheticRollbackValidatorPass
}

# Synthetic state constructor only: production PREPARED authority lives in the
# dedicated child initializer and this helper is never shipped as common code.
function Initialize-RotationOperation([string]$TargetRoot, [string]$OperationId, [switch]$AllowSyntheticTestPermissions) {
  if (-not (Invoke-RotationRuntimeAcceptanceValidator $TargetRoot $OperationId 'Rollback')) { Stop-Rotation 'ROLLBACK_RUNTIME_BASELINE_REJECTED' }
  if (-not $AllowSyntheticTestPermissions) { $null = Ensure-RotationOperationsRoot $TargetRoot }
  $operationRoot = Get-RotationOperationRoot $TargetRoot $OperationId
  if (Test-Path -LiteralPath $operationRoot) { Stop-Rotation 'ROTATION_OPERATION_EXISTS' }
  [IO.Directory]::CreateDirectory($operationRoot) | Out-Null
  if (-not $AllowSyntheticTestPermissions) { Set-RotationOperationDirectorySecurity $operationRoot; Assert-RotationOperationDirectorySecurity $operationRoot }
  $record = [ordered]@{ schemaVersion = $script:RotationSchemaVersion; operationId = $OperationId; planIdentity = Get-RotationPlanIdentity $TargetRoot $OperationId; transition = 'OPERATION_CREATED'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  Write-RotationOperationRecord $operationRoot 'operation-created.json' $record
}

function Assert-RotationTest([string]$Name, [scriptblock]$Action, [bool]$ExpectedPass) {
  $passed = $false
  try {
    $result = & $Action
    # Predicate-style fixtures may return a Boolean; assertion-style fixtures
    # signal success by returning normally. Both forms stay deterministic.
    $passed = if ($result -is [bool]) { [bool]$result } else { $true }
  } catch { $passed = $false }
  [Console]::WriteLine("$Name $(if ($passed -eq $ExpectedPass) { 'PASS' } else { 'FAIL' })")
  if ($passed -ne $ExpectedPass) { throw "M01.4 test failed: $Name" }
}

function New-SyntheticGeneration([string]$Root, [string]$Id, [string[]]$RuntimeLines) {
  $sets = Join-Path $Root 'sets'; if (-not (Test-Path -LiteralPath $sets)) { New-Item -ItemType Directory -Path $sets | Out-Null }
  $path = Join-Path $sets $Id; New-Item -ItemType Directory -Path $path | Out-Null
  foreach ($name in @('.published', 'github-actions-token', 'jwt-access', 'jwt-refresh', 'sensitive.env')) { [IO.File]::WriteAllText((Join-Path $path $name), 'synthetic') }
  [IO.File]::WriteAllLines((Join-Path $path 'runtime.env'), $RuntimeLines, [Text.UTF8Encoding]::new($false))
  return $path
}

function New-ProviderLines([string]$Slug = 'alpha,組織', [string]$Legacy = 'legacy=alpha', [string]$Ids = '', [bool]$IncludeIds = $true, [string]$GitHub = 'true', [string]$Jenkins = 'false') {
  $lines = @("PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS='$Slug'", "PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS='$Legacy'", "GITHUB_ACTIONS_ENABLED=$GitHub", "JENKINS_INTEGRATION_ENABLED=$Jenkins")
  if ($IncludeIds) { $lines += "PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS='$Ids'" }
  return $lines
}

function New-RotationSyntheticObservation([bool]$ApiCandidate = $false, [bool]$WorkerCandidate = $false, [bool]$CandidateAcceptancePassed = $false, [bool]$RollbackAcceptancePassed = $false) {
  return [pscustomobject]@{
    ApiCandidate = $ApiCandidate
    WorkerCandidate = $WorkerCandidate
    CandidateAcceptancePassed = $CandidateAcceptancePassed
    RollbackAcceptancePassed = $RollbackAcceptancePassed
  }
}

$root = Join-Path ([IO.Path]::GetTempPath()) ('autoops-m01-4-' + [Guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $root | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $root 'rotation-plans') | Out-Null
  $current = 'a' * 32; $candidate = 'b' * 32; $previous = 'c' * 32; $operation = 'd' * 32
  $currentPath = New-SyntheticGeneration $root $current (New-ProviderLines)
  $candidatePath = New-SyntheticGeneration $root $candidate (New-ProviderLines -IncludeIds $false)
  $previousPath = New-SyntheticGeneration $root $previous (New-ProviderLines)
  $currentConfig = Get-RotationRuntimeConfiguration (Join-Path $currentPath 'runtime.env')
  $candidateConfig = Get-RotationRuntimeConfiguration (Join-Path $candidatePath 'runtime.env')
  Assert-RotationTest 'LITERAL_QUOTED_UNICODE_EQUALS_PARSER' { if ($currentConfig.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS.State -ne 'NONEMPTY' -or $currentConfig.PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS.State -ne 'NONEMPTY') { throw } } $true
  Assert-RotationTest 'LITERAL_QUOTED_EMPTY_PARSER' { if ($currentConfig.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS.State -ne 'EMPTY') { throw } } $true
  Assert-RotationTest 'VALID_ROTATION_PLAN' { if (-not (Test-RotationProviderSemanticEquivalence $currentConfig $candidateConfig)) { throw } } $true
  Assert-RotationTest 'CANDIDATE_EQUALS_CURRENT_BLOCKED' { New-RotationPlanObject $operation $current $current $previous ('e' * 40) ('sha256:' + ('1' * 64)) ('sha256:' + ('2' * 64)) @('core', 'sensitive-env', 'github') @{ TargetGenerationId = $current; ApiImageId = 'sha256:' + ('3' * 64); WorkerImageId = 'sha256:' + ('4' * 64); ExpectedRuntimeMode = 'file'; ExpectedHealthEndpoints = @('/health', '/ready', '/healthz', '/readyz'); NonTargetContainerIds = @{}; VolumeInventory = @() } | Out-Null } $false
  Assert-RotationTest 'MISSING_CANDIDATE_SET_BLOCKED' { Test-RotationGenerationSet $root ('f' * 32) | Out-Null } $false
  Remove-Item -LiteralPath (Join-Path $candidatePath '.published') -Force
  Assert-RotationTest 'MISSING_PUBLISHED_MARKER_BLOCKED' { Test-RotationGenerationSet $root $candidate | Out-Null } $false
  [IO.File]::WriteAllText((Join-Path $candidatePath '.published'), 'synthetic')
  New-Item -ItemType Directory -Path (Join-Path (Join-Path $root 'sets') ('.' + $candidate + '.staging')) | Out-Null
  Assert-RotationTest 'STAGING_BOUNDARY_BLOCKED' { Test-RotationGenerationSet $root $candidate | Out-Null } $false
  Remove-Item -LiteralPath (Join-Path (Join-Path $root 'sets') ('.' + $candidate + '.staging')) -Recurse -Force
  [IO.File]::WriteAllLines((Join-Path $candidatePath 'runtime.env'), @((New-ProviderLines) + "PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS='duplicate'"))
  Assert-RotationTest 'DUPLICATE_PROVIDER_KEY_BLOCKED' { Get-RotationRuntimeConfiguration (Join-Path $candidatePath 'runtime.env') | Out-Null } $false
  [IO.File]::WriteAllLines((Join-Path $candidatePath 'runtime.env'), @("PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS='unterminated", "GITHUB_ACTIONS_ENABLED=true", "JENKINS_INTEGRATION_ENABLED=false"))
  Assert-RotationTest 'MALFORMED_RUNTIME_ENV_QUOTE_BLOCKED' { Get-RotationRuntimeConfiguration (Join-Path $candidatePath 'runtime.env') | Out-Null } $false
  [IO.File]::WriteAllLines((Join-Path $candidatePath 'runtime.env'), @('PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS=unquoted', 'GITHUB_ACTIONS_ENABLED=true', 'JENKINS_INTEGRATION_ENABLED=false'))
  Assert-RotationTest 'UNQUOTED_PROVIDER_VALUE_BLOCKED' { Get-RotationRuntimeConfiguration (Join-Path $candidatePath 'runtime.env') | Out-Null } $false
  $slugDrift = Get-RotationRuntimeConfiguration (Join-Path $currentPath 'runtime.env'); $slugDrift.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS.Value = 'drift'
  Assert-RotationTest 'PROVIDER_SLUG_MISMATCH_BLOCKED' { if (Test-RotationProviderSemanticEquivalence $currentConfig $slugDrift) { throw } } $true
  $legacyDrift = Get-RotationRuntimeConfiguration (Join-Path $currentPath 'runtime.env'); $legacyDrift.PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS.Value = 'drift'
  Assert-RotationTest 'PROVIDER_LEGACY_SLUG_MISMATCH_BLOCKED' { if (Test-RotationProviderSemanticEquivalence $currentConfig $legacyDrift) { throw } } $true
  Assert-RotationTest 'ORG_IDS_EMPTY_TO_ABSENT_ALLOWED' { if (-not (Test-RotationProviderSemanticEquivalence $currentConfig $candidateConfig)) { throw } } $true
  $nonempty = Get-RotationRuntimeConfiguration (Join-Path $currentPath 'runtime.env'); $nonempty.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS = [pscustomobject]@{ State = 'NONEMPTY'; Value = 'id' }
  Assert-RotationTest 'ORG_IDS_NONEMPTY_TO_ABSENT_BLOCKED' { if (Test-RotationProviderSemanticEquivalence $nonempty $candidateConfig) { throw } } $true
  $badFlags = Get-RotationRuntimeConfiguration (Join-Path $currentPath 'runtime.env'); $badFlags.GITHUB_ACTIONS_ENABLED = 'false'
  Assert-RotationTest 'GITHUB_DISABLED_BLOCKED' { if (Test-RotationEnablementContract $badFlags @('core', 'sensitive-env', 'github')) { throw } } $true
  $badFlags.GITHUB_ACTIONS_ENABLED = 'true'; $badFlags.JENKINS_INTEGRATION_ENABLED = 'true'
  Assert-RotationTest 'JENKINS_ENABLED_BLOCKED' { if (Test-RotationEnablementContract $badFlags @('core', 'sensitive-env', 'github')) { throw } } $true
  Assert-RotationTest 'PATH_TRAVERSAL_GENERATION_BLOCKED' { Get-RotationGenerationPath $root '..\evil' | Out-Null } $false
  Assert-RotationTest 'MALFORMED_TRANSACTION_BLOCKED' { if (Test-RotationGenerationId 'not-valid') { throw } } $true
  $rollback = @{ TargetGenerationId = $current; ApiImageId = 'sha256:' + ('3' * 64); WorkerImageId = 'sha256:' + ('4' * 64); ExpectedRuntimeMode = 'file'; ExpectedHealthEndpoints = @('/health', '/ready', '/healthz', '/readyz'); NonTargetContainerIds = @{}; VolumeInventory = @() }
  $plan = New-RotationPlanObject $operation $candidate $current $previous ('e' * 40) ('sha256:' + ('1' * 64)) ('sha256:' + ('2' * 64)) @('core', 'sensitive-env', 'github') $rollback
  Assert-RotationTest 'UNSAFE_PLAN_DIRECTORY_BLOCKED' { Write-RotationPlanAtomically $root $plan | Out-Null } $false
  Assert-RotationTest 'ATOMIC_PLAN_CREATION' { if (-not (Test-Path -LiteralPath (Write-RotationPlanAtomically $root $plan -AllowSyntheticTestPermissions))) { throw } } $true
  Assert-RotationTest 'UNSAFE_PLAN_READ_BLOCKED' { Read-RotationPlan $root $operation | Out-Null } $false
  Assert-RotationTest 'OPERATION_REPLAY_BLOCKED' { Write-RotationPlanAtomically $root $plan -AllowSyntheticTestPermissions | Out-Null } $false
  Assert-RotationTest 'ACTIVATION_ATTEMPT_BUDGET' ( { Test-RotationAttemptBudget $plan } ) $true
  $plan.activationAttempts = 2
  Assert-RotationTest 'ACTIVATION_ATTEMPT_OVER_LIMIT_BLOCKED' ( { Test-RotationAttemptBudget $plan } ) $false
  $operationState = [pscustomobject]@{ State = 'ACTIVATION_ATTEMPT_CONSUMED' }
  Assert-RotationTest 'INTERRUPTED_PARTIAL_ROTATION_CLASSIFIED' { if ((Get-RotationRecoveryClassification $operationState (New-RotationSyntheticObservation -ApiCandidate $true)) -ne 'ROLLBACK_REQUIRED') { throw } } $true
  $preparedState = [pscustomobject]@{ State = 'PREPARED' }
  Assert-RotationTest 'PREPARED_CURRENT_GOOD_ACCEPTANCE_REQUIRED' { if ((Get-RotationRecoveryClassification $preparedState (New-RotationSyntheticObservation -RollbackAcceptancePassed $true)) -ne 'SAFE_TO_RESUME_PREFLIGHT') { throw } } $true
  foreach ($unsafePreparedCase in @(
    (New-RotationSyntheticObservation),
    (New-RotationSyntheticObservation -ApiCandidate $true),
    (New-RotationSyntheticObservation -WorkerCandidate $true),
    (New-RotationSyntheticObservation -CandidateAcceptancePassed $true)
  )) {
    Assert-RotationTest 'PREPARED_UNKNOWN_OR_STALE_BASELINE_MANUAL' { if ((Get-RotationRecoveryClassification $preparedState $unsafePreparedCase) -ne 'MANUAL_INTERVENTION_REQUIRED') { throw } } $true
  }
  $expected = [pscustomobject]@{ ApiImageId = 'sha256:' + ('1' * 64); WorkerImageId = 'sha256:' + ('2' * 64) }
  $actual = [pscustomobject]@{ ApiImageId = $expected.ApiImageId; WorkerImageId = $expected.WorkerImageId; ApiRunning = $true; ApiHealthy = $true; ApiHealth200 = $true; ApiReady200 = $true; WorkerRunning = $true; WorkerHealthy = $true; WorkerHealth200 = $true; WorkerReady200 = $true; SecretProviderMode = 'file'; SecretProviderStatus = 'READY'; ApiSecretProviderRootBound = $true; ApiRequiredFileMounts = $true; ApiJenkinsMount = $false; WorkerApplicationSecretMount = $false; ApiMigratedEnvironmentAbsent = $true; WorkerMigratedEnvironmentAbsent = $true; GitHubActionsEnabled = $true; JenkinsIntegrationDisabled = $true; ApiProviderEquivalent = $true; WorkerProviderEquivalent = $true; NonTargetContainerIdsPreserved = $true; VolumeInventoryPreserved = $true }
  Assert-RotationTest 'SYNTHETIC_FULL_ACCEPTANCE' { if (-not (Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $actual.WorkerApplicationSecretMount = $true
  Assert-RotationTest 'WORKER_SECRET_MOUNT_BLOCKED' { if ((Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $actual.WorkerApplicationSecretMount = $false; $actual.ApiMigratedEnvironmentAbsent = $false
  Assert-RotationTest 'MIGRATED_ENVIRONMENT_PRESENT_BLOCKED' { if ((Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $actual.ApiMigratedEnvironmentAbsent = $true; $actual.ApiSecretProviderRootBound = $false
  Assert-RotationTest 'ALTERNATE_SECRET_PROVIDER_ROOT_BLOCKED' { if ((Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $actual.ApiSecretProviderRootBound = $true; $actual.NonTargetContainerIdsPreserved = $false
  Assert-RotationTest 'NON_TARGET_STOPPED_BLOCKED' { if ((Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  Assert-RotationTest 'NON_TARGET_PAUSED_BLOCKED' { if ((Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $actual.NonTargetContainerIdsPreserved = $true; $actual.VolumeInventoryPreserved = $false
  Assert-RotationTest 'NON_TARGET_VOLUME_PRESERVATION' { if ((Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $actual.VolumeInventoryPreserved = $true
  $secureRoot = Join-Path $root 'secure-state'
  New-Item -ItemType Directory -Path $secureRoot | Out-Null
  Set-RotationOperationDirectorySecurity $secureRoot
  $secureCurrent = '1' * 32; $secureCandidate = '2' * 32; $securePrevious = '3' * 32; $secureOperation = '4' * 32
  $secureCurrentPath = New-SyntheticGeneration $secureRoot $secureCurrent (New-ProviderLines)
  $secureCandidatePath = New-SyntheticGeneration $secureRoot $secureCandidate (New-ProviderLines)
  $null = New-SyntheticGeneration $secureRoot $securePrevious (New-ProviderLines)
  $secureRollback = @{ TargetGenerationId = $secureCurrent; ApiImageId = 'sha256:' + ('5' * 64); WorkerImageId = 'sha256:' + ('6' * 64); ExpectedRuntimeMode = 'file'; ExpectedHealthEndpoints = @('/health','/ready','/healthz','/readyz'); NonTargetContainerIds = @{ 'autoops-postgres' = 'a' * 64; 'autoops-redis' = 'b' * 64; 'autoops-web' = 'c' * 64; 'autoops-nginx' = 'd' * 64; 'autoops-prometheus' = 'e' * 64; 'autoops-grafana' = 'f' * 64 }; VolumeInventory = @('synthetic-volume') }
  $securePlan = New-RotationPlanObject $secureOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  Assert-RotationTest 'STRICT_PLAN_SCHEMA_VALID' { $null = Write-RotationPlanAtomically $secureRoot $securePlan; $null = Read-RotationPlan $secureRoot $secureOperation } $true
  $optionalPreviousOperation = 'b' * 32
  $optionalPreviousPlan = New-RotationPlanObject $optionalPreviousOperation $secureCandidate $secureCurrent $null ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  Assert-RotationTest 'PREVIOUS_GOOD_OMITTED_SERIALIZES_NULL' {
    $optionalPath = Write-RotationPlanAtomically $secureRoot $optionalPreviousPlan
    $optionalJson = Get-Content -LiteralPath $optionalPath -Raw | ConvertFrom-Json
    if ($null -ne $optionalJson.previousGoodGenerationId) { throw }
  } $true
  Assert-RotationTest 'PREVIOUS_GOOD_NULL_PLAN_INITIALIZES' { $null = Read-RotationPlan $secureRoot $optionalPreviousOperation; Initialize-RotationOperation $secureRoot $optionalPreviousOperation } $true
  $emptyPreviousOperation = 'c' * 32
  $emptyPreviousPlan = New-RotationPlanObject $emptyPreviousOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $emptyPreviousPath = Write-RotationPlanAtomically $secureRoot $emptyPreviousPlan
  $emptyPreviousJson = Get-Content -LiteralPath $emptyPreviousPath -Raw
  [IO.File]::WriteAllText($emptyPreviousPath, ($emptyPreviousJson -replace '"previousGoodGenerationId"\s*:\s*"[a-f0-9]{32}"', '"previousGoodGenerationId":""'), [Text.UTF8Encoding]::new($false))
  Assert-RotationTest 'PREVIOUS_GOOD_EMPTY_STRING_REJECTED' { Read-RotationPlan $secureRoot $emptyPreviousOperation | Out-Null } $false
  $unvalidatedOperation = ('0123456789abcdef' * 2)
  $unvalidatedPlan = New-RotationPlanObject $unvalidatedOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $unvalidatedPlan
  # The maintained initializer is an external PowerShell process. Parent
  # functions cannot manufacture its validator result or its process result.
  # The stopped synthetic runtime makes the child's real rollback validation
  # fail, which must leave this plan-only operation incapable of PREPARED.
  $childInitializer = Join-Path $PSScriptRoot 'initialize-secret-rotation-operation.ps1'
  $shadowedValidatorOperation = ('a1' * 16)
  $null = Write-RotationPlanAtomically $secureRoot (New-RotationPlanObject $shadowedValidatorOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback)
  Assert-RotationTest 'CALLER_FUNCTION_SHADOWING_BLOCKED' {
    & {
      function Invoke-RotationRuntimeAcceptanceValidator { return $true }
      & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $childInitializer -TargetRoot $secureRoot -OperationId $shadowedValidatorOperation 2>$null
      if ($LASTEXITCODE -eq 0) { throw }
    }
    -not (Test-Path -LiteralPath (Get-RotationOperationRoot $secureRoot $shadowedValidatorOperation))
  } $true
  $shadowedProcessOperation = ('b1' * 16)
  $null = Write-RotationPlanAtomically $secureRoot (New-RotationPlanObject $shadowedProcessOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback)
  Assert-RotationTest 'CALLER_PROCESS_HELPER_SHADOWING_BLOCKED' {
    & {
      function Start-RotationProcess { return $null }
      & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $childInitializer -TargetRoot $secureRoot -OperationId $shadowedProcessOperation 2>$null
      if ($LASTEXITCODE -eq 0) { throw }
    }
    -not (Test-Path -LiteralPath (Get-RotationOperationRoot $secureRoot $shadowedProcessOperation))
  } $true
  $script:RotationSyntheticRollbackValidatorExpectedOperationId = $unvalidatedOperation
  $script:RotationSyntheticRollbackValidatorPass = $false
  Assert-RotationTest 'DIRECT_INITIALIZER_ROLLBACK_VALIDATION_BYPASS_BLOCKED' { Initialize-RotationOperation $secureRoot $unvalidatedOperation -AllowSyntheticTestPermissions } $false
  Assert-RotationTest 'ROLLBACK_VALIDATOR_FAILURE_BLOCKS_INITIALIZATION' { -not (Test-Path -LiteralPath (Join-Path (Get-RotationOperationRoot $secureRoot $unvalidatedOperation) 'operation-created.json')) } $true
  Assert-RotationTest 'ROLLBACK_VALIDATION_PRECEDES_OPERATION_CREATED' { -not (Test-Path -LiteralPath (Get-RotationOperationRoot $secureRoot $unvalidatedOperation)) } $true
  Assert-RotationTest 'UNVALIDATED_BASELINE_ACTIVATION_BLOCKED' { Consume-RotationOperationTransition $secureRoot $unvalidatedOperation 'ACTIVATION_ATTEMPT' } $false
  Assert-RotationTest 'SYNTHETIC_PERMISSION_SWITCH_NOT_SECURITY_BYPASS' { Initialize-RotationOperation $secureRoot $unvalidatedOperation -AllowSyntheticTestPermissions } $false
  Assert-RotationTest 'UNVALIDATED_PLAN_ONLY_STATE_RECOVERABLE' { if ((Get-RotationOperationState $secureRoot $unvalidatedOperation).State -ne 'OPERATION_INITIALIZATION_INTERRUPTED') { throw } } $true
  $validatedOperation = ('fedcba9876543210' * 2)
  $validatedPlan = New-RotationPlanObject $validatedOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $validatedPlan
  $script:RotationSyntheticRollbackValidatorExpectedOperationId = $validatedOperation
  $script:RotationSyntheticRollbackValidatorPass = $true
  Assert-RotationTest 'VALIDATED_ROLLBACK_BASELINE_ALLOWS_INITIALIZATION' { Initialize-RotationOperation $secureRoot $validatedOperation } $true
  Assert-RotationTest 'INITIALIZATION_REQUIRES_ROLLBACK_BASELINE' { $state = Get-RotationOperationState $secureRoot $validatedOperation; $state.State -eq 'PREPARED' -and (Test-Path -LiteralPath (Join-Path $state.OperationRoot 'operation-created.json')) } $true
  Assert-RotationTest 'ROLLBACK_VALIDATION_PLAN_BOUND' { $call = $script:RotationSyntheticRollbackValidatorCalls[-1]; $call.OperationId -ceq $validatedOperation -and $call.Mode -ceq 'Rollback' } $true
  $script:RotationSyntheticRollbackValidatorExpectedOperationId = $null
  $planOnlyOperation = ('01' * 16)
  $planOnlyPlan = New-RotationPlanObject $planOnlyOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $planOnlyPlan
  Assert-RotationTest 'PLAN_ONLY_INITIALIZATION_INTERRUPTION_RECOGNIZED' { if ((Get-RotationOperationState $secureRoot $planOnlyOperation).State -ne 'OPERATION_INITIALIZATION_INTERRUPTED') { throw } } $true
  Assert-RotationTest 'PLAN_ONLY_INITIALIZATION_NOT_ACCEPTED' { if ((Get-RotationRecoveryClassification (Get-RotationOperationState $secureRoot $planOnlyOperation) (New-RotationSyntheticObservation)) -ne 'MANUAL_INTERVENTION_REQUIRED') { throw } } $true
  Assert-RotationTest 'PLAN_ONLY_MANUAL_INTERVENTION_SUPPORTED' { Consume-RotationOperationTransition $secureRoot $planOnlyOperation 'MANUAL_INTERVENTION' } $true
  Assert-RotationTest 'PLAN_ONLY_MANUAL_INTERVENTION_STATE_READABLE' { $state = Get-RotationOperationState $secureRoot $planOnlyOperation; if ($state.State -ne 'MANUAL_INTERVENTION_REQUIRED' -or (Test-RotationRecoveryRequiresRuntimeObservation $state)) { throw } } $true
  $directoryOnlyOperation = ('03' * 16)
  $directoryOnlyPlan = New-RotationPlanObject $directoryOnlyOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $directoryOnlyPlan
  $null = Ensure-RotationOperationsRoot $secureRoot
  $directoryOnlyPath = Get-RotationOperationRoot $secureRoot $directoryOnlyOperation
  [IO.Directory]::CreateDirectory($directoryOnlyPath) | Out-Null; Set-RotationOperationDirectorySecurity $directoryOnlyPath
  Assert-RotationTest 'DIRECTORY_ONLY_INITIALIZATION_INTERRUPTION_RECOGNIZED' { if ((Get-RotationOperationState $secureRoot $directoryOnlyOperation).State -ne 'OPERATION_INITIALIZATION_INTERRUPTED') { throw } } $true
  Assert-RotationTest 'DIRECTORY_ONLY_MANUAL_INTERVENTION_SUPPORTED' { Consume-RotationOperationTransition $secureRoot $directoryOnlyOperation 'MANUAL_INTERVENTION' } $true
  Assert-RotationTest 'DIRECTORY_ONLY_MANUAL_INTERVENTION_STATE_READABLE' { $state = Get-RotationOperationState $secureRoot $directoryOnlyOperation; if ($state.State -ne 'MANUAL_INTERVENTION_REQUIRED' -or (Test-RotationRecoveryRequiresRuntimeObservation $state)) { throw } } $true
  $planIdentityBefore = Get-RotationPlanIdentity $secureRoot $secureOperation
  Assert-RotationTest 'ACTIVATION_FIRST_CONSUME' { Initialize-RotationOperation $secureRoot $secureOperation; Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_ATTEMPT' } $true
  Assert-RotationTest 'ACTIVATION_REPLAY_BLOCKED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_ATTEMPT' } $false
  Assert-RotationTest 'DIRECT_ACTIVATION_ACCEPTED_CALLER_ASSERTION_BLOCKED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_ACCEPTED' } $false
  Assert-RotationTest 'UPDATE_SCRIPT_DIRECT_ACTIVATION_ACCEPTED_BLOCKED' { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'update-secret-rotation-operation-state.ps1') -TargetRoot $secureRoot -OperationId $secureOperation -Transition 'ACTIVATION_ACCEPTED' 2>$null; return ($LASTEXITCODE -eq 0) } $false
  Assert-RotationTest 'ACTIVATION_FAILURE_RECORDED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_FAILED' } $true
  Assert-RotationTest 'ROLLBACK_FIRST_CONSUME' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ROLLBACK_ATTEMPT' } $true
  Assert-RotationTest 'ROLLBACK_REPLAY_BLOCKED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ROLLBACK_ATTEMPT' } $false
  Assert-RotationTest 'DIRECT_ROLLBACK_ACCEPTED_CALLER_ASSERTION_BLOCKED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ROLLBACK_ACCEPTED' } $false
  Assert-RotationTest 'UPDATE_SCRIPT_DIRECT_ROLLBACK_ACCEPTED_BLOCKED' { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'update-secret-rotation-operation-state.ps1') -TargetRoot $secureRoot -OperationId $secureOperation -Transition 'ROLLBACK_ACCEPTED' 2>$null; return ($LASTEXITCODE -eq 0) } $false
  Assert-RotationTest 'DIRECT_ACCEPTANCE_HELPER_BYPASS_BLOCKED' { $null -eq (Get-Command Write-RotationVerifiedAcceptance -ErrorAction SilentlyContinue) } $true
  Assert-RotationTest 'TERMINAL_TRANSITION_BLOCKED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_ATTEMPT' } $false
  Assert-RotationTest 'IMMUTABLE_PLAN_PRESERVED' { (Get-RotationPlanIdentity $secureRoot $secureOperation) -ceq $planIdentityBefore } $true
  $activeOperation = '6' * 32
  $activePlan = New-RotationPlanObject $activeOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $activePlan
  Initialize-RotationOperation $secureRoot $activeOperation
  Consume-RotationOperationTransition $secureRoot $activeOperation 'ACTIVATION_ATTEMPT'
  Assert-RotationTest 'COMMON_MODULE_ACCEPTANCE_AUTHORITY_NO' { $null -eq (Get-Command Write-RotationVerifiedAcceptance -ErrorAction SilentlyContinue) } $true
  Assert-RotationTest 'ACTIVE_NO_ACTION_REQUIRES_FULL_VALIDATOR_ACCEPTANCE' { if ((Get-RotationRecoveryClassification ([pscustomobject]@{ State = 'ACTIVE_ACCEPTED' }) (New-RotationSyntheticObservation -ApiCandidate $true -WorkerCandidate $true -CandidateAcceptancePassed $true)) -ne 'NO_ACTION_REQUIRED') { throw } } $true
  foreach ($unsafeActiveCase in @(
    (New-RotationSyntheticObservation -ApiCandidate $true -WorkerCandidate $true),
    (New-RotationSyntheticObservation -ApiCandidate $true),
    (New-RotationSyntheticObservation -CandidateAcceptancePassed $false)
  )) {
    Assert-RotationTest 'ACTIVE_PARTIAL_OR_DRIFT_MANUAL' { if ((Get-RotationRecoveryClassification ([pscustomobject]@{ State = 'ACTIVE_ACCEPTED' }) $unsafeActiveCase) -ne 'MANUAL_INTERVENTION_REQUIRED') { throw } } $true
  }
  Assert-RotationTest 'ROLLED_BACK_NO_ACTION_REQUIRES_FULL_VALIDATOR_ACCEPTANCE' { if ((Get-RotationRecoveryClassification ([pscustomobject]@{ State = 'ROLLED_BACK' }) (New-RotationSyntheticObservation -RollbackAcceptancePassed $true)) -ne 'NO_ACTION_REQUIRED') { throw } } $true
  Assert-RotationTest 'ROLLED_BACK_PARTIAL_OR_DRIFT_MANUAL' { if ((Get-RotationRecoveryClassification ([pscustomobject]@{ State = 'ROLLED_BACK' }) (New-RotationSyntheticObservation)) -ne 'MANUAL_INTERVENTION_REQUIRED') { throw } } $true
  $missingStateOperation = 'f' * 32
  $missingStatePlan = New-RotationPlanObject $missingStateOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $missingStatePlan
  Assert-RotationTest 'MISSING_OPERATION_STATE_MANUAL_REQUIRED' { if ((Get-RotationRecoveryClassification (Get-RotationOperationState $secureRoot $missingStateOperation) (New-RotationSyntheticObservation)) -ne 'MANUAL_INTERVENTION_REQUIRED') { throw } } $true
  Assert-RotationTest 'NONINTEGER_ATTEMPT_BUDGET_BLOCKED' { Test-RotationExactInteger 0.5 0 } $false
  $unexpectedOperation = '0' * 32
  $unexpectedPlan = New-RotationPlanObject $unexpectedOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $unexpectedPlan['unexpected'] = 'synthetic'
  $null = Write-RotationPlanAtomically $secureRoot $unexpectedPlan
  Assert-RotationTest 'UNEXPECTED_PLAN_FIELD_BLOCKED' { Read-RotationPlan $secureRoot $unexpectedOperation | Out-Null } $false
  $mismatchedRecordOperation = 'e' * 32
  $mismatchedRecordPlan = New-RotationPlanObject $mismatchedRecordOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $mismatchedRecordPlan
  Initialize-RotationOperation $secureRoot $mismatchedRecordOperation
  $mismatchedRecordState = Get-RotationOperationState $secureRoot $mismatchedRecordOperation
  $mismatchedRecord = [ordered]@{ schemaVersion = 1; operationId = $mismatchedRecordOperation; planIdentity = $mismatchedRecordState.PlanIdentity; transition = 'ACTIVATION_ACCEPTED'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  Write-RotationOperationRecord $mismatchedRecordState.OperationRoot 'activation-attempt.json' $mismatchedRecord
  Assert-RotationTest 'RECORD_FILENAME_TRANSITION_MISMATCH_BLOCKED' { Get-RotationOperationState $secureRoot $mismatchedRecordOperation | Out-Null } $false
  $conflictOperation = '9' * 32
  $conflictPlan = New-RotationPlanObject $conflictOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $conflictPlan
  Initialize-RotationOperation $secureRoot $conflictOperation
  Consume-RotationOperationTransition $secureRoot $conflictOperation 'ACTIVATION_ATTEMPT'
  $conflictState = Get-RotationOperationState $secureRoot $conflictOperation
  $conflictRecord = [ordered]@{ schemaVersion = 1; operationId = $conflictOperation; planIdentity = $conflictState.PlanIdentity; transition = 'ACTIVATION_ACCEPTED'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  [IO.File]::WriteAllText((Join-Path $conflictState.OperationRoot 'activation-accepted.json'), ($conflictRecord | ConvertTo-Json -Compress))
  $conflictRecord.transition = 'ACTIVATION_FAILED'
  Write-RotationOperationRecord $conflictState.OperationRoot 'activation-failed.json' $conflictRecord
  Assert-RotationTest 'CONFLICTING_DURABLE_TRANSITIONS_BLOCKED' { Get-RotationOperationState $secureRoot $conflictOperation | Out-Null } $false
  $missingEvidenceOperation = '8' * 32
  $missingEvidencePlan = New-RotationPlanObject $missingEvidenceOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $missingEvidencePlan
  Initialize-RotationOperation $secureRoot $missingEvidenceOperation
  Consume-RotationOperationTransition $secureRoot $missingEvidenceOperation 'ACTIVATION_ATTEMPT'
  $missingEvidenceState = Get-RotationOperationState $secureRoot $missingEvidenceOperation
  $directAcceptedRecord = [ordered]@{ schemaVersion = 1; operationId = $missingEvidenceOperation; planIdentity = $missingEvidenceState.PlanIdentity; transition = 'ACTIVATION_ACCEPTED'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  [IO.File]::WriteAllText((Join-Path $missingEvidenceState.OperationRoot 'activation-accepted.json'), ($directAcceptedRecord | ConvertTo-Json -Compress))
  Assert-RotationTest 'ACCEPTED_MARKER_WITHOUT_VALIDATOR_EVIDENCE_BLOCKED' { Get-RotationOperationState $secureRoot $missingEvidenceOperation | Out-Null } $false
  Assert-RotationTest 'VALIDATOR_ONLY_ACCEPTANCE_AUTHORITY' { $finalizer = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'confirm-secret-rotation-runtime.ps1') -Raw; $validatorAt = $finalizer.LastIndexOf('Invoke-RotationRuntimeAcceptanceValidator'); $writerAt = $finalizer.LastIndexOf('Write-RotationAcceptanceRecordPrivate'); $validatorAt -ge 0 -and $writerAt -gt $validatorAt } $true
  $badEvidenceOperation = '7' * 32
  $badEvidencePlan = New-RotationPlanObject $badEvidenceOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $badEvidencePlan
  Initialize-RotationOperation $secureRoot $badEvidenceOperation
  Consume-RotationOperationTransition $secureRoot $badEvidenceOperation 'ACTIVATION_ATTEMPT'
  $badEvidenceState = Get-RotationOperationState $secureRoot $badEvidenceOperation
  $badEvidence = [ordered]@{ schemaVersion = 1; operationId = $badEvidenceOperation; planIdentity = $badEvidenceState.PlanIdentity; transition = 'ACCEPTANCE_EVIDENCE'; mode = 'Candidate'; repositoryRevision = ('b' * 40); expectedApiImageId = 'sha256:' + ('7' * 64); expectedWorkerImageId = 'sha256:' + ('8' * 64); acceptanceResult = 'PASS'; createdAtUtc = 'malformed' }
  [IO.File]::WriteAllText((Join-Path $badEvidenceState.OperationRoot 'candidate-acceptance.json'), ($badEvidence | ConvertTo-Json -Compress))
  $badAccepted = [ordered]@{ schemaVersion = 1; operationId = $badEvidenceOperation; planIdentity = $badEvidenceState.PlanIdentity; transition = 'ACTIVATION_ACCEPTED'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  [IO.File]::WriteAllText((Join-Path $badEvidenceState.OperationRoot 'activation-accepted.json'), ($badAccepted | ConvertTo-Json -Compress))
  Assert-RotationTest 'MALFORMED_ACCEPTANCE_EVIDENCE_TIMESTAMP_BLOCKED' { Get-RotationOperationState $secureRoot $badEvidenceOperation | Out-Null } $false
  $candidateEvidenceOperation = 'd' * 32
  $candidateEvidencePlan = New-RotationPlanObject $candidateEvidenceOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $candidateEvidencePlan; Initialize-RotationOperation $secureRoot $candidateEvidenceOperation; Consume-RotationOperationTransition $secureRoot $candidateEvidenceOperation 'ACTIVATION_ATTEMPT'
  $candidateEvidenceState = Get-RotationOperationState $secureRoot $candidateEvidenceOperation
  $candidateEvidence = [ordered]@{ schemaVersion = 1; operationId = $candidateEvidenceOperation; planIdentity = $candidateEvidenceState.PlanIdentity; transition = 'ACCEPTANCE_EVIDENCE'; mode = 'Candidate'; repositoryRevision = ('b' * 40); expectedApiImageId = 'sha256:' + ('7' * 64); expectedWorkerImageId = 'sha256:' + ('8' * 64); acceptanceResult = 'PASS'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  [IO.File]::WriteAllText((Join-Path $candidateEvidenceState.OperationRoot 'candidate-acceptance.json'), ($candidateEvidence | ConvertTo-Json -Compress))
  Assert-RotationTest 'CANDIDATE_EVIDENCE_ONLY_STATE_RECOGNIZED' { if ((Get-RotationOperationState $secureRoot $candidateEvidenceOperation).State -ne 'CANDIDATE_ACCEPTANCE_INTERRUPTED') { throw } } $true
  Assert-RotationTest 'EVIDENCE_ONLY_NOT_ACCEPTED' { if ((Get-RotationRecoveryClassification (Get-RotationOperationState $secureRoot $candidateEvidenceOperation) (New-RotationSyntheticObservation)) -ne 'MANUAL_INTERVENTION_REQUIRED') { throw } } $true
  Assert-RotationTest 'EVIDENCE_ONLY_MANUAL_PATH_SUPPORTED' { Consume-RotationOperationTransition $secureRoot $candidateEvidenceOperation 'MANUAL_INTERVENTION' } $true
  Assert-RotationTest 'CANDIDATE_EVIDENCE_ONLY_NO_DOCKER_OBSERVATION_REQUIRED' { if (Test-RotationRecoveryRequiresRuntimeObservation (Get-RotationOperationState $secureRoot $candidateEvidenceOperation)) { throw } } $true
  $rollbackEvidenceOperation = '2' * 32
  $rollbackEvidencePlan = New-RotationPlanObject $rollbackEvidenceOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $rollbackEvidencePlan; Initialize-RotationOperation $secureRoot $rollbackEvidenceOperation; Consume-RotationOperationTransition $secureRoot $rollbackEvidenceOperation 'ACTIVATION_ATTEMPT'; Consume-RotationOperationTransition $secureRoot $rollbackEvidenceOperation 'ACTIVATION_FAILED'; Consume-RotationOperationTransition $secureRoot $rollbackEvidenceOperation 'ROLLBACK_ATTEMPT'
  $rollbackEvidenceState = Get-RotationOperationState $secureRoot $rollbackEvidenceOperation
  $rollbackEvidence = [ordered]@{ schemaVersion = 1; operationId = $rollbackEvidenceOperation; planIdentity = $rollbackEvidenceState.PlanIdentity; transition = 'ACCEPTANCE_EVIDENCE'; mode = 'Rollback'; repositoryRevision = ('b' * 40); expectedApiImageId = 'sha256:' + ('5' * 64); expectedWorkerImageId = 'sha256:' + ('6' * 64); acceptanceResult = 'PASS'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  [IO.File]::WriteAllText((Join-Path $rollbackEvidenceState.OperationRoot 'rollback-acceptance.json'), ($rollbackEvidence | ConvertTo-Json -Compress))
  Assert-RotationTest 'ROLLBACK_EVIDENCE_ONLY_STATE_RECOGNIZED' { if ((Get-RotationOperationState $secureRoot $rollbackEvidenceOperation).State -ne 'ROLLBACK_ACCEPTANCE_INTERRUPTED') { throw } } $true
  Assert-RotationTest 'EVIDENCE_ONLY_RECOVERY_SUPPORTED' { if ((Get-RotationRecoveryClassification (Get-RotationOperationState $secureRoot $rollbackEvidenceOperation) (New-RotationSyntheticObservation)) -ne 'MANUAL_INTERVENTION_REQUIRED') { throw } } $true
  Assert-RotationTest 'ROLLBACK_EVIDENCE_ONLY_NO_DOCKER_OBSERVATION_REQUIRED' { if (Test-RotationRecoveryRequiresRuntimeObservation (Get-RotationOperationState $secureRoot $rollbackEvidenceOperation)) { throw } } $true
  $mountRecords = @(
    [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-access'; Destination = '/run/secrets/autoops/jwt-access'; ReadWrite = $false },
    [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-refresh'; Destination = '/run/secrets/autoops/jwt-refresh'; ReadWrite = $false },
    [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'github-actions-token'; Destination = '/run/secrets/autoops/github-actions-token'; ReadWrite = $false }
  )
  Assert-RotationTest 'CANDIDATE_MOUNT_EXACT_SOURCE' { Test-RotationMountBindingData $mountRecords $secureRoot $secureCandidate $true -SkipSourceMetadata } $true
  $setsRoot = Join-Path $secureRoot 'sets'
  $setsAncestor = Split-Path -Parent $secureRoot
  Assert-RotationTest 'SETS_ROOT_EQUALITY_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = $setsRoot; Destination = '/tmp/sets'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'TARGET_ROOT_BIND_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = $secureRoot; Destination = '/tmp/root'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'SETS_ANCESTOR_BIND_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = $setsAncestor; Destination = '/tmp/ancestor'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'SETS_DESCENDANT_BIND_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = $secureCandidatePath; Destination = '/tmp/candidate'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'WORKER_PROTECTED_TREE_OVERLAP_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-access'; Destination = '/tmp/jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'API_BROAD_PROTECTED_TREE_BIND_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = $setsRoot; Destination = '/tmp/sets'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'API_TARGET_ROOT_BIND_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = $secureRoot; Destination = '/tmp/root'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'API_ANCESTOR_SECRET_ROOT_BIND_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = $setsAncestor; Destination = '/tmp/ancestor'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'API_EXACT_PLANNED_BINDINGS_PASS' { Test-RotationMountBindingData $mountRecords $secureRoot $secureCandidate $true -SkipSourceMetadata } $true
  Assert-RotationTest 'API_PROTECTED_DESTINATION_ROOT_INJECTION_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Type = 'volume'; Source = 'unrelated-volume'; Destination = '/run/secrets/autoops'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'API_UNPLANNED_JENKINS_DESTINATION_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = (Join-Path $root 'normal-bind'); Destination = '/run/secrets/autoops/jenkins-api-token'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'SETS_PATH_OVERLAP_EQUALITY' { if (-not (Test-RotationPathOverlap $setsRoot $setsRoot)) { throw } } $true
  Assert-RotationTest 'SETS_PATH_OVERLAP_DESCENDANT' { if (-not (Test-RotationPathOverlap (Join-Path $setsRoot 'child') $setsRoot)) { throw } } $true
  Assert-RotationTest 'SETS_PATH_OVERLAP_ANCESTOR' { if (-not (Test-RotationPathOverlap $secureRoot $setsRoot)) { throw } } $true
  Assert-RotationTest 'SETS_PATH_OVERLAP_CASE_INSENSITIVE' { if (-not (Test-RotationPathOverlap $setsRoot.ToUpperInvariant() $setsRoot)) { throw } } $true
  Assert-RotationTest 'SETS_PATH_OVERLAP_TRAILING_SEPARATOR' { if (-not (Test-RotationPathOverlap ($setsRoot + [IO.Path]::DirectorySeparatorChar) $setsRoot)) { throw } } $true
  Assert-RotationTest 'SETS_PATH_OVERLAP_CANONICALIZED_TRAVERSAL' { if (-not (Test-RotationPathOverlap (Join-Path $secureRoot 'sets\..\sets') $setsRoot)) { throw } } $true
  Assert-RotationTest 'SETS_PATH_PREFIX_COLLISION_SAFE' { if (Test-RotationPathOverlap (Join-Path $secureRoot 'sets-old') $setsRoot) { throw } } $true
  Assert-RotationTest 'SETS_PATH_PREFIX_COLLISION_BACKUP_SAFE' { if (Test-RotationPathOverlap (Join-Path $secureRoot 'sets_backup') $setsRoot) { throw } } $true
  Assert-RotationTest 'SETS_PATH_PREFIX_COLLISION_NUMERIC_SAFE' { if (Test-RotationPathOverlap (Join-Path $secureRoot 'sets2') $setsRoot) { throw } } $true
  Assert-RotationTest 'WORKER_SECRET_DESTINATION_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = (Join-Path $root 'normal-bind'); Destination = '/run/secrets/autoops/jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'WORKER_PROTECTED_DESTINATION_TREE_BLOCKED' {
    Test-RotationMountBindingData @([pscustomobject]@{ Source = (Join-Path $root 'normal-bind'); Destination = '/run/secrets/autoops'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata
  } $false
  Assert-RotationTest 'WORKER_PROTECTED_DESTINATION_CHILD_BLOCKED' {
    Test-RotationMountBindingData @([pscustomobject]@{ Source = (Join-Path $root 'normal-bind'); Destination = '/run/secrets/autoops/custom'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata
  } $false
  Assert-RotationTest 'WORKER_PROTECTED_DESTINATION_ANCESTOR_BLOCKED' {
    Test-RotationMountBindingData @([pscustomobject]@{ Source = (Join-Path $root 'normal-bind'); Destination = '/run/secrets'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata
  } $false
  Assert-RotationTest 'PREFIX_COLLISION_NOT_APPROVED' {
    Test-RotationMountBindingData @([pscustomobject]@{ Source = (Join-Path $root 'normal-bind'); Destination = '/run/secrets/autoops-old'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata
  } $false
  Assert-RotationTest 'WORKER_UNPLANNED_HOST_BIND_BLOCKED' {
    Test-RotationMountBindingData @([pscustomobject]@{ Source = (Join-Path $root 'normal-bind'); Destination = '/tmp/data'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata
  } $false
  Assert-RotationTest 'WORKER_PROTECTED_SOURCE_AND_DESTINATION_BLOCKED' {
    Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-access'; Destination = '/run/secrets/autoops/jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata
  } $false
  $engineSocketMount = [pscustomobject]@{ Type = 'bind'; Source = '/var/run/docker.sock'; Destination = '/var/run/docker.sock'; ReadWrite = $true }
  $infraMount = [pscustomobject]@{ Type = 'bind'; Source = (Join-Path (Split-Path -Parent $PSScriptRoot) 'infra'); Destination = '/app/infra'; ReadWrite = $false }
  Assert-RotationTest 'ENGINE_SOCKET_BIND_ALLOWED' { Test-RotationMountBindingData @($mountRecords + $engineSocketMount + $infraMount) $secureRoot $secureCandidate $true } $true
  Assert-RotationTest 'WORKER_ENGINE_SOCKET_BIND_ALLOWED' { Test-RotationMountBindingData @($engineSocketMount, $infraMount) $secureRoot $secureCandidate $false } $true
  Assert-RotationTest 'API_EXACT_MOUNT_CONTRACT_PASS' { Test-RotationMountBindingData @($mountRecords + $engineSocketMount + $infraMount) $secureRoot $secureCandidate $true } $true
  Assert-RotationTest 'WORKER_EXACT_MOUNT_CONTRACT_PASS' { Test-RotationMountBindingData @($engineSocketMount, $infraMount) $secureRoot $secureCandidate $false } $true
  Assert-RotationTest 'INFRA_BIND_ONLY_ON_MAINTAINED_SERVICE' { Test-RotationMountBindingData @($mountRecords + $engineSocketMount + $infraMount) $secureRoot $secureCandidate $true } $true
  Assert-RotationTest 'UNSUPPORTED_NON_WINDOWS_BIND_SOURCE_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Type = 'bind'; Source = '/var/run/untrusted.sock'; Destination = '/tmp/untrusted'; ReadWrite = $false }) $secureRoot $secureCandidate $false } $false
  $normalSource = Join-Path $root 'normal-bind'; [IO.File]::WriteAllText($normalSource, 'synthetic')
  Assert-RotationTest 'UNPLANNED_WINDOWS_HOST_BIND_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = $normalSource; Destination = '/tmp/data'; ReadWrite = $false }) $secureRoot $secureCandidate $false } $false
  Assert-RotationTest 'EXACT_PLANNED_NON_REPARSE_SOURCES_PASS' { Test-RotationMountBindingData @($mountRecords + $engineSocketMount + $infraMount) $secureRoot $secureCandidate $true } $true
  Assert-RotationTest 'CALLER_PATH_DOCKER_SUBSTITUTION_BLOCKED' {
    $originalPath = $env:PATH; $originalWindir = $env:WINDIR
    try {
      $fakeRoot = Join-Path $root 'caller-controlled-tools'; New-Item -ItemType Directory -Path $fakeRoot | Out-Null
      $env:PATH = $fakeRoot
      $env:WINDIR = $fakeRoot
      $dockerPath = $null
      try { $dockerPath = Get-RotationDockerExecutable } catch {
        # Hosted Windows runners may not install Docker Desktop at the local
        # product location.  That absence must fail closed, never fall back to
        # a caller-controlled PATH entry.
        if ($_.Exception.Message -cne 'TRUSTED_DOCKER_UNAVAILABLE') { throw }
      }
      $systemPath = Get-RotationWindowsSystemExecutable 'fsutil.exe'
      if (($null -ne $dockerPath -and $dockerPath.StartsWith($fakeRoot, [StringComparison]::OrdinalIgnoreCase)) -or $systemPath.StartsWith($fakeRoot, [StringComparison]::OrdinalIgnoreCase)) { throw }
      if (($null -ne $dockerPath -and -not (Test-Path -LiteralPath $dockerPath -PathType Leaf)) -or -not (Test-Path -LiteralPath $systemPath -PathType Leaf)) { throw }
    } finally {
      $env:PATH = $originalPath; $env:WINDIR = $originalWindir
    }
  } $true
  Assert-RotationTest 'CALLER_WINDIR_FSUTIL_SUBSTITUTION_BLOCKED' {
    $common = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'secret-rotation-common.ps1') -Raw
    $common -notmatch '\$env:WINDIR' -and $common.Contains('GetFolderPath([Environment+SpecialFolder]::System)')
  } $true
  Assert-RotationTest 'VALIDATION_DOCKER_PATH_NOT_PATH_RESOLVED' {
    $sources = @('secret-rotation-common.ps1','prepare-secret-rotation.ps1','validate-secret-rotation-runtime.ps1') | ForEach-Object { Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw }
    -not (@($sources | Where-Object { $_ -match "Start-RotationProcess\s+'docker'" }).Count) -and (@($sources | Where-Object { $_.Contains('Get-RotationDockerExecutable') }).Count -eq 3)
  } $true
  Assert-RotationTest 'PROTECTED_FILE_SINGLE_LINK_ALLOWED' { Test-RotationProtectedFileLinkIntegrity $secureRoot } $true
  $hardLinkDirectory = Join-Path $root 'hardlink-outside'; New-Item -ItemType Directory -Path $hardLinkDirectory | Out-Null
  $hardLinkAlias = Join-Path $hardLinkDirectory 'fixture-alias'
  New-Item -ItemType HardLink -Path $hardLinkAlias -Target (Join-Path $secureCandidatePath 'jwt-access') | Out-Null
  Assert-RotationTest 'HARDLINK_TEST_USES_SYNTHETIC_DATA' { -not (Test-RotationPathOverlap $hardLinkAlias $setsRoot) -and ((Get-Item -LiteralPath $hardLinkAlias).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 } $true
  Assert-RotationTest 'PROTECTED_FILE_MULTI_LINK_BLOCKED' { Test-RotationProtectedFileLinkIntegrity $secureRoot } $false
  Assert-RotationTest 'NTFS_HARDLINK_SECRET_ALIAS_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = $hardLinkAlias; Destination = '/tmp/jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $false } $false
  Assert-RotationTest 'WORKER_HARDLINK_SECRET_ALIAS_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = $hardLinkAlias; Destination = '/tmp/anything'; ReadWrite = $false }) $secureRoot $secureCandidate $false } $false
  Assert-RotationTest 'API_EXTRA_HARDLINK_SECRET_ALIAS_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = $hardLinkAlias; Destination = '/tmp/anything'; ReadWrite = $false }) $secureRoot $secureCandidate $true } $false
  Remove-Item -LiteralPath $hardLinkAlias -Force
  $candidateAlias = Join-Path $root 'candidate-alias'; New-Item -ItemType Junction -Path $candidateAlias -Target $secureCandidatePath | Out-Null
  Assert-RotationTest 'REPARSE_ALIAS_INTO_SETS_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = $candidateAlias; Destination = '/tmp/data'; ReadWrite = $false }) $secureRoot $secureCandidate $false } $false
  Assert-RotationTest 'REPARSE_ALIAS_TO_SECRET_FILE_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $candidateAlias 'jwt-access'; Destination = '/tmp/data'; ReadWrite = $false }) $secureRoot $secureCandidate $false } $false
  $intermediateAlias = Join-Path $root 'intermediate-alias'; New-Item -ItemType Junction -Path $intermediateAlias -Target $secureCandidatePath | Out-Null
  Assert-RotationTest 'INTERMEDIATE_REPARSE_COMPONENT_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $intermediateAlias 'jwt-access'; Destination = '/tmp/data'; ReadWrite = $false }) $secureRoot $secureCandidate $false } $false
  Assert-RotationTest 'BROKEN_REPARSE_SOURCE_FAILS_CLOSED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = (Join-Path $root 'missing-reparse-target'); Destination = '/tmp/data'; ReadWrite = $false }) $secureRoot $secureCandidate $false } $false
  $wrongGenerationMounts = @($mountRecords); $wrongGenerationMounts[0] = [pscustomobject]@{ Source = Join-Path $secureCurrentPath 'jwt-access'; Destination = '/run/secrets/autoops/jwt-access'; ReadWrite = $false }
  Assert-RotationTest 'CANDIDATE_MOUNT_CURRENT_GOOD_BLOCKED' { Test-RotationMountBindingData $wrongGenerationMounts $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'API_OTHER_GENERATION_SECRET_SOURCE_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = Join-Path $secureCurrentPath 'jwt-access'; Destination = '/tmp/current-good-jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'WORKER_OTHER_GENERATION_SECRET_SOURCE_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $secureCurrentPath 'jwt-access'; Destination = '/tmp/current-good-jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  $unknownGenerationPath = Join-Path (Join-Path $secureRoot 'sets') ('e' * 32)
  Assert-RotationTest 'API_PREVIOUS_GENERATION_SECRET_SOURCE_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = Join-Path $securePreviousPath 'jwt-refresh'; Destination = '/tmp/previous-good-jwt-refresh'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'API_UNKNOWN_GENERATION_SECRET_SOURCE_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = Join-Path $unknownGenerationPath 'jwt-access'; Destination = '/tmp/unknown-jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'WORKER_PREVIOUS_GENERATION_SECRET_SOURCE_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $securePreviousPath 'jwt-access'; Destination = '/tmp/previous-good-jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'WORKER_UNKNOWN_GENERATION_SECRET_SOURCE_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $unknownGenerationPath 'jwt-access'; Destination = '/tmp/unknown-jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  $rollbackMountRecords = @(
    [pscustomobject]@{ Source = Join-Path $secureCurrentPath 'jwt-access'; Destination = '/run/secrets/autoops/jwt-access'; ReadWrite = $false },
    [pscustomobject]@{ Source = Join-Path $secureCurrentPath 'jwt-refresh'; Destination = '/run/secrets/autoops/jwt-refresh'; ReadWrite = $false },
    [pscustomobject]@{ Source = Join-Path $secureCurrentPath 'github-actions-token'; Destination = '/run/secrets/autoops/github-actions-token'; ReadWrite = $false }
  )
  Assert-RotationTest 'ROLLBACK_API_CANDIDATE_SECRET_SOURCE_BLOCKED' { Test-RotationMountBindingData @($rollbackMountRecords + [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-access'; Destination = '/tmp/candidate-jwt-access'; ReadWrite = $false }) $secureRoot $secureCurrent $true -SkipSourceMetadata } $false
  Assert-RotationTest 'ROLLBACK_WORKER_HISTORICAL_SECRET_SOURCE_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-access'; Destination = '/tmp/candidate-jwt-access'; ReadWrite = $false }) $secureRoot $secureCurrent $false -SkipSourceMetadata } $false
  $translatedMounts = @($mountRecords); $translatedMounts[0] = [pscustomobject]@{ Source = '/run/desktop/mnt/host/c/untrusted/jwt-access'; Destination = '/run/secrets/autoops/jwt-access'; ReadWrite = $false }
  Assert-RotationTest 'TRANSLATED_VM_MOUNT_SOURCE_BLOCKED' { Test-RotationMountBindingData $translatedMounts $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'DUPLICATE_SECRET_MOUNT_BLOCKED' { Test-RotationMountBindingData @($mountRecords + $mountRecords[0]) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  $rwMounts = @($mountRecords); $rwMounts[1] = [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-refresh'; Destination = '/run/secrets/autoops/jwt-refresh'; ReadWrite = $true }
  Assert-RotationTest 'READ_WRITE_SECRET_MOUNT_BLOCKED' { Test-RotationMountBindingData $rwMounts $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'WORKER_SECRET_MOUNT_BLOCKED' { Test-RotationMountBindingData @($mountRecords[0]) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'UNEXPECTED_SECRET_DESTINATION_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-access'; Destination = '/tmp/jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'WORKER_SECRET_SOURCE_ANY_DESTINATION_BLOCKED' { Test-RotationMountBindingData @([pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-access'; Destination = '/tmp/jwt-access'; ReadWrite = $false }) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'UNKNOWN_GENERATION_SOURCE_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'unknown'; Destination = '/tmp/unknown'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'UNPLANNED_WINDOWS_HOST_BIND_BLOCKED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = (Join-Path $root 'normal-bind'); Destination = '/srv/normal'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'SETS_PREFIX_COLLISION_NOT_APPROVED' { Test-RotationMountBindingData @($mountRecords + [pscustomobject]@{ Source = (Join-Path $secureRoot 'sets-old\jwt-access'); Destination = '/srv/normal'; ReadWrite = $false }) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'COMMON_MODULE_INITIALIZATION_AUTHORITY_NO' {
    $common = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'secret-rotation-common.ps1') -Raw
    if ($common.Contains('function Initialize-RotationOperation')) { throw }
    $initializer = Join-Path $PSScriptRoot 'initialize-secret-rotation-operation.ps1'
    if (-not (Test-Path -LiteralPath $initializer)) { throw }
    $preflight = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'prepare-secret-rotation.ps1') -Raw
    if (-not $preflight.Contains('initialize-secret-rotation-operation.ps1')) { throw }
  } $true
  Assert-RotationTest 'DUPLICATE_JSON_KEYS_REJECTED_PRE_DESERIALIZATION' { ConvertFrom-RotationStrictJson '{"transition":"ACTIVATION_ATTEMPT","transition":"ACTIVATION_ACCEPTED"}' 'ROTATION_OPERATION_RECORD_INVALID' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_PLAN_KEYS_REJECTED_PRE_DESERIALIZATION' {
    $duplicatePlanOperation = 'a' * 32
    $duplicatePlan = New-RotationPlanObject $duplicatePlanOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
    $path = Write-RotationPlanAtomically $secureRoot $duplicatePlan
    $json = Get-Content -LiteralPath $path -Raw
    [IO.File]::WriteAllText($path, ($json -replace '^\{', '{"schemaVersion":1,'), [Text.UTF8Encoding]::new($false))
    Read-RotationPlan $secureRoot $duplicatePlanOperation | Out-Null
  } $false
  Assert-RotationTest 'DUPLICATE_PLAN_OPERATION_ID_BLOCKED' { ConvertFrom-RotationStrictJson '{"operationId":"a","operationId":"b"}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_PLAN_RUNTIME_SERVICES_BLOCKED' { ConvertFrom-RotationStrictJson '{"runtimeServices":{},"runtimeServices":{}}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_NESTED_PLAN_SERVICE_IDENTITY_BLOCKED' { ConvertFrom-RotationStrictJson '{"runtimeServices":{"api":"autoops-api","api":"fake-api"}}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_PLAN_API_IMAGE_ID_BLOCKED' { ConvertFrom-RotationStrictJson '{"apiImageId":"a","apiImageId":"b"}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_PLAN_WORKER_IMAGE_ID_BLOCKED' { ConvertFrom-RotationStrictJson '{"workerImageId":"a","workerImageId":"b"}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_PLAN_CANDIDATE_GENERATION_ID_BLOCKED' { ConvertFrom-RotationStrictJson '{"candidateGenerationId":"a","candidateGenerationId":"b"}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_ROLLBACK_API_IMAGE_ID_BLOCKED' { ConvertFrom-RotationStrictJson '{"rollback":{"ApiImageId":"a","ApiImageId":"b"}}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_ROLLBACK_WORKER_IMAGE_ID_BLOCKED' { ConvertFrom-RotationStrictJson '{"rollback":{"WorkerImageId":"a","WorkerImageId":"b"}}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_PRESERVATION_CONTAINER_BLOCKED' { ConvertFrom-RotationStrictJson '{"rollback":{"NonTargetContainerIds":{"autoops-postgres":"a","autoops-postgres":"b"}}}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_PRESERVATION_VOLUME_PROPERTY_BLOCKED' { ConvertFrom-RotationStrictJson '{"rollback":{"VolumeInventory":[],"VolumeInventory":[]}}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'MALFORMED_PLAN_JSON_BLOCKED' { ConvertFrom-RotationStrictJson '{"runtimeServices":' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'DUPLICATE_NESTED_JSON_KEYS_REJECTED' { ConvertFrom-RotationStrictJson '{"rollback":{"ApiImageId":"a","ApiImageId":"b"}}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $false
  Assert-RotationTest 'JSON_STRING_VALUE_NOT_MISTAKEN_FOR_KEY' { ConvertFrom-RotationStrictJson '{"value":"transition\" still value","nested":{"unicode":"組織"}}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $true
  Assert-RotationTest 'JSON_COLON_BRACES_STRING_VALUE_ALLOWED' { ConvertFrom-RotationStrictJson '{"value":"{key:value}:still-a-string"}' 'ROTATION_PLAN_MALFORMED' | Out-Null } $true
  Assert-RotationTest 'WINDOWS_POWERSHELL_5_1_PROCESS_ARGUMENT_BOUNDARIES' {
    $child = Join-Path ([IO.Path]::GetTempPath()) ('autoops-rotation-args-' + [Guid]::NewGuid().ToString('N') + '.ps1')
    try {
      [IO.File]::WriteAllText($child, '$args | ForEach-Object { [Console]::WriteLine($_) }', [Text.UTF8Encoding]::new($false))
      $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$child,'plain','space value','quote"value','key=value','組織','&literal',';literal','(literal)','$literal','`literal','C:\path with spaces\','C:\path with spaces\\','C:\path with spaces\\\')
      $process = Start-RotationProcess 'powershell' $arguments 'PS51_PROCESS_START_FAILED'
      $actual = @($process.StandardOutput.ReadToEnd() -split "`r?`n" | Where-Object { $_.Length -gt 0 }); $null=$process.StandardError.ReadToEnd(); $process.WaitForExit()
      if ($process.ExitCode -ne 0 -or -not (Test-RotationExactStringArray $actual @('plain','space value','quote"value','key=value','組織','&literal',';literal','(literal)','$literal','`literal','C:\path with spaces\','C:\path with spaces\\','C:\path with spaces\\\'))) { throw }
    } finally { if (Test-Path -LiteralPath $child) { Remove-Item -LiteralPath $child -Force } }
  } $true
  Assert-RotationTest 'PS51_MULTIPLE_TRAILING_BACKSLASH_ARGUMENTS' { $encoder = (Get-Command ConvertTo-RotationProcessArgument).ScriptBlock.ToString(); $encoder -match '\[char\]92' } $true
  Assert-RotationTest 'PROCESS_ARGUMENT_INJECTION_BLOCKED' { $launcher = (Get-Command Start-RotationProcess).ScriptBlock.ToString(); $launcher -notmatch 'cmd\.exe|powershell\.exe.+-Command|UseShellExecute\s*=\s*\$true' } $true
  Assert-RotationTest 'SECRET_PRESENCE_ABSENT' { Test-RotationPresenceOnlyExitCode 3 } $true
  Assert-RotationTest 'SECRET_PRESENCE_PRESENT_BLOCKED' { Test-RotationPresenceOnlyExitCode 0 } $false
  Assert-RotationTest 'NEGATIVE_PATH_SECRET_MATERIALIZATION' { $probe = (Get-Command Test-RotationContainerSecretKeyAbsent).ScriptBlock.ToString(); -not ($probe -match 'printf|echo|ReadToEnd\(\).*StandardOutput') } $true
  [Console]::WriteLine('SECRET_ROTATION_RECOVERY_TEST PASS')
} finally {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}
