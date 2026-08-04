param(
  [string[]]$Overlay = @('core'),
  [switch]$RunSelfTest
)

$ErrorActionPreference = 'Stop'

$contracts = @{
  runtime = @{
    Variable = 'AUTOOPS_FILE_MODE_ENV_FILE'
    FileName = 'runtime.env'
  }
  sensitive = @{
    Variable = 'AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE'
    FileName = 'sensitive.env'
  }
  core = @(
    @{ Variable = 'AUTOOPS_SECRET_JWT_ACCESS_FILE'; FileName = 'jwt-access' },
    @{ Variable = 'AUTOOPS_SECRET_JWT_REFRESH_FILE'; FileName = 'jwt-refresh' }
  )
  github = @{
    Variable = 'AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE'
    FileName = 'github-actions-token'
  }
  jenkins = @{
    Variable = 'AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE'
    FileName = 'jenkins-api-token'
  }
}

$runtimeEnablementKeys = @('GITHUB_ACTIONS_ENABLED', 'JENKINS_INTEGRATION_ENABLED')
$migratedSecretKeys = @('JWT_SECRET', 'JWT_REFRESH_SECRET', 'GITHUB_ACTIONS_TOKEN', 'JENKINS_API_TOKEN')
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
$sensitiveRuntimeKeys = @(
  'DATABASE_URL', 'REDIS_URL',
  'ARGOCD_AUTH_TOKEN', 'ARGOCD_PASSWORD',
  'GRAFANA_API_TOKEN',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET'
)
$ordinalComparer = [System.StringComparer]::Ordinal
$runtimeEnablementKeySet = [System.Collections.Generic.HashSet[string]]::new($ordinalComparer)
$migratedSecretKeySet = [System.Collections.Generic.HashSet[string]]::new($ordinalComparer)
$runtimeAllowedKeySet = [System.Collections.Generic.HashSet[string]]::new($ordinalComparer)
$sensitiveRuntimeKeySet = [System.Collections.Generic.HashSet[string]]::new($ordinalComparer)
foreach ($key in $runtimeEnablementKeys) { $null = $runtimeEnablementKeySet.Add($key) }
foreach ($key in $migratedSecretKeys) { $null = $migratedSecretKeySet.Add($key) }
foreach ($key in $runtimeAllowedKeys) { $null = $runtimeAllowedKeySet.Add($key) }
foreach ($key in $sensitiveRuntimeKeys) { $null = $sensitiveRuntimeKeySet.Add($key) }

function Write-Result([string]$Name, [string]$Status, [bool]$Passed) {
  # Host output is intentionally kept outside the PowerShell success pipeline so
  # callers can use Boolean results without status text changing control flow.
  Write-Host "$Name $Status $(if ($Passed) { 'PASS' } else { 'FAIL' })"
}

function Test-WithinPath([string]$Candidate, [string]$Root) {
  $trimCharacters = [char[]]@('\', '/')
  $normalizedCandidate = [IO.Path]::GetFullPath($Candidate).TrimEnd($trimCharacters)
  $normalizedRoot = [IO.Path]::GetFullPath($Root).TrimEnd($trimCharacters)
  $comparison = if ([Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)) {
    [StringComparison]::OrdinalIgnoreCase
  } else {
    [StringComparison]::Ordinal
  }
  if ($normalizedCandidate.Equals($normalizedRoot, $comparison)) {
    return $true
  }
  $prefix = $normalizedRoot + [IO.Path]::DirectorySeparatorChar
  return $normalizedCandidate.StartsWith($prefix, $comparison)
}

function Initialize-SafeFileLinkCountApi {
  if ($null -ne ('AutoOps.MountedSecretFileMetadata' -as [type])) { return }

  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace AutoOps {
  public static class MountedSecretFileMetadata {
    private const uint FILE_READ_ATTRIBUTES = 0x80;
    private const uint FILE_SHARE_READ = 0x1;
    private const uint FILE_SHARE_WRITE = 0x2;
    private const uint FILE_SHARE_DELETE = 0x4;
    private const uint OPEN_EXISTING = 3;

    [StructLayout(LayoutKind.Sequential)]
    private struct ByHandleFileInformation {
      public uint FileAttributes;
      public uint CreationTimeLow;
      public uint CreationTimeHigh;
      public uint LastAccessTimeLow;
      public uint LastAccessTimeHigh;
      public uint LastWriteTimeLow;
      public uint LastWriteTimeHigh;
      public uint VolumeSerialNumber;
      public uint FileSizeHigh;
      public uint FileSizeLow;
      public uint NumberOfLinks;
      public uint FileIndexHigh;
      public uint FileIndexLow;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LinuxTimespec {
      public long Seconds;
      public long Nanoseconds;
    }

    // Linux x64/glibc struct stat. Unsupported platforms fail closed.
    [StructLayout(LayoutKind.Sequential)]
    private struct LinuxStat {
      public ulong Device;
      public ulong Inode;
      public ulong NumberOfLinks;
      public uint Mode;
      public uint UserId;
      public uint GroupId;
      public int Padding;
      public ulong DeviceType;
      public long Size;
      public long BlockSize;
      public long Blocks;
      public LinuxTimespec AccessTime;
      public LinuxTimespec ModificationTime;
      public LinuxTimespec ChangeTime;
      public long Reserved0;
      public long Reserved1;
      public long Reserved2;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(
      string path,
      uint desiredAccess,
      uint shareMode,
      IntPtr securityAttributes,
      uint creationDisposition,
      uint flagsAndAttributes,
      IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandle(
      SafeFileHandle file,
      out ByHandleFileInformation information);

    [DllImport("libc", SetLastError = true)]
    private static extern int stat(string path, out LinuxStat information);

    public static long GetLinkCount(string path) {
      if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) {
        return GetWindowsLinkCount(path);
      }
      if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux) && IntPtr.Size == 8) {
        return GetLinuxLinkCount(path);
      }
      throw new PlatformNotSupportedException("Safe file link metadata is unavailable on this platform.");
    }

    private static long GetWindowsLinkCount(string path) {
      SafeFileHandle handle = CreateFile(
        path,
        FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        IntPtr.Zero,
        OPEN_EXISTING,
        0,
        IntPtr.Zero);
      try {
        if (handle == null || handle.IsInvalid) {
          throw new InvalidOperationException("Unable to inspect file metadata.");
        }
        ByHandleFileInformation information;
        if (!GetFileInformationByHandle(handle, out information)) {
          throw new InvalidOperationException("Unable to inspect file metadata.");
        }
        return information.NumberOfLinks;
      } finally {
        if (handle != null) {
          handle.Dispose();
        }
      }
    }

    private static long GetLinuxLinkCount(string path) {
      LinuxStat information;
      if (stat(path, out information) != 0) {
        throw new InvalidOperationException("Unable to inspect file metadata.");
      }
      return unchecked((long)information.NumberOfLinks);
    }
  }
}
'@ -ErrorAction Stop
}

function Get-SafeFileLinkCount([string]$Path) {
  Initialize-SafeFileLinkCountApi
  $count = [AutoOps.MountedSecretFileMetadata]::GetLinkCount($Path)
  if ($count -lt 1) { throw 'Invalid file link metadata.' }
  return [int64]$count
}

function Get-SourceMetadata([string]$SourcePath) {
  try {
    if ([string]::IsNullOrWhiteSpace($SourcePath) -or -not [IO.Path]::IsPathRooted($SourcePath)) {
      return @{ Exists = $false; MetadataAvailable = $true }
    }
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
      return @{ Exists = $false; MetadataAvailable = $true }
    }

    $normalized = [IO.Path]::GetFullPath($SourcePath)
    $current = $normalized
    $hasReparsePoint = $false
    while ($true) {
      $item = Get-Item -Force -LiteralPath $current
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        $hasReparsePoint = $true
        break
      }
      $parentInfo = [IO.Directory]::GetParent($current)
      if ($null -eq $parentInfo -or $parentInfo.FullName -eq $current) { break }
      $current = $parentInfo.FullName
    }

    $leaf = Get-Item -Force -LiteralPath $normalized
    $linkCount = if ($hasReparsePoint) { $null } else { Get-SafeFileLinkCount $normalized }
    return @{
      Exists = $true
      MetadataAvailable = $true
      IsRegularFile = (-not $leaf.PSIsContainer -and $leaf -is [IO.FileInfo])
      LeafName = $leaf.Name
      CanonicalPath = [IO.Path]::GetFullPath($leaf.FullName)
      HasReparsePoint = $hasReparsePoint
      LinkCountKnown = (-not $hasReparsePoint)
      LinkCount = $linkCount
    }
  } catch {
    return @{ Exists = $false; MetadataAvailable = $false }
  }
}

