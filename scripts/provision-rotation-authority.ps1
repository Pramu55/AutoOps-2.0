[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^S-1-5-21-[0-9]+-[0-9]+-[0-9]+-[0-9]+$')][string]$RequesterSid,
  [Parameter(Mandatory)][ValidatePattern('^[A-Za-z]:\\')][string]$SecretRoot,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Phase 1 intentionally provides a non-mutating provisioning contract only.
# Later privileged provisioning must create this service as the dedicated
# NT SERVICE\\AutoOpsRotationAuthority identity, not SYSTEM, and grant the
# requester pipe-connect/read status only. The authority store is never placed
# under the requester-controlled secret TargetRoot.
$storeRoot = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)) 'AutoOps\rotation-authority'
$authorityParentRoot = Split-Path -Parent $storeRoot
$installRoot = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)) 'AutoOps\RotationAuthority'
$contract = [ordered]@{
  ServiceName = 'AutoOpsRotationAuthority'
  ServiceIdentity = 'NT SERVICE\AutoOpsRotationAuthority'
  ServiceImagePath = (Join-Path $installRoot 'AutoOpsRotationAuthority.exe')
  ServiceImageFromRepository = 'NO'
  RuntimeValidatorPayloadRoot = (Join-Path $installRoot 'scripts')
  RuntimeValidatorPayload = (Join-Path $installRoot 'scripts\validate-secret-rotation-runtime.ps1')
  RuntimeValidatorCommonPayload = (Join-Path $installRoot 'scripts\secret-rotation-common.ps1')
  RecoveryInspectorPayload = (Join-Path $installRoot 'scripts\inspect-secret-rotation-recovery.ps1')
  RecoveryClassifierPayload = (Join-Path $installRoot 'scripts\invoke-authority-recovery-classification.ps1')
  RuntimeValidatorPayloadSource = 'PROTECTED_SERVICE_INSTALL_COPY_ONLY'
  ProvenanceValidatorPayload = (Join-Path $installRoot 'scripts\validate-file-mode-image-provenance.ps1')
  ProvenanceRepositoryRoot = (Join-Path $installRoot 'provenance-repository')
  ProvenanceRepositorySource = 'PROTECTED_SERVICE_INSTALL_COPY_ONLY'
  StoreRoot = $storeRoot
  AuthorityParentRoot = $authorityParentRoot
  CanonicalPlanRoot = Join-Path $storeRoot 'plans'
  InitializationClaimRoot = Join-Path $storeRoot 'initialization-claims'
  OperationRoot = Join-Path $storeRoot 'operations'
  RequesterSid = $RequesterSid
  SecretRoot = $SecretRoot
  DockerEndpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine'
  DockerConfigRoot = Join-Path $storeRoot 'docker-cli'
  RequesterStoreWrite = 'DENY'
  RequesterStoreDelete = 'DENY'
  RequesterStoreChangeAcl = 'DENY'
  RequesterStoreTakeOwnership = 'DENY'
  RequesterParentDeleteChild = 'DENY'
}

if ($Apply) { throw [System.InvalidOperationException]::new('ROTATION_AUTHORITY_PROVISIONING_REQUIRES_SEPARATE_AUTHORIZATION') }
$contract.GetEnumerator() | ForEach-Object { [Console]::WriteLine(($_.Key + '=' + $_.Value)) }
