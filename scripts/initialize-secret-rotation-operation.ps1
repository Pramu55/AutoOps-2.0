[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$TargetRoot,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'rotation-authority-client.ps1')

try {
  # The authority service, running as NT SERVICE\AutoOpsRotationAuthority,
  # owns rollback validation, the canonical plan, claim creation, and PREPARED.
  # TargetRoot is retained only for client compatibility and is never sent as
  # authorization input to the service.
  $null = Invoke-RotationAuthorityRequest 'INITIALIZE_OPERATION' $OperationId
  exit 0
} catch { exit 1 }
