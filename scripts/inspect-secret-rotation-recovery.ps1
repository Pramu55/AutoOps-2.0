[CmdletBinding(DefaultParameterSetName = 'Inspect')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Inspect')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Inspect')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory, ParameterSetName = 'Inspect')][ValidateSet('NONE', 'CANDIDATE_BOTH_HEALTHY', 'CANDIDATE_PARTIAL', 'ROLLBACK_PARTIAL')][string]$ObservedRuntime,
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

function Get-RotationObservation([string]$State) {
  switch ($State) {
    'NONE' { return [pscustomobject]@{ ApiCandidate = $false; WorkerCandidate = $false; ApiHealthy = $false; WorkerHealthy = $false } }
    'CANDIDATE_BOTH_HEALTHY' { return [pscustomobject]@{ ApiCandidate = $true; WorkerCandidate = $true; ApiHealthy = $true; WorkerHealthy = $true } }
    'CANDIDATE_PARTIAL' { return [pscustomobject]@{ ApiCandidate = $true; WorkerCandidate = $false; ApiHealthy = $true; WorkerHealthy = $false } }
    'ROLLBACK_PARTIAL' { return [pscustomobject]@{ ApiCandidate = $false; WorkerCandidate = $false; ApiHealthy = $false; WorkerHealthy = $false } }
  }
}

try {
  if ($RunSelfTest) {
    $plan = [pscustomobject]@{ activationAttemptLimit = 1; rollbackAttemptLimit = 1; activationAttempts = 0; rollbackAttempts = 0; status = 'PREPARED' }
    if ((Get-RotationRecoveryClassification $plan (Get-RotationObservation 'NONE')) -ne 'SAFE_TO_RESUME_PREFLIGHT') { Stop-Rotation 'RECOVERY_SELF_TEST_PREPARED' }
    $plan.status = 'ACTIVATION_CANDIDATE'; $plan.activationAttempts = 1
    if ((Get-RotationRecoveryClassification $plan (Get-RotationObservation 'CANDIDATE_PARTIAL')) -ne 'ROLLBACK_REQUIRED') { Stop-Rotation 'RECOVERY_SELF_TEST_PARTIAL' }
    if ((Get-RotationRecoveryClassification $plan (Get-RotationObservation 'CANDIDATE_BOTH_HEALTHY')) -ne 'ACTIVATION_IN_PROGRESS') { Stop-Rotation 'RECOVERY_SELF_TEST_ACTIVE' }
    $plan.rollbackAttempts = 2
    if ((Get-RotationRecoveryClassification $plan (Get-RotationObservation 'NONE')) -ne 'MANUAL_INTERVENTION_REQUIRED') { Stop-Rotation 'RECOVERY_SELF_TEST_BUDGET' }
    [Console]::WriteLine('INTERRUPTED_RECOVERY_SELF_TEST PASS')
    exit 0
  }
  $plan = Read-RotationPlan $TargetRoot $OperationId
  $observation = Get-RotationObservation $ObservedRuntime
  $classification = Get-RotationRecoveryClassification $plan $observation
  [Console]::WriteLine(('RECOVERY_CLASSIFICATION ' + $classification))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'RECOVERY_INSPECTION_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
