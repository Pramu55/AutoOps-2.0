[CmdletBinding(DefaultParameterSetName = 'Validate')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Validate')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Validate')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(ParameterSetName = 'Validate')][string]$ApiContainer = 'autoops-api',
  [Parameter(ParameterSetName = 'Validate')][string]$WorkerContainer = 'autoops-worker',
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

function Invoke-RotationDocker([string[]]$Arguments, [string]$FailureCode) {
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'docker'; $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  foreach ($argument in $Arguments) { $null = $psi.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $psi
  if (-not $process.Start()) { Stop-Rotation $FailureCode }
  $stdout = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -ne 0) { Stop-Rotation $FailureCode }
  return $stdout
}

function Assert-RotationContainerName([string]$Name) {
  if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') { Stop-Rotation 'CONTAINER_NAME_INVALID' }
}

function Get-RotationContainerState([string]$Name) {
  Assert-RotationContainerName $Name
  $line = (Invoke-RotationDocker @('inspect', '--format', '{{.Id}}|{{.Image}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}', $Name) 'CONTAINER_INSPECTION_FAILED').Trim()
  $parts = $line.Split('|', 4)
  if ($parts.Count -ne 4 -or $parts[0] -notmatch '^[a-f0-9]{64}$' -or -not (Test-RotationSha256 $parts[1])) { Stop-Rotation 'CONTAINER_STATE_MALFORMED' }
  return [pscustomobject]@{ ContainerId = $parts[0]; ImageId = $parts[1]; Running = $parts[2] -eq 'running'; Healthy = $parts[3] -eq 'healthy' }
}

