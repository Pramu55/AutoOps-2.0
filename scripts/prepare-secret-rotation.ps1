[CmdletBinding(DefaultParameterSetName = 'Prepare')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][ValidatePattern('^[a-f0-9]{32}$')][string]$CandidateGenerationId,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][ValidatePattern('^[a-f0-9]{32}$')][string]$CurrentGoodGenerationId,
  [Parameter(ParameterSetName = 'Prepare')][ValidatePattern('^[a-f0-9]{32}$')][string]$PreviousGoodGenerationId,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$RepositoryRevision,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$CandidateApiImageId,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$CandidateWorkerImageId,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$RollbackApiImageId,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$RollbackWorkerImageId,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$ApiImage,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$WorkerImage,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$ApiBuildRecordRef,
  [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$WorkerBuildRecordRef,
  [Parameter(ParameterSetName = 'Prepare')][string]$BuildxBuilder = 'desktop-linux',
  [Parameter(ParameterSetName = 'Prepare')][string[]]$IneligibleGenerationId = @(),
  [Parameter(ParameterSetName = 'Prepare')][string]$ExpectedOverlays = 'core,sensitive-env,github',
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

function Write-RotationResult([string]$Name, [bool]$Passed) {
  [Console]::WriteLine("$Name $(if ($Passed) { 'PASS' } else { 'FAIL' })")
  if (-not $Passed) { Stop-Rotation $Name }
}

function Test-RotationSelfTest {
  $baseline = [pscustomobject]@{
    PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = [pscustomobject]@{ State = 'NONEMPTY'; Value = 'alpha,unicode-組織' }
    PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS = [pscustomobject]@{ State = 'NONEMPTY'; Value = 'legacy=alpha' }
    PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS = [pscustomobject]@{ State = 'EMPTY'; Value = '' }
    GITHUB_ACTIONS_ENABLED = 'true'; JENKINS_INTEGRATION_ENABLED = 'false'
  }
  $candidate = [pscustomobject]@{
    PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = [pscustomobject]@{ State = 'NONEMPTY'; Value = 'alpha,unicode-組織' }
    PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS = [pscustomobject]@{ State = 'NONEMPTY'; Value = 'legacy=alpha' }
    PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS = [pscustomobject]@{ State = 'ABSENT'; Value = $null }
    GITHUB_ACTIONS_ENABLED = 'true'; JENKINS_INTEGRATION_ENABLED = 'false'
  }
  Write-RotationResult 'ROTATION_PROVIDER_EMPTY_TO_ABSENT' (Test-RotationProviderSemanticEquivalence $baseline $candidate)
  $candidate.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS.Value = 'different'
  Write-RotationResult 'ROTATION_PROVIDER_SLUG_MISMATCH_BLOCKED' (-not (Test-RotationProviderSemanticEquivalence $baseline $candidate))
  $candidate.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS.Value = 'alpha,unicode-組織'
  Write-RotationResult 'ROTATION_ENABLEMENT_CONTRACT' (Test-RotationEnablementContract $candidate @('core', 'sensitive-env', 'github'))
  $plan = New-RotationPlanObject ('a' * 32) ('b' * 32) ('c' * 32) ('d' * 32) ('e' * 40) ('sha256:' + ('1' * 64)) ('sha256:' + ('2' * 64)) @('core', 'sensitive-env', 'github') @{ TargetGenerationId = 'c' * 32; ApiImageId = 'sha256:' + ('3' * 64); WorkerImageId = 'sha256:' + ('4' * 64); ExpectedRuntimeMode = 'file'; ExpectedHealthEndpoints = @('/health', '/ready', '/healthz', '/readyz'); NonTargetContainerIds = @{}; VolumeInventory = @() }
  Write-RotationResult 'ROTATION_PLAN_VALID' (($plan.status -eq 'PREPARED') -and (Test-RotationAttemptBudget $plan))
  Write-RotationResult 'ROTATION_REPEATED_OPERATION_BLOCKED' (-not (Test-RotationGenerationId 'not-a-transaction'))
  $state = [pscustomobject]@{ State = 'ACTIVATION_ATTEMPT_CONSUMED' }
  $classification = Get-RotationRecoveryClassification $state ([pscustomobject]@{ ApiCandidate = $true; WorkerCandidate = $false; ApiRollback = $false; WorkerRollback = $false; CandidateAcceptancePassed = $false; RollbackAcceptancePassed = $false; ApiHealthy = $true; WorkerHealthy = $false; CandidateApiMountsBound = $true; RollbackApiMountsBound = $false; WorkerMountsIsolated = $true })
  Write-RotationResult 'ROTATION_INTERRUPTED_RECOVERY' ($classification -eq 'ROLLBACK_REQUIRED')
  $actual = [pscustomobject]@{ ApiImageId = $plan.apiImageId; WorkerImageId = $plan.workerImageId; ApiRunning = $true; ApiHealthy = $true; ApiHealth200 = $true; ApiReady200 = $true; WorkerRunning = $true; WorkerHealthy = $true; WorkerHealth200 = $true; WorkerReady200 = $true; SecretProviderMode = 'file'; SecretProviderStatus = 'READY'; ApiSecretProviderRootBound = $true; ApiRequiredFileMounts = $true; ApiJenkinsMount = $false; WorkerApplicationSecretMount = $false; ApiMigratedEnvironmentAbsent = $true; WorkerMigratedEnvironmentAbsent = $true; GitHubActionsEnabled = $true; JenkinsIntegrationDisabled = $true; ApiProviderEquivalent = $true; WorkerProviderEquivalent = $true; NonTargetContainerIdsPreserved = $true; VolumeInventoryPreserved = $true }
  Write-RotationResult 'ROTATION_RUNTIME_ACCEPTANCE' (Test-RotationRuntimeAcceptanceData $actual ([pscustomobject]@{ ApiImageId = $plan.apiImageId; WorkerImageId = $plan.workerImageId })).Passed
}

function Invoke-RotationEvidenceCommand([string]$File, [string[]]$Arguments, [hashtable]$Environment, [string]$FailureCode) {
  $powershellExe = Join-Path $PSHOME 'powershell.exe'
  $process = Start-RotationProcess $powershellExe (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $File) + $Arguments) $FailureCode $Environment
  # Maintained validators may handle sensitive material internally. Their
  # diagnostics remain redirected and are never surfaced by rotation preflight.
  $null = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -ne 0) { Stop-Rotation $FailureCode }
}

