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

function Test-SensitiveEnvironmentAuthoritative($Service, [string]$DatabaseUrl, [string]$RedisUrl) {
  return ($Service.environment.DATABASE_URL -eq $DatabaseUrl) -and
    ($Service.environment.REDIS_URL -eq $RedisUrl)
}

function Test-BaseRuntimeEnvironmentPreserved($BaseService, $SensitiveService, [string[]]$Keys) {
  foreach ($key in $Keys) {
    $baseProperty = $BaseService.environment.PSObject.Properties[$key]
    $sensitiveProperty = $SensitiveService.environment.PSObject.Properties[$key]
    if ($null -eq $baseProperty -or $null -eq $sensitiveProperty -or $sensitiveProperty.Value -ne $baseProperty.Value) { return $false }
  }
  return $true
}

function Get-ComposeEnvironmentMappingKeys([string]$Path, [string]$ServiceName) {
  $keys = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $inService = $false
  $inEnvironment = $false
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^  $([regex]::Escape($ServiceName)):\s*$") {
      $inService = $true
      $inEnvironment = $false
      continue
    }
    if (-not $inService) { continue }
    if ($line -match '^  [A-Za-z0-9_-]+:\s*$') { break }
    if ($line -match '^    environment:\s*(?:!override)?\s*$') {
      $inEnvironment = $true
      continue
    }
    if (-not $inEnvironment) { continue }
    if ($line -match '^    \S') { $inEnvironment = $false; continue }
    if ($line -match '^      (?<key>[A-Za-z_][A-Za-z0-9_]*):') {
      $null = $keys.Add($Matches['key'])
    }
  }
  return $keys
}