function Get-RotationMountAcceptance([string]$Name, [bool]$IsApi) {
  Assert-RotationContainerName $Name
  $raw = Invoke-RotationDocker @('inspect', '--format', '{{range .Mounts}}{{.Destination}}|{{.RW}}{{"\n"}}{{end}}', $Name) 'MOUNT_INSPECTION_FAILED'
  $mounts = @{}
  foreach ($line in ($raw -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split('|', 2)
    if ($parts.Count -ne 2) { Stop-Rotation 'MOUNT_INSPECTION_MALFORMED' }
    $mounts[$parts[0]] = $parts[1] -eq 'true'
  }
  $targets = @('/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh', '/run/secrets/autoops/github-actions-token', '/run/secrets/autoops/jenkins-api-token')
  if ($IsApi) {
    return [pscustomobject]@{ Required = ($mounts.ContainsKey($targets[0]) -and -not $mounts[$targets[0]] -and $mounts.ContainsKey($targets[1]) -and -not $mounts[$targets[1]] -and $mounts.ContainsKey($targets[2]) -and -not $mounts[$targets[2]]); Jenkins = $mounts.ContainsKey($targets[3]) }
  }
  return [pscustomobject]@{ Required = $true; Jenkins = $false; Unexpected = @($targets | Where-Object { $mounts.ContainsKey($_) }).Count -gt 0 }
}

function Get-RotationContainerVolumeNames([string]$Name) {
  Assert-RotationContainerName $Name
  $raw = Invoke-RotationDocker @('inspect', '--format', '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{"\n"}}{{end}}{{end}}', $Name) 'VOLUME_INSPECTION_FAILED'
  return @($raw -split "`r?`n" | Where-Object { $_.Length -gt 0 })
}

function Get-RotationEnvironmentValue([string]$Container, [string]$Key) {
  Assert-RotationContainerName $Container
  if ($Key -notmatch '^[A-Z][A-Z0-9_]*$') { Stop-Rotation 'ENVIRONMENT_KEY_INVALID' }
  $script = 'if [ "${' + $Key + '+x}" ]; then printf %s "${' + $Key + '}"; else exit 3; fi'
  $psi = [Diagnostics.ProcessStartInfo]::new(); $psi.FileName = 'docker'; $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  foreach ($argument in @('exec', $Container, 'sh', '-c', $script)) { $null = $psi.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $psi
  if (-not $process.Start()) { Stop-Rotation 'ENVIRONMENT_INSPECTION_FAILED' }
  $value = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -eq 3) { return [pscustomobject]@{ Present = $false; Value = $null } }
  if ($process.ExitCode -ne 0) { Stop-Rotation 'ENVIRONMENT_INSPECTION_FAILED' }
  return [pscustomobject]@{ Present = $true; Value = $value }
}

function Get-RotationContainerProviderConfiguration([string]$Container) {
  $data = [ordered]@{}
  foreach ($key in $script:RotationProviderKeys) {
    $entry = Get-RotationEnvironmentValue $Container $key
    $data[$key] = [pscustomobject]@{ State = if (-not $entry.Present) { 'ABSENT' } elseif ($entry.Value.Length -eq 0) { 'EMPTY' } else { 'NONEMPTY' }; Value = $entry.Value }
  }
  foreach ($key in $script:RotationFlagKeys) { $data[$key] = (Get-RotationEnvironmentValue $Container $key).Value }
  return [pscustomobject]$data
}

function Test-RotationMigratedEnvironmentAbsent([string]$Container) {
  foreach ($key in @('JWT_SECRET', 'JWT_REFRESH_SECRET', 'GITHUB_ACTIONS_TOKEN', 'JENKINS_API_TOKEN')) {
    if ((Get-RotationEnvironmentValue $Container $key).Present) { return $false }
  }
  return $true
}

function Get-RotationHttpStatus([string]$Uri) {
  try { return (Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 10).StatusCode } catch { return 0 }
}

function Get-RotationReadiness($Uri) {
  try {
    $payload = Invoke-RestMethod -Uri $Uri -TimeoutSec 10
    if ($null -eq $payload.secretProvider) { return [pscustomobject]@{ Mode = $null; Status = $null } }
    return [pscustomobject]@{ Mode = [string]$payload.secretProvider.mode; Status = [string]$payload.secretProvider.status }
  } catch { return [pscustomobject]@{ Mode = $null; Status = $null } }
}

function Test-RotationRuntimeSelfTest {
  $expected = [pscustomobject]@{ ApiImageId = 'sha256:' + ('1' * 64); WorkerImageId = 'sha256:' + ('2' * 64) }
  $actual = [pscustomobject]@{ ApiImageId = $expected.ApiImageId; WorkerImageId = $expected.WorkerImageId; ApiRunning = $true; ApiHealthy = $true; ApiHealth200 = $true; ApiReady200 = $true; WorkerRunning = $true; WorkerHealthy = $true; WorkerHealth200 = $true; WorkerReady200 = $true; SecretProviderMode = 'file'; SecretProviderStatus = 'READY'; ApiRequiredFileMounts = $true; ApiJenkinsMount = $false; WorkerApplicationSecretMount = $false; ApiMigratedEnvironmentAbsent = $true; WorkerMigratedEnvironmentAbsent = $true; GitHubActionsEnabled = $true; JenkinsIntegrationDisabled = $true; ApiProviderEquivalent = $true; WorkerProviderEquivalent = $true; NonTargetContainerIdsPreserved = $true; VolumeInventoryPreserved = $true }
  $pass = Test-RotationRuntimeAcceptanceData $actual $expected
  if (-not $pass.Passed) { Stop-Rotation 'RUNTIME_ACCEPTANCE_SELF_TEST_FAILED' }
  $actual.WorkerApplicationSecretMount = $true
  $fail = Test-RotationRuntimeAcceptanceData $actual $expected
  if ($fail.Passed -or $fail.Gate -ne 'WORKER_MOUNTS') { Stop-Rotation 'RUNTIME_ACCEPTANCE_FAIL_CLOSED_TEST_FAILED' }
  [Console]::WriteLine('RUNTIME_ACCEPTANCE_SELF_TEST PASS')
}

try {
  if ($RunSelfTest) { Test-RotationRuntimeSelfTest; exit 0 }
  $plan = Read-RotationPlan $TargetRoot $OperationId
  if ($plan.status -notin @('PREPARED', 'VALIDATED', 'ACTIVATION_CANDIDATE')) { Stop-Rotation 'RUNTIME_ACCEPTANCE_PLAN_STATUS_INVALID' }
  $baselinePath = Join-Path (Get-RotationGenerationPath $TargetRoot $plan.currentGoodGenerationId) 'runtime.env'
  $baseline = Get-RotationRuntimeConfiguration $baselinePath
  $apiState = Get-RotationContainerState $ApiContainer; $workerState = Get-RotationContainerState $WorkerContainer
  $apiMounts = Get-RotationMountAcceptance $ApiContainer $true; $workerMounts = Get-RotationMountAcceptance $WorkerContainer $false
  $apiConfig = Get-RotationContainerProviderConfiguration $ApiContainer; $workerConfig = Get-RotationContainerProviderConfiguration $WorkerContainer
  $readiness = Get-RotationReadiness 'http://localhost:4000/ready'
  $nonTargetPreserved = $true
  $volumeSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($volume in @(Get-RotationContainerVolumeNames $ApiContainer) + @(Get-RotationContainerVolumeNames $WorkerContainer)) { $null = $volumeSet.Add($volume) }
  foreach ($property in @($plan.rollback.NonTargetContainerIds.PSObject.Properties)) {
    $nonTargetPreserved = $nonTargetPreserved -and (Get-RotationContainerState $property.Name).ContainerId -eq $property.Value
    foreach ($volume in Get-RotationContainerVolumeNames $property.Name) { $null = $volumeSet.Add($volume) }
  }
  $volumeNames = @($volumeSet | Sort-Object)
  $volumesPreserved = (($volumeNames -join [char]0) -ceq ((@($plan.rollback.VolumeInventory | Sort-Object)) -join [char]0))
  $actual = [pscustomobject]@{
    ApiImageId = $apiState.ImageId; WorkerImageId = $workerState.ImageId; ApiRunning = $apiState.Running; ApiHealthy = $apiState.Healthy; ApiHealth200 = (Get-RotationHttpStatus 'http://localhost:4000/health') -eq 200; ApiReady200 = (Get-RotationHttpStatus 'http://localhost:4000/ready') -eq 200; WorkerRunning = $workerState.Running; WorkerHealthy = $workerState.Healthy; WorkerHealth200 = (Get-RotationHttpStatus 'http://localhost:4001/healthz') -eq 200; WorkerReady200 = (Get-RotationHttpStatus 'http://localhost:4001/readyz') -eq 200; SecretProviderMode = $readiness.Mode; SecretProviderStatus = $readiness.Status; ApiRequiredFileMounts = $apiMounts.Required; ApiJenkinsMount = $apiMounts.Jenkins; WorkerApplicationSecretMount = $workerMounts.Unexpected; ApiMigratedEnvironmentAbsent = Test-RotationMigratedEnvironmentAbsent $ApiContainer; WorkerMigratedEnvironmentAbsent = Test-RotationMigratedEnvironmentAbsent $WorkerContainer; GitHubActionsEnabled = ($apiConfig.GITHUB_ACTIONS_ENABLED -ceq 'true' -and $workerConfig.GITHUB_ACTIONS_ENABLED -ceq 'true'); JenkinsIntegrationDisabled = ($apiConfig.JENKINS_INTEGRATION_ENABLED -ceq 'false' -and $workerConfig.JENKINS_INTEGRATION_ENABLED -ceq 'false'); ApiProviderEquivalent = Test-RotationProviderSemanticEquivalence $baseline $apiConfig; WorkerProviderEquivalent = Test-RotationProviderSemanticEquivalence $baseline $workerConfig; NonTargetContainerIdsPreserved = $nonTargetPreserved; VolumeInventoryPreserved = $volumesPreserved
  }
  $result = Test-RotationRuntimeAcceptanceData $actual ([pscustomobject]@{ ApiImageId = $plan.apiImageId; WorkerImageId = $plan.workerImageId })
  if (-not $result.Passed) { Stop-Rotation ('RUNTIME_ACCEPTANCE_' + $result.Gate) }
  [Console]::WriteLine('RUNTIME_ACCEPTANCE PASS')
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'RUNTIME_ACCEPTANCE_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
