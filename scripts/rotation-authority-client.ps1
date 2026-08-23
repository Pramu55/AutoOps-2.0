Set-StrictMode -Version Latest

$script:RotationAuthorityPipeName = 'AutoOpsRotationAuthority-v1'
$script:RotationAuthorityServiceAccount = 'NT SERVICE\AutoOpsRotationAuthority'
$script:RotationAuthorityOperations = @(
  'CREATE_CANONICAL_PLAN',
  'INITIALIZE_OPERATION',
  'GET_OPERATION_STATE',
  'CONSUME_ACTIVATION_ATTEMPT',
  'RECORD_ACTIVATION_FAILURE',
  'CONSUME_ROLLBACK_ATTEMPT',
  'CONFIRM_CANDIDATE',
  'CONFIRM_ROLLBACK',
  'RECORD_MANUAL_INTERVENTION'
)

function Stop-RotationAuthorityClient([string]$Code) {
  throw [System.InvalidOperationException]::new($Code)
}

function Get-RotationAuthorityExpectedServiceSid {
  try {
    return ([Security.Principal.NTAccount]::new($script:RotationAuthorityServiceAccount)).Translate([Security.Principal.SecurityIdentifier]).Value
  } catch { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_SERVER_IDENTITY_UNAVAILABLE' }
}

function Get-RotationAuthorityConnectedServerSid([IO.Pipes.NamedPipeClientStream]$Pipe) {
  if (-not ('AutoOps.RotationAuthority.PipeIdentity' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
namespace AutoOps.RotationAuthority {
public static class PipeIdentity {
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint processId);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  public static string GetServerSid(NamedPipeClientStream pipe) {
    uint pid; if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out pid)) throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr process = OpenProcess(0x1000, false, pid); if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    try { IntPtr token; if (!OpenProcessToken(process, 0x0008, out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
      try { using (var identity = new WindowsIdentity(token)) { return identity.User == null ? null : identity.User.Value; } }
      finally { CloseHandle(token); }
    } finally { CloseHandle(process); }
  }
}
}
'@ -ErrorAction Stop
  }
  try { return [AutoOps.RotationAuthority.PipeIdentity]::GetServerSid($Pipe) } catch { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_SERVER_IDENTITY_UNAVAILABLE' }
}

function Invoke-RotationAuthorityRequest(
  [ValidateSet('CREATE_CANONICAL_PLAN','INITIALIZE_OPERATION','GET_OPERATION_STATE','CONSUME_ACTIVATION_ATTEMPT','RECORD_ACTIVATION_FAILURE','CONSUME_ROLLBACK_ATTEMPT','CONFIRM_CANDIDATE','CONFIRM_ROLLBACK','RECORD_MANUAL_INTERVENTION')][string]$Operation,
  [ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [string]$PlanProposalJson
) {
  if ($Operation -eq 'CREATE_CANONICAL_PLAN') {
    if ([string]::IsNullOrWhiteSpace($PlanProposalJson)) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PLAN_PROPOSAL_REQUIRED' }
    try { $proposal = $PlanProposalJson | ConvertFrom-Json -ErrorAction Stop } catch { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PLAN_PROPOSAL_INVALID' }
    $request = [ordered]@{ operation = 'CreateCanonicalPlan'; operationId = $OperationId; planProposal = $proposal }
  } else {
    if (-not [string]::IsNullOrWhiteSpace($PlanProposalJson)) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PLAN_PROPOSAL_FORBIDDEN' }
    $pascal = (($Operation -split '_' | ForEach-Object { $_.Substring(0,1) + $_.Substring(1).ToLowerInvariant() }) -join '')
    $request = [ordered]@{ operation = $pascal; operationId = $OperationId }
  }
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($request | ConvertTo-Json -Depth 8 -Compress))
  try {
    $pipe = [IO.Pipes.NamedPipeClientStream]::new('.', $script:RotationAuthorityPipeName, [IO.Pipes.PipeDirection]::InOut, [IO.Pipes.PipeOptions]::None)
    try {
      $pipe.Connect(3000)
      # A pipe name is not server authentication. Bind this exact connected
      # instance to the dedicated service SID before sending a request or
      # accepting a PASS response.
      if ((Get-RotationAuthorityConnectedServerSid $pipe) -cne (Get-RotationAuthorityExpectedServiceSid)) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_SERVER_IDENTITY_INVALID' }
      if ($bytes.Length -le 0 -or $bytes.Length -gt 16384) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PROTOCOL_INVALID' }
      $header = [BitConverter]::GetBytes([int]$bytes.Length)
      $pipe.Write($header, 0, $header.Length); $pipe.Write($bytes, 0, $bytes.Length); $pipe.Flush()
      $responseHeader = New-Object byte[] 4; $offset = 0
      while ($offset -lt $responseHeader.Length) { $read = $pipe.Read($responseHeader, $offset, $responseHeader.Length - $offset); if ($read -le 0) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PROTOCOL_INVALID' }; $offset += $read }
      $length = [BitConverter]::ToInt32($responseHeader, 0)
      if ($length -le 0 -or $length -gt 16384) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PROTOCOL_INVALID' }
      $buffer = New-Object byte[] $length; $offset = 0
      while ($offset -lt $buffer.Length) { $read = $pipe.Read($buffer, $offset, $buffer.Length - $offset); if ($read -le 0) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PROTOCOL_INVALID' }; $offset += $read }
      $response = ([Text.UTF8Encoding]::new($false)).GetString($buffer, 0, $buffer.Length) | ConvertFrom-Json -ErrorAction Stop
    } finally { $pipe.Dispose() }
  } catch {
    if ($_.Exception.Message -match '^ROTATION_AUTHORITY_') { throw }
    Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_UNAVAILABLE'
  }
  if ($response.result -cne 'PASS') { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_REJECTED' }
  return $response
}

function Test-RotationAuthorityClientSelfTest {
  $source = Get-Content -LiteralPath $PSCommandPath -Raw
  $forbidden = @('Skip' + 'Validation', 'Trusted' + 'Caller', 'Validation' + 'Passed', 'Acceptance' + 'Result=PASS', 'Script' + 'Block', 'rotation-' + 'operations', 'rotation-' + 'initialization-claims')
  foreach ($token in $forbidden) { if ($source -match [regex]::Escape($token)) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_CLIENT_SELF_TEST_FAILED' } }
  if ($source -notmatch 'GetNamedPipeServerProcessId' -or $source -notmatch 'Get-RotationAuthorityConnectedServerSid' -or $source -notmatch 'ROTATION_AUTHORITY_SERVER_IDENTITY_INVALID') { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_CLIENT_SELF_TEST_FAILED' }
  $unavailable = $false
  try { Invoke-RotationAuthorityRequest 'GET_OPERATION_STATE' ('0' * 32) | Out-Null } catch { $unavailable = $_.Exception.Message -eq 'ROTATION_AUTHORITY_UNAVAILABLE' }
  if (-not $unavailable) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_CLIENT_SELF_TEST_FAILED' }
  [Console]::WriteLine('ROTATION_AUTHORITY_CLIENT_NO_LOCAL_WRITER YES')
  [Console]::WriteLine('ROTATION_AUTHORITY_CLIENT_SERVICE_UNAVAILABLE_FAIL_CLOSED YES')
  [Console]::WriteLine('ROTATION_AUTHORITY_CLIENT_SERVER_IDENTITY_REQUIRED YES')
}
