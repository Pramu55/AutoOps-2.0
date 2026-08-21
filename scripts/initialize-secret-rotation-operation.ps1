[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$TargetRoot,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

try {
  # This maintained child-process boundary owns the only supported creation of
  # PREPARED operation state. The validator path and process are fixed by the
  # repository; parent-session functions cannot supply its PASS decision.
  $null = Read-RotationPlan $TargetRoot $OperationId
  if (-not (Invoke-RotationRuntimeAcceptanceValidator $TargetRoot $OperationId 'Rollback')) { Stop-Rotation 'ROLLBACK_RUNTIME_BASELINE_REJECTED' }
  $null = Ensure-RotationOperationsRoot $TargetRoot
  $operationRoot = Get-RotationOperationRoot $TargetRoot $OperationId
  if (Test-Path -LiteralPath $operationRoot) { Stop-Rotation 'ROTATION_OPERATION_EXISTS' }
  try { [IO.Directory]::CreateDirectory($operationRoot) | Out-Null; Set-RotationOperationDirectorySecurity $operationRoot; Assert-RotationOperationDirectorySecurity $operationRoot } catch { Stop-Rotation 'ROTATION_OPERATION_CREATE_FAILED' }
  $record = [ordered]@{ schemaVersion = $script:RotationSchemaVersion; operationId = $OperationId; planIdentity = Get-RotationPlanIdentity $TargetRoot $OperationId; transition = 'OPERATION_CREATED'; createdAtUtc = [DateTime]::UtcNow.ToString('o') }
  Write-RotationOperationRecord $operationRoot 'operation-created.json' $record
  exit 0
} catch { exit 1 }
