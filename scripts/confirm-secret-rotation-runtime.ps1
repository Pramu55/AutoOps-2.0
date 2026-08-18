[CmdletBinding(DefaultParameterSetName = 'Confirm')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][ValidateSet('Candidate','Rollback')][string]$Mode,
  [Parameter(ParameterSetName = 'Confirm')][string]$ApiContainer = 'autoops-api',
  [Parameter(ParameterSetName = 'Confirm')][string]$WorkerContainer = 'autoops-worker',
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

try {
  if ($RunSelfTest) {
    [Console]::WriteLine('ACCEPTANCE_FINALIZER_CALLER_ASSERTION NO')
    [Console]::WriteLine('ACCEPTANCE_FINALIZER_VALIDATOR_REQUIRED YES')
    [Console]::WriteLine('ACCEPTANCE_FINALIZER_SELF_TEST PASS')
    exit 0
  }
  $state = Get-RotationOperationState $TargetRoot $OperationId
  $requiredState = if ($Mode -ceq 'Candidate') { 'ACTIVATION_ATTEMPT_CONSUMED' } else { 'ROLLBACK_ATTEMPT_CONSUMED' }
  if ($state.State -cne $requiredState) { Stop-Rotation 'ROTATION_ACCEPTANCE_TRANSITION_INVALID' }
  if (-not (Invoke-RotationRuntimeAcceptanceValidator $TargetRoot $OperationId $Mode $ApiContainer $WorkerContainer)) { Stop-Rotation 'ROTATION_ACCEPTANCE_VALIDATION_FAILED' }
  # The validator's successful exit is the only authority that reaches this
  # create-new evidence and accepted-marker write path.
  Write-RotationVerifiedAcceptance $TargetRoot $OperationId $Mode
  [Console]::WriteLine(('ROTATION_' + $Mode.ToUpperInvariant() + '_ACCEPTANCE_CONFIRMED PASS'))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'ROTATION_ACCEPTANCE_CONFIRM_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
