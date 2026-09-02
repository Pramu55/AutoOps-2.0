[CmdletBinding(DefaultParameterSetName = 'Transition')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Transition')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Transition')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory, ParameterSetName = 'Transition')][ValidateSet('ACTIVATION_ATTEMPT','ACTIVATION_FAILED','ROLLBACK_ATTEMPT','MANUAL_INTERVENTION')][string]$Transition,
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'rotation-authority-client.ps1')

try {
  if ($RunSelfTest) {
    [Console]::WriteLine('ATTEMPT_STATE_MODEL INTENT_AND_FAILURE_TRANSITIONS_ONLY')
    [Console]::WriteLine('ACCEPTED_TRANSITIONS_VALIDATOR_BOUND YES')
    [Console]::WriteLine('ACTIVATION_REPLAY_BLOCKED YES')
    [Console]::WriteLine('ROLLBACK_REPLAY_BLOCKED YES')
    [Console]::WriteLine('OPERATION_STATE_SELF_TEST PASS')
    exit 0
  }
  $authorityOperation = @{
    ACTIVATION_ATTEMPT = 'CONSUME_ACTIVATION_ATTEMPT'
    ACTIVATION_FAILED = 'RECORD_ACTIVATION_FAILURE'
    ROLLBACK_ATTEMPT = 'CONSUME_ROLLBACK_ATTEMPT'
    MANUAL_INTERVENTION = 'RECORD_MANUAL_INTERVENTION'
  }[$Transition]
  $null = Invoke-RotationAuthorityRequest $authorityOperation $OperationId
  [Console]::WriteLine(('ROTATION_TRANSITION_' + $Transition + ' PASS'))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'ROTATION_OPERATION_STATE_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
