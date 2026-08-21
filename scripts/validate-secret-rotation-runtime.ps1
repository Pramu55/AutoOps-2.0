[CmdletBinding(DefaultParameterSetName = 'Validate')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Validate')][string]$TargetRoot,
  [Parameter(Mandatory, ParameterSetName = 'Validate')][ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [Parameter(ParameterSetName = 'Validate')][ValidateSet('Candidate', 'Rollback')][string]$Mode = 'Candidate',
  [Parameter(Mandatory, ParameterSetName = 'SelfTest')][switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'secret-rotation-common.ps1')

function Invoke-RotationDocker([string[]]$Arguments, [string]$FailureCode) {
  $process = Start-RotationProcess 'docker' $Arguments $FailureCode
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

function Get-RotationContainerVolumeNames([string]$Name) {
  Assert-RotationContainerName $Name
  $raw = Invoke-RotationDocker @('inspect', '--format', '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{"\n"}}{{end}}{{end}}', $Name) 'VOLUME_INSPECTION_FAILED'
  return @($raw -split "`r?`n" | Where-Object { $_.Length -gt 0 })
}

function Get-RotationEnvironmentValue([string]$Container, [string]$Key) {
  Assert-RotationContainerName $Container
  if ($Key -notin @($script:RotationProviderKeys + $script:RotationFlagKeys + @('SECRET_PROVIDER_ROOT'))) { Stop-Rotation 'ENVIRONMENT_KEY_INVALID' }
  $script = 'if [ "${' + $Key + '+x}" ]; then printf %s "${' + $Key + '}"; else exit 3; fi'
  $process = Start-RotationProcess 'docker' @('exec', $Container, 'sh', '-c', $script) 'ENVIRONMENT_INSPECTION_FAILED'
  $value = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -eq 3) { return [pscustomobject]@{ Present = $false; Value = $null } }
  if ($process.ExitCode -ne 0) { Stop-Rotation 'ENVIRONMENT_INSPECTION_FAILED' }
  return [pscustomobject]@{ Present = $true; Value = $value }
}

function Test-RotationApiSecretProviderRoot($Entry) {
  # File-mode Compose explicitly sets this exact root. A missing, trailing-
  # slash, or alternate value could direct the API to unverified mounts.
  return $null -ne $Entry -and $Entry.Present -and $Entry.Value -ceq '/run/secrets/autoops'
}

function Test-RotationNonTargetPreservation($State, [string]$ExpectedContainerId) {
  return $null -ne $State -and $State.ContainerId -is [string] -and $State.ContainerId -match '^[a-f0-9]{64}$' -and $State.ContainerId -ceq $ExpectedContainerId -and $State.Running -eq $true
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
    if (-not (Test-RotationContainerSecretKeyAbsent $Container $key)) { return $false }
  }
  return $true
}

function New-RotationContainerHttpProbeArguments([string]$Container, [int]$Port, [string]$Path, [bool]$Readiness) {
  Assert-RotationContainerName $Container
  if ($Port -notin @(4000, 4001) -or $Path -notin @('/health', '/ready', '/healthz', '/readyz')) { Stop-Rotation 'CONTAINER_HTTP_PROBE_INVALID' }
  # Execute inside the exact plan-bound container. Only the status and the
  # allowlisted readiness classifications cross the process boundary.
  $program = @'
const http = require("http");
const port = Number(process.argv[1]);
const path = process.argv[2];
const readiness = process.argv[3] === "true";
const fail = () => process.exit(2);
const request = http.get({ hostname: "127.0.0.1", port, path, timeout: 10000 }, (response) => {
  if (!readiness) { process.stdout.write(String(response.statusCode)); response.resume(); return; }
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk) => { body += chunk; if (body.length > 65536) { request.destroy(); fail(); } });
  response.on("end", () => {
    try {
      const provider = JSON.parse(body).secretProvider || {};
      process.stdout.write([response.statusCode, String(provider.mode || ""), String(provider.status || "")].join("|"));
    } catch (_) { fail(); }
  });
});
request.setTimeout(10000, () => { request.destroy(); fail(); });
request.on("error", fail);
'@
  return @('exec', $Container, 'node', '-e', $program, $Port.ToString(), $Path, $Readiness.ToString().ToLowerInvariant())
}