function Get-RotationLocalImageId([string]$ImageReference) {
  if ([string]::IsNullOrWhiteSpace($ImageReference) -or $ImageReference -match '[\s"'']') { Stop-Rotation 'IMAGE_REFERENCE_INVALID' }
  $process = Start-RotationProcess 'docker' @('image', 'inspect', '--format', '{{.Id}}', $ImageReference) 'IMAGE_INSPECTION_FAILED'
  $value = $process.StandardOutput.ReadToEnd().Trim(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -ne 0 -or -not (Test-RotationSha256 $value)) { Stop-Rotation 'IMAGE_INSPECTION_FAILED' }
  return $value
}

function Get-RotationContainerMetadata([string]$Container) {
  if ($Container -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') { Stop-Rotation 'ROLLBACK_CONTAINER_INVALID' }
  $process = Start-RotationProcess 'docker' @('inspect', '--format', '{{.Id}}|{{.Image}}|{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}},{{end}}{{end}}', $Container) 'ROLLBACK_CONTAINER_INSPECTION_FAILED'
  $line = $process.StandardOutput.ReadToEnd().Trim(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -ne 0) { Stop-Rotation 'ROLLBACK_CONTAINER_INSPECTION_FAILED' }
  $parts = $line.Split('|', 3)
  if ($parts.Count -ne 3 -or -not (Test-RotationSha256 $parts[1])) { Stop-Rotation 'ROLLBACK_CONTAINER_METADATA_MALFORMED' }
  return [pscustomobject]@{ ContainerId = $parts[0]; ImageId = $parts[1]; Volumes = @($parts[2].Split(',', [StringSplitOptions]::RemoveEmptyEntries) | Sort-Object -Unique) }
}

function Invoke-RotationDeliveryValidation([string]$GenerationPath) {
  $deliveryEnvironment = @{
    AUTOOPS_FILE_MODE_ENV_FILE = Join-Path $GenerationPath 'runtime.env'
    AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE = Join-Path $GenerationPath 'sensitive.env'
    AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $GenerationPath 'jwt-access'
    AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $GenerationPath 'jwt-refresh'
    AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $GenerationPath 'github-actions-token'
  }
  Invoke-RotationEvidenceCommand (Join-Path $PSScriptRoot 'validate-mounted-secret-delivery.ps1') @('-Overlay', 'core,sensitive-env,github') $deliveryEnvironment 'MOUNTED_SECRET_DELIVERY_REJECTED'
}

try {
  if ($RunSelfTest) {
    Test-RotationSelfTest
    [Console]::WriteLine('ROTATION_PREFLIGHT_SELF_TEST PASS')
    exit 0
  }
  if (-not (Test-RotationRevision $RepositoryRevision)) { Stop-Rotation 'REPOSITORY_REVISION_INVALID' }
  $overlays = @($ExpectedOverlays.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
  if (@($IneligibleGenerationId | Where-Object { -not (Test-RotationGenerationId $_) }).Count -gt 0) { Stop-Rotation 'INELIGIBLE_GENERATION_ID_INVALID' }
  if ($IneligibleGenerationId -contains $CandidateGenerationId) { Stop-Rotation 'CANDIDATE_GENERATION_INELIGIBLE' }
  $candidatePath = Test-RotationGenerationSet $TargetRoot $CandidateGenerationId
  $currentPath = Test-RotationGenerationSet $TargetRoot $CurrentGoodGenerationId
  if (-not [string]::IsNullOrWhiteSpace($PreviousGoodGenerationId)) { $null = Test-RotationGenerationSet $TargetRoot $PreviousGoodGenerationId }
  if ($CandidateGenerationId -ceq $CurrentGoodGenerationId -or $CandidateGenerationId -ceq $PreviousGoodGenerationId) { Stop-Rotation 'CANDIDATE_GENERATION_REUSE' }
  Invoke-RotationDeliveryValidation $currentPath
  Invoke-RotationDeliveryValidation $candidatePath
  Invoke-RotationEvidenceCommand (Join-Path $PSScriptRoot 'validate-file-mode-image-provenance.ps1') @('-ExpectedRevision', $RepositoryRevision, '-ApiImage', $ApiImage, '-WorkerImage', $WorkerImage, '-ApiBuildRecordRef', $ApiBuildRecordRef, '-WorkerBuildRecordRef', $WorkerBuildRecordRef, '-BuildxBuilder', $BuildxBuilder) @{} 'IMAGE_PROVENANCE_REJECTED'
  if ((Get-RotationLocalImageId $ApiImage) -cne $CandidateApiImageId -or (Get-RotationLocalImageId $WorkerImage) -cne $CandidateWorkerImageId) { Stop-Rotation 'CANDIDATE_IMAGE_IDENTITY_MISMATCH' }
  $candidateConfiguration = Get-RotationRuntimeConfiguration (Join-Path $candidatePath 'runtime.env')
  $currentConfiguration = Get-RotationRuntimeConfiguration (Join-Path $currentPath 'runtime.env')
  if (-not (Test-RotationEnablementContract $candidateConfiguration $overlays)) { Stop-Rotation 'CANDIDATE_ENABLEMENT_CONTRACT_INVALID' }
  if (-not (Test-RotationProviderSemanticEquivalence $currentConfiguration $candidateConfiguration)) { Stop-Rotation 'CANDIDATE_PROVIDER_CONFIGURATION_DRIFT' }
  $rollbackApi = Get-RotationContainerMetadata $script:RotationRuntimeServices.api
  $rollbackWorker = Get-RotationContainerMetadata $script:RotationRuntimeServices.worker
  if ($rollbackApi.ImageId -cne $RollbackApiImageId -or $rollbackWorker.ImageId -cne $RollbackWorkerImageId) { Stop-Rotation 'ROLLBACK_IMAGE_IDENTITY_MISMATCH' }
  $nonTargetIds = [ordered]@{}
  $volumes = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($volume in @($rollbackApi.Volumes + $rollbackWorker.Volumes)) { $null = $volumes.Add($volume) }
  foreach ($container in $script:RotationNonTargetContainers) {
    $metadata = Get-RotationContainerMetadata $container
    $nonTargetIds[$container] = $metadata.ContainerId
    foreach ($volume in $metadata.Volumes) { $null = $volumes.Add($volume) }
  }
  $rollback = @{ TargetGenerationId = $CurrentGoodGenerationId; ApiImageId = $RollbackApiImageId; WorkerImageId = $RollbackWorkerImageId; ExpectedRuntimeMode = 'file'; ExpectedHealthEndpoints = @('/health', '/ready', '/healthz', '/readyz'); NonTargetContainerIds = $nonTargetIds; VolumeInventory = @($volumes | Sort-Object) }
  $plan = New-RotationPlanObject $OperationId $CandidateGenerationId $CurrentGoodGenerationId $PreviousGoodGenerationId $RepositoryRevision $CandidateApiImageId $CandidateWorkerImageId $overlays $rollback
  $null = Write-RotationPlanAtomically $TargetRoot $plan
  $initializer = Join-Path $PSScriptRoot 'initialize-secret-rotation-operation.ps1'
  $powershellExe = Join-Path $PSHOME 'powershell.exe'
  $process = Start-RotationProcess $powershellExe @('-NoProfile','-ExecutionPolicy','Bypass','-File',$initializer,'-TargetRoot',$TargetRoot,'-OperationId',$OperationId) 'ROTATION_INITIALIZER_START_FAILED'
  $null = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -ne 0) { Stop-Rotation 'ROLLBACK_RUNTIME_BASELINE_REJECTED' }
  [Console]::WriteLine('ROTATION_PREFLIGHT PASS')
  [Console]::WriteLine('ROTATION_PLAN_STATUS PREPARED')
  [Console]::WriteLine('ROTATION_PLAN_CREATED YES')
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'ROTATION_PREFLIGHT_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
