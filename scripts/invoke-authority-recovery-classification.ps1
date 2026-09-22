[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$TargetRoot,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory)][string]$AuthorityPlanPath,
  [Parameter(Mandatory)][string]$AuthorityOperationState
)

Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

# This payload is invoked only by the protected authority install copy. It is
# not a requester-facing recovery command and does not create any authority
# record or transition.
$script:RotationAuthorityCanonicalPlanPath = $AuthorityPlanPath

try {
  $plan = Read-RotationPlan $TargetRoot $OperationId
  $state = [pscustomobject]@{ State = $AuthorityOperationState; Plan = $plan }
  $classification = Get-RotationRecoveryInspectionClassification $TargetRoot $state
  if ($classification -notin @('SAFE_TO_RESUME_PREFLIGHT','ACTIVATION_IN_PROGRESS','ROLLBACK_REQUIRED','NO_ACTION_REQUIRED','MANUAL_INTERVENTION_REQUIRED')) { Stop-Rotation 'AUTHORITY_RECOVERY_CLASSIFICATION_INVALID' }
  [Console]::WriteLine(('RECOVERY_CLASSIFICATION ' + $classification))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'AUTHORITY_RECOVERY_CLASSIFICATION_FAILED' }
  [Console]::Error.WriteLine($code)
  exit 1
}