function Test-BaseEnvironmentDriftGuard($BaseKeys, $OverlayKeys) {
  $approvedRemovedKeys = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($key in @('DATABASE_URL', 'REDIS_URL')) {
    $null = $approvedRemovedKeys.Add($key)
  }
  foreach ($baseKey in $BaseKeys) {
    if (-not $approvedRemovedKeys.Contains($baseKey) -and -not $OverlayKeys.Contains($baseKey)) { return $false }
  }
  return $true
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "autoops-mounted-secret-compose-test-$([guid]::NewGuid())"
$variables = @(
  'AUTOOPS_FILE_MODE_ENV_FILE', 'AUTOOPS_SECRET_JWT_ACCESS_FILE',
  'AUTOOPS_SECRET_JWT_REFRESH_FILE', 'AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE',
  'AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE', 'AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE', 'GITHUB_ACTIONS_ENABLED',
  'JENKINS_INTEGRATION_ENABLED', 'DATABASE_URL', 'REDIS_URL',
  'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS'
)
$original = @{}
foreach ($variable in $variables) { $original[$variable] = [Environment]::GetEnvironmentVariable($variable) }
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
  foreach ($file in @('runtime.env', 'sensitive.env', 'jwt-access', 'jwt-refresh', 'github-actions-token', 'jenkins-api-token')) {
    New-Item -ItemType File -Path (Join-Path $temporaryRoot $file) | Out-Null
  }
  $env:AUTOOPS_FILE_MODE_ENV_FILE = Join-Path $temporaryRoot 'runtime.env'
  $env:AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE = Join-Path $temporaryRoot 'sensitive.env'
  $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'
  $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $temporaryRoot 'jwt-refresh'
  $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
  $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = Join-Path $temporaryRoot 'jenkins-api-token'
  $sensitiveDatabaseUrl = 'postgresql://dummy:dummy@dummy.invalid:5432/dummy'
  $sensitiveRedisUrl = 'redis://dummy.invalid:6379'
  $ambientDatabaseUrl = 'postgresql://ambient:ambient@ambient.invalid:5432/ambient'
  $ambientRedisUrl = 'redis://ambient.invalid:6380'
  $providerInventoryDefault = 'autoops-demo,pramod-s-ss-workspace'
  $providerInventoryOverride = 'test-provider-inventory'
  Set-Content -LiteralPath $env:AUTOOPS_FILE_MODE_ENV_FILE -Value @('GITHUB_ACTIONS_ENABLED=true', 'JENKINS_INTEGRATION_ENABLED=false')
  Set-Content -LiteralPath $env:AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE -Value @("DATABASE_URL=$sensitiveDatabaseUrl", "REDIS_URL=$sensitiveRedisUrl")
  $env:DATABASE_URL = $ambientDatabaseUrl
  $env:REDIS_URL = $ambientRedisUrl
  $env:PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = ''
  $env:PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS = ''

  $default = Get-ComposeModel @('docker-compose.yml')
  $core = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml')
  $sensitive = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-sensitive-env.yml')
  $github = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-github.yml')
  $sensitiveGithub = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-sensitive-env.yml', 'docker-compose.secrets-github.yml')
  $jenkins = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-jenkins.yml')
  $sensitiveJenkins = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-sensitive-env.yml', 'docker-compose.secrets-jenkins.yml')
  $combined = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-github.yml', 'docker-compose.secrets-jenkins.yml')
  $sensitiveCombined = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-sensitive-env.yml', 'docker-compose.secrets-github.yml', 'docker-compose.secrets-jenkins.yml')
  $compatibilityOverlay = Get-Content -LiteralPath 'docker-compose.secrets-sensitive-env.yml' -Raw
  $runtimeMarker = '${AUTOOPS_FILE_MODE_ENV_FILE:?'
  $sensitiveMarker = '${AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE:?'

  Assert-Condition 'DEFAULT_ENV_MODE_UNCHANGED' ($null -eq $default.services.api.environment.SECRET_PROVIDER_MODE)
  Assert-Condition 'CORE_API_FILE_MODE' ($core.services.api.environment.SECRET_PROVIDER_MODE -eq 'file')
  Assert-Condition 'CORE_WORKER_FILE_MODE' ($core.services.worker.environment.SECRET_PROVIDER_MODE -eq 'file')
  Assert-Condition 'SENSITIVE_ENV_API_AND_WORKER_FILE_MODE' (($sensitive.services.api.environment.SECRET_PROVIDER_MODE -eq 'file') -and ($sensitive.services.worker.environment.SECRET_PROVIDER_MODE -eq 'file'))
  Assert-Condition 'BASE_PRECEDENCE_REGRESSION_REPRODUCED' (($core.services.api.environment.DATABASE_URL -eq $ambientDatabaseUrl) -and ($core.services.worker.environment.REDIS_URL -ne $sensitiveRedisUrl))
  Assert-Condition 'SENSITIVE_ENV_DATABASE_URL_AUTHORITATIVE' ((Test-SensitiveEnvironmentAuthoritative $sensitive.services.api $sensitiveDatabaseUrl $sensitiveRedisUrl) -and (Test-SensitiveEnvironmentAuthoritative $sensitive.services.worker $sensitiveDatabaseUrl $sensitiveRedisUrl))
  Assert-Condition 'SENSITIVE_ENV_AMBIENT_OVERRIDES_BLOCKED' (($sensitive.services.api.environment.DATABASE_URL -ne $ambientDatabaseUrl) -and ($sensitive.services.api.environment.REDIS_URL -ne $ambientRedisUrl) -and ($sensitive.services.worker.environment.DATABASE_URL -ne $ambientDatabaseUrl) -and ($sensitive.services.worker.environment.REDIS_URL -ne $ambientRedisUrl))
  # Compose resolves env_file into environment in the rendered JSON. Verify the
  # compatibility overlay's two explicit source entries and their order instead.
  Assert-Condition 'SENSITIVE_ENV_ORDER' (($compatibilityOverlay.IndexOf($runtimeMarker, [System.StringComparison]::Ordinal) -ge 0) -and ($compatibilityOverlay.IndexOf($sensitiveMarker, [System.StringComparison]::Ordinal) -gt $compatibilityOverlay.IndexOf($runtimeMarker, [System.StringComparison]::Ordinal)) -and (([regex]::Matches($compatibilityOverlay, [regex]::Escape($runtimeMarker))).Count -eq 2) -and (([regex]::Matches($compatibilityOverlay, [regex]::Escape($sensitiveMarker))).Count -eq 2))
  Assert-Condition 'SENSITIVE_ENV_BASE_MAPPINGS_EXPLICITLY_PRESERVED' (([regex]::Matches($compatibilityOverlay, 'environment:\s*!override')).Count -eq 2)
  Assert-Condition 'SENSITIVE_ENV_ONLY_DATABASE_REDIS_YIELD_TO_ENV_FILE' (-not ($compatibilityOverlay -match 'DATABASE_URL:|REDIS_URL:'))
  $apiPreservedRuntimeKeys = @('NODE_ENV', 'API_PORT', 'DOCKER_SOCKET_PATH', 'INFRA_TERRAFORM_ROOT', 'INFRA_ANSIBLE_ROOT', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS')
  $workerPreservedRuntimeKeys = @('NODE_ENV', 'WORKER_PORT', 'DOCKER_SOCKET_PATH', 'INFRA_TERRAFORM_ROOT', 'INFRA_ANSIBLE_ROOT', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS')
  Assert-Condition 'SENSITIVE_ENV_OTHER_BASE_RUNTIME_MAPPINGS_PRESERVED' ((Test-BaseRuntimeEnvironmentPreserved $default.services.api $sensitive.services.api $apiPreservedRuntimeKeys) -and (Test-BaseRuntimeEnvironmentPreserved $default.services.worker $sensitive.services.worker $workerPreservedRuntimeKeys))
  Assert-Condition 'SENSITIVE_ENV_BASE_ENVIRONMENT_DRIFT_GUARD' ((Test-BaseEnvironmentDriftGuard (Get-ComposeEnvironmentMappingKeys 'docker-compose.yml' 'api') (Get-ComposeEnvironmentMappingKeys 'docker-compose.secrets-sensitive-env.yml' 'api')) -and (Test-BaseEnvironmentDriftGuard (Get-ComposeEnvironmentMappingKeys 'docker-compose.yml' 'worker') (Get-ComposeEnvironmentMappingKeys 'docker-compose.secrets-sensitive-env.yml' 'worker')))
  Assert-Condition 'PROVIDER_INVENTORY_DEFAULT_PRESERVED' (($sensitive.services.api.environment.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS -eq $providerInventoryDefault) -and ($sensitive.services.worker.environment.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS -eq $providerInventoryDefault))
  $env:PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = $providerInventoryOverride
  $sensitiveProviderOverride = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-sensitive-env.yml')
  Assert-Condition 'PROVIDER_INVENTORY_EXPLICIT_COMPOSE_OVERRIDE_PRESERVED' (($sensitiveProviderOverride.services.api.environment.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS -eq $providerInventoryOverride) -and ($sensitiveProviderOverride.services.worker.environment.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS -eq $providerInventoryOverride))
  Assert-Condition 'CORE_API_MIGRATED_ENV_REMOVED' (Test-MigratedEnvironmentAbsent $core.services.api)
  Assert-Condition 'CORE_WORKER_MIGRATED_ENV_REMOVED' (Test-MigratedEnvironmentAbsent $core.services.worker)
  Assert-Condition 'API_CORE_MOUNTS_ONLY_JWT' (Test-MountTargets $core.services.api @('/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh'))
  Assert-Condition 'WORKER_CORE_HAS_NO_SECRET_MOUNTS' (Test-MountTargets $core.services.worker @())
  Assert-Condition 'GITHUB_MOUNTS_ONLY_API_TOKEN' (Test-MountTargets $github.services.api @('/run/secrets/autoops/github-actions-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh'))
  Assert-Condition 'GITHUB_WORKER_REMAINS_SECRET_FREE' (Test-MountTargets $github.services.worker @())
  Assert-Condition 'SENSITIVE_GITHUB_API_ONLY_TOKEN' ((Test-MountTargets $sensitiveGithub.services.api @('/run/secrets/autoops/github-actions-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh')) -and (Test-MountTargets $sensitiveGithub.services.worker @()))
  Assert-Condition 'JENKINS_MOUNTS_ONLY_REQUIRED_TOKEN' ((Test-MountTargets $jenkins.services.api @('/run/secrets/autoops/jenkins-api-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh')) -and (Test-MountTargets $jenkins.services.worker @('/run/secrets/autoops/jenkins-api-token')))
  Assert-Condition 'SENSITIVE_JENKINS_MOUNTS_ONLY_REQUIRED_TOKEN' ((Test-MountTargets $sensitiveJenkins.services.api @('/run/secrets/autoops/jenkins-api-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh')) -and (Test-MountTargets $sensitiveJenkins.services.worker @('/run/secrets/autoops/jenkins-api-token')))
  Assert-Condition 'COMBINED_OVERLAYS_MOUNT_EXPECTED_FILES' ((Test-MountTargets $combined.services.api @('/run/secrets/autoops/github-actions-token', '/run/secrets/autoops/jenkins-api-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh')) -and (Test-MountTargets $combined.services.worker @('/run/secrets/autoops/jenkins-api-token')))
  Assert-Condition 'SENSITIVE_COMBINED_OVERLAYS_MOUNT_EXPECTED_FILES' ((Test-MountTargets $sensitiveCombined.services.api @('/run/secrets/autoops/github-actions-token', '/run/secrets/autoops/jenkins-api-token', '/run/secrets/autoops/jwt-access', '/run/secrets/autoops/jwt-refresh')) -and (Test-MountTargets $sensitiveCombined.services.worker @('/run/secrets/autoops/jenkins-api-token')))
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
