$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

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
  Assert-RotationTest 'INTERRUPTED_PARTIAL_ROTATION_CLASSIFIED' { if ((Get-RotationRecoveryClassification $operationState ([pscustomobject]@{ ApiCandidate = $true; WorkerCandidate = $false; ApiRollback = $false; WorkerRollback = $false; ApiHealthy = $true; WorkerHealthy = $false; CandidateApiMountsBound = $true; RollbackApiMountsBound = $false; WorkerMountsIsolated = $true })) -ne 'ROLLBACK_REQUIRED') { throw } } $true
  $expected = [pscustomobject]@{ ApiImageId = 'sha256:' + ('1' * 64); WorkerImageId = 'sha256:' + ('2' * 64) }
  $actual = [pscustomobject]@{ ApiImageId = $expected.ApiImageId; WorkerImageId = $expected.WorkerImageId; ApiRunning = $true; ApiHealthy = $true; ApiHealth200 = $true; ApiReady200 = $true; WorkerRunning = $true; WorkerHealthy = $true; WorkerHealth200 = $true; WorkerReady200 = $true; SecretProviderMode = 'file'; SecretProviderStatus = 'READY'; ApiRequiredFileMounts = $true; ApiJenkinsMount = $false; WorkerApplicationSecretMount = $false; ApiMigratedEnvironmentAbsent = $true; WorkerMigratedEnvironmentAbsent = $true; GitHubActionsEnabled = $true; JenkinsIntegrationDisabled = $true; ApiProviderEquivalent = $true; WorkerProviderEquivalent = $true; NonTargetContainerIdsPreserved = $true; VolumeInventoryPreserved = $true }
  Assert-RotationTest 'SYNTHETIC_FULL_ACCEPTANCE' { if (-not (Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $actual.WorkerApplicationSecretMount = $true
  Assert-RotationTest 'WORKER_SECRET_MOUNT_BLOCKED' { if ((Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $actual.WorkerApplicationSecretMount = $false; $actual.ApiMigratedEnvironmentAbsent = $false
  Assert-RotationTest 'MIGRATED_ENVIRONMENT_PRESENT_BLOCKED' { if ((Test-RotationRuntimeAcceptanceData $actual $expected).Passed) { throw } } $true
  $secureRoot = Join-Path $root 'secure-state'
  New-Item -ItemType Directory -Path $secureRoot | Out-Null
  Set-RotationOperationDirectorySecurity $secureRoot
  $secureCurrent = '1' * 32; $secureCandidate = '2' * 32; $securePrevious = '3' * 32; $secureOperation = '4' * 32
  $secureCurrentPath = New-SyntheticGeneration $secureRoot $secureCurrent (New-ProviderLines)
  $secureCandidatePath = New-SyntheticGeneration $secureRoot $secureCandidate (New-ProviderLines)
  $null = New-SyntheticGeneration $secureRoot $securePrevious (New-ProviderLines)
  $secureRollback = @{ TargetGenerationId = $secureCurrent; ApiImageId = 'sha256:' + ('5' * 64); WorkerImageId = 'sha256:' + ('6' * 64); ExpectedRuntimeMode = 'file'; ExpectedHealthEndpoints = @('/health','/ready','/healthz','/readyz'); NonTargetContainerIds = @{ 'autoops-postgres' = 'a' * 64 }; VolumeInventory = @('synthetic-volume') }
  $securePlan = New-RotationPlanObject $secureOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  Assert-RotationTest 'STRICT_PLAN_SCHEMA_VALID' { $null = Write-RotationPlanAtomically $secureRoot $securePlan; $null = Read-RotationPlan $secureRoot $secureOperation } $true
  $planIdentityBefore = Get-RotationPlanIdentity $secureRoot $secureOperation
  Assert-RotationTest 'ACTIVATION_FIRST_CONSUME' { Initialize-RotationOperation $secureRoot $secureOperation; Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_ATTEMPT' } $true
  Assert-RotationTest 'ACTIVATION_REPLAY_BLOCKED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_ATTEMPT' } $false
  Assert-RotationTest 'ACTIVATION_FAILURE_RECORDED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_FAILED' } $true
  Assert-RotationTest 'ROLLBACK_FIRST_CONSUME' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ROLLBACK_ATTEMPT' } $true
  Assert-RotationTest 'ROLLBACK_REPLAY_BLOCKED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ROLLBACK_ATTEMPT' } $false
  Assert-RotationTest 'ROLLBACK_ACCEPTED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ROLLBACK_ACCEPTED' } $true
  Assert-RotationTest 'TERMINAL_TRANSITION_BLOCKED' { Consume-RotationOperationTransition $secureRoot $secureOperation 'ACTIVATION_ATTEMPT' } $false
  Assert-RotationTest 'IMMUTABLE_PLAN_PRESERVED' { (Get-RotationPlanIdentity $secureRoot $secureOperation) -ceq $planIdentityBefore } $true
  $missingStateOperation = 'f' * 32
  $missingStatePlan = New-RotationPlanObject $missingStateOperation $secureCandidate $secureCurrent $securePrevious ('b' * 40) ('sha256:' + ('7' * 64)) ('sha256:' + ('8' * 64)) @('core','sensitive-env','github') $secureRollback
  $null = Write-RotationPlanAtomically $secureRoot $missingStatePlan
  Assert-RotationTest 'MISSING_OPERATION_STATE_BLOCKED' { Get-RotationOperationState $secureRoot $missingStateOperation | Out-Null } $false
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
  Write-RotationOperationRecord $conflictState.OperationRoot 'activation-accepted.json' $conflictRecord
  $conflictRecord.transition = 'ACTIVATION_FAILED'
  Write-RotationOperationRecord $conflictState.OperationRoot 'activation-failed.json' $conflictRecord
  Assert-RotationTest 'CONFLICTING_DURABLE_TRANSITIONS_BLOCKED' { Get-RotationOperationState $secureRoot $conflictOperation | Out-Null } $false
  $mountRecords = @(
    [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-access'; Destination = '/run/secrets/autoops/jwt-access'; ReadWrite = $false },
    [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-refresh'; Destination = '/run/secrets/autoops/jwt-refresh'; ReadWrite = $false },
    [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'github-actions-token'; Destination = '/run/secrets/autoops/github-actions-token'; ReadWrite = $false }
  )
  Assert-RotationTest 'CANDIDATE_MOUNT_EXACT_SOURCE' { Test-RotationMountBindingData $mountRecords $secureRoot $secureCandidate $true -SkipSourceMetadata } $true
  $wrongGenerationMounts = @($mountRecords); $wrongGenerationMounts[0] = [pscustomobject]@{ Source = Join-Path $secureCurrentPath 'jwt-access'; Destination = '/run/secrets/autoops/jwt-access'; ReadWrite = $false }
  Assert-RotationTest 'CANDIDATE_MOUNT_CURRENT_GOOD_BLOCKED' { Test-RotationMountBindingData $wrongGenerationMounts $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'DUPLICATE_SECRET_MOUNT_BLOCKED' { Test-RotationMountBindingData @($mountRecords + $mountRecords[0]) $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  $rwMounts = @($mountRecords); $rwMounts[1] = [pscustomobject]@{ Source = Join-Path $secureCandidatePath 'jwt-refresh'; Destination = '/run/secrets/autoops/jwt-refresh'; ReadWrite = $true }
  Assert-RotationTest 'READ_WRITE_SECRET_MOUNT_BLOCKED' { Test-RotationMountBindingData $rwMounts $secureRoot $secureCandidate $true -SkipSourceMetadata } $false
  Assert-RotationTest 'WORKER_SECRET_MOUNT_BLOCKED' { Test-RotationMountBindingData @($mountRecords[0]) $secureRoot $secureCandidate $false -SkipSourceMetadata } $false
  Assert-RotationTest 'SECRET_PRESENCE_ABSENT' { Test-RotationPresenceOnlyExitCode 3 } $true
  Assert-RotationTest 'SECRET_PRESENCE_PRESENT_BLOCKED' { Test-RotationPresenceOnlyExitCode 0 } $false
  Assert-RotationTest 'NEGATIVE_PATH_SECRET_MATERIALIZATION' { $probe = (Get-Command Test-RotationContainerSecretKeyAbsent).ScriptBlock.ToString(); -not ($probe -match 'printf|echo|ReadToEnd\(\).*StandardOutput') } $true
  [Console]::WriteLine('SECRET_ROTATION_RECOVERY_TEST PASS')
} finally {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}
