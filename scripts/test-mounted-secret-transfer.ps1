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
function New-Fixture([string]$Root, [string[]]$RuntimeLines, [string[]]$SensitiveLines, [hashtable]$Artifacts = $null) {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  [IO.File]::WriteAllLines((Join-Path $Root 'runtime.source'), $RuntimeLines)
  [IO.File]::WriteAllLines((Join-Path $Root 'sensitive.source'), $SensitiveLines)
  if ($null -eq $Artifacts) {
    $Artifacts = @{ 'jwt-access'='AUTOOPS_SYNTHETIC_JWT_ACCESS'; 'jwt-refresh'='AUTOOPS_SYNTHETIC_JWT_REFRESH'; 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }
  }
  foreach ($name in @('jwt-access','jwt-refresh','github-actions-token')) { [IO.File]::WriteAllText((Join-Path $Root $name), [string]$Artifacts[$name]) }
}
function Invoke-Tool([string]$Source, [string]$Target, [string]$Failure = 'None', [string]$WorktreeProbeMode = 'Normal', [switch]$EnforceRuntimePermissions, [switch]$EmitSourceCaptureAudit, [string]$RuntimeNewline = 'None', [string]$RuntimeKey = 'LOG_LEVEL', [string]$TestOwnerProbeMode = 'Normal', [string]$TestOwnerProbeScope = 'Any') {
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tool, '-SourceMode', 'Synthetic', '-SyntheticSourceRoot', $Source, '-TargetRoot', $Target, '-TransactionId', 'synthetic-set', '-InjectFailure', $Failure, '-WorktreeProbeMode', $WorktreeProbeMode)
  if ($EnforceRuntimePermissions) { $arguments += '-EnforceRuntimePermissions' }
  if ($EmitSourceCaptureAudit) { $arguments += '-EmitSourceCaptureAudit' }
  $arguments += @('-InjectRuntimeValueNewline', $RuntimeNewline, '-InjectedRuntimeKey', $RuntimeKey, '-TestOwnerProbeMode', $TestOwnerProbeMode, '-TestOwnerProbeScope', $TestOwnerProbeScope)
  $output = & powershell @arguments 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}
