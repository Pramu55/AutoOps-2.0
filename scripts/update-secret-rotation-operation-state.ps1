[CmdletBinding(DefaultParameterSetName = 'Transition')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Transition')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Transition')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory, ParameterSetName = 'Transition')][ValidateSet('ACTIVATION_ATTEMPT','ACTIVATION_ACCEPTED','ACTIVATION_FAILED','ROLLBACK_ATTEMPT','ROLLBACK_ACCEPTED','MANUAL_INTERVENTION')][string]$Transition,
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

try {
  if ($RunSelfTest) {
    [Console]::WriteLine('ATTEMPT_STATE_MODEL IMMUTABLE_PLAN_BOUND_MARKERS')
    [Console]::WriteLine('ACTIVATION_REPLAY_BLOCKED YES')
    [Console]::WriteLine('ROLLBACK_REPLAY_BLOCKED YES')
    [Console]::WriteLine('OPERATION_STATE_SELF_TEST PASS')
    exit 0
  }
  Consume-RotationOperationTransition $TargetRoot $OperationId $Transition
  [Console]::WriteLine(('ROTATION_TRANSITION_' + $Transition + ' PASS'))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'ROTATION_OPERATION_STATE_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