function Test-PathContainsGitMetadata([string]$Path) {
  $current = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath (Join-Path $current '.git')) { return $true }
    $parent = [IO.Directory]::GetParent($current)
    if ($null -eq $parent -or $parent.FullName -eq $current) { return $false }
    $current = $parent.FullName
  }
}

function Get-GitArgumentVector([string]$WorkingDirectory, [string[]]$Arguments, [switch]$LiteralPathspecs) {
  $vector = New-Object System.Collections.Generic.List[string]
  if ($LiteralPathspecs) { $vector.Add('--literal-pathspecs') }
  $vector.Add('-C')
  $vector.Add($WorkingDirectory)
  foreach ($argument in $Arguments) { $vector.Add($argument) }
  return @{ Arguments = [string[]]$vector.ToArray(); UsesLiteralPathspecs = $LiteralPathspecs.IsPresent }
}

function Invoke-GitQuietly([string]$WorkingDirectory, [string[]]$Arguments, [switch]$LiteralPathspecs) {
  $isolationVariables = @('GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_CEILING_DIRECTORIES', 'GIT_DISCOVERY_ACROSS_FILESYSTEM')
  $saved = @{}
  foreach ($name in $isolationVariables) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  $savedErrorActionPreference = $ErrorActionPreference
  $nativePreferenceVariable = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
  $savedNativePreference = if ($null -ne $nativePreferenceVariable) { $nativePreferenceVariable.Value } else { $null }
  try {
    $ErrorActionPreference = 'Continue'
    if ($null -ne $nativePreferenceVariable) { $PSNativeCommandUseErrorActionPreference = $false }
    $invocation = Get-GitArgumentVector $WorkingDirectory $Arguments -LiteralPathspecs:$LiteralPathspecs
    $output = @(& git @($invocation.Arguments) 2>$null)
    return @{ Invoked = $true; ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine); UsesLiteralPathspecs = $invocation.UsesLiteralPathspecs }
  } catch {
    return @{ Invoked = $false; ExitCode = $null; Output = $null }
  } finally {
    $ErrorActionPreference = $savedErrorActionPreference
    if ($null -ne $nativePreferenceVariable) { $PSNativeCommandUseErrorActionPreference = $savedNativePreference }
    foreach ($name in $isolationVariables) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
  }
}

