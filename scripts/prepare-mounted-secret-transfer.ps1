[CmdletBinding()]
param(
  [ValidateSet('Synthetic', 'Runtime')]
  [string]$SourceMode = 'Synthetic',
  [Parameter(Mandatory)]
  [string]$TargetRoot,
  [string]$SyntheticSourceRoot,
  [string]$RuntimeContainer = 'autoops-api',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')]
  [string]$TransactionId = ([Guid]::NewGuid().ToString('N')),
  [ValidateSet('None', 'BeforeCommit', 'AfterFirstCommit', 'AfterAllCommits', 'Acl', 'Metadata', 'AtomicMove')]
  [string]$InjectFailure = 'None',
  [ValidateSet('Normal', 'GenericError', 'Ambiguous')]
  [string]$WorktreeProbeMode = 'Normal',
  [switch]$EnforceRuntimePermissions,
  [ValidateSet('None', 'CR', 'LF', 'CRLF')]
  [string]$InjectRuntimeValueNewline = 'None',
  [ValidatePattern('^[A-Z][A-Z0-9_]*$')]
  [string]$InjectedRuntimeKey = 'LOG_LEVEL',
  # Synthetic-only test seam. It cannot influence Runtime-mode trust decisions.
  [ValidateSet('Normal', 'ApprovedSystem', 'ApprovedAdministrators', 'Unapproved', 'Unresolvable')]
  [string]$TestOwnerProbeMode = 'Normal',
  [ValidateSet('Any', 'Sets')]
  [string]$TestOwnerProbeScope = 'Any',
  # Synthetic-only test seam. Runtime mode always uses resolved filesystem owners.
  [ValidateSet('Normal', 'ApprovedSystem', 'ApprovedAdministrators', 'Unapproved', 'Unresolvable')]
  [string]$TestAncestorOwnerProbeMode = 'Normal',
  # Synthetic-only test seam for a disposable, verified ancestor boundary.
  [string]$TestAncestorTrustAnchor,
  [switch]$EmitSourceCaptureAudit
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
$mountedArtifactDescriptors = [ordered]@{
  'jwt-access' = @{ EnvironmentVariable = 'JWT_SECRET'; StripSingleTrailingNewline = $true }
  'jwt-refresh' = @{ EnvironmentVariable = 'JWT_REFRESH_SECRET'; StripSingleTrailingNewline = $true }
  'github-actions-token' = @{ EnvironmentVariable = 'GITHUB_ACTIONS_TOKEN'; StripSingleTrailingNewline = $true }
}
$requiredSensitiveKeys = @('DATABASE_URL', 'REDIS_URL')
$optionalSensitiveKeys = @($sensitiveKeys | Where-Object { $_ -notin $requiredSensitiveKeys })
$omitWhenEmpty = @('AWS_ACCOUNT_ID', 'AWS_REGION', 'PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS')
$comparer = [System.StringComparer]::Ordinal
$sourceAdapterInvocations = 0
$requiresRuntimePermissions = $SourceMode -eq 'Runtime' -or $EnforceRuntimePermissions

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
    $allowEmpty = $Kind -eq 'runtime' -or ($Kind -eq 'sensitive' -and $optionalSensitiveKeys -contains $key)
    $values[$key] = ConvertFrom-SyntheticEnvFileValue $match.Groups['value'].Value $Kind $allowEmpty
  }
  return $values
}
function ConvertFrom-SyntheticEnvFileValue([string]$RawValue, [string]$Kind, [bool]$AllowEmpty) {
  if ($RawValue.IndexOfAny([char[]]@(13, 10, 0)) -ge 0) { Fail-Safely 'SOURCE_VALUE_INVALID' }
  $value = $RawValue.Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    if ($AllowEmpty) { return '' }
    Fail-Safely 'SOURCE_VALUE_INVALID'
  }
  if ($value.StartsWith('#')) { Fail-Safely 'SOURCE_VALUE_INVALID' }
  if ($value.StartsWith("'")) {
    $closingQuote = $value.IndexOf("'", 1)
    $trailing = if ($closingQuote -lt 0) { '' } else { $value.Substring($closingQuote + 1).TrimStart() }
    if ($closingQuote -lt 0 -or (-not [string]::IsNullOrWhiteSpace($trailing) -and -not $trailing.StartsWith('#'))) { Fail-Safely 'SOURCE_VALUE_INVALID' }
    $content = $value.Substring(1, $closingQuote - 1)
    if ($content.Contains('\')) { Fail-Safely 'SOURCE_VALUE_INVALID' }
    return $content
  }
  if ($value.StartsWith('"')) {
    $match = [regex]::Match($value, '^"(?<content>(?:[^"\\]|\\.)*)"\s*(?:#.*)?$')
    if (-not $match.Success) { Fail-Safely 'SOURCE_VALUE_INVALID' }
    $content = $match.Groups['content'].Value
    if ($content.Contains('\') -or $content.Contains('$')) { Fail-Safely 'SOURCE_VALUE_INVALID' }
    return $content
  }
  $effective = [regex]::Replace($value, '\s+#.*$', '').Trim()
  if ([string]::IsNullOrWhiteSpace($effective) -or $effective.Contains('$') -or $effective.Contains('"') -or $effective.Contains("'")) { Fail-Safely 'SOURCE_VALUE_INVALID' }
  return $effective
}
function Test-SensitiveValue([string]$RawValue) {
  if ($RawValue.IndexOfAny([char[]]@(13, 10)) -ge 0) { return $false }
  $value = $RawValue.Trim()
  if ([string]::IsNullOrWhiteSpace($value) -or $value.StartsWith('#')) { return $false }
  if ($value.StartsWith("'")) {
    $closingQuote = -1; $escaped = $false
    for ($index = 1; $index -lt $value.Length; $index += 1) {
      $character = $value[$index]
      if ($character -eq [char]92 -and -not $escaped) { $escaped = $true; continue }
      if ($character -eq "'" -and -not $escaped) { $closingQuote = $index; break }
      $escaped = $false
    }
    if ($closingQuote -lt 0) { return $false }
    $trailing = $value.Substring($closingQuote + 1).TrimStart()
    if (-not [string]::IsNullOrWhiteSpace($trailing) -and -not $trailing.StartsWith('#')) { return $false }
    return -not [string]::IsNullOrWhiteSpace($value.Substring(1, $closingQuote - 1))
  }
  if ($value.StartsWith('"')) {
    $match = [regex]::Match($value, '^"(?<content>(?:[^"\\]|\\.)*)"\s*(?:#.*)?$')
    if (-not $match.Success) { return $false }
    $content = $match.Groups['content'].Value
    return (-not [string]::IsNullOrWhiteSpace($content)) -and -not $content.Contains('\') -and -not $content.Contains('$')
  }
  $effective = [regex]::Replace($value, '\s+#.*$', '').Trim()
  return (-not [string]::IsNullOrWhiteSpace($effective)) -and -not $effective.Contains('"') -and -not $effective.Contains("'") -and -not $effective.Contains('$')
}
function Test-SingleLineRuntimeValue([string]$Value) {
  return $Value.IndexOfAny([char[]]@(13, 10)) -lt 0
}
function ConvertTo-LosslessSingleQuotedValue([string]$Value, [string]$FailureCode) {
  if ($Value.IndexOfAny([char[]]@(0, 13, 10)) -ge 0) { Fail-Safely $FailureCode }
  # The authoritative validator documents single-quoted env-file values as
  # literal. Reject the two characters which would require Compose-specific
  # escape semantics instead of reproducing a partial parser.
  if ($Value.Contains("'") -or $Value.Contains('\')) { Fail-Safely $FailureCode }
  $encoded = "'$Value'"
  $roundTrip = $encoded.Substring(1, $encoded.Length - 2)
  if (-not $roundTrip.Equals($Value, [StringComparison]::Ordinal)) { Fail-Safely $FailureCode }
  return $encoded
}
function ConvertTo-RuntimeEnvAssignment([string]$Key, [string]$Value) {
  if (-not (Test-SingleLineRuntimeValue $Value) -or $Value.IndexOf([char]0) -ge 0) { Fail-Safely 'RUNTIME_VALUE_MULTILINE' }
  if ($Key -eq 'GITHUB_ACTIONS_ENABLED' -or $Key -eq 'JENKINS_INTEGRATION_ENABLED') {
    # The authoritative runtime validator consumes these two flags before
    # Compose, so retain their validated, unquoted boolean representation.
    return "$Key=$Value"
  }
  return "$Key=$(ConvertTo-LosslessSingleQuotedValue $Value 'RUNTIME_VALUE_UNREPRESENTABLE')"
}
function ConvertTo-SensitiveEnvAssignment([string]$Key, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { Fail-Safely 'SENSITIVE_VALUE_INVALID' }
  return "$Key=$(ConvertTo-LosslessSingleQuotedValue $Value 'SENSITIVE_VALUE_UNREPRESENTABLE')"
}
function Get-SyntheticValue([string]$Name) {
  $path = Join-Path $SyntheticSourceRoot $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail-Safely 'SOURCE_MISSING' }
  return [IO.File]::ReadAllText($path)
}
function Get-RuntimeValue([string]$Name) {
  # The value remains only in redirected process memory and is never written to diagnostics.
  $script:sourceAdapterInvocations += 1
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
function Get-ArtifactSourceValue([string]$ArtifactName) {
  if ($SourceMode -eq 'Synthetic') { return Get-SyntheticValue $ArtifactName }
  if (-not $mountedArtifactDescriptors.Contains($ArtifactName)) { Fail-Safely 'ARTIFACT_SOURCE_INVALID' }
  return Get-SourceValue $mountedArtifactDescriptors[$ArtifactName].EnvironmentVariable
}
function Test-MountedArtifactLogicalEquivalence([string]$ArtifactName, [string]$Value) {
  if (-not $mountedArtifactDescriptors.Contains($ArtifactName)) { Fail-Safely 'ARTIFACT_SOURCE_INVALID' }
  $descriptor = $mountedArtifactDescriptors[$ArtifactName]
  if ($descriptor.StripSingleTrailingNewline -and ($Value.EndsWith("`n") -or $Value.EndsWith("`r"))) {
    # MountedFileSecretProvider removes a single terminal LF or CRLF. Reject
    # values whose file-mode result would differ from their env-mode value.
    Fail-Safely 'MOUNTED_SECRET_TRAILING_LINE_ENDING'
  }
}
function Get-RuntimeAssignmentMap([string[]]$Keys) {
  $values = [ordered]@{}
  foreach ($key in $Keys) {
    $captured = Get-RuntimeValue $key
    if ($captured.State -eq 'PRESENT') { $values[$key] = [string]$captured.Value }
  }
  return $values
}
function Normalize-ActivationEnablement([System.Collections.IDictionary]$Runtime) {
  # The maintained file-mode overlay always activates GitHub Actions and keeps
  # Jenkins disabled. Normalize accepted source representations into the
  # deterministic activation configuration before any sensitive source capture.
  if (-not $Runtime.Contains('GITHUB_ACTIONS_ENABLED')) { Fail-Safely 'RUNTIME_ENABLEMENT_INVALID' }
  switch -casesensitive ([string]$Runtime['GITHUB_ACTIONS_ENABLED']) {
    'true' { $Runtime['GITHUB_ACTIONS_ENABLED'] = 'true'; break }
    '1' { $Runtime['GITHUB_ACTIONS_ENABLED'] = 'true'; break }
    default { Fail-Safely 'RUNTIME_ENABLEMENT_INVALID' }
  }

  if (-not $Runtime.Contains('JENKINS_INTEGRATION_ENABLED')) {
    $Runtime['JENKINS_INTEGRATION_ENABLED'] = 'false'
    return
  }
  switch -casesensitive ([string]$Runtime['JENKINS_INTEGRATION_ENABLED']) {
    'false' { $Runtime['JENKINS_INTEGRATION_ENABLED'] = 'false'; break }
    '0' { $Runtime['JENKINS_INTEGRATION_ENABLED'] = 'false'; break }
    default { Fail-Safely 'RUNTIME_ENABLEMENT_INVALID' }
  }
}
function Get-FileMetadata([string]$Path) {
  $item = Get-Item -Force -LiteralPath $Path -ErrorAction Stop
  if ($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { Fail-Safely 'METADATA_INVALID' }
  return $true
}
function Get-ApprovedRuntimeSecurityIdentifiers() {
  return @(
    [Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
    'S-1-5-18', # SYSTEM
    'S-1-5-32-544' # BUILTIN\\Administrators
  )
}
function Get-ApprovedAncestorSecurityIdentifiers() {
  $approved = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($sid in Get-ApprovedRuntimeSecurityIdentifiers) { $null = $approved.Add($sid) }
  if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    # TrustedInstaller owns the Windows filesystem root on supported hosts. It
    # is an OS trust anchor for ancestor verification only, never for a secret
    # target root or an invocation-created artifact.
    $null = $approved.Add('S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
  }
  return $approved
}
function Get-RuntimeAcl([string]$Path, [bool]$IsDirectory) {
  if ($IsDirectory) { return [IO.Directory]::GetAccessControl($Path) }
  return [IO.File]::GetAccessControl($Path)
}
function Set-RuntimeAcl([string]$Path, [bool]$IsDirectory, [Security.AccessControl.FileSystemSecurity]$Acl) {
  if ($IsDirectory) { [IO.Directory]::SetAccessControl($Path, $Acl); return }
  [IO.File]::SetAccessControl($Path, $Acl)
}
function Test-RestrictedRuntimePermissions([string]$Path, [bool]$RequireProtectedAcl, [string]$FailureCode) {
  if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $isDirectory = Test-Path -LiteralPath $Path -PathType Container
    $acl = Get-RuntimeAcl $Path $isDirectory
    if ($RequireProtectedAcl -and -not $acl.AreAccessRulesProtected) { Fail-Safely $FailureCode }
    $operatorSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $approvedSids = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($approvedSid in Get-ApprovedRuntimeSecurityIdentifiers) { $null = $approvedSids.Add($approvedSid) }
    try {
      $useTestOwner = $TestOwnerProbeMode -ne 'Normal' -and ($TestOwnerProbeScope -eq 'Any' -or ((Split-Path -Leaf $Path) -eq 'sets'))
      $ownerSid = if (-not $useTestOwner) {
        $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier])
        if ($null -eq $owner -or [string]::IsNullOrWhiteSpace($owner.Value)) { Fail-Safely $FailureCode }
        $owner.Value
      } else { switch ($TestOwnerProbeMode) {
        'ApprovedSystem' { 'S-1-5-18'; break }
        'ApprovedAdministrators' { 'S-1-5-32-544'; break }
        'Unapproved' { 'S-1-5-21-424242-424242-424242-4001'; break }
        'Unresolvable' { Fail-Safely $FailureCode }
        default { Fail-Safely $FailureCode }
      } }
    } catch {
      Fail-Safely $FailureCode
    }
    if (-not $approvedSids.Contains($ownerSid)) { Fail-Safely $FailureCode }
    $operatorAllowed = $false; $broadSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
      $sid = $rule.IdentityReference.Value
      if ($rule.AccessControlType -eq 'Allow' -and -not $approvedSids.Contains($sid)) { Fail-Safely $FailureCode }
      if ($sid -eq $operatorSid -and $rule.AccessControlType -eq 'Allow' -and (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne 0)) { $operatorAllowed = $true }
    }
    if (-not $operatorAllowed) { Fail-Safely $FailureCode }
    return
  }
  Fail-Safely 'PLATFORM_PERMISSION_MODEL_UNSUPPORTED'
}
function Test-AncestorReplacementPermissions([string]$TargetRoot, [string]$FailureCode) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Fail-Safely 'PLATFORM_PERMISSION_MODEL_UNSUPPORTED' }
  $approvedSids = Get-ApprovedAncestorSecurityIdentifiers
  $replacementRights = [Security.AccessControl.FileSystemRights]::Delete -bor
    [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
    [Security.AccessControl.FileSystemRights]::ChangePermissions -bor
    [Security.AccessControl.FileSystemRights]::TakeOwnership
  $parent = [IO.Directory]::GetParent($TargetRoot)
  $trustAnchor = if ([string]::IsNullOrWhiteSpace($TestAncestorTrustAnchor)) { $null } else { [IO.Path]::GetFullPath($TestAncestorTrustAnchor).TrimEnd([char[]]@('\', '/')) }
  $isImmediateParent = $true
  while ($null -ne $parent -and $parent.FullName -ne $TargetRoot) {
    try {
      $item = Get-Item -Force -LiteralPath $parent.FullName -ErrorAction Stop
      if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { Fail-Safely $FailureCode }
      $acl = Get-RuntimeAcl $parent.FullName $true
      $ownerSid = if ($isImmediateParent -and $TestAncestorOwnerProbeMode -ne 'Normal') {
        switch ($TestAncestorOwnerProbeMode) {
          'ApprovedSystem' { 'S-1-5-18'; break }
          'ApprovedAdministrators' { 'S-1-5-32-544'; break }
          'Unapproved' { 'S-1-5-21-424242-424242-424242-5001'; break }
          'Unresolvable' { Fail-Safely $FailureCode }
          default { Fail-Safely $FailureCode }
        }
      } else {
        $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier])
        if ($null -eq $owner -or [string]::IsNullOrWhiteSpace($owner.Value)) { Fail-Safely $FailureCode }
        $owner.Value
      }
      if (-not $approvedSids.Contains($ownerSid)) { Fail-Safely $FailureCode }
      foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -ne 'Allow') { continue }
        # An InheritOnly ACE is returned for this directory but does not grant
        # rights on this current object. Any effective inherited copy is
        # evaluated when the descendant itself is visited.
        if (($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0) { continue }
        $sid = $rule.IdentityReference.Value
        if ([string]::IsNullOrWhiteSpace($sid)) { Fail-Safely $FailureCode }
        if (-not $approvedSids.Contains($sid) -and (($rule.FileSystemRights -band $replacementRights) -ne 0)) { Fail-Safely $FailureCode }
      }
    } catch {
      if ($_.Exception.Message -match '^[A-Z_]+$') { throw }
      Fail-Safely $FailureCode
    }
    if ($null -ne $trustAnchor -and $parent.FullName.TrimEnd([char[]]@('\', '/')) -ceq $trustAnchor) { break }
    $next = [IO.Directory]::GetParent($parent.FullName)
    if ($null -eq $next -or $next.FullName -eq $parent.FullName) { break }
    $parent = $next
    $isImmediateParent = $false
  }
}
function Set-InvocationRestrictedPermissions([string]$Path, [bool]$IsDirectory) {
  if (-not $requiresRuntimePermissions) { return }
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Fail-Safely 'PLATFORM_PERMISSION_MODEL_UNSUPPORTED' }
  $acl = Get-RuntimeAcl $Path $IsDirectory
  # This function is called only for files/directories created by this invocation.
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($existingRule in @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))) { $null = $acl.RemoveAccessRuleSpecific($existingRule) }
  $inheritance = if ($IsDirectory) { [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit } else { [Security.AccessControl.InheritanceFlags]::None }
  foreach ($sidText in Get-ApprovedRuntimeSecurityIdentifiers) {
    $sid = [Security.Principal.SecurityIdentifier]::new($sidText)
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
  }
  Set-RuntimeAcl $Path $IsDirectory $acl
  Test-RestrictedRuntimePermissions $Path $true 'ACL_POST_VERIFY_FAILED'
}
function Test-TargetRootSafe([string]$Candidate) {
  $checkpoint = 'INITIAL'
  try {
  if ([string]::IsNullOrWhiteSpace($Candidate) -or -not [IO.Path]::IsPathRooted($Candidate)) { Fail-Safely 'TARGET_ROOT_INVALID' }
  $checkpoint = 'CANONICAL'; $root = [IO.Path]::GetFullPath($Candidate)
  if (-not (Test-Path -LiteralPath $root -PathType Container)) { Fail-Safely 'TARGET_ROOT_MISSING' }
  $checkpoint = 'PARENTS'; $current = $root
  while ($true) {
    $item = Get-Item -Force -LiteralPath $current -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail-Safely 'TARGET_REPARSE_PATH' }
    $parent = [IO.Directory]::GetParent($current)
    if ($null -eq $parent -or $parent.FullName -eq $current) { break }
    $current = $parent.FullName
  }
  $checkpoint = 'REPOSITORY'; $repositoryRoot = (& git -C $PSScriptRoot rev-parse --show-toplevel 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryRoot)) { Fail-Safely 'REPOSITORY_ROOT_UNAVAILABLE' }
  $checkpoint = 'CONTAINMENT'; $comparison = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
  $normalizedRepository = [IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\', '/')
  $normalizedRoot = $root.TrimEnd('\', '/')
  if ($normalizedRoot.Equals($normalizedRepository, $comparison) -or $normalizedRoot.StartsWith($normalizedRepository + [IO.Path]::DirectorySeparatorChar, $comparison)) { Fail-Safely 'TARGET_REPOSITORY_CONTAINED' }
  $current = $root
  while ($true) {
    if (Test-Path -LiteralPath (Join-Path $current '.git')) { Fail-Safely 'TARGET_GIT_WORKTREE' }
    $parent = [IO.Directory]::GetParent($current)
    if ($null -eq $parent -or $parent.FullName -eq $current) { break }
    $current = $parent.FullName
  }
  $checkpoint = 'WORKTREE'; $probe = [Diagnostics.ProcessStartInfo]::new()
  if ($WorktreeProbeMode -eq 'GenericError') { Fail-Safely 'TARGET_WORKTREE_PROBE_FAILED' }
  if ($WorktreeProbeMode -eq 'Ambiguous') { Fail-Safely 'TARGET_WORKTREE_PROBE_AMBIGUOUS' }
  $probe.FileName = 'git'; $probe.Arguments = '-C "' + $root.Replace('"', '\"') + '" rev-parse --is-inside-work-tree'
  $probe.UseShellExecute = $false; $probe.RedirectStandardOutput = $true; $probe.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $probe
  if (-not $process.Start()) { Fail-Safely 'TARGET_WORKTREE_PROBE_FAILED' }
  $probeOutput = $process.StandardOutput.ReadToEnd().Trim(); $probeError = $process.StandardError.ReadToEnd().Trim(); $process.WaitForExit()
  if ($process.ExitCode -eq 0) {
    if ($probeOutput -ceq 'true') { Fail-Safely 'TARGET_GIT_WORKTREE' }
    Fail-Safely 'TARGET_WORKTREE_PROBE_AMBIGUOUS'
  }
  if ($process.ExitCode -ne 128 -or $probeOutput.Length -ne 0 -or $probeError -cne 'fatal: not a git repository (or any of the parent directories): .git') { Fail-Safely 'TARGET_WORKTREE_PROBE_FAILED' }
  return $root
  } catch {
    if ($_.Exception.Message -match '^[A-Z_]+$') { throw }
    Fail-Safely ('TARGET_CHECK_' + $checkpoint)
  }
}
function New-StagedFile([string]$Directory, [string]$Name, [string]$Value) {
  $stage = Join-Path $Directory $Name
  $encoding = [Text.UTF8Encoding]::new($false)
  $stream = [IO.FileStream]::new($stage, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $bytes = $encoding.GetBytes($Value); $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  return $stage
}
function Test-StagedMountedSecretContract([string]$SetRoot) {
  $validator = Join-Path $PSScriptRoot 'validate-mounted-secret-delivery.ps1'
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'powershell'
  $psi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $validator.Replace('"', '\"') + '" -Overlay core,sensitive-env,github'
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.Environment['AUTOOPS_FILE_MODE_ENV_FILE'] = Join-Path $SetRoot 'runtime.env'
  $psi.Environment['AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE'] = Join-Path $SetRoot 'sensitive.env'
  $psi.Environment['AUTOOPS_SECRET_JWT_ACCESS_FILE'] = Join-Path $SetRoot 'jwt-access'
  $psi.Environment['AUTOOPS_SECRET_JWT_REFRESH_FILE'] = Join-Path $SetRoot 'jwt-refresh'
  $psi.Environment['AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE'] = Join-Path $SetRoot 'github-actions-token'
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $psi
  if (-not $process.Start()) { Fail-Safely 'VALIDATOR_EXECUTION_FAILED' }
  $null = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -ne 0) { Fail-Safely 'VALIDATOR_REJECTED' }
}

$created = New-Object System.Collections.Generic.List[string]
$staged = New-Object System.Collections.Generic.List[string]
try {
  if ($SourceMode -eq 'Runtime' -and ($TestOwnerProbeMode -ne 'Normal' -or $TestOwnerProbeScope -ne 'Any' -or $TestAncestorOwnerProbeMode -ne 'Normal' -or -not [string]::IsNullOrWhiteSpace($TestAncestorTrustAnchor))) { Fail-Safely 'TEST_PARAMETER_INVALID' }
  $targetRootFull = Test-TargetRootSafe $TargetRoot
  if ($requiresRuntimePermissions) {
    Test-RestrictedRuntimePermissions $targetRootFull $true 'TARGET_ROOT_PERMISSIONS_UNSAFE'
    Test-AncestorReplacementPermissions $targetRootFull 'TARGET_ANCESTOR_PERMISSIONS_UNSAFE'
  }
  Write-Phase 'INITIALIZE' $true
  $setsRoot = Join-Path $targetRootFull 'sets'
  $setsRootExisted = Test-Path -LiteralPath $setsRoot
  if (-not $setsRootExisted) {
    New-Item -ItemType Directory -Path $setsRoot -ErrorAction Stop | Out-Null
    Set-InvocationRestrictedPermissions $setsRoot $true
  }
  $setsRoot = Test-TargetRootSafe $setsRoot
  if ($requiresRuntimePermissions -and $setsRootExisted) { Test-RestrictedRuntimePermissions $setsRoot $true 'EXISTING_TARGET_HIERARCHY_PERMISSIONS_UNSAFE' }
  $stagingSet = Join-Path $setsRoot ('.' + $TransactionId + '.staging')
  $publishedSet = Join-Path $setsRoot $TransactionId
  if ((Test-Path -LiteralPath $stagingSet) -or (Test-Path -LiteralPath $publishedSet)) { Fail-Safely 'DESTINATION_EXISTS' }
  New-Item -ItemType Directory -Path $stagingSet -ErrorAction Stop | Out-Null
  $created.Add($stagingSet)
  Set-InvocationRestrictedPermissions $stagingSet $true
  $names = @('runtime.env', 'sensitive.env', 'jwt-access', 'jwt-refresh', 'github-actions-token')
  if ($SourceMode -eq 'Synthetic' -and [string]::IsNullOrWhiteSpace($SyntheticSourceRoot)) { Fail-Safely 'SYNTHETIC_SOURCE_REQUIRED' }
  Write-Phase 'SOURCE_DISCOVERY' $true

  $runtime = if ($SourceMode -eq 'Synthetic') {
    Read-AssignmentFile (Join-Path $SyntheticSourceRoot 'runtime.source') 'runtime'
  } else {
    Get-RuntimeAssignmentMap $runtimeAllowedKeys
  }
  $runtimeSet = New-OrdinalSet $runtimeAllowedKeys; $sensitiveSet = New-OrdinalSet $sensitiveKeys; $optionalSensitiveSet = New-OrdinalSet $optionalSensitiveKeys; $migratedSet = New-OrdinalSet $migratedKeys
  if ($InjectRuntimeValueNewline -ne 'None') {
    if (-not $runtimeSet.Contains($InjectedRuntimeKey)) { Fail-Safely 'RUNTIME_KEY_INVALID' }
    $newline = switch ($InjectRuntimeValueNewline) { 'CR' { [string][char]13 } 'LF' { [string][char]10 } 'CRLF' { [string]([char]13) + [char]10 } }
    $runtime[$InjectedRuntimeKey] = 'synthetic' + $newline + 'value'
  }
  foreach ($key in $runtime.Keys) {
    if ($sensitiveSet.Contains($key) -or $migratedSet.Contains($key) -or -not $runtimeSet.Contains($key)) { Fail-Safely 'RUNTIME_KEY_INVALID' }
  }
  Normalize-ActivationEnablement $runtime
  $runtimeLines = New-Object System.Collections.Generic.List[string]
  foreach ($key in $runtimeAllowedKeys) {
    if (-not $runtime.Contains($key)) { continue }
    if ($omitWhenEmpty -contains $key -and [string]::IsNullOrEmpty([string]$runtime[$key])) { continue }
    $runtimeLines.Add((ConvertTo-RuntimeEnvAssignment $key ([string]$runtime[$key])))
  }
  $runtimeValue = ($runtimeLines -join [Environment]::NewLine) + [Environment]::NewLine
  Write-Phase 'RUNTIME_SERIALIZATION' $true

  $sensitive = if ($SourceMode -eq 'Synthetic') {
    Read-AssignmentFile (Join-Path $SyntheticSourceRoot 'sensitive.source') 'sensitive'
  } else {
    Get-RuntimeAssignmentMap $sensitiveKeys
  }
  foreach ($key in $sensitive.Keys) { if (-not $sensitiveSet.Contains($key) -or $migratedSet.Contains($key)) { Fail-Safely 'SENSITIVE_KEY_INVALID' } }
  foreach ($key in $requiredSensitiveKeys) { if (-not $sensitive.Contains($key)) { Fail-Safely 'SENSITIVE_REQUIRED_MISSING' } }
  foreach ($key in @($sensitive.Keys)) {
    if ($optionalSensitiveSet.Contains($key) -and [string]::IsNullOrWhiteSpace([string]$sensitive[$key])) { $sensitive.Remove($key) }
  }
  $sensitiveLines = New-Object System.Collections.Generic.List[string]
  foreach ($key in $sensitiveKeys) { if ($sensitive.Contains($key)) { $sensitiveLines.Add((ConvertTo-SensitiveEnvAssignment $key ([string]$sensitive[$key]))) } }
  $sensitiveValue = ($sensitiveLines -join [Environment]::NewLine) + [Environment]::NewLine
  Write-Phase 'SENSITIVE_SERIALIZATION' $true
  $payloads = [ordered]@{
    'runtime.env' = $runtimeValue
    'sensitive.env' = $sensitiveValue
    'jwt-access' = (Get-ArtifactSourceValue 'jwt-access')
    'jwt-refresh' = (Get-ArtifactSourceValue 'jwt-refresh')
    'github-actions-token' = (Get-ArtifactSourceValue 'github-actions-token')
  }
  foreach ($artifact in @('jwt-access', 'jwt-refresh', 'github-actions-token')) {
    $value = [string]$payloads[$artifact]
    if ([string]::IsNullOrWhiteSpace($value) -or $value.IndexOf([char]0) -ge 0) { Fail-Safely 'REQUIRED_SECRET_INVALID' }
    Test-MountedArtifactLogicalEquivalence $artifact $value
  }
  # This utility prepares the fixed file-mode activation overlay, which forces
  # NODE_ENV=production. Validate the eventual activation contract rather than
  # the source container's current NODE_ENV.
  $access = [string]$payloads['jwt-access']; $refresh = [string]$payloads['jwt-refresh']
  $placeholder = 'change-me|replace-me|please-change|local-only|autoops_dev|^secret$|^password$|^default$'
  if ($access.Length -lt 32 -or $refresh.Length -lt 32 -or $access -match $placeholder -or $refresh -match $placeholder -or $access -ceq $refresh) { Fail-Safely 'REQUIRED_SECRET_INVALID' }
  if ($requiresRuntimePermissions) {
    $targetRootFull = Test-TargetRootSafe $targetRootFull
    Test-RestrictedRuntimePermissions $targetRootFull $true 'TARGET_ROOT_PERMISSIONS_UNSAFE'
    Test-AncestorReplacementPermissions $targetRootFull 'TARGET_ANCESTOR_PERMISSIONS_UNSAFE'
    $setsRoot = Test-TargetRootSafe $setsRoot
    Test-RestrictedRuntimePermissions $setsRoot $true 'EXISTING_TARGET_HIERARCHY_PERMISSIONS_UNSAFE'
    Test-RestrictedRuntimePermissions $stagingSet $true 'ACL_POST_VERIFY_FAILED'
  }
  if ($InjectFailure -eq 'BeforeCommit') { Fail-Safely 'INJECTED_FAILURE' }
  foreach ($name in $payloads.Keys) {
    $stage = New-StagedFile $stagingSet $name ([string]$payloads[$name]); $staged.Add($stage)
    if ($InjectFailure -eq 'Acl') { Fail-Safely 'INJECTED_FAILURE' }
    Set-InvocationRestrictedPermissions $stage $false
    if ($InjectFailure -eq 'Metadata') { Fail-Safely 'INJECTED_FAILURE' }
    $null = Get-FileMetadata $stage
  }
  Write-Phase 'ACL' $true; Write-Phase 'METADATA' $true
  if ($InjectFailure -eq 'AtomicMove' -or $InjectFailure -eq 'AfterFirstCommit' -or $InjectFailure -eq 'AfterAllCommits') { Fail-Safely 'INJECTED_FAILURE' }
  Test-StagedMountedSecretContract $stagingSet
  Write-Phase 'VALIDATION' $true
  $publicationMarker = Join-Path $stagingSet '.published'
  [IO.File]::WriteAllText($publicationMarker, 'PUBLISHED', [Text.UTF8Encoding]::new($false))
  $staged.Add($publicationMarker)
  Set-InvocationRestrictedPermissions $publicationMarker $false
  if ($InjectFailure -eq 'BeforeCommit') { Fail-Safely 'INJECTED_FAILURE' }
  Move-Item -LiteralPath $stagingSet -Destination $publishedSet -ErrorAction Stop
  $created.Clear()
  Write-Phase 'COMMIT' $true
  $payloads.Clear(); Write-Phase 'CLEANUP' $true
  exit 0
} catch {
  $code = if ($_.Exception.Message -match '^[A-Z_]+$') { $_.Exception.Message } else { 'TRANSFER_FAILED' }
  foreach ($path in $staged) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
  foreach ($path in $created) { Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue }
  if ($EmitSourceCaptureAudit) { [Console]::WriteLine("SOURCE_ADAPTER_INVOCATIONS=$sourceAdapterInvocations") }
  [Console]::WriteLine("ERROR_CODE=$code")
  Write-Phase 'CLEANUP' $true
  exit 1
}
