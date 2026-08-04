$ErrorActionPreference = 'Stop'

function Assert-Condition([string]$Name, [bool]$Condition) {
  Write-Output "$Name $(if ($Condition) { 'PASS' } else { 'FAIL' })"
  if (-not $Condition) { throw "Mounted-secret structural test failed: $Name" }
}

function Get-ComposeModel([string[]]$Files) {
  $arguments = @()
  foreach ($file in $Files) { $arguments += @('-f', $file) }
  $arguments += @('config', '--format', 'json')
  $json = & docker compose @arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose structural rendering failed.' }
  return $json | ConvertFrom-Json
}

function Get-SecretMounts($Service) {
  return @($Service.volumes | Where-Object { $_.target -like '/run/secrets/autoops/*' })
}

function Test-MigratedEnvironmentAbsent($Service) {
  foreach ($name in @('JWT_SECRET', 'JWT_REFRESH_SECRET', 'GITHUB_ACTIONS_TOKEN', 'JENKINS_API_TOKEN')) {
    $property = $Service.environment.PSObject.Properties[$name]
    # A null override removes an inherited env_file variable under Compose
    # semantics; an absent property is equivalent.
    if ($null -ne $property -and $null -ne $property.Value) { return $false }
  }
  return $true
}

function Test-MountTargets($Service, [string[]]$Expected) {
  $actual = @((Get-SecretMounts $Service).target | Sort-Object)
  return (($actual -join ',') -eq (($Expected | Sort-Object) -join ','))
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "autoops-mounted-secret-compose-test-$([guid]::NewGuid())"
$variables = @(
  'AUTOOPS_FILE_MODE_ENV_FILE', 'AUTOOPS_SECRET_JWT_ACCESS_FILE',
  'AUTOOPS_SECRET_JWT_REFRESH_FILE', 'AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE',
  'AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE', 'GITHUB_ACTIONS_ENABLED',
  'JENKINS_INTEGRATION_ENABLED'
)
$original = @{}
foreach ($variable in $variables) { $original[$variable] = [Environment]::GetEnvironmentVariable($variable) }
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
  foreach ($file in @('file-mode.env', 'jwt-access', 'jwt-refresh', 'github-actions-token', 'jenkins-api-token')) {
    New-Item -ItemType File -Path (Join-Path $temporaryRoot $file) | Out-Null
  }
  $env:AUTOOPS_FILE_MODE_ENV_FILE = Join-Path $temporaryRoot 'file-mode.env'
  $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'
  $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $temporaryRoot 'jwt-refresh'
  $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
  $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = Join-Path $temporaryRoot 'jenkins-api-token'

  $default = Get-ComposeModel @('docker-compose.yml')
  $core = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml')
  $github = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-github.yml')
  $jenkins = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-jenkins.yml')
  $combined = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-github.yml', 'docker-compose.secrets-jenkins.yml')

  Assert-Condition 'DEFAULT_ENV_MODE_UNCHANGED' ($null -eq $default.services.api.environment.SECRET_PROVIDER_MODE)
  Assert-Condition 'CORE_API_FILE_MODE' ($core.services.api.environment.SECRET_PROVIDER_MODE -eq 'file')
  Assert-Condition 'CORE_WORKER_FILE_MODE' ($core.services.worker.environment.SECRET_PROVIDER_MODE -eq 'file')
  Assert-Condition 'CORE_API_MIGRATED_ENV_REMOVED' (Test-MigratedEnvironmentAbsent $core.services.api)
  Assert-Condition 'CORE_WORKER_MIGRATED_ENV_REMOVED' (Test-MigratedEnvironmentAbsent $core.services.worker)
  Assert-Condition 'API_CORE_MOUNTS_ONLY_JWT' (Test-MountTargets $core.services.api @('/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh'))
  Assert-Condition 'WORKER_CORE_HAS_NO_SECRET_MOUNTS' (Test-MountTargets $core.services.worker @())
  Assert-Condition 'GITHUB_MOUNTS_ONLY_API_TOKEN' (Test-MountTargets $github.services.api @('/run/secrets/autoops/github-actions-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh'))
  Assert-Condition 'GITHUB_WORKER_REMAINS_SECRET_FREE' (Test-MountTargets $github.services.worker @())
  Assert-Condition 'JENKINS_MOUNTS_ONLY_REQUIRED_TOKEN' ((Test-MountTargets $jenkins.services.api @('/run/secrets/autoops/jenkins-api-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh')) -and (Test-MountTargets $jenkins.services.worker @('/run/secrets/autoops/jenkins-api-token')))
  Assert-Condition 'COMBINED_OVERLAYS_MOUNT_EXPECTED_FILES' ((Test-MountTargets $combined.services.api @('/run/secrets/autoops/github-actions-token', '/run/secrets/autoops/jenkins-api-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh')) -and (Test-MountTargets $combined.services.worker @('/run/secrets/autoops/jenkins-api-token')))
  $allMounts = @((Get-SecretMounts $combined.services.api) + (Get-SecretMounts $combined.services.worker))
  Assert-Condition 'ALL_SECRET_MOUNTS_READ_ONLY' (@($allMounts | Where-Object { -not $_.read_only }).Count -eq 0)
  Assert-Condition 'COMBINED_API_MIGRATED_ENV_REMOVED' (Test-MigratedEnvironmentAbsent $combined.services.api)
  Assert-Condition 'COMBINED_WORKER_MIGRATED_ENV_REMOVED' (Test-MigratedEnvironmentAbsent $combined.services.worker)
  Assert-Condition 'NO_SECRET_BUILD_ARGUMENTS' ($null -eq $combined.services.api.build.args -and $null -eq $combined.services.worker.build.args)
  Assert-Condition 'NO_RENDERED_KUBERNETES_SECRET_DATA' (-not (($combined | ConvertTo-Json -Depth 20) -match 'stringData'))

  & powershell -ExecutionPolicy Bypass -File scripts/validate-mounted-secret-delivery.ps1 -RunSelfTest
  Assert-Condition 'METADATA_VALIDATOR_SELF_TEST' ($LASTEXITCODE -eq 0)
} finally {
  foreach ($variable in $variables) { [Environment]::SetEnvironmentVariable($variable, $original[$variable], 'Process') }
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
