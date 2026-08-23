[CmdletBinding(DefaultParameterSetName = 'Confirm')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][ValidateSet('Candidate','Rollback')][string]$Mode,
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'rotation-authority-client.ps1')

try {
  if ($RunSelfTest) {
    [Console]::WriteLine('ACCEPTANCE_FINALIZER_CALLER_ASSERTION NO')
    [Console]::WriteLine('ACCEPTANCE_FINALIZER_VALIDATOR_REQUIRED YES')
    [Console]::WriteLine('ACCEPTANCE_FINALIZER_SELF_TEST PASS')
    exit 0
  }
  $operation = if ($Mode -ceq 'Candidate') { 'CONFIRM_CANDIDATE' } else { 'CONFIRM_ROLLBACK' }
  # The service independently validates live runtime state and owns both
  # acceptance evidence and accepted markers. The client has no writer path.
  $null = Invoke-RotationAuthorityRequest $operation $OperationId
  [Console]::WriteLine(('ROTATION_' + $Mode.ToUpperInvariant() + '_ACCEPTANCE_CONFIRMED PASS'))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'ROTATION_ACCEPTANCE_CONFIRM_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
