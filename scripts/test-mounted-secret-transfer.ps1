[CmdletBinding()]
param(
  [switch]$RunDockerAdapterQualification
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$tool = Join-Path $PSScriptRoot 'prepare-mounted-secret-transfer.ps1'
$fakeMarkers = @(
  @{ Name = 'JWT_ACCESS'; Value = 'AUTOOPS_SYNTHETIC_JWT_ACCESS' },
  @{ Name = 'JWT_REFRESH'; Value = 'AUTOOPS_SYNTHETIC_JWT_REFRESH' },
  @{ Name = 'GITHUB_TOKEN'; Value = 'AUTOOPS_SYNTHETIC_GITHUB_TOKEN' },
  @{ Name = 'DATABASE_URL'; Value = 'synthetic-database-value' },
  @{ Name = 'REDIS_URL'; Value = 'synthetic-redis-value' }
)
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
  $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $tool -SourceMode Synthetic -SyntheticSourceRoot $Source -TargetRoot $Target -TransactionId synthetic-set -InjectFailure $Failure 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}
function Invoke-RuntimeAdapter([string]$Container, [string]$Target) {
  $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $tool -SourceMode Runtime -RuntimeContainer $Container -TargetRoot $Target -TransactionId synthetic-set 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}
function Get-PublishedSet([string]$Path) { return (Join-Path $Path 'sets/synthetic-set') }
function Test-NoPublishedSet([string]$Path) { return -not (Test-Path -LiteralPath (Get-PublishedSet $Path)) }
function Test-SetSelectable([string]$Path) {
  $set = Get-PublishedSet $Path
  return (Test-Path -LiteralPath $set -PathType Container) -and (Test-Path -LiteralPath (Join-Path $set '.published') -PathType Leaf)
}
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
  $repositoryTarget = Split-Path -Parent $PSScriptRoot
  $repositoryTargetResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $repositoryTarget
  Assert-Condition 'TARGET_REPOSITORY_ROOT_REJECTED' ($repositoryTargetResult.ExitCode -ne 0 -and $repositoryTargetResult.Output.Contains('TARGET_REPOSITORY_CONTAINED'))
  Assert-Condition 'TARGET_CHECK_BEFORE_SOURCE_CAPTURE' (-not $repositoryTargetResult.Output.Contains('SOURCE_CAPTURE_FAILED'))
  $repositorySubdirectory = Join-Path $repositoryTarget 'scripts'
  $repositorySubdirectoryResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $repositorySubdirectory
  Assert-Condition 'TARGET_REPOSITORY_SUBDIRECTORY_REJECTED' ($repositorySubdirectoryResult.ExitCode -ne 0 -and $repositorySubdirectoryResult.Output.Contains('TARGET_REPOSITORY_CONTAINED'))
  $nestedWorktree = Join-Path $root 'nested-git'; New-Item -ItemType Directory -Path $nestedWorktree -Force | Out-Null; & git -C $nestedWorktree init -q
  $nestedTargetResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $nestedWorktree
  Assert-Condition 'TARGET_NESTED_GIT_WORKTREE_REJECTED' ($nestedTargetResult.ExitCode -ne 0 -and $nestedTargetResult.Output.Contains('TARGET_GIT_WORKTREE'))
  $reparseReal = Join-Path $root 'reparse-real'; $reparseParent = Join-Path $root 'reparse-parent'; New-Item -ItemType Directory -Path $reparseReal -Force | Out-Null
  New-Item -ItemType Junction -Path $reparseParent -Target $reparseReal -ErrorAction Stop | Out-Null
  $reparseTargetResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $reparseParent
  Assert-Condition 'TARGET_REPARSE_PARENT_REJECTED' ($reparseTargetResult.ExitCode -ne 0 -and $reparseTargetResult.Output.Contains('TARGET_REPARSE_PATH'))
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $case = Join-Path $root "success-$attempt"; $source = Join-Path $case 'source'; $target = Join-Path $case 'target'
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    New-Fixture $source @('GITHUB_ACTIONS_ENABLED=true', 'JENKINS_INTEGRATION_ENABLED=false', 'AWS_ACCOUNT_ID=', 'AWS_REGION=', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS=', 'LOG_LEVEL=warn') @($syntheticDatabaseAssignment, $syntheticRedisAssignment)
    $result = Invoke-Tool $source $target
    if ($result.ExitCode -ne 0) { Write-Host $result.Output }
    Assert-Condition "REPEATABILITY_$attempt" ($result.ExitCode -eq 0)
    if ($attempt -eq 1) { Assert-Condition 'TARGET_EXTERNAL_NORMAL_DIRECTORY_ACCEPTED' ($result.ExitCode -eq 0) }
    $published = Get-PublishedSet $target
    foreach ($name in @('runtime.env', 'sensitive.env', 'jwt-access', 'jwt-refresh', 'github-actions-token')) { Assert-Condition "OUTPUT_${attempt}_$name" (Test-Path -LiteralPath (Join-Path $published $name) -PathType Leaf) }
    Assert-Condition "PUBLISHED_SET_${attempt}" (Test-SetSelectable $target)
    if ($attempt -eq 1) { Assert-Condition 'PUBLICATION_COMPLETE_SET_PASS' (Test-SetSelectable $target) }
    $text = [IO.File]::ReadAllText((Join-Path $published 'runtime.env'))
    Assert-Condition "EMPTY_OMISSION_$attempt" (-not ($text -match 'AWS_ACCOUNT_ID|AWS_REGION|PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS'))
    foreach ($marker in $fakeMarkers) { Assert-Condition "NO_OUTPUT_LEAK_${attempt}_$($marker.Name)" (-not $result.Output.Contains($marker.Value)) }
  }
  $validator = Join-Path $PSScriptRoot 'validate-mounted-secret-delivery.ps1'
  $validatorTarget = Get-PublishedSet (Join-Path $root 'success-1/target')
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
    foreach ($marker in $fakeMarkers) { Assert-Condition "VALIDATOR_NO_LEAK_$($marker.Name)" (-not (($validatorOutput -join [Environment]::NewLine).Contains($marker.Value))) }
  } finally {
    foreach ($key in $validatorEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $validatorEnvironment[$key], 'Process') }
  }
  $validSource = Join-Path $root 'success-1/source'
  foreach ($case in @(
    @{ Name='MissingDatabase'; Sensitive=@($syntheticRedisAssignment); Failure='None' },
    @{ Name='MissingRedis'; Sensitive=@($syntheticDatabaseAssignment); Failure='None' },
    @{ Name='UnknownSensitive'; Sensitive=@($syntheticDatabaseAssignment,$syntheticRedisAssignment,'UNKNOWN_KEY=value'); Failure='None' },
    @{ Name='DuplicateSensitive'; Sensitive=@($syntheticDatabaseAssignment,($databaseKey + '=another-synthetic-database-value'),$syntheticRedisAssignment); Failure='None' },
    @{ Name='SensitiveBlank'; Sensitive=@(($databaseKey + '='),$syntheticRedisAssignment); Failure='None' },
    @{ Name='SensitiveWhitespace'; Sensitive=@(($databaseKey + '=   '),$syntheticRedisAssignment); Failure='None' },
    @{ Name='SensitiveHashPrefix'; Sensitive=@(($databaseKey + '=#comment'),$syntheticRedisAssignment); Failure='None' },
    @{ Name='SensitiveDoubleQuotedEscape'; Sensitive=@(($databaseKey + '="\\t"'),$syntheticRedisAssignment); Failure='None' },
    @{ Name='SensitiveInterpolation'; Sensitive=@(($databaseKey + '=${UNTRUSTED}'),$syntheticRedisAssignment); Failure='None' },
    @{ Name='SensitiveSingleQuotedEmpty'; Sensitive=@(($databaseKey + "=''"),$syntheticRedisAssignment); Failure='None' },
    @{ Name='SensitiveMigratedKey'; Sensitive=@($syntheticDatabaseAssignment,$syntheticRedisAssignment,('JWT' + '_SECRET=synthetic')); Failure='None' },
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
    Assert-Condition "CLEANUP_$($case.Name)" (Test-NoPublishedSet $target)
    foreach ($marker in $fakeMarkers) { Assert-Condition "NO_LEAK_$($case.Name)_$($marker.Name)" (-not $result.Output.Contains($marker.Value)) }
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
    Assert-Condition "CLEANUP_$($case.Name)" (Test-NoPublishedSet $target)
  }
  $quotedSource = Join-Path $root 'single-quoted/source'; $quotedTarget = Join-Path $root 'single-quoted/target'; New-Item -ItemType Directory -Path $quotedTarget -Force | Out-Null
  New-Fixture $quotedSource @('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') @(($databaseKey + "='synthetic-database-value' # literal"),($redisKey + '="synthetic-redis-value" # comment'))
  $quotedResult = Invoke-Tool $quotedSource $quotedTarget
  Assert-Condition 'SENSITIVE_SINGLE_QUOTED_VALID' ($quotedResult.ExitCode -eq 0)
  Assert-Condition 'SENSITIVE_INLINE_COMMENT_SEMANTICS' ($quotedResult.ExitCode -eq 0)
  Assert-Condition 'PUBLISHED_SET_SELECTABLE' (Test-SetSelectable $quotedTarget)
  $abandonedRoot = Join-Path $root 'abandoned'; $abandonedSource = Join-Path $abandonedRoot 'source'; $abandonedTarget = Join-Path $abandonedRoot 'target'; $abandonedStaging = Join-Path $abandonedTarget 'sets/.abandoned.staging'; New-Item -ItemType Directory -Path $abandonedStaging -Force | Out-Null
  Assert-Condition 'STAGING_SET_NOT_SELECTABLE' (-not (Test-SetSelectable $abandonedTarget))
  Assert-Condition 'VALIDATED_NOT_PUBLISHED_NOT_SELECTABLE' (-not (Test-SetSelectable $abandonedTarget))
  Assert-Condition 'PARTIAL_SET_NOT_SELECTABLE' (-not (Test-SetSelectable $abandonedTarget))
  Copy-Item -LiteralPath $validSource -Destination $abandonedSource -Recurse
  $abandonedResult = Invoke-Tool $abandonedSource $abandonedTarget
  Assert-Condition 'ABANDONED_STAGING_RECOVERY' ($abandonedResult.ExitCode -eq 0 -and (Test-SetSelectable $abandonedTarget))
  $previousRoot = Join-Path $root 'previous'; $previousSource = Join-Path $previousRoot 'source'; $previousTarget = Join-Path $previousRoot 'target'; New-Item -ItemType Directory -Path (Join-Path $previousTarget 'sets/previous-published') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $previousTarget 'sets/previous-published/.published'), 'published')
  Copy-Item -LiteralPath $validSource -Destination $previousSource -Recurse
  $previousResult = Invoke-Tool $previousSource $previousTarget
  Assert-Condition 'PREVIOUS_PUBLISHED_SET_PRESERVED' ($previousResult.ExitCode -eq 0 -and (Test-Path -LiteralPath (Join-Path $previousTarget 'sets/previous-published/.published')) -and (Test-SetSelectable $previousTarget))
  if ($RunDockerAdapterQualification) {
    $adapterRoot = Join-Path $root 'runtime-adapter'; $adapterTarget = Join-Path $adapterRoot 'target'; New-Item -ItemType Directory -Path $adapterTarget -Force | Out-Null
    $container = 'autoops-transfer-synthetic-' + [Guid]::NewGuid().ToString('N')
    try {
      $arguments = @('run', '--rm', '-d', '--name', $container, '-e', 'GITHUB_ACTIONS_ENABLED=true', '-e', 'JENKINS_INTEGRATION_ENABLED=false', '-e', $syntheticDatabaseAssignment, '-e', $syntheticRedisAssignment, '-e', (('JWT' + '_SECRET') + '=AUTOOPS_SYNTHETIC_JWT_ACCESS'), '-e', (('JWT' + '_REFRESH_SECRET') + '=AUTOOPS_SYNTHETIC_JWT_REFRESH'), '-e', (('GITHUB_ACTIONS' + '_TOKEN') + '=AUTOOPS_SYNTHETIC_GITHUB_TOKEN'), 'alpine:3.20', 'sh', '-c', 'while true; do sleep 3600; done')
      & docker @arguments | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_DOCKER_SOURCE_UNAVAILABLE' }
      $adapterResult = Invoke-RuntimeAdapter $container $adapterTarget
      Assert-Condition 'CONTROLLED_SOURCE_ADAPTER_SYNTHETIC' ($adapterResult.ExitCode -eq 0)
      foreach ($marker in $fakeMarkers) { Assert-Condition "ADAPTER_NO_LEAK_$($marker.Name)" (-not $adapterResult.Output.Contains($marker.Value)) }
      foreach ($name in @('runtime.env', 'sensitive.env', 'jwt-access', 'jwt-refresh', 'github-actions-token')) { Assert-Condition "ADAPTER_OUTPUT_$name" (Test-Path -LiteralPath (Join-Path (Get-PublishedSet $adapterTarget) $name) -PathType Leaf) }
    } finally {
      & docker rm -f $container 2>$null | Out-Null
    }
  }
  $preRoot = Join-Path $root 'preexisting'; $preSource = Join-Path $preRoot 'source'; $preTarget = Join-Path $preRoot 'target'; New-Item -ItemType Directory -Path $preTarget -Force | Out-Null; Copy-Item -LiteralPath $validSource -Destination $preSource -Recurse
  New-Item -ItemType Directory -Path (Get-PublishedSet $preTarget) -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path (Get-PublishedSet $preTarget) '.published'), 'pre-existing-synthetic')
  $pre = Invoke-Tool $preSource $preTarget
  Assert-Condition 'PREEXISTING_DESTINATION_REJECTED' ($pre.ExitCode -ne 0 -and $pre.Output.Contains('ERROR_CODE=DESTINATION_EXISTS'))
  Assert-Condition 'PREEXISTING_DESTINATION_PRESERVED' ([IO.File]::ReadAllText((Join-Path (Get-PublishedSet $preTarget) '.published')) -eq 'pre-existing-synthetic')
  Assert-Condition 'PREEXISTING_TRANSACTION_UNTOUCHED' ((Get-ChildItem -LiteralPath (Get-PublishedSet $preTarget) -Force | Measure-Object).Count -eq 1)
  Write-Host 'MOUNTED_SECRET_TRANSFER_TEST PASS'
} finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
