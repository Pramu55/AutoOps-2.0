[CmdletBinding(DefaultParameterSetName = 'Inspect')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Inspect')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Inspect')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

function Get-RotationSyntheticObservation([bool]$ApiCandidate, [bool]$WorkerCandidate, [bool]$CandidateAcceptancePassed, [bool]$RollbackAcceptancePassed) {
  return [pscustomobject]@{ ApiCandidate = $ApiCandidate; WorkerCandidate = $WorkerCandidate; CandidateAcceptancePassed = $CandidateAcceptancePassed; RollbackAcceptancePassed = $RollbackAcceptancePassed }
}

function Get-RotationObservedRuntime([string]$TargetRoot, $Plan) {
  $ApiContainer = $Plan.runtimeServices.api; $WorkerContainer = $Plan.runtimeServices.worker
  $api = Get-RotationContainerRuntimeMetadata $ApiContainer; $worker = Get-RotationContainerRuntimeMetadata $WorkerContainer
  $candidateApiMounts = Test-RotationMountBindingData (Get-RotationContainerMountRecords $ApiContainer) $TargetRoot $Plan.candidateGenerationId $true
  $candidateWorkerMounts = Test-RotationMountBindingData (Get-RotationContainerMountRecords $WorkerContainer) $TargetRoot $Plan.candidateGenerationId $false
  $rollbackApiMounts = Test-RotationMountBindingData (Get-RotationContainerMountRecords $ApiContainer) $TargetRoot $Plan.rollback.TargetGenerationId $true
  $rollbackWorkerMounts = Test-RotationMountBindingData (Get-RotationContainerMountRecords $WorkerContainer) $TargetRoot $Plan.rollback.TargetGenerationId $false
  $candidateAcceptance = Invoke-RotationRuntimeAcceptanceValidator $TargetRoot $Plan.operationId 'Candidate'
  $rollbackAcceptance = Invoke-RotationRuntimeAcceptanceValidator $TargetRoot $Plan.operationId 'Rollback'
  return [pscustomobject]@{ ApiCandidate = $api.ImageId -ceq $Plan.apiImageId; WorkerCandidate = $worker.ImageId -ceq $Plan.workerImageId; ApiRollback = $api.ImageId -ceq $Plan.rollback.ApiImageId; WorkerRollback = $worker.ImageId -ceq $Plan.rollback.WorkerImageId; CandidateApiMountsBound = $candidateApiMounts; RollbackApiMountsBound = $rollbackApiMounts; WorkerMountsIsolated = ($candidateWorkerMounts -and $rollbackWorkerMounts); CandidateAcceptancePassed = $candidateAcceptance; RollbackAcceptancePassed = $rollbackAcceptance }
}

function Get-RotationRecoveryInspectionClassification([string]$TargetRoot, $State) {
  # States with an unconditional fail-closed manual result must remain
  # inspectable when Docker is down or the planned services no longer exist.
  # No runtime probe can change their classification.
  $observation = $null
  if (Test-RotationRecoveryRequiresRuntimeObservation $State) {
    $observation = Get-RotationObservedRuntime $TargetRoot $State.Plan
  }
  return Get-RotationRecoveryClassification $State $observation
}

try {
  if ($RunSelfTest) {
    $state = [pscustomobject]@{ State = 'PREPARED' }
    if ((Get-RotationRecoveryClassification $state (Get-RotationSyntheticObservation $false $false $false $true)) -ne 'SAFE_TO_RESUME_PREFLIGHT') { Stop-Rotation 'RECOVERY_SELF_TEST_PREPARED' }
    $state.State = 'OPERATION_INITIALIZATION_INTERRUPTED'
    if ((Get-RotationRecoveryClassification $state (Get-RotationSyntheticObservation $false $false $false $false)) -ne 'MANUAL_INTERVENTION_REQUIRED') { Stop-Rotation 'RECOVERY_SELF_TEST_INITIALIZATION_INTERRUPTED' }
    if (Test-RotationRecoveryRequiresRuntimeObservation $state) { Stop-Rotation 'RECOVERY_SELF_TEST_INITIALIZATION_OBSERVATION' }
    $state.State = 'NEVER_INITIALIZED'
    if ((Get-RotationRecoveryClassification $state $null) -ne 'MANUAL_INTERVENTION_REQUIRED' -or (Test-RotationRecoveryRequiresRuntimeObservation $state)) { Stop-Rotation 'RECOVERY_SELF_TEST_NEVER_INITIALIZED' }
    $state.State = 'CANDIDATE_ACCEPTANCE_INTERRUPTED'
    if ((Get-RotationRecoveryClassification $state $null) -ne 'MANUAL_INTERVENTION_REQUIRED' -or (Test-RotationRecoveryRequiresRuntimeObservation $state)) { Stop-Rotation 'RECOVERY_SELF_TEST_CANDIDATE_EVIDENCE_OBSERVATION' }
    $state.State = 'ROLLBACK_ACCEPTANCE_INTERRUPTED'
    if ((Get-RotationRecoveryClassification $state $null) -ne 'MANUAL_INTERVENTION_REQUIRED' -or (Test-RotationRecoveryRequiresRuntimeObservation $state)) { Stop-Rotation 'RECOVERY_SELF_TEST_ROLLBACK_EVIDENCE_OBSERVATION' }
    if ((Get-RotationRecoveryInspectionClassification 'unused-in-self-test' $state) -ne 'MANUAL_INTERVENTION_REQUIRED') { Stop-Rotation 'RECOVERY_SELF_TEST_UNCONDITIONAL_MANUAL_NO_DOCKER' }
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
  $classification = Get-RotationRecoveryInspectionClassification $TargetRoot $state
  [Console]::WriteLine(('RECOVERY_CLASSIFICATION ' + $classification))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'RECOVERY_INSPECTION_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
