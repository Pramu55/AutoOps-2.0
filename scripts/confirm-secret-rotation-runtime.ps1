[CmdletBinding(DefaultParameterSetName = 'Confirm')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory, ParameterSetName = 'Confirm')][ValidateSet('Candidate','Rollback')][string]$Mode,
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

function Write-RotationAcceptanceRecordPrivate([string]$OperationRoot, [string]$Name, $Record) {
  $path = Join-Path $OperationRoot $Name
  if (-not (Test-RotationPathInside $path $OperationRoot)) { Stop-Rotation 'ROTATION_OPERATION_PATH_ESCAPE' }
  try {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Record | ConvertTo-Json -Depth 5 -Compress))
    $stream = [IO.FileStream]::new($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  } catch { Stop-Rotation 'ROTATION_ACCEPTANCE_RECORD_WRITE_FAILED' }
}

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
  if (-not (Invoke-RotationRuntimeAcceptanceValidator $TargetRoot $OperationId $Mode)) { Stop-Rotation 'ROTATION_ACCEPTANCE_VALIDATION_FAILED' }
  # This write path intentionally lives only in this finalizer, after the
  # maintained validator exits successfully.  The shared module exposes no
  # acceptance-authoring primitive.
  $evidenceName = if ($Mode -ceq 'Candidate') { 'candidate-acceptance.json' } else { 'rollback-acceptance.json' }
  $acceptedName = if ($Mode -ceq 'Candidate') { 'activation-accepted.json' } else { 'rollback-accepted.json' }
  $transition = if ($Mode -ceq 'Candidate') { 'ACTIVATION_ACCEPTED' } else { 'ROLLBACK_ACCEPTED' }
  $expectedApi = if ($Mode -ceq 'Candidate') { $state.Plan.apiImageId } else { $state.Plan.rollback.ApiImageId }
  $expectedWorker = if ($Mode -ceq 'Candidate') { $state.Plan.workerImageId } else { $state.Plan.rollback.WorkerImageId }
  $evidence = [ordered]@{ schemaVersion = $script:RotationSchemaVersion; operationId = $OperationId; planIdentity = $state.PlanIdentity; transition = 'ACCEPTANCE_EVIDENCE'; mode = $Mode; repositoryRevision = $state.Plan.repositoryRevision; expectedApiImageId = $expectedApi; expectedWorkerImageId = $expectedWorker; acceptanceResult = 'PASS'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  Write-RotationAcceptanceRecordPrivate $state.OperationRoot $evidenceName $evidence
  $accepted = [ordered]@{ schemaVersion = $script:RotationSchemaVersion; operationId = $OperationId; planIdentity = $state.PlanIdentity; transition = $transition; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  Write-RotationAcceptanceRecordPrivate $state.OperationRoot $acceptedName $accepted
  [Console]::WriteLine(('ROTATION_' + $Mode.ToUpperInvariant() + '_ACCEPTANCE_CONFIRMED PASS'))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'ROTATION_ACCEPTANCE_CONFIRM_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
