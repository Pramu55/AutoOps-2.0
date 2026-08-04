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

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "autoops-mounted-secret-compose-test-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
  foreach ($file in @('jwt-access', 'jwt-refresh', 'github-actions-token', 'jenkins-api-token')) {
    New-Item -ItemType File -Path (Join-Path $temporaryRoot $file) | Out-Null
  }
  $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'
  $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $temporaryRoot 'jwt-refresh'
  $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
  $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = Join-Path $temporaryRoot 'jenkins-api-token'

  $default = Get-ComposeModel @('docker-compose.yml')
  $core = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml')
  $github = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-github.yml')
  $jenkins = Get-ComposeModel @('docker-compose.yml', 'docker-compose.secrets-core.yml', 'docker-compose.secrets-jenkins.yml')

  Assert-Condition 'DEFAULT_ENV_MODE_UNCHANGED' ($null -eq $default.services.api.environment.SECRET_PROVIDER_MODE)
  Assert-Condition 'CORE_API_FILE_MODE' ($core.services.api.environment.SECRET_PROVIDER_MODE -eq 'file')
  Assert-Condition 'CORE_WORKER_FILE_MODE' ($core.services.worker.environment.SECRET_PROVIDER_MODE -eq 'file')
  $apiCore = Get-SecretMounts $core.services.api
  $workerCore = Get-SecretMounts $core.services.worker
  Assert-Condition 'API_CORE_MOUNTS_ONLY_JWT' (@($apiCore.target | Sort-Object) -join ',' -eq '/run/secrets/autoops/jwt-access,/run/secrets/autoops/jwt-refresh')
  Assert-Condition 'WORKER_CORE_HAS_NO_SECRET_MOUNTS' ($workerCore.Count -eq 0)
  Assert-Condition 'JWT_TARGETS_DIFFER' ($apiCore[0].target -ne $apiCore[1].target)
  Assert-Condition 'ALL_CORE_SECRET_MOUNTS_READ_ONLY' (@($apiCore | Where-Object { -not $_.read_only }).Count -eq 0)
  Assert-Condition 'GITHUB_IS_CONDITIONAL_API_ONLY' ((Get-SecretMounts $github.services.api).target -contains '/run/secrets/autoops/github-actions-token')
  Assert-Condition 'JENKINS_IS_CONDITIONAL_API_AND_WORKER' (((Get-SecretMounts $jenkins.services.api).target -contains '/run/secrets/autoops/jenkins-api-token') -and ((Get-SecretMounts $jenkins.services.worker).target -contains '/run/secrets/autoops/jenkins-api-token'))
  Assert-Condition 'ALL_OPTIONAL_SECRET_MOUNTS_READ_ONLY' (@((Get-SecretMounts $github.services.api) + (Get-SecretMounts $jenkins.services.api) + (Get-SecretMounts $jenkins.services.worker) | Where-Object { -not $_.read_only }).Count -eq 0)
  Assert-Condition 'NO_SECRET_BUILD_ARGUMENTS' ($null -eq $core.services.api.build.args -and $null -eq $core.services.worker.build.args)
  Assert-Condition 'NO_RENDERED_KUBERNETES_SECRET_DATA' (-not (($core | ConvertTo-Json -Depth 20) -match 'stringData'))
  & powershell -ExecutionPolicy Bypass -File scripts/validate-mounted-secret-delivery.ps1 -SelfTest
  Assert-Condition 'METADATA_VALIDATOR_SELF_TEST' ($LASTEXITCODE -eq 0)
} finally {
  Remove-Item Env:AUTOOPS_SECRET_JWT_ACCESS_FILE, Env:AUTOOPS_SECRET_JWT_REFRESH_FILE, Env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE, Env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}