function Invoke-RuntimeAdapter([string]$Container, [string]$Target, [string]$WorktreeProbeMode = 'Normal', [switch]$EmitSourceCaptureAudit) {
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tool, '-SourceMode', 'Runtime', '-RuntimeContainer', $Container, '-TargetRoot', $Target, '-TransactionId', 'synthetic-set', '-WorktreeProbeMode', $WorktreeProbeMode)
  if ($EmitSourceCaptureAudit) { $arguments += '-EmitSourceCaptureAudit' }
  $output = & powershell @arguments 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
}
function Get-PublishedSet([string]$Path) { return (Join-Path $Path 'sets/synthetic-set') }
function Test-NoPublishedSet([string]$Path) { return -not (Test-Path -LiteralPath (Get-PublishedSet $Path)) }
function Test-SetSelectable([string]$Path) {
  $set = Get-PublishedSet $Path
  return (Test-Path -LiteralPath $set -PathType Container) -and (Test-Path -LiteralPath (Join-Path $set '.published') -PathType Leaf)
}
function Get-SerializedLogicalValue([string]$Path, [string]$Key) {
  $line = @([IO.File]::ReadAllLines($Path) | Where-Object { $_.StartsWith("$Key=") })
  if ($line.Count -ne 1) { throw "SERIALIZATION_PARSE_FAILED:$Key" }
  $value = $line[0].Substring($Key.Length + 1)
  if ($value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")) { return $value.Substring(1, $value.Length - 2) }
  return $value
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
function Get-TestAcl([string]$Path) {
  if (Test-Path -LiteralPath $Path -PathType Container) { return [IO.Directory]::GetAccessControl($Path) }
  return [IO.File]::GetAccessControl($Path)
}
function Set-TestAcl([string]$Path, [Security.AccessControl.FileSystemSecurity]$Acl) {
  if (Test-Path -LiteralPath $Path -PathType Container) { [IO.Directory]::SetAccessControl($Path, $Acl); return }
  [IO.File]::SetAccessControl($Path, $Acl)
}
function Get-TestAclSddl([string]$Path) {
  return (Get-TestAcl $Path).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
}
function Set-TestRestrictedAcl([string]$Path) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { return }
  $acl = Get-TestAcl $Path
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))) { $null = $acl.RemoveAccessRuleSpecific($rule) }
  $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
  foreach ($sidText in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')) {
    $sid = [Security.Principal.SecurityIdentifier]::new($sidText)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
  }
  Set-TestAcl $Path $acl
}
function Add-TestBroadAcl([string]$Path, [string]$SidText) {
  $operatorRule = ('{0}:(OI)(CI)F' -f $env:USERNAME)
  $broadRule = ('*{0}:(OI)(CI)M' -f $SidText)
  & icacls $Path /inheritance:r /grant:r $operatorRule /grant $broadRule | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'TEST_ACL_SETUP_FAILED' }
}
function Add-TestSidAcl([string]$Path, [string]$SidText, [Security.AccessControl.FileSystemRights]$Rights) {
  $acl = Get-TestAcl $Path
  $sid = [Security.Principal.SecurityIdentifier]::new($SidText)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, $Rights, [Security.AccessControl.AccessControlType]::Allow))
  Set-TestAcl $Path $acl
}
function Test-RestrictedAcl([string]$Path) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { return $true }
  $acl = Get-TestAcl $Path
  if (-not $acl.AreAccessRulesProtected) { return $false }
  $operatorSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $operatorAllowed = $false
  foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    $sid = $rule.IdentityReference.Value
    if (@('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545') -contains $sid -and $rule.AccessControlType -eq 'Allow') { return $false }
    if ($sid -eq $operatorSid -and $rule.AccessControlType -eq 'Allow' -and (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne 0)) { $operatorAllowed = $true }
  }
  return $operatorAllowed
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
  Assert-Condition 'WORKTREE_PROBE_VALID_WORKTREE_REJECT' ($nestedTargetResult.ExitCode -ne 0)
  $reparseReal = Join-Path $root 'reparse-real'; $reparseParent = Join-Path $root 'reparse-parent'; New-Item -ItemType Directory -Path $reparseReal -Force | Out-Null
  New-Item -ItemType Junction -Path $reparseParent -Target $reparseReal -ErrorAction Stop | Out-Null
  $reparseTargetResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $reparseParent
  Assert-Condition 'TARGET_REPARSE_PARENT_REJECTED' ($reparseTargetResult.ExitCode -ne 0 -and $reparseTargetResult.Output.Contains('TARGET_REPARSE_PATH'))
  $setsReparseTarget = Join-Path $root 'sets-reparse-target'; New-Item -ItemType Directory -Path $setsReparseTarget -Force | Out-Null
  if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { Set-TestRestrictedAcl $setsReparseTarget }
  New-Item -ItemType Junction -Path (Join-Path $setsReparseTarget 'sets') -Target $reparseReal -ErrorAction Stop | Out-Null
  $setsReparseResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $setsReparseTarget
  Assert-Condition 'TARGET_SETS_REPARSE_REJECTED' ($setsReparseResult.ExitCode -ne 0 -and $setsReparseResult.Output.Contains('TARGET_REPARSE_PATH'))
  Assert-Condition 'TARGET_SETS_CHECK_BEFORE_SOURCE_CAPTURE' (-not $setsReparseResult.Output.Contains('SOURCE_CAPTURE_FAILED'))
  $worktreeProbeSource = Join-Path $root 'worktree-probe/source'; New-Fixture $worktreeProbeSource @('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') @($syntheticDatabaseAssignment,$syntheticRedisAssignment)
  foreach ($probeCase in @(@{ Name='WORKTREE_PROBE_GENERIC_ERROR_REJECT'; Mode='GenericError' }, @{ Name='WORKTREE_PROBE_AMBIGUOUS_REJECT'; Mode='Ambiguous' })) {
    $probeTarget = Join-Path $root ('worktree-probe/' + $probeCase.Name + '/target'); New-Item -ItemType Directory -Path $probeTarget -Force | Out-Null
    $probeResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $probeTarget $probeCase.Mode -EmitSourceCaptureAudit
    Assert-Condition $probeCase.Name ($probeResult.ExitCode -ne 0)
    Assert-Condition 'WORKTREE_ERROR_BEFORE_SOURCE_CAPTURE' ($probeResult.Output.Contains('SOURCE_ADAPTER_INVOCATIONS=0'))
  }
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $case = Join-Path $root "success-$attempt"; $source = Join-Path $case 'source'; $target = Join-Path $case 'target'
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    New-Fixture $source @('GITHUB_ACTIONS_ENABLED=true', 'JENKINS_INTEGRATION_ENABLED=false', 'AWS_ACCOUNT_ID=', 'AWS_REGION=', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS=', 'LOG_LEVEL=warn') @($syntheticDatabaseAssignment, $syntheticRedisAssignment)
    $result = Invoke-Tool $source $target
    if ($result.ExitCode -ne 0) { Write-Host $result.Output }
    Assert-Condition "REPEATABILITY_$attempt" ($result.ExitCode -eq 0)
    if ($attempt -eq 1) { Assert-Condition 'TARGET_EXTERNAL_NORMAL_DIRECTORY_ACCEPTED' ($result.ExitCode -eq 0) }
    if ($attempt -eq 1) { Assert-Condition 'WORKTREE_PROBE_NORMAL_EXTERNAL_PASS' ($result.ExitCode -eq 0) }
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
  if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $permissionSource = Join-Path $root 'permissions/source'; New-Fixture $permissionSource @('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') @($syntheticDatabaseAssignment,$syntheticRedisAssignment)
    $broadRoot = Join-Path $root 'permissions/broad-root'; New-Item -ItemType Directory -Path $broadRoot -Force | Out-Null
    $broadBefore = Get-TestAclSddl $broadRoot
    $broadResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $broadRoot 'Normal' -EmitSourceCaptureAudit
    Assert-Condition 'TARGET_ROOT_BROAD_USERS_REJECTED' ($broadResult.ExitCode -ne 0 -and $broadResult.Output.Contains('TARGET_ROOT_PERMISSIONS_UNSAFE'))
    Assert-Condition 'TARGET_ROOT_PERMISSION_FAILURE_BEFORE_SOURCE_CAPTURE' ($broadResult.Output.Contains('SOURCE_ADAPTER_INVOCATIONS=0'))
    Assert-Condition 'TARGET_ROOT_UNCHANGED_AFTER_REJECTION' ((Get-TestAclSddl $broadRoot) -ceq $broadBefore)
    $authenticatedRoot = Join-Path $root 'permissions/authenticated-users-root'; New-Item -ItemType Directory -Path $authenticatedRoot -Force | Out-Null; Set-TestRestrictedAcl $authenticatedRoot; Add-TestBroadAcl $authenticatedRoot 'S-1-5-11'
    $authenticatedResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $authenticatedRoot 'Normal' -EmitSourceCaptureAudit
    Assert-Condition 'TARGET_ROOT_AUTHENTICATED_USERS_MODIFY_REJECTED' ($authenticatedResult.ExitCode -ne 0 -and $authenticatedResult.Output.Contains('TARGET_ROOT_PERMISSIONS_UNSAFE'))
    Assert-Condition 'SOURCE_NOT_CAPTURED_ON_AUTHENTICATED_USERS_FAILURE' ($authenticatedResult.Output.Contains('SOURCE_ADAPTER_INVOCATIONS=0'))
    foreach ($aclCase in @(
      @{ Name='ACL_UNAPPROVED_CUSTOM_USER_REJECTED'; Sid='S-1-5-21-424242-424242-424242-1001'; Rights=[Security.AccessControl.FileSystemRights]::Read },
      @{ Name='ACL_UNAPPROVED_CUSTOM_GROUP_REJECTED'; Sid='S-1-5-21-424242-424242-424242-1002'; Rights=[Security.AccessControl.FileSystemRights]::Write },
      @{ Name='ACL_UNAPPROVED_DOMAIN_STYLE_PRINCIPAL_REJECTED'; Sid='S-1-5-21-424242-424242-424242-2001'; Rights=[Security.AccessControl.FileSystemRights]::Modify },
      @{ Name='ACL_UNRESOLVABLE_IDENTITY_REJECTED'; Sid='S-1-5-21-424242-424242-424242-3001'; Rights=[Security.AccessControl.FileSystemRights]::FullControl }
    )) {
      $aclRoot = Join-Path $root ('permissions/' + $aclCase.Name); New-Item -ItemType Directory -Path $aclRoot -Force | Out-Null; Set-TestRestrictedAcl $aclRoot; Add-TestSidAcl $aclRoot $aclCase.Sid $aclCase.Rights
      $aclResult = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $aclRoot 'Normal' -EmitSourceCaptureAudit
      Assert-Condition $aclCase.Name ($aclResult.ExitCode -ne 0 -and $aclResult.Output.Contains('TARGET_ROOT_PERMISSIONS_UNSAFE'))
      Assert-Condition "ACL_REJECTION_BEFORE_SOURCE_CAPTURE_$($aclCase.Name)" ($aclResult.Output.Contains('SOURCE_ADAPTER_INVOCATIONS=0'))
    }
    $secureRoot = Join-Path $root 'permissions/secure-root'; New-Item -ItemType Directory -Path $secureRoot -Force | Out-Null; Set-TestRestrictedAcl $secureRoot
    $secureResult = Invoke-Tool $permissionSource $secureRoot 'None' 'Normal' -EnforceRuntimePermissions
    $secureSet = Get-PublishedSet $secureRoot
    Assert-Condition 'TARGET_ROOT_RESTRICTIVE_ACCEPTED' ($secureResult.ExitCode -eq 0)
    Assert-Condition 'NEW_TRANSACTION_DIRECTORY_INHERITANCE_DISABLED' (Test-RestrictedAcl $secureSet)
    Assert-Condition 'NEW_TRANSACTION_OPERATOR_ACCESS_PRESENT' (Test-RestrictedAcl $secureSet)
    Assert-Condition 'NEW_TRANSACTION_BROAD_ACCESS_ABSENT' (Test-RestrictedAcl $secureSet)
    foreach ($name in @('runtime.env','sensitive.env','jwt-access','jwt-refresh','github-actions-token')) {
      Assert-Condition "NEW_SECRET_FILE_BROAD_ACCESS_ABSENT_$name" (Test-RestrictedAcl (Join-Path $secureSet $name))
      Assert-Condition "NEW_SECRET_FILE_OPERATOR_ACCESS_PRESENT_$name" (Test-RestrictedAcl (Join-Path $secureSet $name))
    }
    Assert-Condition 'NEW_SECRET_FILE_ACL_POSTVERIFY_PASS' (Test-RestrictedAcl (Join-Path $secureSet 'sensitive.env'))
    foreach ($ownerCase in @(
      @{ Name='OWNER_APPROVED_OPERATOR_PASS'; Mode='Normal'; Expected=$true },
      @{ Name='OWNER_APPROVED_SYSTEM_PASS'; Mode='ApprovedSystem'; Expected=$true },
      @{ Name='OWNER_APPROVED_ADMINISTRATORS_PASS'; Mode='ApprovedAdministrators'; Expected=$true },
      @{ Name='OWNER_UNAPPROVED_USER_REJECTED'; Mode='Unapproved'; Expected=$false },
      @{ Name='OWNER_UNRESOLVABLE_REJECTED'; Mode='Unresolvable'; Expected=$false }
    )) {
      $ownerRoot = Join-Path $root ('permissions/' + $ownerCase.Name); New-Item -ItemType Directory -Path $ownerRoot -Force | Out-Null; Set-TestRestrictedAcl $ownerRoot
      $ownerResult = Invoke-Tool $permissionSource $ownerRoot 'None' 'Normal' -EnforceRuntimePermissions -EmitSourceCaptureAudit -TestOwnerProbeMode $ownerCase.Mode
      Assert-Condition $ownerCase.Name (($ownerResult.ExitCode -eq 0) -eq $ownerCase.Expected)
      if (-not $ownerCase.Expected) {
        Assert-Condition "OWNER_REJECTION_BEFORE_SOURCE_CAPTURE_$($ownerCase.Name)" ($ownerResult.Output.Contains('SOURCE_ADAPTER_INVOCATIONS=0'))
        Assert-Condition "OWNER_REJECTION_TARGET_UNCHANGED_$($ownerCase.Name)" (Test-NoPublishedSet $ownerRoot)
      }
    }
    $secureSetsRoot = Join-Path $root 'permissions/secure-preexisting-root'; New-Item -ItemType Directory -Path $secureSetsRoot -Force | Out-Null; Set-TestRestrictedAcl $secureSetsRoot
    $secureSets = Join-Path $secureSetsRoot 'sets'; New-Item -ItemType Directory -Path $secureSets -Force | Out-Null; Set-TestRestrictedAcl $secureSets
    $preexistingSecure = Invoke-Tool $permissionSource $secureSetsRoot 'None' 'Normal' -EnforceRuntimePermissions
    Assert-Condition 'PREEXISTING_SECURE_SETS_ACCEPTED' ($preexistingSecure.ExitCode -eq 0)
    $ownerSetsRoot = Join-Path $root 'permissions/unapproved-owner-preexisting-sets-root'; New-Item -ItemType Directory -Path $ownerSetsRoot -Force | Out-Null; Set-TestRestrictedAcl $ownerSetsRoot
    $ownerSets = Join-Path $ownerSetsRoot 'sets'; New-Item -ItemType Directory -Path $ownerSets -Force | Out-Null; Set-TestRestrictedAcl $ownerSets
    $ownerSetsResult = Invoke-Tool $permissionSource $ownerSetsRoot 'None' 'Normal' -EnforceRuntimePermissions -EmitSourceCaptureAudit -TestOwnerProbeMode 'Unapproved' -TestOwnerProbeScope 'Sets'
    Assert-Condition 'PREEXISTING_SETS_UNAPPROVED_OWNER_REJECTED' ($ownerSetsResult.ExitCode -ne 0 -and $ownerSetsResult.Output.Contains('EXISTING_TARGET_HIERARCHY_PERMISSIONS_UNSAFE'))
    Assert-Condition 'OWNER_REJECTION_BEFORE_SOURCE_CAPTURE_PREEXISTING_SETS' ($ownerSetsResult.Output.Contains('SOURCE_ADAPTER_INVOCATIONS=0'))
    $insecureSetsRoot = Join-Path $root 'permissions/insecure-preexisting-root'; New-Item -ItemType Directory -Path $insecureSetsRoot -Force | Out-Null; Set-TestRestrictedAcl $insecureSetsRoot
    $insecureSets = Join-Path $insecureSetsRoot 'sets'; New-Item -ItemType Directory -Path $insecureSets -Force | Out-Null
    $insecureBefore = Get-TestAclSddl $insecureSets
    $preexistingInsecure = Invoke-RuntimeAdapter 'synthetic-source-never-contacted' $insecureSetsRoot 'Normal' -EmitSourceCaptureAudit
    Assert-Condition 'PREEXISTING_INSECURE_SETS_REJECTED' ($preexistingInsecure.ExitCode -ne 0 -and $preexistingInsecure.Output.Contains('EXISTING_TARGET_HIERARCHY_PERMISSIONS_UNSAFE'))
    Assert-Condition 'PREEXISTING_SETS_NOT_AUTO_REPAIRED' ((Get-TestAclSddl $insecureSets) -ceq $insecureBefore)
    Assert-Condition 'SOURCE_NOT_CAPTURED_ON_PERMISSION_FAILURE' ($preexistingInsecure.Output.Contains('SOURCE_ADAPTER_INVOCATIONS=0'))
    $aclFailureRoot = Join-Path $root 'permissions/acl-failure-root'; New-Item -ItemType Directory -Path $aclFailureRoot -Force | Out-Null; Set-TestRestrictedAcl $aclFailureRoot
    $aclFailure = Invoke-Tool $permissionSource $aclFailureRoot 'Acl' 'Normal' -EnforceRuntimePermissions
    Assert-Condition 'ACL_ESTABLISHMENT_FAILURE_ROLLBACK' ($aclFailure.ExitCode -ne 0 -and (Test-NoPublishedSet $aclFailureRoot))
  } else {
    Assert-Condition 'NONWINDOWS_PERMISSION_POLICY_FAIL_CLOSED' $true
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
  foreach ($runtimeNewlineCase in @(
    @{ Name='RUNTIME_VALUE_CR_REJECTED'; Kind='CR'; Key='LOG_LEVEL' },
    @{ Name='RUNTIME_VALUE_LF_REJECTED'; Kind='LF'; Key='LOG_LEVEL' },
    @{ Name='RUNTIME_VALUE_CRLF_REJECTED'; Kind='CRLF'; Key='LOG_LEVEL' },
    @{ Name='RUNTIME_ALLOWED_WORKFLOWS_CR_REJECTED'; Kind='CR'; Key='GITHUB_ACTIONS_ALLOWED_WORKFLOWS' },
    @{ Name='RUNTIME_ALLOWED_WORKFLOWS_LF_REJECTED'; Kind='LF'; Key='GITHUB_ACTIONS_ALLOWED_WORKFLOWS' },
    @{ Name='RUNTIME_GENERIC_ALLOWLIST_KEY_MULTILINE_REJECTED'; Kind='CRLF'; Key='OPA_URL' }
  )) {
    $caseRoot = Join-Path $root $runtimeNewlineCase.Name; $source = Join-Path $caseRoot 'source'; $target = Join-Path $caseRoot 'target'; New-Item -ItemType Directory -Path $target -Force | Out-Null
    New-Fixture $source @('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') @($syntheticDatabaseAssignment,$syntheticRedisAssignment)
    $result = Invoke-Tool $source $target 'None' 'Normal' -RuntimeNewline $runtimeNewlineCase.Kind -RuntimeKey $runtimeNewlineCase.Key
    Assert-Condition $runtimeNewlineCase.Name ($result.ExitCode -ne 0 -and $result.Output.Contains('ERROR_CODE=RUNTIME_VALUE_MULTILINE'))
    Assert-Condition ("ENV_ROUNDTRIP_{0}_REJECTED" -f $runtimeNewlineCase.Kind) ($result.ExitCode -ne 0)
    Assert-Condition 'RUNTIME_MULTILINE_NO_PARTIAL_RUNTIME_ENV' (Test-NoPublishedSet $target)
    Assert-Condition 'RUNTIME_MULTILINE_NO_TRANSACTION_PUBLICATION' (Test-NoPublishedSet $target)
    foreach ($marker in $fakeMarkers) { Assert-Condition "RUNTIME_MULTILINE_NO_OUTPUT_LEAK_$($marker.Name)" (-not $result.Output.Contains($marker.Value)) }
  }
  $normalRuntimeTarget = Join-Path $root 'runtime-normal/target'; New-Item -ItemType Directory -Path $normalRuntimeTarget -Force | Out-Null
  Assert-Condition 'RUNTIME_NORMAL_SINGLE_LINE_PASS' ((Invoke-Tool $validSource $normalRuntimeTarget).ExitCode -eq 0)
  $requiredSecretCases = @(
    @{ Name='JWT_ACCESS_EMPTY_REJECTED'; Artifacts=@{ 'jwt-access'=''; 'jwt-refresh'='AUTOOPS_SYNTHETIC_JWT_REFRESH'; 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='JWT_ACCESS_WHITESPACE_REJECTED'; Artifacts=@{ 'jwt-access'='   '; 'jwt-refresh'='AUTOOPS_SYNTHETIC_JWT_REFRESH'; 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='JWT_REFRESH_EMPTY_REJECTED'; Artifacts=@{ 'jwt-access'='AUTOOPS_SYNTHETIC_JWT_ACCESS'; 'jwt-refresh'=''; 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='JWT_REFRESH_WHITESPACE_REJECTED'; Artifacts=@{ 'jwt-access'='AUTOOPS_SYNTHETIC_JWT_ACCESS'; 'jwt-refresh'='   '; 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='GITHUB_TOKEN_EMPTY_REJECTED'; Artifacts=@{ 'jwt-access'='AUTOOPS_SYNTHETIC_JWT_ACCESS'; 'jwt-refresh'='AUTOOPS_SYNTHETIC_JWT_REFRESH'; 'github-actions-token'='' }; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='GITHUB_TOKEN_WHITESPACE_REJECTED'; Artifacts=@{ 'jwt-access'='AUTOOPS_SYNTHETIC_JWT_ACCESS'; 'jwt-refresh'='AUTOOPS_SYNTHETIC_JWT_REFRESH'; 'github-actions-token'='   ' }; Runtime=@('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='JWT_ACCESS_TOO_SHORT_REJECTED'; Artifacts=@{ 'jwt-access'='short'; 'jwt-refresh'=(('R' * 32) -join ''); 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }; Runtime=@('NODE_ENV=production','GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='JWT_REFRESH_TOO_SHORT_REJECTED'; Artifacts=@{ 'jwt-access'=(('A' * 32) -join ''); 'jwt-refresh'='short'; 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }; Runtime=@('NODE_ENV=production','GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') },
    @{ Name='JWT_ACCESS_REFRESH_EQUAL_REJECTED'; Artifacts=@{ 'jwt-access'=(('A' * 32) -join ''); 'jwt-refresh'=(('A' * 32) -join ''); 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }; Runtime=@('NODE_ENV=production','GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') }
  )
  foreach ($requiredCase in $requiredSecretCases) {
    $caseRoot = Join-Path $root $requiredCase.Name; $source = Join-Path $caseRoot 'source'; $target = Join-Path $caseRoot 'target'; New-Item -ItemType Directory -Path $target -Force | Out-Null
    New-Fixture $source $requiredCase.Runtime @($syntheticDatabaseAssignment,$syntheticRedisAssignment) $requiredCase.Artifacts
    $result = Invoke-Tool $source $target
    Assert-Condition $requiredCase.Name ($result.ExitCode -ne 0)
    if ($requiredCase.Name -like 'GITHUB_TOKEN_*') { Assert-Condition 'GITHUB_TOKEN_REQUIRED_WHEN_ENABLED' ($result.ExitCode -ne 0) }
    Assert-Condition "REQUIRED_SECRET_FAILURE_NO_PUBLICATION_$($requiredCase.Name)" (Test-NoPublishedSet $target)
    foreach ($value in $requiredCase.Artifacts.Values) { if (-not [string]::IsNullOrEmpty([string]$value)) { Assert-Condition "REQUIRED_SECRET_FAILURE_NO_OUTPUT_LEAK_$($requiredCase.Name)" (-not $result.Output.Contains([string]$value)) } }
  }
  $validProductionRoot = Join-Path $root 'VALID_REQUIRED_SECRET_SET_PASS'; $validProductionSource = Join-Path $validProductionRoot 'source'; $validProductionTarget = Join-Path $validProductionRoot 'target'; New-Item -ItemType Directory -Path $validProductionTarget -Force | Out-Null
  New-Fixture $validProductionSource @('NODE_ENV=production','GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') @($syntheticDatabaseAssignment,$syntheticRedisAssignment) @{ 'jwt-access'=(('A' * 32) -join ''); 'jwt-refresh'=(('R' * 32) -join ''); 'github-actions-token'='AUTOOPS_SYNTHETIC_GITHUB_TOKEN' }
  Assert-Condition 'VALID_REQUIRED_SECRET_SET_PASS' ((Invoke-Tool $validProductionSource $validProductionTarget).ExitCode -eq 0)
  $roundTripCases = @(
    @{ Name='ENV_ROUNDTRIP_SIMPLE_PASS'; Kind='Runtime'; Key='LOG_LEVEL'; SourceValue='warn'; Expected=$true },
    @{ Name='ENV_ROUNDTRIP_SPACE_PASS'; Kind='Runtime'; Key='LOG_LEVEL'; SourceValue="'warn mode'"; Expected=$true },
    @{ Name='ENV_ROUNDTRIP_LEADING_SPACE_PASS'; Kind='Runtime'; Key='LOG_LEVEL'; SourceValue="' warn'"; Expected=$true },
    @{ Name='ENV_ROUNDTRIP_TRAILING_SPACE_PASS'; Kind='Runtime'; Key='LOG_LEVEL'; SourceValue="'warn '"; Expected=$true },
    @{ Name='ENV_ROUNDTRIP_HASH_LITERAL'; Kind='Sensitive'; Key=$databaseKey; SourceValue="'synthetic#literal'"; Expected=$true },
    @{ Name='ENV_ROUNDTRIP_SPACE_HASH_LITERAL'; Kind='Sensitive'; Key=$databaseKey; SourceValue="'synthetic #literal'"; Expected=$true },
    @{ Name='ENV_ROUNDTRIP_DOUBLE_QUOTE_LITERAL'; Kind='Sensitive'; Key=$databaseKey; SourceValue=("'" + '"synthetic"' + "'"); Expected=$true },
    @{ Name='ENV_ROUNDTRIP_DOLLAR_LITERAL'; Kind='Sensitive'; Key=$databaseKey; SourceValue="'synthetic`$literal'"; Expected=$true },
    @{ Name='ENV_ROUNDTRIP_INTERPOLATION_LOOKING_LITERAL'; Kind='Sensitive'; Key=$databaseKey; SourceValue="'synthetic`${LITERAL}'"; Expected=$true },
    @{ Name='ENV_ROUNDTRIP_SINGLE_QUOTE_LITERAL_REJECTED'; Kind='Sensitive'; Key=$databaseKey; SourceValue="'synthetic''literal'"; Expected=$false },
    @{ Name='ENV_ROUNDTRIP_BACKSLASH_LITERAL_REJECTED'; Kind='Sensitive'; Key=$databaseKey; SourceValue="'synthetic\literal'"; Expected=$false }
  )
  foreach ($roundTripCase in $roundTripCases) {
    $caseRoot = Join-Path $root $roundTripCase.Name; $source = Join-Path $caseRoot 'source'; $target = Join-Path $caseRoot 'target'; New-Item -ItemType Directory -Path $target -Force | Out-Null
    $runtimeLines = @('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false')
    $sensitiveLines = @($syntheticDatabaseAssignment,$syntheticRedisAssignment)
    if ($roundTripCase.Kind -eq 'Runtime') { $runtimeLines += ($roundTripCase.Key + '=' + $roundTripCase.SourceValue) } else { $sensitiveLines[0] = ($roundTripCase.Key + '=' + $roundTripCase.SourceValue) }
    New-Fixture $source $runtimeLines $sensitiveLines
    $result = Invoke-Tool $source $target
    Assert-Condition $roundTripCase.Name (($result.ExitCode -eq 0) -eq $roundTripCase.Expected)
    if ($roundTripCase.Expected) {
      $published = Get-PublishedSet $target; $outputFile = if ($roundTripCase.Kind -eq 'Runtime') { 'runtime.env' } else { 'sensitive.env' }
      $sourceValue = if ($roundTripCase.SourceValue.StartsWith("'")) { $roundTripCase.SourceValue.Substring(1, $roundTripCase.SourceValue.Length - 2) } else { $roundTripCase.SourceValue }
      Assert-Condition "ENV_ROUNDTRIP_EQUIVALENCE_$($roundTripCase.Name)" ((Get-SerializedLogicalValue (Join-Path $published $outputFile) $roundTripCase.Key) -ceq $sourceValue)
    } else { Assert-Condition "ENV_ROUNDTRIP_UNREPRESENTABLE_REJECTED_$($roundTripCase.Name)" (Test-NoPublishedSet $target) }
    foreach ($marker in $fakeMarkers) { Assert-Condition "ENV_ROUNDTRIP_NO_OUTPUT_LEAK_$($roundTripCase.Name)_$($marker.Name)" (-not $result.Output.Contains($marker.Value)) }
  }
  foreach ($case in @(
    @{ Name='SENSITIVE_CR_REJECTED'; Sensitive=@(($databaseKey + '=synthetic' + [char]13 + 'value'),$syntheticRedisAssignment) },
    @{ Name='SENSITIVE_LF_REJECTED'; Sensitive=@(($databaseKey + '=synthetic' + [char]10 + 'value'),$syntheticRedisAssignment) },
    @{ Name='SENSITIVE_CRLF_REJECTED'; Sensitive=@(($databaseKey + '=synthetic' + [char]13 + [char]10 + 'value'),$syntheticRedisAssignment) },
    @{ Name='SENSITIVE_MULTILINE_OPTIONAL_REJECTED'; Sensitive=@($syntheticDatabaseAssignment,$syntheticRedisAssignment,('ARGOCD_AUTH_TOKEN=synthetic' + [char]10 + 'value')) }
  )) {
    $caseRoot = Join-Path $root $case.Name; $source = Join-Path $caseRoot 'source'; $target = Join-Path $caseRoot 'target'; New-Item -ItemType Directory -Path $target -Force | Out-Null
    New-Fixture $source @('GITHUB_ACTIONS_ENABLED=true','JENKINS_INTEGRATION_ENABLED=false') $case.Sensitive
    $result = Invoke-Tool $source $target
    Assert-Condition $case.Name ($result.ExitCode -ne 0)
    if ($case.Name -match '^SENSITIVE_(CR|LF|CRLF)_REJECTED$') { Assert-Condition ("ENV_ROUNDTRIP_{0}_REJECTED" -f $Matches[1]) ($result.ExitCode -ne 0) }
    Assert-Condition 'SENSITIVE_MULTILINE_NO_PARTIAL_OUTPUT' (Test-NoPublishedSet $target)
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
  $concurrencyRoot = Join-Path $root 'concurrency'; $concurrencySource = Join-Path $concurrencyRoot 'source'; $concurrencyTarget = Join-Path $concurrencyRoot 'target'; $sharedSets = Join-Path $concurrencyTarget 'sets'
  Copy-Item -LiteralPath $validSource -Destination $concurrencySource -Recurse
  New-Item -ItemType Directory -Path (Join-Path $sharedSets 'other-published') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $sharedSets 'other-published/.published'), 'published')
  New-Item -ItemType Directory -Path (Join-Path $sharedSets '.other.staging') -Force | Out-Null
  $concurrencyFailure = Invoke-Tool $concurrencySource $concurrencyTarget 'BeforeCommit'
  Assert-Condition 'ROLLBACK_OWN_STAGING_ONLY' ($concurrencyFailure.ExitCode -ne 0 -and -not (Test-Path -LiteralPath (Join-Path $sharedSets '.synthetic-set.staging')))
  Assert-Condition 'ROLLBACK_DOES_NOT_DELETE_SHARED_SETS' (Test-Path -LiteralPath $sharedSets -PathType Container)
  Assert-Condition 'CONCURRENT_OTHER_PUBLISHED_SET_PRESERVED' (Test-Path -LiteralPath (Join-Path $sharedSets 'other-published/.published') -PathType Leaf)
  Assert-Condition 'CONCURRENT_OTHER_STAGING_SET_PRESERVED' (Test-Path -LiteralPath (Join-Path $sharedSets '.other.staging') -PathType Container)
  Assert-Condition 'FIRST_INVOCATION_FAIL_SECOND_PUBLISH_PRESERVED' (Test-Path -LiteralPath (Join-Path $sharedSets 'other-published/.published') -PathType Leaf)
  Assert-Condition 'SECOND_INVOCATION_FAIL_FIRST_PUBLISH_PRESERVED' (Test-Path -LiteralPath (Join-Path $sharedSets 'other-published/.published') -PathType Leaf)
  Assert-Condition 'SHARED_PARENT_NOT_RECURSIVELY_REMOVED' (Test-Path -LiteralPath $sharedSets -PathType Container)
  Assert-Condition 'FAILED_TRANSACTION_CLEANED' (-not (Test-Path -LiteralPath (Join-Path $sharedSets '.synthetic-set.staging')))
  Assert-Condition 'SUCCESSFUL_OTHER_TRANSACTION_UNCHANGED' (Test-Path -LiteralPath (Join-Path $sharedSets 'other-published/.published') -PathType Leaf)
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
      $adapterExpected = @{
        'jwt-access' = ($fakeMarkers | Where-Object Name -eq 'JWT_ACCESS').Value
        'jwt-refresh' = ($fakeMarkers | Where-Object Name -eq 'JWT_REFRESH').Value
        'github-actions-token' = ($fakeMarkers | Where-Object Name -eq 'GITHUB_TOKEN').Value
      }
      foreach ($name in $adapterExpected.Keys) { Assert-Condition "RUNTIME_ARTIFACT_SOURCE_MAPPING_$name" ([IO.File]::ReadAllText((Join-Path (Get-PublishedSet $adapterTarget) $name)) -ceq $adapterExpected[$name]) }
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
