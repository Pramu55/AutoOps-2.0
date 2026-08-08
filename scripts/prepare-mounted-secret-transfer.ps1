[CmdletBinding()]
param(
  [ValidateSet('Synthetic', 'Runtime')]
  [string]$SourceMode = 'Synthetic',
  [Parameter(Mandatory)]
  [string]$TargetRoot,
  [string]$SyntheticSourceRoot,
  [string]$RuntimeContainer = 'autoops-api',
  [ValidateSet('None', 'BeforeCommit', 'AfterFirstCommit', 'AfterAllCommits', 'Acl', 'Metadata', 'AtomicMove')]
  [string]$InjectFailure = 'None'
)

# This tool prepares artifacts only. It never activates Compose or changes a running service.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$runtimeAllowedKeys = @(
  'NODE_ENV', 'LOG_LEVEL', 'STRICT_ENV_VALIDATION', 'API_PORT', 'API_HOST', 'API_PUBLIC_URL',
  'CORS_ORIGINS', 'WORKER_PORT', 'WORKER_HOST', 'JWT_ACCESS_TTL', 'JWT_REFRESH_TTL',
  'GITHUB_ACTIONS_ENABLED', 'GITHUB_REPOSITORY_OWNER', 'GITHUB_REPOSITORY_NAME',
  'GITHUB_ACTIONS_ALLOWED_WORKFLOWS', 'JENKINS_INTEGRATION_ENABLED', 'ARGON2_MEMORY_COST',
  'ARGON2_TIME_COST', 'ARGON2_PARALLELISM', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX',
  'OPA_URL', 'OPA_POLICY_PATH', 'OPA_REQUEST_TIMEOUT_MS', 'OPA_ENFORCEMENT_MODE',
  'JENKINS_ALLOWED_JOBS', 'POLICY_KUBERNETES_PROTECTED_NAMESPACES',
  'POLICY_KUBERNETES_SCALE_APPROVAL_THRESHOLD', 'ARGOCD_URL', 'ARGOCD_USERNAME',
  'ARGOCD_SKIP_TLS_VERIFY', 'ARGOCD_REQUEST_TIMEOUT_MS', 'DEPLOYMENTS_CONCURRENCY',
  'BUILDS_CONCURRENCY', 'AI_CONCURRENCY', 'KUBERNETES_ALLOWED_NAMESPACES',
  'KUBERNETES_MAX_REPLICAS', 'PROMETHEUS_URL', 'GRAFANA_URL', 'GRAFANA_PUBLIC_URL',
  'AWS_INTEGRATION_ENABLED', 'AWS_REGION', 'AWS_ACCOUNT_ID', 'AWS_ALLOWED_DEPLOYMENT_WORKSPACES',
  'AWS_TERRAFORM_STATE_BUCKET', 'AWS_TERRAFORM_STATE_DYNAMODB_TABLE',
  'AWS_TERRAFORM_STATE_REGION', 'AWS_DEPLOYMENT_APPLY_ENABLED', 'AWS_ECR_PUSH_ENABLED',
  'AWS_ECR_PRODUCTION_PUSH_REQUIRES_APPROVAL', 'AWS_ALLOWED_ACCOUNT_IDS', 'AWS_ALLOWED_REGIONS',
  'AWS_MAX_PLAN_ADD_COUNT', 'AWS_MAX_PLAN_CHANGE_COUNT', 'AWS_MAX_MONTHLY_COST_DELTA_USD',
  'AWS_MAX_FARGATE_CPU', 'AWS_MAX_FARGATE_MEMORY_MB', 'AWS_MAX_DESIRED_COUNT',
  'AWS_BLOCK_PUBLIC_LOAD_BALANCER_BY_DEFAULT', 'AWS_ALLOW_PUBLIC_LOAD_BALANCER',
  'AWS_COST_GUARDRAILS_ENABLED', 'AWS_BLAST_RADIUS_GUARDRAILS_ENABLED',
  'API_INTERNAL_URL', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS',
  'PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS',
  'JENKINS_URL', 'JENKINS_USERNAME', 'JENKINS_REQUEST_TIMEOUT_MS',
  'JENKINS_TRIGGER_POLL_TIMEOUT_MS', 'JENKINS_TRIGGER_POLL_INTERVAL_MS',
  'DOCKER_SOCKET_PATH', 'DOCKER_HOST', 'AUTOOPS_MONITORED_DOCKER_COMPOSE_PROJECTS',
  'KUBECONFIG', 'KUBERNETES_API_SERVER_OVERRIDE', 'KUBERNETES_TLS_SERVER_NAME_OVERRIDE',
  'INFRA_AUTOMATION_ENABLED', 'INFRA_TERRAFORM_ROOT', 'INFRA_ANSIBLE_ROOT',
  'INFRA_OPERATION_TIMEOUT_SECONDS', 'INFRA_EXPORT_OUTPUT_LIMIT',
  'AWS_DEFAULT_TAG_OWNER', 'AWS_ECR_ALLOWED_REPOSITORIES', 'AWS_ECR_ALLOWED_BUILD_TARGETS',
  'AZURE_INTEGRATION_ENABLED', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID',
  'AZURE_SUBSCRIPTION_ID', 'GCP_INTEGRATION_ENABLED', 'GOOGLE_APPLICATION_CREDENTIALS'
)
$sensitiveKeys = @('DATABASE_URL', 'REDIS_URL', 'ARGOCD_AUTH_TOKEN', 'ARGOCD_PASSWORD', 'GRAFANA_API_TOKEN', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AZURE_CLIENT_SECRET')
$migratedKeys = @('JWT_SECRET', 'JWT_REFRESH_SECRET', 'GITHUB_ACTIONS_TOKEN', 'JENKINS_API_TOKEN')
$requiredSensitiveKeys = @('DATABASE_URL', 'REDIS_URL')
$omitWhenEmpty = @('AWS_ACCOUNT_ID', 'AWS_REGION', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS')
$comparer = [System.StringComparer]::Ordinal

function Write-Phase([string]$Name, [bool]$Passed) {
  [Console]::WriteLine("PHASE_$Name $(if ($Passed) { 'PASS' } else { 'FAIL' })")
}
function Fail-Safely([string]$Code) { throw [System.InvalidOperationException]::new($Code) }
function New-OrdinalSet([string[]]$Items) {
  $set = [System.Collections.Generic.HashSet[string]]::new($comparer)
  foreach ($item in $Items) { $null = $set.Add($item) }
  return $set
}
function Read-AssignmentFile([string]$Path, [string]$Kind) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Fail-Safely 'SOURCE_MISSING' }
  $values = [ordered]@{}
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) { continue }
    $match = [regex]::Match($line, '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$')
    if (-not $match.Success) { Fail-Safely 'INVALID_ASSIGNMENT' }
    $key = $match.Groups['key'].Value
    if ($values.Contains($key)) { Fail-Safely 'DUPLICATE_KEY' }
    $values[$key] = $match.Groups['value'].Value
  }
  return $values
}
function Test-SensitiveValue([string]$RawValue) {
  if ([string]::IsNullOrWhiteSpace($RawValue)) { return $false }
  if ($RawValue -match '\$\{' -or $RawValue -match '\$[A-Za-z_]') { return $false }
  if ($RawValue -match '^".*"$' -and $RawValue.Contains('\')) { return $false }
  if (($RawValue -eq "''") -or ($RawValue -eq '""')) { return $false }
  return $true
}
function Get-SyntheticValue([string]$Name) {
  $path = Join-Path $SyntheticSourceRoot $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail-Safely 'SOURCE_MISSING' }
  return [IO.File]::ReadAllText($path)
}
function Get-RuntimeValue([string]$Name) {
  # The value remains only in redirected process memory and is never written to diagnostics.
  if ($RuntimeContainer -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') { Fail-Safely 'SOURCE_CONTAINER_INVALID' }
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'docker'
  $script = 'if [ "${' + $Name + '+x}" ]; then printf %s "${' + $Name + '}"; else exit 3; fi'
  $arguments = @('exec', $RuntimeContainer, 'sh', '-c', $script) | ForEach-Object { [char]34 + $_.Replace([string][char]34, '\"') + [char]34 }
  $psi.Arguments = $arguments -join ' '
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $psi
  if (-not $process.Start()) { Fail-Safely 'SOURCE_CAPTURE_FAILED' }
  $value = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -eq 3) { return @{ State = 'ABSENT'; Value = $null } }
  if ($process.ExitCode -ne 0) { Fail-Safely 'SOURCE_CAPTURE_FAILED' }
  return @{ State = 'PRESENT'; Value = $value }
}
function Get-SourceValue([string]$Name) {
  if ($SourceMode -eq 'Synthetic') { return Get-SyntheticValue $Name }
  $captured = Get-RuntimeValue $Name
  if ($captured.State -ne 'PRESENT') { Fail-Safely 'SOURCE_MISSING' }
  return [string]$captured.Value
}
function Get-RuntimeAssignmentMap([string[]]$Keys) {
  $values = [ordered]@{}
  foreach ($key in $Keys) {
    $captured = Get-RuntimeValue $key
    if ($captured.State -eq 'PRESENT') { $values[$key] = [string]$captured.Value }
  }
  return $values
}
function Get-FileMetadata([string]$Path) {
  $item = Get-Item -Force -LiteralPath $Path -ErrorAction Stop
  if ($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { Fail-Safely 'METADATA_INVALID' }
  return $true
}
function Set-ArtifactAcl([string]$Path) {
  # Do not touch the script ACL. On non-Windows, inherited directory permissions are used.
  if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $acl = Get-Acl -LiteralPath $Path
    $current = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($current, 'FullControl', 'Allow')
    $acl.SetAccessRule($rule); Set-Acl -LiteralPath $Path -AclObject $acl
  }
}
function New-StagedFile([string]$Directory, [string]$Name, [string]$Value) {
  $stage = Join-Path $Directory ('.' + $Name + '.' + [Guid]::NewGuid().ToString('N') + '.stage')
  $encoding = [Text.UTF8Encoding]::new($false)
  $stream = [IO.FileStream]::new($stage, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $bytes = $encoding.GetBytes($Value); $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  return $stage
}

$created = New-Object System.Collections.Generic.List[string]
$staged = New-Object System.Collections.Generic.List[string]
try {
  if ([string]::IsNullOrWhiteSpace($TargetRoot) -or -not [IO.Path]::IsPathRooted($TargetRoot)) { Fail-Safely 'TARGET_ROOT_INVALID' }
  $targetRootFull = [IO.Path]::GetFullPath($TargetRoot)
  if (-not (Test-Path -LiteralPath $targetRootFull -PathType Container)) { Fail-Safely 'TARGET_ROOT_MISSING' }
  Write-Phase 'INITIALIZE' $true
  $names = @('runtime.env', 'sensitive.env', 'jwt-access', 'jwt-refresh', 'github-actions-token')
  foreach ($name in $names) { if (Test-Path -LiteralPath (Join-Path $targetRootFull $name)) { Fail-Safely 'DESTINATION_EXISTS' } }
  if ($SourceMode -eq 'Synthetic' -and [string]::IsNullOrWhiteSpace($SyntheticSourceRoot)) { Fail-Safely 'SYNTHETIC_SOURCE_REQUIRED' }
  Write-Phase 'SOURCE_DISCOVERY' $true

  $runtime = if ($SourceMode -eq 'Synthetic') {
    Read-AssignmentFile (Join-Path $SyntheticSourceRoot 'runtime.source') 'runtime'
  } else {
    Get-RuntimeAssignmentMap $runtimeAllowedKeys
  }
  $runtimeSet = New-OrdinalSet $runtimeAllowedKeys; $sensitiveSet = New-OrdinalSet $sensitiveKeys; $migratedSet = New-OrdinalSet $migratedKeys
  foreach ($key in $runtime.Keys) {
    if ($sensitiveSet.Contains($key) -or $migratedSet.Contains($key) -or -not $runtimeSet.Contains($key)) { Fail-Safely 'RUNTIME_KEY_INVALID' }
  }
  if ($runtime['GITHUB_ACTIONS_ENABLED'] -cne 'true' -or $runtime['JENKINS_INTEGRATION_ENABLED'] -cne 'false') { Fail-Safely 'RUNTIME_ENABLEMENT_INVALID' }
  $runtimeLines = New-Object System.Collections.Generic.List[string]
  foreach ($key in $runtimeAllowedKeys) {
    if (-not $runtime.Contains($key)) { continue }
    if ($omitWhenEmpty -contains $key -and [string]::IsNullOrEmpty([string]$runtime[$key])) { continue }
    $runtimeLines.Add("$key=$($runtime[$key])")
  }
  $runtimeValue = ($runtimeLines -join [Environment]::NewLine) + [Environment]::NewLine
  Write-Phase 'RUNTIME_SERIALIZATION' $true

  $sensitive = if ($SourceMode -eq 'Synthetic') {
    Read-AssignmentFile (Join-Path $SyntheticSourceRoot 'sensitive.source') 'sensitive'
  } else {
    Get-RuntimeAssignmentMap $sensitiveKeys
  }
  foreach ($key in $sensitive.Keys) { if (-not $sensitiveSet.Contains($key) -or $migratedSet.Contains($key) -or -not (Test-SensitiveValue ([string]$sensitive[$key]))) { Fail-Safely 'SENSITIVE_KEY_INVALID' } }
  foreach ($key in $requiredSensitiveKeys) { if (-not $sensitive.Contains($key)) { Fail-Safely 'SENSITIVE_REQUIRED_MISSING' } }
  $sensitiveLines = New-Object System.Collections.Generic.List[string]
  foreach ($key in $sensitiveKeys) { if ($sensitive.Contains($key)) { $sensitiveLines.Add("$key=$($sensitive[$key])") } }
  $sensitiveValue = ($sensitiveLines -join [Environment]::NewLine) + [Environment]::NewLine
  Write-Phase 'SENSITIVE_SERIALIZATION' $true
  $payloads = [ordered]@{
    'runtime.env' = $runtimeValue
    'sensitive.env' = $sensitiveValue
    'jwt-access' = (Get-SourceValue 'jwt-access')
    'jwt-refresh' = (Get-SourceValue 'jwt-refresh')
    'github-actions-token' = (Get-SourceValue 'github-actions-token')
  }
  if ($InjectFailure -eq 'BeforeCommit') { Fail-Safely 'INJECTED_FAILURE' }
  foreach ($name in $payloads.Keys) {
    $stage = New-StagedFile $targetRootFull $name ([string]$payloads[$name]); $staged.Add($stage)
    if ($InjectFailure -eq 'Acl') { Fail-Safely 'INJECTED_FAILURE' }
    Set-ArtifactAcl $stage
    if ($InjectFailure -eq 'Metadata') { Fail-Safely 'INJECTED_FAILURE' }
    $null = Get-FileMetadata $stage
  }
  Write-Phase 'ACL' $true; Write-Phase 'METADATA' $true
  $index = 0
  foreach ($name in $payloads.Keys) {
    if ($InjectFailure -eq 'AtomicMove') { Fail-Safely 'INJECTED_FAILURE' }
    Move-Item -LiteralPath $staged[$index] -Destination (Join-Path $targetRootFull $name) -ErrorAction Stop
    $created.Add((Join-Path $targetRootFull $name)); $index++
    if ($InjectFailure -eq 'AfterFirstCommit' -and $index -eq 1) { Fail-Safely 'INJECTED_FAILURE' }
  }
  if ($InjectFailure -eq 'AfterAllCommits') { Fail-Safely 'INJECTED_FAILURE' }
  Write-Phase 'COMMIT' $true
  $payloads.Clear(); Write-Phase 'CLEANUP' $true
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z_]+$') { $_.Exception.Message } else { 'TRANSFER_FAILED' }
  foreach ($path in $staged) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
  foreach ($path in $created) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
  [Console]::WriteLine("ERROR_CODE=$code")
  Write-Phase 'CLEANUP' $true
  exit 1
}
