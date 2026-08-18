[CmdletBinding(DefaultParameterSetName = 'Inspect')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Inspect')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Inspect')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(ParameterSetName = 'Inspect')][string]$ApiContainer = 'autoops-api',
  [Parameter(ParameterSetName = 'Inspect')][string]$WorkerContainer = 'autoops-worker',
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

function Get-RotationSyntheticObservation([bool]$ApiCandidate, [bool]$WorkerCandidate, [bool]$CandidateAcceptancePassed, [bool]$RollbackAcceptancePassed) {
  return [pscustomobject]@{ ApiCandidate = $ApiCandidate; WorkerCandidate = $WorkerCandidate; CandidateAcceptancePassed = $CandidateAcceptancePassed; RollbackAcceptancePassed = $RollbackAcceptancePassed }
}

function Get-RotationObservedRuntime([string]$TargetRoot, $Plan, [string]$ApiContainer, [string]$WorkerContainer) {
  $api = Get-RotationContainerRuntimeMetadata $ApiContainer; $worker = Get-RotationContainerRuntimeMetadata $WorkerContainer
  $candidateApiMounts = Test-RotationMountBindingData (Get-RotationContainerMountRecords $ApiContainer) $TargetRoot $Plan.candidateGenerationId $true
  $candidateWorkerMounts = Test-RotationMountBindingData (Get-RotationContainerMountRecords $WorkerContainer) $TargetRoot $Plan.candidateGenerationId $false
  $rollbackApiMounts = Test-RotationMountBindingData (Get-RotationContainerMountRecords $ApiContainer) $TargetRoot $Plan.rollback.TargetGenerationId $true
  $rollbackWorkerMounts = Test-RotationMountBindingData (Get-RotationContainerMountRecords $WorkerContainer) $TargetRoot $Plan.rollback.TargetGenerationId $false
  $candidateAcceptance = Invoke-RotationRuntimeAcceptanceValidator $TargetRoot $Plan.operationId 'Candidate' $ApiContainer $WorkerContainer
  $rollbackAcceptance = Invoke-RotationRuntimeAcceptanceValidator $TargetRoot $Plan.operationId 'Rollback' $ApiContainer $WorkerContainer
  return [pscustomobject]@{ ApiCandidate = $api.ImageId -ceq $Plan.apiImageId; WorkerCandidate = $worker.ImageId -ceq $Plan.workerImageId; ApiRollback = $api.ImageId -ceq $Plan.rollback.ApiImageId; WorkerRollback = $worker.ImageId -ceq $Plan.rollback.WorkerImageId; CandidateApiMountsBound = $candidateApiMounts; RollbackApiMountsBound = $rollbackApiMounts; WorkerMountsIsolated = ($candidateWorkerMounts -and $rollbackWorkerMounts); CandidateAcceptancePassed = $candidateAcceptance; RollbackAcceptancePassed = $rollbackAcceptance }
}

try {
  if ($RunSelfTest) {
    $state = [pscustomobject]@{ State = 'PREPARED' }
    if ((Get-RotationRecoveryClassification $state (Get-RotationSyntheticObservation $false $false $false $true)) -ne 'SAFE_TO_RESUME_PREFLIGHT') { Stop-Rotation 'RECOVERY_SELF_TEST_PREPARED' }
    $state.State = 'ACTIVATION_ATTEMPT_CONSUMED'
    if ((Get-RotationRecoveryClassification $state (Get-RotationSyntheticObservation $true $false $false $false)) -ne 'ROLLBACK_REQUIRED') { Stop-Rotation 'RECOVERY_SELF_TEST_PARTIAL' }
    if ((Get-RotationRecoveryClassification $state (Get-RotationSyntheticObservation $true $true $true $false)) -ne 'ACTIVATION_IN_PROGRESS') { Stop-Rotation 'RECOVERY_SELF_TEST_ACTIVE' }
    $state.State = 'ROLLED_BACK'
    if ((Get-RotationRecoveryClassification $state (Get-RotationSyntheticObservation $false $false $false $false)) -ne 'MANUAL_INTERVENTION_REQUIRED') { Stop-Rotation 'RECOVERY_SELF_TEST_FAIL_CLOSED' }
    [Console]::WriteLine('RECOVERY_OBSERVATION_SOURCE PLAN_BOUND_REAL_RUNTIME_METADATA')
    [Console]::WriteLine('CALLER_RUNTIME_CLASSIFICATION_AUTHORITY NO')
    [Console]::WriteLine('RECOVERY_SELF_TEST PASS')
    exit 0
  }
  $state = Get-RotationOperationState $TargetRoot $OperationId
  $observation = Get-RotationObservedRuntime $TargetRoot $state.Plan $ApiContainer $WorkerContainer
  $classification = Get-RotationRecoveryClassification $state $observation
  [Console]::WriteLine(('RECOVERY_CLASSIFICATION ' + $classification))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'RECOVERY_INSPECTION_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
