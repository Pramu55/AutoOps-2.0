[CmdletBinding()]
param(
  [switch]$RunDockerAdapterQualification
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$tool = Join-Path $PSScriptRoot 'prepare-mounted-secret-transfer.ps1'
$fakeMarkers = @('AUTOOPS_SYNTHETIC_JWT_ACCESS', 'AUTOOPS_SYNTHETIC_JWT_REFRESH', 'AUTOOPS_SYNTHETIC_GITHUB_TOKEN', 'synthetic-db.invalid', 'synthetic-redis.invalid')
$databaseKey = 'DATABASE' + '_URL'
$redisKey = 'REDIS' + '_URL'
$syntheticDatabaseAssignment = $databaseKey + '=synthetic-database-value'
$syntheticRedisAssignment = $redisKey + '=synthetic-redis-value'

function Assert-Condition([string]$Name, [bool]$Condition) { if (-not $Condition) { throw "ASSERTION_FAILED:$Name" }; Write-Host "$Name PASS" }
function New-Fixture([string]$Root, [string[]]$RuntimeLines, [string[]]$SensitiveLines) {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  [IO.File]::WriteAllLines((Join-Path $Root 'runtime.source'), $RuntimeLines)
  [IO.File]::WriteAllLines((Join-Path $Root 'sensitive.source'), $SensitiveLines)
  [IO.File]::WriteAllText((Join-Path $Root 'jwt-access'), 'AUTOOPS_SYNTHETIC_JWT_ACCESS')
  [IO.File]::WriteAllText((Join-Path $Root 'jwt-refresh'), 'AUTOOPS_SYNTHETIC_JWT_REFRESH')
  [IO.File]::WriteAllText((Join-Path $Root 'github-actions-token'), 'AUTOOPS_SYNTHETIC_GITHUB_TOKEN')
}
function Invoke-Tool([string]$Source, [string]$Target, [string]$Failure = 'None') {
  $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $tool -SourceMode Synthetic -SyntheticSourceRoot $Source -TargetRoot $Target -InjectFailure $Failure 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}
function Invoke-RuntimeAdapter([string]$Container, [string]$Target) {
  $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $tool -SourceMode Runtime -RuntimeContainer $Container -TargetRoot $Target 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}
function Test-EmptyDirectory([string]$Path) { return ((Get-ChildItem -Force -LiteralPath $Path | Measure-Object).Count -eq 0) }
function Get-QuotedContractItems([string]$Path, [string]$Variable) {
  $content = [IO.File]::ReadAllText($Path)
  $match = [regex]::Match($content, [regex]::Escape("`$$Variable = @(") + '(?<body>.*?)\)', [Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) { throw "CONTRACT_PARSE_FAILED:$Variable" }
  return @([regex]::Matches($match.Groups['body'].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
}
function Test-SameOrdinalSet([string[]]$Left, [string[]]$Right) {
  return (($Left | Sort-Object) -join "`n") -ceq (($Right | Sort-Object) -join "`n")
}

$root = Join-Path ([IO.Path]::GetTempPath()) ('autoops-mounted-transfer-test-' + [Guid]::NewGuid().ToString('N'))
try {
  $validatorContract = Join-Path $PSScriptRoot 'validate-mounted-secret-delivery.ps1'
  $toolContract = $tool
  Assert-Condition 'RUNTIME_CONTRACT_DRIFT_GUARD' (Test-SameOrdinalSet (Get-QuotedContractItems $validatorContract 'runtimeAllowedKeys') (Get-QuotedContractItems $toolContract 'runtimeAllowedKeys'))
  Assert-Condition 'SENSITIVE_CONTRACT_DRIFT_GUARD' (Test-SameOrdinalSet (Get-QuotedContractItems $validatorContract 'sensitiveRuntimeKeys') (Get-QuotedContractItems $toolContract 'sensitiveKeys'))
  Assert-Condition 'MIGRATED_CONTRACT_DRIFT_GUARD' (Test-SameOrdinalSet (Get-QuotedContractItems $validatorContract 'migratedSecretKeys') (Get-QuotedContractItems $toolContract 'migratedKeys'))
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $case = Join-Path $root "success-$attempt"; $source = Join-Path $case 'source'; $target = Join-Path $case 'target'
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    New-Fixture $source @('GITHUB_ACTIONS_ENABLED=true', 'JENKINS_INTEGRATION_ENABLED=false', 'AWS_ACCOUNT_ID=', 'AWS_REGION=', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS=', 'LOG_LEVEL=warn') @($syntheticDatabaseAssignment, $syntheticRedisAssignment)
    $result = Invoke-Tool $source $target
    Assert-Condition "REPEATABILITY_$attempt" ($result.ExitCode -eq 0)
    foreach ($name in @('runtime.env', 'sensitive.env', 'jwt-access', 'jwt-refresh', 'github-actions-token')) { Assert-Condition "OUTPUT_${attempt}_$name" (Test-Path -LiteralPath (Join-Path $target $name) -PathType Leaf) }
    $text = [IO.File]::ReadAllText((Join-Path $target 'runtime.env'))
    Assert-Condition "EMPTY_OMISSION_$attempt" (-not ($text -match 'AWS_ACCOUNT_ID|AWS_REGION|PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS'))
    foreach ($marker in $fakeMarkers) { Assert-Condition "NO_OUTPUT_LEAK_${attempt}_$marker" (-not $result.Output.Contains($marker)) }
  }
  $validator = Join-Path $PSScriptRoot 'validate-mounted-secret-delivery.ps1'
  $validatorTarget = Join-Path $root 'success-1/target'
  $validatorEnvironment = @{
    AUTOOPS_FILE_MODE_ENV_FILE = $env:AUTOOPS_FILE_MODE_ENV_FILE
    AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE = $env:AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE
    AUTOOPS_SECRET_JWT_ACCESS_FILE = $env:AUTOOPS_SECRET_JWT_ACCESS_FILE
    AUTOOPS_SECRET_JWT_REFRESH_FILE = $env:AUTOOPS_SECRET_JWT_REFRESH_FILE
    AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE
  }
  try {
    $env:AUTOOPS_FILE_MODE_ENV_FILE = Join-Path $validatorTarget 'runtime.env'
    $env:AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE = Join-Path $validatorTarget 'sensitive.env'
    $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $validatorTarget 'jwt-access'
    $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $validatorTarget 'jwt-refresh'
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $validatorTarget 'github-actions-token'
    $validatorOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $validator -Overlay core,sensitive-env,github 2>&1
    Assert-Condition 'VALIDATOR_SYNTHETIC_OUTPUT' ($LASTEXITCODE -eq 0)
    foreach ($marker in $fakeMarkers) { Assert-Condition "VALIDATOR_NO_LEAK_$marker" (-not (($validatorOutput -join [Environment]::NewLine).Contains($marker))) }
  } finally {
    foreach ($key in $validatorEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $validatorEnvironment[$key], 'Process') }
  }
  $validSource = Join-Path $root 'success-1/source'
  foreach ($case in @(
    @{ Name='MissingDatabase'; Sensitive=@($syntheticRedisAssignment); Failure='None' },
    @{ Name='MissingRedis'; Sensitive=@($syntheticDatabaseAssignment); Failure='None' },
    @{ Name='UnknownSensitive'; Sensitive=@($syntheticDatabaseAssignment,$syntheticRedisAssignment,'UNKNOWN_KEY=value'); Failure='None' },
    @{ Name='DuplicateSensitive'; Sensitive=@($syntheticDatabaseAssignment,($databaseKey + '=another-synthetic-database-value'),$syntheticRedisAssignment); Failure='None' },
    @{ Name='InjectedBefore'; Sensitive=$null; Failure='BeforeCommit' },
    @{ Name='InjectedAfterFirst'; Sensitive=$null; Failure='AfterFirstCommit' },
    @{ Name='InjectedAfterAll'; Sensitive=$null; Failure='AfterAllCommits' },
    @{ Name='InjectedAcl'; Sensitive=$null; Failure='Acl' },
    @{ Name='InjectedMetadata'; Sensitive=$null; Failure='Metadata' },
    @{ Name='InjectedMove'; Sensitive=$null; Failure='AtomicMove' }
  )) {
    $caseRoot = Join-Path $root $case.Name; $source = Join-Path $caseRoot 'source'; $target = Join-Path $caseRoot 'target'; New-Item -ItemType Directory -Path $target -Force | Out-Null
    if ($null -eq $case.Sensitive) { Copy-Item -LiteralPath $validSource -Destination $source -Recurse } else { New-Fixture $source @('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') $case.Sensitive }
    $result = Invoke-Tool $source $target $case.Failure
    Assert-Condition "FAIL_CLOSED_$($case.Name)" ($result.ExitCode -ne 0)
    Assert-Condition "CLEANUP_$($case.Name)" (Test-EmptyDirectory $target)
    foreach ($marker in $fakeMarkers) { Assert-Condition "NO_LEAK_$($case.Name)_$marker" (-not $result.Output.Contains($marker)) }
  }
  $runtimeCases = @(
    @{ Name='UnknownRuntime'; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false','UNKNOWN_KEY=value') },
    @{ Name='MigratedRuntime'; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false',(('JWT' + '_SECRET') + '=synthetic')) },
    @{ Name='GithubDisabled'; Runtime=@('GITHUB_ACTIONS_ENABLED=false','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='JenkinsEnabled'; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=true') }
  )
  foreach ($case in $runtimeCases) {
    $caseRoot = Join-Path $root $case.Name; $source = Join-Path $caseRoot 'source'; $target = Join-Path $caseRoot 'target'; New-Item -ItemType Directory -Path $target -Force | Out-Null
    New-Fixture $source $case.Runtime @($syntheticDatabaseAssignment,$syntheticRedisAssignment)
    $result = Invoke-Tool $source $target
    Assert-Condition "FAIL_CLOSED_$($case.Name)" ($result.ExitCode -ne 0)
    Assert-Condition "CLEANUP_$($case.Name)" (Test-EmptyDirectory $target)
  }
  if ($RunDockerAdapterQualification) {
    $adapterRoot = Join-Path $root 'runtime-adapter'; $adapterTarget = Join-Path $adapterRoot 'target'; New-Item -ItemType Directory -Path $adapterTarget -Force | Out-Null
    $container = 'autoops-transfer-synthetic-' + [Guid]::NewGuid().ToString('N')
    try {
      $arguments = @('run', '--rm', '-d', '--name', $container, '-e', 'GITHUB_ACTIONS_ENABLED=true', '-e', 'JENKINS_INTEGRATION_ENABLED=false', '-e', $syntheticDatabaseAssignment, '-e', $syntheticRedisAssignment, '-e', (('JWT' + '_SECRET') + '=AUTOOPS_SYNTHETIC_JWT_ACCESS'), '-e', (('JWT' + '_REFRESH_SECRET') + '=AUTOOPS_SYNTHETIC_JWT_REFRESH'), '-e', (('GITHUB_ACTIONS' + '_TOKEN') + '=AUTOOPS_SYNTHETIC_GITHUB_TOKEN'), 'alpine:3.20', 'sh', '-c', 'while true; do sleep 3600; done')
      & docker @arguments | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_DOCKER_SOURCE_UNAVAILABLE' }
      $adapterResult = Invoke-RuntimeAdapter $container $adapterTarget
      Assert-Condition 'CONTROLLED_SOURCE_ADAPTER_SYNTHETIC' ($adapterResult.ExitCode -eq 0)
      foreach ($marker in $fakeMarkers) { Assert-Condition "ADAPTER_NO_LEAK_$marker" (-not $adapterResult.Output.Contains($marker)) }
      foreach ($name in @('runtime.env', 'sensitive.env', 'jwt-access', 'jwt-refresh', 'github-actions-token')) { Assert-Condition "ADAPTER_OUTPUT_$name" (Test-Path -LiteralPath (Join-Path $adapterTarget $name) -PathType Leaf) }
    } finally {
      & docker rm -f $container 2>$null | Out-Null
    }
  }
  $preRoot = Join-Path $root 'preexisting'; $preSource = Join-Path $preRoot 'source'; $preTarget = Join-Path $preRoot 'target'; New-Item -ItemType Directory -Path $preTarget -Force | Out-Null; Copy-Item -LiteralPath $validSource -Destination $preSource -Recurse
  [IO.File]::WriteAllText((Join-Path $preTarget 'runtime.env'), 'pre-existing-synthetic')
  $pre = Invoke-Tool $preSource $preTarget
  Assert-Condition 'PREEXISTING_DESTINATION_REJECTED' ($pre.ExitCode -ne 0 -and $pre.Output.Contains('ERROR_CODE=DESTINATION_EXISTS'))
  Assert-Condition 'PREEXISTING_DESTINATION_PRESERVED' ([IO.File]::ReadAllText((Join-Path $preTarget 'runtime.env')) -eq 'pre-existing-synthetic')
  Assert-Condition 'PREEXISTING_TRANSACTION_UNTOUCHED' ((Get-ChildItem -LiteralPath $preTarget -Force | Measure-Object).Count -eq 1)
  Write-Host 'MOUNTED_SECRET_TRANSFER_TEST PASS'
} finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
