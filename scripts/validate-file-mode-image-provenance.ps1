param(
  [string]$ExpectedRevision,
  [string]$ApiImage = 'autoops-api',
  [string]$WorkerImage = 'autoops-worker',
  [switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'

function Write-Result([string]$Name, [bool]$Passed) {
  Write-Host "$Name $(if ($Passed) { 'PASS' } else { 'FAIL' })"
}

function Test-Revision([string]$Revision) {
  return -not [string]::IsNullOrWhiteSpace($Revision) -and $Revision -cmatch '^[0-9a-f]{40}$'
}

function Test-ImageReference([string]$Image) {
  return -not [string]::IsNullOrWhiteSpace($Image) -and $Image -cmatch '^[A-Za-z0-9][A-Za-z0-9._/:@-]*$'
}

function Get-ImageRevision([string]$Image) {
  if (-not (Test-ImageReference $Image)) { return $null }
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'docker'
  $psi.Arguments = 'image inspect --format "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}" "' + $Image.Replace('"', '\"') + '"'
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  if (-not $process.Start()) { return $null }
  $stdout = $process.StandardOutput.ReadToEnd().Trim()
  $null = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($stdout) -or $stdout -eq '<no value>') {
    return $null
  }
  return $stdout
}

function Test-ImageRevision([string]$Revision, [string]$Expected) {
  return (Test-Revision $Revision) -and $Revision -ceq $Expected
}

function Invoke-SelfTest {
  $expected = 'a' * 40
  $stale = 'b' * 40
  $passed = $true
  $cases = @(
    @{ Name = 'IMAGE_PROVENANCE_EXACT_ACCEPTED_SHA'; Passed = (Test-ImageRevision $expected $expected) -and (Test-ImageRevision $expected $expected) },
    @{ Name = 'IMAGE_PROVENANCE_STALE_SHA_BLOCKED'; Passed = -not (Test-ImageRevision $stale $expected) },
    @{ Name = 'IMAGE_PROVENANCE_MISSING_BLOCKED'; Passed = -not (Test-ImageRevision $null $expected) },
    @{ Name = 'IMAGE_PROVENANCE_MALFORMED_BLOCKED'; Passed = -not (Test-ImageRevision 'not-a-revision' $expected) },
    @{ Name = 'IMAGE_PROVENANCE_INVALID_IMAGE_REFERENCE_BLOCKED'; Passed = -not (Test-ImageReference 'invalid image reference') },
    @{ Name = 'IMAGE_PROVENANCE_API_WORKER_MISMATCH_BLOCKED'; Passed = -not ((Test-ImageRevision $expected $expected) -and (Test-ImageRevision $stale $expected)) }
  )
  foreach ($case in $cases) {
    Write-Result $case.Name $case.Passed
    if (-not $case.Passed) { $passed = $false }
  }
  exit $(if ($passed) { 0 } else { 1 })
}

if ($RunSelfTest) { Invoke-SelfTest }

if (-not (Test-Revision $ExpectedRevision)) {
  Write-Result 'EXPECTED_IMAGE_REVISION' $false
  exit 1
}

$apiRevision = Get-ImageRevision $ApiImage
$workerRevision = Get-ImageRevision $WorkerImage
$apiPassed = Test-ImageRevision $apiRevision $ExpectedRevision
$workerPassed = Test-ImageRevision $workerRevision $ExpectedRevision
Write-Result 'API_IMAGE_PROVENANCE' $apiPassed
Write-Result 'WORKER_IMAGE_PROVENANCE' $workerPassed
if (-not $apiPassed -or -not $workerPassed) { exit 1 }
