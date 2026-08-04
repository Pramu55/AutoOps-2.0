[CmdletBinding()]
param(
  [ValidateSet('core', 'github', 'jenkins')]
  [string]$Overlay = 'core',
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

$contracts = @{
  core = @(
    @{ Variable = 'AUTOOPS_SECRET_JWT_ACCESS_FILE'; FileName = 'jwt-access'; Consumers = 'api' },
    @{ Variable = 'AUTOOPS_SECRET_JWT_REFRESH_FILE'; FileName = 'jwt-refresh'; Consumers = 'api' }
  )
  github = @(
    @{ Variable = 'AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE'; FileName = 'github-actions-token'; Consumers = 'api' }
  )
  jenkins = @(
    @{ Variable = 'AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE'; FileName = 'jenkins-api-token'; Consumers = 'api,worker' }
  )
}

function Write-Result([string]$Name, [string]$Status, [bool]$Passed) {
  Write-Output "$Name $Status $(if ($Passed) { 'PASS' } else { 'FAIL' })"
}

function Test-SourceFile([hashtable]$Contract, [string]$RepositoryRoot) {
  $passed = $true
  $value = [Environment]::GetEnvironmentVariable($Contract.Variable)
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Result $Contract.Variable 'ABSENT' $false
    return $false
  }
  Write-Result $Contract.Variable 'PRESENT' $true

  if (-not [IO.Path]::IsPathRooted($value) -or -not (Test-Path -LiteralPath $value)) {
    Write-Result $Contract.Variable 'INVALID_TYPE' $false
    return $false
  }

  $item = Get-Item -Force -LiteralPath $value
  if ($item.PSIsContainer -or -not ($item -is [IO.FileInfo])) {
    Write-Result $Contract.Variable 'INVALID_TYPE' $false
    return $false
  }
  Write-Result $Contract.Variable 'FILE' $true

  if ($item.Name -ne $Contract.FileName) {
    Write-Result $Contract.Variable 'INVALID_TYPE' $false
    $passed = $false
  }

  $repositoryPrefix = $RepositoryRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  $insideRepository = $item.FullName.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)
  if ($insideRepository) {
    $relative = $item.FullName.Substring($repositoryPrefix.Length)
    git ls-files --error-unmatch -- $relative 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Result $Contract.Variable 'TRACKED' $false
      return $false
    }
    git check-ignore -q -- $relative
    if ($LASTEXITCODE -ne 0) {
      Write-Result $Contract.Variable 'UNTRACKED' $false
      return $false
    }
  }
  Write-Result $Contract.Variable 'UNTRACKED' $true
  return $passed
}

function Test-Overlay([string]$SelectedOverlay) {
  $repositoryRoot = (git rev-parse --show-toplevel).Trim()
  $required = @($contracts.core)
  if ($SelectedOverlay -eq 'github') { $required += $contracts.github }
  if ($SelectedOverlay -eq 'jenkins') { $required += $contracts.jenkins }

  $allPassed = $true
  $seen = @{}
  foreach ($contract in $required) {
    $value = [Environment]::GetEnvironmentVariable($contract.Variable)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $key = [IO.Path]::GetFullPath($value).ToLowerInvariant()
      if ($seen.ContainsKey($key)) {
        Write-Result $contract.Variable 'DUPLICATE' $false
        $allPassed = $false
        continue
      }
      $seen[$key] = $true
    }
    if (-not (Test-SourceFile $contract $repositoryRoot)) { $allPassed = $false }
  }

  $jenkinsEnabled = [Environment]::GetEnvironmentVariable('JENKINS_INTEGRATION_ENABLED')
  if ($SelectedOverlay -ne 'jenkins' -and ($jenkinsEnabled -eq 'true' -or $jenkinsEnabled -eq '1')) {
    Write-Result 'JENKINS_INTEGRATION_ENABLED' 'PRESENT' $false
    $allPassed = $false
  } else {
    Write-Result 'JENKINS_INTEGRATION_ENABLED' 'PRESENT' $true
  }
  return $allPassed
}

function Invoke-SelfTest {
  $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "autoops-mounted-secret-test-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  try {
    $files = @('jwt-access', 'jwt-refresh', 'github-actions-token', 'jenkins-api-token')
    foreach ($file in $files) { New-Item -ItemType File -Path (Join-Path $temporaryRoot $file) | Out-Null }
    $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'
    $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $temporaryRoot 'jwt-refresh'
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
    $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = Join-Path $temporaryRoot 'jenkins-api-token'
    $env:JENKINS_INTEGRATION_ENABLED = 'false'
    $passed = (Test-Overlay 'core') -and (Test-Overlay 'github') -and (Test-Overlay 'jenkins')
    Remove-Item Env:AUTOOPS_SECRET_JWT_ACCESS_FILE, Env:AUTOOPS_SECRET_JWT_REFRESH_FILE, Env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE, Env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE -ErrorAction SilentlyContinue
    if (Test-Overlay 'core') { $passed = $false }
    $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'
    $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $temporaryRoot 'jwt-access'
    if (Test-Overlay 'core') { $passed = $false }
    $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path ((git rev-parse --show-toplevel).Trim()) 'package.json'
    $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $temporaryRoot 'jwt-refresh'
    if (Test-Overlay 'core') { $passed = $false }
    Write-Result 'SELF_TEST' 'STRUCTURAL' $passed
    return $passed
  } finally {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

if ($SelfTest) {
  if (-not (Invoke-SelfTest)) { exit 1 }
  exit 0
}

if (-not (Test-Overlay $Overlay)) { exit 1 }