function Get-SourceGitWorktreeStatus([string]$CanonicalPath) {
  $parent = [IO.Path]::GetDirectoryName($CanonicalPath)
  if ([string]::IsNullOrWhiteSpace($parent)) { return 'UNKNOWN' }

  $worktreeProbe = Invoke-GitQuietly $parent @('rev-parse', '--show-toplevel')
  if (-not $worktreeProbe.Invoked) { return 'UNKNOWN' }
  if ($worktreeProbe.ExitCode -ne 0) {
    # A non-zero Git probe is accepted as outside a worktree only when the
    # ancestor chain has no Git metadata. This catches broken nested/worktree
    # metadata as an ambiguity instead of treating it as untracked.
    if (Test-PathContainsGitMetadata $parent) { return 'UNKNOWN' }
    return 'OUTSIDE'
  }

  $worktreeRoot = $worktreeProbe.Output.Trim()
  if ([string]::IsNullOrWhiteSpace($worktreeRoot)) { return 'UNKNOWN' }
  try {
    $worktreeRoot = [IO.Path]::GetFullPath($worktreeRoot)
    if (-not (Test-WithinPath $CanonicalPath $worktreeRoot)) { return 'UNKNOWN' }
    $trimCharacters = [char[]]@('\', '/')
    $relativePath = $CanonicalPath.Substring($worktreeRoot.TrimEnd($trimCharacters).Length).TrimStart($trimCharacters)
    if ([string]::IsNullOrWhiteSpace($relativePath)) { return 'UNKNOWN' }
  } catch {
    return 'UNKNOWN'
  }

  $trackingProbe = Invoke-GitQuietly $worktreeRoot @('ls-files', '--error-unmatch', '--', $relativePath) -LiteralPathspecs
  if (-not $trackingProbe.Invoked) { return 'UNKNOWN' }
  if ($trackingProbe.ExitCode -eq 0) { return 'TRACKED' }
  if ($trackingProbe.ExitCode -ne 1) { return 'UNKNOWN' }

  # check-ignore rejects --literal-pathspecs on the installed Git version.
  # Prefixing the worktree-relative name with ./ prevents a leading : from
  # being parsed as pathspec magic while retaining the literal pathname.
  $literalIgnorePath = "./$relativePath"
  $ignoreProbe = Invoke-GitQuietly $worktreeRoot @('check-ignore', '-q', '--', $literalIgnorePath)
  if (-not $ignoreProbe.Invoked) { return 'UNKNOWN' }
  if ($ignoreProbe.ExitCode -eq 0) { return 'UNTRACKED_IGNORED' }
  if ($ignoreProbe.ExitCode -eq 1) { return 'UNTRACKED_NOT_IGNORED' }
  return 'UNKNOWN'
}

function Test-SourceFile([hashtable]$Contract, [string]$RepositoryRoot, [hashtable]$MetadataOverride) {
  $sourcePath = [Environment]::GetEnvironmentVariable($Contract.Variable)
  if ([string]::IsNullOrWhiteSpace($sourcePath)) {
    Write-Result $Contract.Variable 'ABSENT' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  Write-Result $Contract.Variable 'PRESENT' $true

  $metadata = if ($null -ne $MetadataOverride) { $MetadataOverride } else { Get-SourceMetadata $sourcePath }
  if (-not $metadata.MetadataAvailable) {
    Write-Result $Contract.Variable 'METADATA_UNAVAILABLE' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  if (-not $metadata.Exists -or -not $metadata.IsRegularFile) {
    Write-Result $Contract.Variable 'INVALID_TYPE' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  if ($metadata.HasReparsePoint) {
    Write-Result $Contract.Variable 'LINK_PATH_REJECTED' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  if (-not $metadata.LinkCountKnown) {
    Write-Result $Contract.Variable 'LINK_COUNT_UNAVAILABLE' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  if ($metadata.LinkCount -ne 1) {
    Write-Result $Contract.Variable 'LINK_COUNT_INVALID' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }
  if ($null -ne $Contract.FileName -and $metadata.LeafName -ne $Contract.FileName) {
    Write-Result $Contract.Variable 'INVALID_TYPE' $false
    return @{ Passed = $false; CanonicalPath = $null }
  }

  # Reparse-bearing paths were rejected above. The canonical path is the only
  # path used for repository containment and Git-tracking checks.
  $canonicalPath = [IO.Path]::GetFullPath($metadata.CanonicalPath)
  if (Test-WithinPath $canonicalPath $RepositoryRoot) {
    Write-Result $Contract.Variable 'REPOSITORY_PATH' $false
    return @{ Passed = $false; CanonicalPath = $canonicalPath }
  }

  $gitWorktreeStatus = if ($metadata.ContainsKey('GitWorktreeStatus')) { $metadata.GitWorktreeStatus } else { Get-SourceGitWorktreeStatus $canonicalPath }
  if ($gitWorktreeStatus -eq 'TRACKED') {
    Write-Result $Contract.Variable 'GIT_TRACKED' $false
    return @{ Passed = $false; CanonicalPath = $canonicalPath }
  }
  if ($gitWorktreeStatus -eq 'UNTRACKED_NOT_IGNORED') {
    Write-Result $Contract.Variable 'GIT_UNTRACKED_NOT_IGNORED' $false
    return @{ Passed = $false; CanonicalPath = $canonicalPath }
  }
  if ($gitWorktreeStatus -eq 'UNKNOWN') {
    Write-Result $Contract.Variable 'GIT_STATUS_UNAVAILABLE' $false
    return @{ Passed = $false; CanonicalPath = $canonicalPath }
  }

  Write-Result $Contract.Variable 'METADATA_VALID' $true
  return @{ Passed = $true; CanonicalPath = $canonicalPath }
}

function Get-NormalizedOverlays([string[]]$Requested) {
  $known = @('core', 'sensitive-env', 'github', 'jenkins')
  $selected = New-Object System.Collections.Generic.List[string]
  $valid = $true
  foreach ($entry in $Requested) {
    foreach ($part in ($entry -split ',')) {
      $name = $part.Trim().ToLowerInvariant()
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      if ($known -notcontains $name) {
        Write-Result 'OVERLAY' 'UNKNOWN' $false
        $valid = $false
        continue
      }
      if ($selected.Contains($name)) {
        Write-Result 'OVERLAY' 'DUPLICATE' $false
        $valid = $false
        continue
      }
      $selected.Add($name)
    }
  }
  if (-not $selected.Contains('core')) {
    $selected.Insert(0, 'core')
    Write-Result 'OVERLAY_CORE' 'IMPLIED' $true
  }
  return @{ Valid = $valid; Selected = @($selected) }
}

function ConvertTo-ApplicationBoolean([string]$Value) {
  if ($Value -eq 'true' -or $Value -eq '1') { return @{ Valid = $true; Enabled = $true } }
  if ($Value -eq 'false' -or $Value -eq '0') { return @{ Valid = $true; Enabled = $false } }
  return @{ Valid = $false; Enabled = $false }
}

function Read-RuntimeEnablement([string]$RuntimeConfigurationPath) {
  $states = [System.Collections.Generic.Dictionary[string, object]]::new($ordinalComparer)
  foreach ($key in $runtimeEnablementKeys) { $states.Add($key, @{ Defined = $false; Enabled = $false }) }
  $seenKeys = [System.Collections.Generic.HashSet[string]]::new($ordinalComparer)
  $reader = $null
  try {
    $reader = [IO.File]::OpenText($RuntimeConfigurationPath)
    while (($rawLine = $reader.ReadLine()) -ne $null) {
      $line = $rawLine.Trim().TrimStart([char]0xfeff)
      if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
      $match = [regex]::Match($line, '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$')
      if (-not $match.Success) {
        Write-Result 'RUNTIME_CONFIGURATION' 'INVALID_FORMAT' $false
        return @{ Valid = $false }
      }
      $key = $match.Groups['key'].Value
      if (-not $seenKeys.Add($key)) {
        Write-Result 'RUNTIME_CONFIGURATION' 'DUPLICATE_KEY' $false
        return @{ Valid = $false }
      }
      if ($migratedSecretKeySet.Contains($key)) {
        Write-Result 'RUNTIME_CONFIGURATION' 'MIGRATED_SECRET_KEY' $false
        return @{ Valid = $false }
      }
      if ($sensitiveRuntimeKeySet.Contains($key)) {
        Write-Result 'RUNTIME_CONFIGURATION' 'SENSITIVE_KEY' $false
        return @{ Valid = $false }
      }
      if (-not $runtimeAllowedKeySet.Contains($key)) {
        Write-Result 'RUNTIME_CONFIGURATION' 'UNKNOWN_KEY' $false
        return @{ Valid = $false }
      }
      if (-not $runtimeEnablementKeySet.Contains($key)) { continue }
      $state = ConvertTo-ApplicationBoolean $match.Groups['value'].Value.Trim()
      if (-not $state.Valid) {
        Write-Result $key 'INVALID' $false
        return @{ Valid = $false }
      }
      $states[$key] = @{ Defined = $true; Enabled = $state.Enabled }
    }
  } catch {
    Write-Result 'RUNTIME_CONFIGURATION' 'UNREADABLE' $false
    return @{ Valid = $false }
  } finally {
    if ($null -ne $reader) { $reader.Dispose() }
  }

  foreach ($key in $runtimeEnablementKeys) {
    Write-Result $key $(if ($states[$key].Enabled) { 'ENABLED' } else { 'DISABLED' }) $true
  }
  Write-Result 'RUNTIME_CONFIGURATION' 'VALID' $true
  return @{ Valid = $true; Github = $states['GITHUB_ACTIONS_ENABLED']; Jenkins = $states['JENKINS_INTEGRATION_ENABLED']; Keys = $seenKeys }
}

function Read-SensitiveRuntimeConfiguration([string]$SensitiveConfigurationPath, [System.Collections.Generic.HashSet[string]]$RuntimeKeys) {
  $seenKeys = [System.Collections.Generic.HashSet[string]]::new($ordinalComparer)
  $reader = $null
  try {
    $reader = [IO.File]::OpenText($SensitiveConfigurationPath)
    while (($rawLine = $reader.ReadLine()) -ne $null) {
      $line = $rawLine.Trim().TrimStart([char]0xfeff)
      if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
      $match = [regex]::Match($line, '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$')
      if (-not $match.Success) {
        Write-Result 'SENSITIVE_CONFIGURATION' 'INVALID_FORMAT' $false
        return @{ Valid = $false }
      }
      $key = $match.Groups['key'].Value
      if (-not $seenKeys.Add($key)) {
        Write-Result 'SENSITIVE_CONFIGURATION' 'DUPLICATE_KEY' $false
        return @{ Valid = $false }
      }
      if ($RuntimeKeys.Contains($key)) {
        Write-Result 'SENSITIVE_CONFIGURATION' 'CROSS_FILE_DUPLICATE' $false
        return @{ Valid = $false }
      }
      if ($migratedSecretKeySet.Contains($key)) {
        Write-Result 'SENSITIVE_CONFIGURATION' 'MIGRATED_SECRET_KEY' $false
        return @{ Valid = $false }
      }
      if ($runtimeAllowedKeySet.Contains($key)) {
        Write-Result 'SENSITIVE_CONFIGURATION' 'NON_SECRET_KEY' $false
        return @{ Valid = $false }
      }
      if (-not $sensitiveRuntimeKeySet.Contains($key)) {
        Write-Result 'SENSITIVE_CONFIGURATION' 'UNKNOWN_KEY' $false
        return @{ Valid = $false }
      }
      if ($match.Groups['value'].Length -eq 0) {
        Write-Result $key 'MISSING_VALUE' $false
        return @{ Valid = $false }
      }
    }
  } catch {
    Write-Result 'SENSITIVE_CONFIGURATION' 'UNREADABLE' $false
    return @{ Valid = $false }
  } finally {
    if ($null -ne $reader) { $reader.Dispose() }
  }
  Write-Result 'SENSITIVE_CONFIGURATION' 'VALID' $true
  return @{ Valid = $true }
}

function Test-Overlay([string[]]$RequestedOverlay, [hashtable]$MetadataOverrides) {
  $repositoryRoot = (git rev-parse --show-toplevel).Trim()
  $normalization = Get-NormalizedOverlays $RequestedOverlay
  if (-not $normalization.Valid) { return $false }
  $selected = $normalization.Selected

  $runtimeOverride = $null
  if ($null -ne $MetadataOverrides -and $MetadataOverrides.ContainsKey($contracts.runtime.Variable)) {
    $runtimeOverride = $MetadataOverrides[$contracts.runtime.Variable]
  }
  $runtimeSource = Test-SourceFile $contracts.runtime $repositoryRoot $runtimeOverride
  if (-not $runtimeSource.Passed) { return $false }
  $runtime = Read-RuntimeEnablement $runtimeSource.CanonicalPath
  if (-not $runtime.Valid) { return $false }

  if (-not ($selected -contains 'sensitive-env')) {
    Write-Result 'SENSITIVE_ENV_OVERLAY' 'REQUIRED' $false
    return $false
  }
  $sensitiveOverride = $null
  if ($null -ne $MetadataOverrides -and $MetadataOverrides.ContainsKey($contracts.sensitive.Variable)) {
    $sensitiveOverride = $MetadataOverrides[$contracts.sensitive.Variable]
  }
  $sensitiveSource = Test-SourceFile $contracts.sensitive $repositoryRoot $sensitiveOverride
  if (-not $sensitiveSource.Passed) { return $false }
  $sensitive = Read-SensitiveRuntimeConfiguration $sensitiveSource.CanonicalPath $runtime.Keys
  if (-not $sensitive.Valid) { return $false }

  $integrations = @(
    @{ Name = 'GITHUB_ACTIONS_ENABLED'; Overlay = 'github'; State = $runtime.Github },
    @{ Name = 'JENKINS_INTEGRATION_ENABLED'; Overlay = 'jenkins'; State = $runtime.Jenkins }
  )
  $allPassed = $true
  foreach ($integration in $integrations) {
    $hasOverlay = $selected -contains $integration.Overlay
    if ($integration.State.Enabled -and -not $hasOverlay) {
      Write-Result $integration.Name 'OVERLAY_REQUIRED' $false
      $allPassed = $false
    } elseif (-not $integration.State.Enabled -and $hasOverlay) {
      Write-Result $integration.Name 'OVERLAY_CONTRADICTS_DISABLED' $false
      $allPassed = $false
    } else {
      Write-Result $integration.Name 'OVERLAY_ALIGNED' $true
    }
  }
  if (-not $allPassed) { return $false }

  $required = @($contracts.runtime) + @($contracts.sensitive) + @($contracts.core)
  if ($selected -contains 'github') { $required += @($contracts.github) }
  if ($selected -contains 'jenkins') { $required += @($contracts.jenkins) }
  $seen = @{}
  foreach ($contract in $required) {
    $override = $null
    if ($null -ne $MetadataOverrides -and $MetadataOverrides.ContainsKey($contract.Variable)) {
      $override = $MetadataOverrides[$contract.Variable]
    }
    $result = Test-SourceFile $contract $repositoryRoot $override
    if (-not $result.Passed) { $allPassed = $false; continue }
    $duplicateKey = $result.CanonicalPath.ToLowerInvariant()
    if ($seen.ContainsKey($duplicateKey)) {
      Write-Result $contract.Variable 'DUPLICATE' $false
      $allPassed = $false
    } else {
      $seen[$duplicateKey] = $true
    }
  }
  return $allPassed
}

function Set-TemporaryRuntimeConfiguration([string]$Path, [string[]]$Lines) {
  [IO.File]::WriteAllText($Path, ($Lines -join [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
}

function Invoke-SelfTest {
  $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "autoops-mounted-secret-test-$([guid]::NewGuid())"
  $variables = @(
    'AUTOOPS_FILE_MODE_ENV_FILE', 'AUTOOPS_SECRET_JWT_ACCESS_FILE',
    'AUTOOPS_SECRET_JWT_REFRESH_FILE', 'AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE',
    'AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE', 'AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE', 'GITHUB_ACTIONS_ENABLED',
    'JENKINS_INTEGRATION_ENABLED'
  )
  $original = @{}
  foreach ($variable in $variables) { $original[$variable] = [Environment]::GetEnvironmentVariable($variable) }
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  try {
    foreach ($file in @('jwt-access', 'jwt-refresh', 'github-actions-token', 'jenkins-api-token')) {
      New-Item -ItemType File -Path (Join-Path $temporaryRoot $file) | Out-Null
    }
    $runtimeFile = Join-Path $temporaryRoot 'runtime.env'
    $sensitiveFile = Join-Path $temporaryRoot 'sensitive.env'
    Set-TemporaryRuntimeConfiguration $sensitiveFile @('DATABASE_URL=placeholder', 'REDIS_URL=placeholder', 'AWS_ACCESS_KEY_ID=placeholder')
    $env:AUTOOPS_FILE_MODE_ENV_FILE = $runtimeFile
    $env:AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE = $sensitiveFile
    $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'
    $env:AUTOOPS_SECRET_JWT_REFRESH_FILE = Join-Path $temporaryRoot 'jwt-refresh'
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
    $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = Join-Path $temporaryRoot 'jenkins-api-token'
    $env:GITHUB_ACTIONS_ENABLED = 'true'
    $env:JENKINS_INTEGRATION_ENABLED = 'true'
    $gcpKey = 'GOOGLE_APPLICATION_CREDENTIALS'
    $gcpReference = '/temporary/dummy/reference.json'
    $gcpAssignment = $gcpKey + '=' + $gcpReference
    $gcpLowerAssignment = $gcpKey.ToLowerInvariant() + '=' + $gcpReference
    $gcpMixedAssignment = ('Google' + $gcpKey.Substring(6).ToLowerInvariant()) + '=' + $gcpReference
    $gcpDuplicateAssignments = @(
      ($gcpKey + '=/temporary/dummy/one.json')
      ($gcpKey + '=/temporary/dummy/two.json')
    )

    $passed = $true
    $literalLsFiles = Get-GitArgumentVector $temporaryRoot @('ls-files', '--error-unmatch', '--', ':(top)literal/jwt-access') -LiteralPathspecs
    $literalCheckIgnore = Get-GitArgumentVector $temporaryRoot @('check-ignore', '-q', '--', './:(top)literal/jwt-access')
    $literalVectorValid = $literalLsFiles.UsesLiteralPathspecs -and
      $literalCheckIgnore.Arguments[-1].StartsWith('./', [StringComparison]::Ordinal) -and
      $literalLsFiles.Arguments[0] -eq '--literal-pathspecs'
    if (-not $literalVectorValid) { $passed = $false }
    Write-Result 'SELF_TEST_LITERAL_PATHSPEC_ARGUMENTS' $(if ($literalVectorValid) { 'PASS' } else { 'FAIL' }) $literalVectorValid
    $outsideGitStatus = Get-SourceGitWorktreeStatus $runtimeFile
    if ($outsideGitStatus -ne 'OUTSIDE') { $passed = $false }
    Write-Result 'SELF_TEST_GIT_OUTSIDE' $outsideGitStatus ($outsideGitStatus -eq 'OUTSIDE')
    Set-TemporaryRuntimeConfiguration $runtimeFile @()
    if (Test-Overlay @('core') $null) { $passed = $false }
    Set-TemporaryRuntimeConfiguration $runtimeFile @('GITHUB_ACTIONS_ENABLED=false', 'JENKINS_INTEGRATION_ENABLED=false')
    if (-not (Test-Overlay @('core', 'sensitive-env') $null)) { $passed = $false }

    Set-TemporaryRuntimeConfiguration $runtimeFile @('GITHUB_ACTIONS_ENABLED=true', 'JENKINS_INTEGRATION_ENABLED=false')
    if (Test-Overlay @('core', 'sensitive-env') $null) { $passed = $false }
    if (-not (Test-Overlay @('github', 'sensitive-env') $null)) { $passed = $false }
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = $null
    if (Test-Overlay @('github', 'sensitive-env') $null) { $passed = $false }
    $env:AUTOOPS_SECRET_GITHUB_ACTIONS_TOKEN_FILE = Join-Path $temporaryRoot 'github-actions-token'
    Set-TemporaryRuntimeConfiguration $runtimeFile @('GITHUB_ACTIONS_ENABLED=false', 'JENKINS_INTEGRATION_ENABLED=false')
    if (Test-Overlay @('github', 'sensitive-env') $null) { $passed = $false }

    Set-TemporaryRuntimeConfiguration $runtimeFile @('GITHUB_ACTIONS_ENABLED=false', 'JENKINS_INTEGRATION_ENABLED=true')
    if (Test-Overlay @('core', 'sensitive-env') $null) { $passed = $false }
    if (-not (Test-Overlay @('jenkins', 'sensitive-env') $null)) { $passed = $false }
    $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = $null
    if (Test-Overlay @('jenkins', 'sensitive-env') $null) { $passed = $false }
    $env:AUTOOPS_SECRET_JENKINS_API_TOKEN_FILE = Join-Path $temporaryRoot 'jenkins-api-token'

    Set-TemporaryRuntimeConfiguration $runtimeFile @('GITHUB_ACTIONS_ENABLED=true', 'JENKINS_INTEGRATION_ENABLED=true')
    if (-not (Test-Overlay @('core', 'sensitive-env', 'github', 'jenkins') $null)) { $passed = $false }
    $env:GITHUB_ACTIONS_ENABLED = 'false'; $env:JENKINS_INTEGRATION_ENABLED = 'false'
    if (-not (Test-Overlay @('core', 'sensitive-env', 'github', 'jenkins') $null)) { $passed = $false }
    $env:GITHUB_ACTIONS_ENABLED = 'true'; $env:JENKINS_INTEGRATION_ENABLED = 'true'
    if (Test-Overlay @('core', 'sensitive-env', 'github', 'github', 'jenkins') $null) { $passed = $false }
    if (Test-Overlay @('unknown') $null) { $passed = $false }

    foreach ($invalidRuntime in @(
        @('GITHUB_ACTIONS_ENABLED=true', 'GITHUB_ACTIONS_ENABLED=false'),
        @('DATABASE_URL=value-one', 'DATABASE_URL=value-two'),
        @('UNRELATED_VALUE=value-one', 'UNRELATED_VALUE=value-two'),
        @('GITHUB_ACTIONS_ENABLED=enabled', 'JENKINS_INTEGRATION_ENABLED=false'),
        @('JWT_SECRET=placeholder', 'GITHUB_ACTIONS_ENABLED=false', 'JENKINS_INTEGRATION_ENABLED=false'),
        @('JWT_REFRESH_SECRET=placeholder', 'GITHUB_ACTIONS_ENABLED=false', 'JENKINS_INTEGRATION_ENABLED=false'),
        @('GITHUB_ACTIONS_TOKEN=placeholder', 'GITHUB_ACTIONS_ENABLED=false', 'JENKINS_INTEGRATION_ENABLED=false'),
        @('JENKINS_API_TOKEN=placeholder', 'GITHUB_ACTIONS_ENABLED=false', 'JENKINS_INTEGRATION_ENABLED=false'),
        @($gcpLowerAssignment),
        @($gcpMixedAssignment),
        $gcpDuplicateAssignments
      )) {
      Set-TemporaryRuntimeConfiguration $runtimeFile $invalidRuntime
      if (Test-Overlay @('core', 'sensitive-env') $null) { $passed = $false }
    }
    Set-TemporaryRuntimeConfiguration $runtimeFile @('LOG_LEVEL=info')
    if (-not (Test-Overlay @('core', 'sensitive-env') $null)) { $passed = $false }
    Set-TemporaryRuntimeConfiguration $runtimeFile @(
      'GCP_INTEGRATION_ENABLED=true',
      $gcpAssignment
    )
    if (-not (Test-Overlay @('core', 'sensitive-env') $null)) { $passed = $false }
    Set-TemporaryRuntimeConfiguration $runtimeFile @(
      'GCP_INTEGRATION_ENABLED=false',
      $gcpAssignment
    )
    if (-not (Test-Overlay @('core', 'sensitive-env') $null)) { $passed = $false }

    $env:AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE = $null
    if (Test-Overlay @('core', 'sensitive-env') $null) { $passed = $false }
    $env:AUTOOPS_FILE_MODE_SENSITIVE_ENV_FILE = $sensitiveFile
    foreach ($invalidSensitive in @(
        @('JWT_SECRET=placeholder'),
        @('DATABASE_URL=placeholder', 'DATABASE_URL=duplicate'),
        @('LOG_LEVEL=info'),
        @($gcpAssignment),
        @('UNKNOWN_CREDENTIAL=placeholder'),
        @('DATABASE_URL=')
      )) {
      Set-TemporaryRuntimeConfiguration $sensitiveFile $invalidSensitive
      if (Test-Overlay @('core', 'sensitive-env') $null) { $passed = $false }
    }
    Set-TemporaryRuntimeConfiguration $runtimeFile @('DATABASE_URL=placeholder')
    Set-TemporaryRuntimeConfiguration $sensitiveFile @('DATABASE_URL=placeholder', 'REDIS_URL=placeholder')
    if (Test-Overlay @('core', 'sensitive-env') $null) { $passed = $false }
    Set-TemporaryRuntimeConfiguration $runtimeFile @($gcpAssignment)
    Set-TemporaryRuntimeConfiguration $sensitiveFile @($gcpAssignment)
    if (Test-Overlay @('core', 'sensitive-env') $null) { $passed = $false }
    Set-TemporaryRuntimeConfiguration $runtimeFile @('GITHUB_ACTIONS_ENABLED=false', 'JENKINS_INTEGRATION_ENABLED=false')
    Set-TemporaryRuntimeConfiguration $sensitiveFile @('DATABASE_URL=placeholder', 'REDIS_URL=placeholder')
    foreach ($caseSensitiveRuntime in @(
        @{ Lines = @('github_actions_enabled=true'); Overlay = @('github', 'sensitive-env') },
        @{ Lines = @('Github_Actions_Enabled=true'); Overlay = @('github', 'sensitive-env') },
        @{ Lines = @('jenkins_integration_enabled=true'); Overlay = @('jenkins', 'sensitive-env') },
        @{ Lines = @('Jenkins_Integration_Enabled=true'); Overlay = @('jenkins', 'sensitive-env') },
        @{ Lines = @('GITHUB_ACTIONS_ENABLED=false', 'github_actions_enabled=true'); Overlay = @('github', 'sensitive-env') },
        @{ Lines = @('JENKINS_INTEGRATION_ENABLED=false', 'jenkins_integration_enabled=true'); Overlay = @('jenkins', 'sensitive-env') }
      )) {
      Set-TemporaryRuntimeConfiguration $runtimeFile $caseSensitiveRuntime.Lines
      if (Test-Overlay $caseSensitiveRuntime.Overlay $null) { $passed = $false }
    }
    Set-TemporaryRuntimeConfiguration $runtimeFile @('GITHUB_ACTIONS_ENABLED=true', 'JENKINS_INTEGRATION_ENABLED=true')

    $normalMetadata = @{ Exists = $true; MetadataAvailable = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path $temporaryRoot 'jwt-access'); HasReparsePoint = $false; LinkCountKnown = $true; LinkCount = 1 }
    if (-not (Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $normalMetadata).Passed) { $passed = $false }
    $multiLinkMetadata = @{ Exists = $true; MetadataAvailable = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path $temporaryRoot 'jwt-access'); HasReparsePoint = $false; LinkCountKnown = $true; LinkCount = 2 }
    if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $multiLinkMetadata).Passed) { $passed = $false }
    $unknownLinkMetadata = @{ Exists = $true; MetadataAvailable = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path $temporaryRoot 'jwt-access'); HasReparsePoint = $false; LinkCountKnown = $false; LinkCount = $null }
    if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $unknownLinkMetadata).Passed) { $passed = $false }
    $linkMetadata = @{ Exists = $true; MetadataAvailable = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path $temporaryRoot 'jwt-access'); HasReparsePoint = $true; LinkCountKnown = $false; LinkCount = $null }
    if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $linkMetadata).Passed) { $passed = $false }
    $repositoryHardLinkMetadata = @{ Exists = $true; MetadataAvailable = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path $temporaryRoot 'jwt-access'); HasReparsePoint = $false; LinkCountKnown = $true; LinkCount = 2 }
    if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $repositoryHardLinkMetadata).Passed) { $passed = $false }
    $repositoryMetadata = @{ Exists = $true; MetadataAvailable = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path ((git rev-parse --show-toplevel).Trim()) 'package.json'); HasReparsePoint = $false; LinkCountKnown = $true; LinkCount = 1 }
    if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $repositoryMetadata).Passed) { $passed = $false }
    $unknownGitMetadata = @{ Exists = $true; MetadataAvailable = $true; IsRegularFile = $true; LeafName = 'jwt-access'; CanonicalPath = (Join-Path $temporaryRoot 'jwt-access'); HasReparsePoint = $false; LinkCountKnown = $true; LinkCount = 1; GitWorktreeStatus = 'UNKNOWN' }
    if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $unknownGitMetadata).Passed) { $passed = $false }

    $hardLinkRoot = Join-Path $temporaryRoot 'hard-link-test'
    New-Item -ItemType Directory -Path $hardLinkRoot | Out-Null
    $hardLinkTargetDirectory = Join-Path $hardLinkRoot 'target'
    $hardLinkSourceDirectory = Join-Path $hardLinkRoot 'source'
    New-Item -ItemType Directory -Path $hardLinkTargetDirectory, $hardLinkSourceDirectory | Out-Null
    $hardLinkTarget = Join-Path $hardLinkTargetDirectory 'jwt-access'
    $hardLinkSource = Join-Path $hardLinkSourceDirectory 'jwt-access'
    New-Item -ItemType File -Path $hardLinkTarget | Out-Null
    try {
      New-Item -ItemType HardLink -Path $hardLinkSource -Target $hardLinkTarget -ErrorAction Stop | Out-Null
      $originalJwtAccess = $env:AUTOOPS_SECRET_JWT_ACCESS_FILE
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $hardLinkSource
      if (Test-Overlay @('core', 'sensitive-env', 'github', 'jenkins') $null) { $passed = $false }
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $originalJwtAccess
      Write-Result 'SELF_TEST_HARD_LINK' 'REJECTED' $true
    } catch {
      # The deterministic metadata-seam assertion above remains mandatory on
      # platforms that do not expose unprivileged hard-link creation.
      Write-Result 'SELF_TEST_HARD_LINK' 'UNAVAILABLE' $true
    }

    $temporaryGitRoot = Join-Path $temporaryRoot 'git-worktree-tests'
    $trackedRepository = Join-Path $temporaryGitRoot 'tracked-repository'
    $untrackedRepository = Join-Path $temporaryGitRoot 'untracked-repository'
    $ignoredRepository = Join-Path $temporaryGitRoot 'ignored-repository'
    $outerRepository = Join-Path $temporaryGitRoot 'outer-repository'
    $nestedRepository = Join-Path $outerRepository 'nested-repository'
    $worktreeRepository = Join-Path $temporaryGitRoot 'worktree-repository'
    $neighborWorktree = Join-Path $temporaryGitRoot 'neighbor-worktree'
    $literalMagicRepository = Join-Path $temporaryGitRoot 'literal-pathspec-repository'
    New-Item -ItemType Directory -Path $temporaryGitRoot | Out-Null
    $gitTestStage = 'INITIALIZE'
    try {
      foreach ($repository in @($trackedRepository, $untrackedRepository, $ignoredRepository, $outerRepository, $nestedRepository, $worktreeRepository)) {
        New-Item -ItemType Directory -Path $repository -Force | Out-Null
        $null = & git -C $repository init -q 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Temporary Git repository initialization failed.' }
      }

      if ([Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Linux)) {
        $gitTestStage = 'LITERAL_MAGIC'
        New-Item -ItemType Directory -Path $literalMagicRepository -Force | Out-Null
        $null = Invoke-GitQuietly $literalMagicRepository @('init', '-q')
        $magicDirectory = Join-Path $literalMagicRepository ':(top)literal'
        New-Item -ItemType Directory -Path $magicDirectory | Out-Null
        $magicSource = Join-Path $magicDirectory 'jwt-access'
        New-Item -ItemType File -Path $magicSource | Out-Null
        [IO.File]::WriteAllText((Join-Path $literalMagicRepository '.gitignore'), 'literal/jwt-access', [Text.UTF8Encoding]::new($false))
        $relativeMagicSource = ':(top)literal/jwt-access'
        $literalAdd = Invoke-GitQuietly $literalMagicRepository @('add', '--', $relativeMagicSource) -LiteralPathspecs
        if (-not $literalAdd.Invoked -or $literalAdd.ExitCode -ne 0) { throw 'Temporary literal pathspec staging failed.' }
        $originalJwtAccess = $env:AUTOOPS_SECRET_JWT_ACCESS_FILE
        $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $magicSource
        if (Test-Overlay @('core', 'sensitive-env', 'github', 'jenkins') $null) { $passed = $false }
        $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $originalJwtAccess
        Write-Result 'SELF_TEST_LITERAL_PATHSPEC_LINUX' 'REJECTED' $true
      }

      $trackedSource = Join-Path $trackedRepository 'jwt-access'
      $gitTestStage = 'TRACKED'
      New-Item -ItemType File -Path $trackedSource | Out-Null
      $null = & git -C $trackedRepository add -- 'jwt-access' 2>$null
      if ($LASTEXITCODE -ne 0) { throw 'Temporary Git staging failed.' }
      $originalJwtAccess = $env:AUTOOPS_SECRET_JWT_ACCESS_FILE
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $trackedSource
      if (Test-Overlay @('core', 'sensitive-env', 'github', 'jenkins') $null) { $passed = $false }
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $originalJwtAccess

      $untrackedSource = Join-Path $untrackedRepository 'jwt-access'
      $gitTestStage = 'UNTRACKED'
      New-Item -ItemType File -Path $untrackedSource | Out-Null
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $untrackedSource
      if (Test-Overlay @('core', 'sensitive-env', 'github', 'jenkins') $null) { $passed = $false }
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $originalJwtAccess

      [IO.File]::WriteAllText((Join-Path $ignoredRepository '.gitignore'), 'jwt-access', [Text.UTF8Encoding]::new($false))
      $gitTestStage = 'IGNORED'
      $ignoredSource = Join-Path $ignoredRepository 'jwt-access'
      New-Item -ItemType File -Path $ignoredSource | Out-Null
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $ignoredSource
      if (-not (Test-Overlay @('core', 'sensitive-env', 'github', 'jenkins') $null)) { $passed = $false }
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $originalJwtAccess

      $nestedSource = Join-Path $nestedRepository 'jwt-access'
      $gitTestStage = 'NESTED'
      New-Item -ItemType File -Path $nestedSource | Out-Null
      $null = & git -C $nestedRepository add -- 'jwt-access' 2>$null
      if ($LASTEXITCODE -ne 0) { throw 'Temporary nested Git staging failed.' }
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $nestedSource
      if (Test-Overlay @('core', 'sensitive-env', 'github', 'jenkins') $null) { $passed = $false }
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $originalJwtAccess

      $worktreeSource = Join-Path $worktreeRepository 'jwt-access'
      $gitTestStage = 'WORKTREE_COMMIT'
      New-Item -ItemType File -Path $worktreeSource | Out-Null
      $null = & git -C $worktreeRepository add -- 'jwt-access' 2>$null
      if ($LASTEXITCODE -ne 0) { throw 'Temporary worktree staging failed.' }
      $null = & git -C $worktreeRepository -c user.name=AutoOpsTest -c user.email=autoops-test@example.invalid commit -qm 'test' 2>$null
      if ($LASTEXITCODE -ne 0) { throw 'Temporary worktree commit failed.' }
      $gitTestStage = 'WORKTREE_ADD'
      $worktreeAdd = Invoke-GitQuietly $worktreeRepository @('worktree', 'add', '--detach', $neighborWorktree, 'HEAD')
      if (-not $worktreeAdd.Invoked -or $worktreeAdd.ExitCode -ne 0) { throw 'Temporary neighboring worktree creation failed.' }
      $gitTestStage = 'WORKTREE_STATUS'
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = (Join-Path $neighborWorktree 'jwt-access')
      $neighborStatus = Get-SourceGitWorktreeStatus $env:AUTOOPS_SECRET_JWT_ACCESS_FILE
      if ($neighborStatus -ne 'TRACKED') { $passed = $false }
      $gitTestStage = 'WORKTREE_SOURCE_VALIDATION'
      if ((Test-SourceFile $contracts.core[0] ((git rev-parse --show-toplevel).Trim()) $null).Passed) { $passed = $false }
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = $originalJwtAccess
      Write-Result 'SELF_TEST_GIT_WORKTREE' 'PASS' $true
    } catch {
      $passed = $false
      Write-Result 'SELF_TEST_GIT_WORKTREE' $gitTestStage $false
    } finally {
      $env:AUTOOPS_SECRET_JWT_ACCESS_FILE = Join-Path $temporaryRoot 'jwt-access'
      if (Test-Path -LiteralPath $neighborWorktree) {
        $null = Invoke-GitQuietly $worktreeRepository @('worktree', 'remove', '--force', $neighborWorktree)
      }
    }

    Write-Result 'SELF_TEST' 'STRUCTURAL' $passed
    return $passed
  } finally {
    foreach ($variable in $variables) { [Environment]::SetEnvironmentVariable($variable, $original[$variable], 'Process') }
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($RunSelfTest) {
  if (-not (Invoke-SelfTest)) { exit 1 }
  exit 0
}

if (-not (Test-Overlay $Overlay $null)) { exit 1 }