function Get-RotationContainerHttpProbe([string]$Container, [int]$Port, [string]$Path, [bool]$Readiness) {
  try {
    $process = Start-RotationProcess 'docker' (New-RotationContainerHttpProbeArguments $Container $Port $Path $Readiness) 'CONTAINER_HTTP_PROBE_FAILED'
    $stdout = $process.StandardOutput.ReadToEnd().Trim(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
    if ($process.ExitCode -ne 0) { Stop-Rotation 'CONTAINER_HTTP_PROBE_FAILED' }
    return $stdout
  } catch { return $null }
}

function Get-RotationContainerHttpStatus([string]$Container, [int]$Port, [string]$Path) {
  $output = Get-RotationContainerHttpProbe $Container $Port $Path $false
  if ($output -notmatch '^[1-5][0-9]{2}$') { return 0 }
  return [int]$output
}

function Get-RotationContainerReadiness([string]$Container) {
  $output = Get-RotationContainerHttpProbe $Container 4000 '/ready' $true
  if ($null -eq $output) { return [pscustomobject]@{ Mode = $null; Status = $null } }
  $parts = $output.Split('|', 3)
  if ($parts.Count -ne 3 -or $parts[0] -notmatch '^[1-5][0-9]{2}$') { return [pscustomobject]@{ Mode = $null; Status = $null } }
  return [pscustomobject]@{ Mode = $parts[1]; Status = $parts[2] }
}

function Test-RotationRuntimeSelfTest {
  $expected = [pscustomobject]@{ ApiImageId = 'sha256:' + ('1' * 64); WorkerImageId = 'sha256:' + ('2' * 64) }
  $actual = [pscustomobject]@{ ApiImageId = $expected.ApiImageId; WorkerImageId = $expected.WorkerImageId; ApiRunning = $true; ApiHealthy = $true; ApiHealth200 = $true; ApiReady200 = $true; WorkerRunning = $true; WorkerHealthy = $true; WorkerHealth200 = $true; WorkerReady200 = $true; SecretProviderMode = 'file'; SecretProviderStatus = 'READY'; ApiSecretProviderRootBound = $true; ApiRequiredFileMounts = $true; ApiJenkinsMount = $false; WorkerApplicationSecretMount = $false; ApiMigratedEnvironmentAbsent = $true; WorkerMigratedEnvironmentAbsent = $true; GitHubActionsEnabled = $true; JenkinsIntegrationDisabled = $true; ApiProviderEquivalent = $true; WorkerProviderEquivalent = $true; NonTargetContainerIdsPreserved = $true; VolumeInventoryPreserved = $true }
  $pass = Test-RotationRuntimeAcceptanceData $actual $expected
  if (-not $pass.Passed) { Stop-Rotation 'RUNTIME_ACCEPTANCE_SELF_TEST_FAILED' }
  $actual.WorkerApplicationSecretMount = $true
  $fail = Test-RotationRuntimeAcceptanceData $actual $expected
  if ($fail.Passed -or $fail.Gate -ne 'WORKER_MOUNTS') { Stop-Rotation 'RUNTIME_ACCEPTANCE_FAIL_CLOSED_TEST_FAILED' }
  $actual.WorkerApplicationSecretMount = $false; $actual.ApiSecretProviderRootBound = $false
  $rootFail = Test-RotationRuntimeAcceptanceData $actual $expected
  if ($rootFail.Passed -or $rootFail.Gate -ne 'API_SECRET_PROVIDER_ROOT') { Stop-Rotation 'SECRET_PROVIDER_ROOT_SELF_TEST_FAILED' }
  $actual.ApiSecretProviderRootBound = $true
  $containerId = 'a' * 64
  if (-not (Test-RotationApiSecretProviderRoot ([pscustomobject]@{ Present = $true; Value = '/run/secrets/autoops' })) -or (Test-RotationApiSecretProviderRoot ([pscustomobject]@{ Present = $true; Value = '/tmp/autoops' })) -or (Test-RotationApiSecretProviderRoot ([pscustomobject]@{ Present = $true; Value = '/run/secrets/autoops/' })) -or (Test-RotationApiSecretProviderRoot ([pscustomobject]@{ Present = $false; Value = $null }))) { Stop-Rotation 'SECRET_PROVIDER_ROOT_SELF_TEST_FAILED' }
  if (-not (Test-RotationNonTargetPreservation ([pscustomobject]@{ ContainerId = $containerId; Running = $true }) $containerId) -or (Test-RotationNonTargetPreservation ([pscustomobject]@{ ContainerId = $containerId; Running = $false }) $containerId) -or (Test-RotationNonTargetPreservation ([pscustomobject]@{ ContainerId = ('b' * 64); Running = $true }) $containerId)) { Stop-Rotation 'NON_TARGET_PRESERVATION_SELF_TEST_FAILED' }
  if (-not (Test-RotationPresenceOnlyExitCode 3) -or (Test-RotationPresenceOnlyExitCode 0)) { Stop-Rotation 'SECRET_PRESENCE_ONLY_SELF_TEST_FAILED' }
  $apiProbe = New-RotationContainerHttpProbeArguments 'autoops-api' 4000 '/ready' $true
  $workerProbe = New-RotationContainerHttpProbeArguments 'autoops-worker' 4001 '/readyz' $false
  if ($apiProbe[0] -cne 'exec' -or $apiProbe[1] -cne 'autoops-api' -or $apiProbe[5] -cne '4000' -or $apiProbe[6] -cne '/ready' -or $workerProbe[1] -cne 'autoops-worker' -or $workerProbe[5] -cne '4001' -or $workerProbe[6] -cne '/readyz') { Stop-Rotation 'PLAN_BOUND_HTTP_PROBE_SELF_TEST_FAILED' }
  $validatorSource = Get-Content -LiteralPath $PSCommandPath -Raw
  $hostEndpointPattern = ('local' + 'host:4000|local' + 'host:4001')
  if ($validatorSource -match $hostEndpointPattern) { Stop-Rotation 'HOST_PORT_HTTP_PROBE_SELF_TEST_FAILED' }
  [Console]::WriteLine('CANDIDATE_ACCEPTANCE_SELF_TEST PASS')
  [Console]::WriteLine('ROLLBACK_ACCEPTANCE_SELF_TEST PASS')
  [Console]::WriteLine('MIGRATED_SECRET_PRESENCE_ONLY PASS')
  [Console]::WriteLine('HTTP_PROBES_PLAN_BOUND PASS')
  [Console]::WriteLine('HOST_PORT_DECOY_ACCEPTANCE_BLOCKED PASS')
  [Console]::WriteLine('API_SECRET_PROVIDER_ROOT_BOUND PASS')
  [Console]::WriteLine('ALTERNATE_SECRET_PROVIDER_ROOT_BLOCKED PASS')
  [Console]::WriteLine('NON_TARGET_RUNNING_REQUIRED PASS')
  [Console]::WriteLine('NON_TARGET_STOPPED_BLOCKED PASS')
  [Console]::WriteLine('NON_TARGET_IDENTITY_PRESERVED PASS')
}

try {
  if ($RunSelfTest) { Test-RotationRuntimeSelfTest; exit 0 }
  $plan = Read-RotationPlan $TargetRoot $OperationId
  $ApiContainer = $plan.runtimeServices.api; $WorkerContainer = $plan.runtimeServices.worker
  $expectedGeneration = if ($Mode -eq 'Candidate') { $plan.candidateGenerationId } else { $plan.rollback.TargetGenerationId }
  $expectedApiImage = if ($Mode -eq 'Candidate') { $plan.apiImageId } else { $plan.rollback.ApiImageId }
  $expectedWorkerImage = if ($Mode -eq 'Candidate') { $plan.workerImageId } else { $plan.rollback.WorkerImageId }
  $baselinePath = Join-Path (Get-RotationGenerationPath $TargetRoot $plan.currentGoodGenerationId) 'runtime.env'
  $baseline = Get-RotationRuntimeConfiguration $baselinePath
  $apiState = Get-RotationContainerState $ApiContainer; $workerState = Get-RotationContainerState $WorkerContainer
  $apiMountsBound = Test-RotationMountBindingData (Get-RotationContainerMountRecords $ApiContainer) $TargetRoot $expectedGeneration $true
  $workerMountsBound = Test-RotationMountBindingData (Get-RotationContainerMountRecords $WorkerContainer) $TargetRoot $expectedGeneration $false
  $apiConfig = Get-RotationContainerProviderConfiguration $ApiContainer; $workerConfig = Get-RotationContainerProviderConfiguration $WorkerContainer
  $apiSecretProviderRootBound = Test-RotationApiSecretProviderRoot (Get-RotationEnvironmentValue $ApiContainer 'SECRET_PROVIDER_ROOT')
  $readiness = Get-RotationContainerReadiness $ApiContainer
  $nonTargetPreserved = $true
  $volumeSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($volume in @(Get-RotationContainerVolumeNames $ApiContainer) + @(Get-RotationContainerVolumeNames $WorkerContainer)) { $null = $volumeSet.Add($volume) }
  foreach ($property in @($plan.rollback.NonTargetContainerIds.PSObject.Properties)) {
    $nonTargetPreserved = $nonTargetPreserved -and (Test-RotationNonTargetPreservation (Get-RotationContainerState $property.Name) $property.Value)
    foreach ($volume in Get-RotationContainerVolumeNames $property.Name) { $null = $volumeSet.Add($volume) }
  }
  $volumeNames = @($volumeSet | Sort-Object)
  $volumesPreserved = (($volumeNames -join [char]0) -ceq ((@($plan.rollback.VolumeInventory | Sort-Object)) -join [char]0))
  $actual = [pscustomobject]@{
    ApiImageId = $apiState.ImageId; WorkerImageId = $workerState.ImageId; ApiRunning = $apiState.Running; ApiHealthy = $apiState.Healthy; ApiHealth200 = (Get-RotationContainerHttpStatus $ApiContainer 4000 '/health') -eq 200; ApiReady200 = (Get-RotationContainerHttpStatus $ApiContainer 4000 '/ready') -eq 200; WorkerRunning = $workerState.Running; WorkerHealthy = $workerState.Healthy; WorkerHealth200 = (Get-RotationContainerHttpStatus $WorkerContainer 4001 '/healthz') -eq 200; WorkerReady200 = (Get-RotationContainerHttpStatus $WorkerContainer 4001 '/readyz') -eq 200; SecretProviderMode = $readiness.Mode; SecretProviderStatus = $readiness.Status; ApiSecretProviderRootBound = $apiSecretProviderRootBound; ApiRequiredFileMounts = $apiMountsBound; ApiJenkinsMount = $false; WorkerApplicationSecretMount = -not $workerMountsBound; ApiMigratedEnvironmentAbsent = Test-RotationMigratedEnvironmentAbsent $ApiContainer; WorkerMigratedEnvironmentAbsent = Test-RotationMigratedEnvironmentAbsent $WorkerContainer; GitHubActionsEnabled = ($apiConfig.GITHUB_ACTIONS_ENABLED -ceq 'true' -and $workerConfig.GITHUB_ACTIONS_ENABLED -ceq 'true'); JenkinsIntegrationDisabled = ($apiConfig.JENKINS_INTEGRATION_ENABLED -ceq 'false' -and $workerConfig.JENKINS_INTEGRATION_ENABLED -ceq 'false'); ApiProviderEquivalent = Test-RotationProviderSemanticEquivalence $baseline $apiConfig; WorkerProviderEquivalent = Test-RotationProviderSemanticEquivalence $baseline $workerConfig; NonTargetContainerIdsPreserved = $nonTargetPreserved; VolumeInventoryPreserved = $volumesPreserved
  }
  $result = Test-RotationRuntimeAcceptanceData $actual ([pscustomobject]@{ ApiImageId = $expectedApiImage; WorkerImageId = $expectedWorkerImage })
  if (-not $result.Passed) { Stop-Rotation ('RUNTIME_ACCEPTANCE_' + $result.Gate) }
  [Console]::WriteLine(('RUNTIME_' + $Mode.ToUpperInvariant() + '_ACCEPTANCE PASS'))
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'RUNTIME_ACCEPTANCE_FAILED' }
  [Console]::WriteLine(('ERROR_CODE=' + $code))
  exit 1
}
